import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { deletionPostTickReconciliationSql, verifyDeletionPostTickReconciliation } from '../src/db/deletionPostTickReconciliationVerifier';
import { runDeletionPostTickReconciliationVerifierCli } from '../src/db/deletionPostTickReconciliationVerifierCli';

function fixture(responses: Array<unknown>) {
  const queries: Array<{sql:string; values:readonly unknown[]|undefined}>=[]; let released=false;
  const client={query:async(sql:string,values?:readonly unknown[])=>{queries.push({sql,values});const next=responses.shift();if(next instanceof Error)throw next;return next;},release:()=>{released=true;}};
  return {pool:{connect:async()=>client},queries,released:()=>released};
}
const window={start_utc:'2026-09-28T03:00:00Z',end_utc:'2026-09-28T03:10:00Z'};
const successRows=[
  undefined,undefined,
  {rows:[{status:'COMPLETED',count:'2'},{status:'FAILED',count:'1'}]}, {rows:[{observed_at_utc:new Date('2026-09-28T03:10:01Z')}]},
  {rows:[{status:'COMPLETED',count:'2'}]}, {rows:[{failure_code:'DELETION_WORKER_INTERRUPTED',count:'1'}]},
  {rows:[{data_class:'GENERAL_RAW_DIAGNOSIS',count:'2'}]}, {rows:[{data_class:'APPROVED_DECISION_EVIDENCE',count:'1'}]},
  {rows:[{processed_request_count:'2',processed_without_single_audit_count:'0',audit_without_processed_request_count:'0',tombstone_audit_count_mismatch_count:'0'}]},
  {rows:[{runtime_role:'sales_tools_runtime',can_select_deletion_requests:true,can_select_audit_logs:true,can_select_tombstones:true}]},undefined,
];

test('post-tick verifier uses a bounded UTC window and joins request/audit/tombstone integrity internally',async()=>{
  const db=fixture([...successRows]);const result=await verifyDeletionPostTickReconciliation(db.pool,window);
  assert.equal(result.window.start_utc,'2026-09-28T03:00:00.000Z');assert.equal(result.window.end_utc,'2026-09-28T03:10:00.000Z');
  assert.deepEqual(result.request_audit_tombstone_integrity,{processed_request_count:'2',processed_without_single_audit_count:'0',audit_without_processed_request_count:'0',tombstone_audit_count_mismatch_count:'0'});
  assert.equal(result.shared_organization_failure_attribution_supported,false);assert.equal(db.released(),true);
  assert.deepEqual(db.queries.map(q=>q.sql),Object.values(deletionPostTickReconciliationSql));
  for(const query of db.queries.slice(4,9))assert.deepEqual(query.values,['2026-09-28T03:00:00.000Z','2026-09-28T03:10:00.000Z','system:scheduler-deletion-worker']);
  const sql=db.queries.map(q=>q.sql).join('\n');
  assert.match(sql,/detail_json->>'deletion_request_id'/);assert.match(sql,/tombstones_written/);assert.match(sql,/DELETION_WORKER_INTERRUPTED/);
  assert.doesNotMatch(sql,/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|COMMIT)\b/im);
});

test('post-tick verifier preserves zero results and detects audit/tombstone mismatch as a count rather than emitting identifiers',async()=>{
  const rows:unknown[]=[...successRows];rows[2]={rows:[]};rows[4]={rows:[]};rows[5]={rows:[]};rows[6]={rows:[]};rows[7]={rows:[]};rows[8]={rows:[{processed_request_count:'0',processed_without_single_audit_count:'0',audit_without_processed_request_count:'1',tombstone_audit_count_mismatch_count:'1'}]};
  const result=await verifyDeletionPostTickReconciliation(fixture(rows).pool,window);
  assert.deepEqual(result.window_outcome_counts,[]);assert.equal(result.request_audit_tombstone_integrity.audit_without_processed_request_count,'1');assert.equal(result.request_audit_tombstone_integrity.tombstone_audit_count_mismatch_count,'1');
});

test('post-tick verifier fails closed, rolls back, and releases on malformed data or invalid windows',async()=>{
  const failed=fixture([undefined,undefined,new Error('must not escape'),undefined]);await assert.rejects(verifyDeletionPostTickReconciliation(failed.pool,window),/DELETION_POST_TICK_RECONCILIATION_FAILED/);assert.equal(failed.released(),true);assert.equal(failed.queries.at(-1)?.sql,'ROLLBACK');
  await assert.rejects(verifyDeletionPostTickReconciliation(fixture([]).pool,{start_utc:window.end_utc,end_utc:window.start_utc}),/DELETION_POST_TICK_RECONCILIATION_FAILED/);
  const malformed:unknown[]=[...successRows];malformed[8]={rows:[{processed_request_count:'1',diagnosis_case_id:'forbidden'}]};await assert.rejects(verifyDeletionPostTickReconciliation(fixture(malformed).pool,window),/DELETION_POST_TICK_RECONCILIATION_FAILED/);
});

test('runtime CLI requires a bounded window, emits only aggregate evidence, and closes its pool',async()=>{
  const db=fixture([...successRows]);let ended=false;const output:string[]=[];
  await runDeletionPostTickReconciliationVerifierCli({loadDatabaseConfig:async()=>({name:'safe',user:'runtime',password:'must-not-appear',host:'127.0.0.1',port:5432}),createPool:()=>({...db.pool,end:async()=>{ended=true;}}),environment:{DELETION_RECONCILIATION_WINDOW_START_UTC:window.start_utc,DELETION_RECONCILIATION_WINDOW_END_UTC:window.end_utc},stdout:{write:(chunk:string)=>{output.push(chunk);return true;}}});
  const rendered=output.join('');assert.match(rendered,/"processed_request_count":"2"/);assert.doesNotMatch(rendered,/must-not-appear|password|127\.0\.0\.1/i);assert.doesNotMatch(rendered,/"diagnosis_case_id"|"deletion_request_id"|"target_id"|"detail_json"/);assert.equal(ended,true);
  await assert.rejects(runDeletionPostTickReconciliationVerifierCli({loadDatabaseConfig:async()=>({}as never),createPool:()=>({}as never),environment:{},stdout:{write:()=>true}}),/DELETION_POST_TICK_RECONCILIATION_FAILED/);
});

test('artifact stays isolated from migrations and deletion execution and builds from source',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../src/db/deletionPostTickReconciliationVerifier.ts'),'utf8');const cli=fs.readFileSync(path.resolve(__dirname,'../src/db/deletionPostTickReconciliationVerifierCli.ts'),'utf8');const dockerfile=fs.readFileSync(path.resolve(__dirname,'../Dockerfile.deletion-post-tick-reconciliation'),'utf8');const worker=fs.readFileSync(path.resolve(__dirname,'../src/services/retentionDeletionWorker.ts'),'utf8');const router=fs.readFileSync(path.resolve(__dirname,'../src/routes/internalWorkers.ts'),'utf8');
  assert.doesNotMatch(source,/executeApprovedRequest|markFailed|migrateCli|runMigrations|INSERT INTO|UPDATE public\./i);assert.doesNotMatch(cli,/loadDatabaseConfig\('migration'\)|MIGRATIONS_DIR/i);assert.match(dockerfile,/dist\/db\/deletionPostTickReconciliationVerifierCli\.js/);assert.match(dockerfile,/COPY src \.\/src/);assert.match(dockerfile,/RUN npm run build/);assert.doesNotMatch(dockerfile,/^COPY dist \.\/dist$/m);
  assert.match(worker,/SHARED_ORGANIZATION_CLASSIFICATION_REQUIRES_REVIEW/);assert.match(worker,/APPROVED_DECISION_EVIDENCE/);assert.match(router,/DELETION_WORKER_INTERRUPTED/);assert.equal((source.match(/shared_organization_failure_attribution_supported:false/g)??[]).length,1);
});
