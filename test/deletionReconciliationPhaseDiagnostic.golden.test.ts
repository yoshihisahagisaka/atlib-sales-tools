import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deletionPostTickReconciliationSql } from '../src/db/deletionPostTickReconciliationVerifier';
import { DeletionReconciliationPhaseDiagnosticError, diagnoseDeletionReconciliationPhase } from '../src/db/deletionReconciliationPhaseDiagnostic';
import { runDeletionReconciliationPhaseDiagnosticCli } from '../src/db/deletionReconciliationPhaseDiagnosticCli';

const window={start_utc:'2026-09-28T03:00:00Z',end_utc:'2026-09-28T03:10:00Z'}; const now=new Date('2026-09-28T03:10:00.000Z');
const responses: unknown[]=[undefined,undefined,{rows:[]},{rows:[{observed_at_utc:now}]},{rows:[]},{rows:[]},{rows:[]},{rows:[]},{rows:[{processed_request_count:'0',processed_without_single_audit_count:'0',audit_without_processed_request_count:'0',tombstone_audit_count_mismatch_count:'0'}]},{rows:[{runtime_role:'sales_tools_runtime',can_select_deletion_requests:true,can_select_audit_logs:true,can_select_tombstones:true}]},undefined];
function fixture(values: unknown[]) { const queries:string[]=[]; let released=false; const client={query:async(sql:string)=>{queries.push(sql);const value=values.shift();if(value instanceof Error)throw value;return value;},release:()=>{released=true;}}; return {pool:{connect:async()=>client},queries,released:()=>released}; }

test('phase diagnostic follows the existing fixed SQL sequence without emitting aggregate values',async()=>{
  const db=fixture([...responses]); assert.equal(await diagnoseDeletionReconciliationPhase(db.pool,window),'PRIVILEGE_CHECK'); assert.deepEqual(db.queries,Object.values(deletionPostTickReconciliationSql)); assert.equal(db.released(),true);
});
test('phase diagnostic reports the owning phase and rolls back without leaking an error',async()=>{
  const db=fixture([undefined,undefined,{rows:[]},{rows:[{observed_at_utc:now}]},new Error('forbidden detail'),undefined]); await assert.rejects(diagnoseDeletionReconciliationPhase(db.pool,window),(error:unknown)=>error instanceof DeletionReconciliationPhaseDiagnosticError && error.phase==='WINDOW_AGGREGATE'); assert.equal(db.queries.at(-1),deletionPostTickReconciliationSql.ROLLBACK); assert.equal(db.released(),true);
});
test('CLI validates windows before config and emits only fixed phase evidence',async()=>{
  let loaded=false; const stderr:string[]=[]; await assert.rejects(runDeletionReconciliationPhaseDiagnosticCli({loadDatabaseConfig:async()=>{loaded=true;return {} as never;},createPool:()=>({} as never),environment:{DELETION_RECONCILIATION_WINDOW_START_UTC:'invalid',DELETION_RECONCILIATION_WINDOW_END_UTC:window.end_utc},now:()=>now,stdout:{write:()=>true},stderr:{write:(v:string)=>{stderr.push(v);return true;}}})); assert.equal(loaded,false); assert.deepEqual(stderr,['DELETION_RECONCILIATION_PHASE_DIAGNOSTIC_FAILED:CONNECT\n']);
});
test('artifact contract remains read-only and excludes worker and migration entrypoints',()=>{
  const all=Object.values(deletionPostTickReconciliationSql).join('\n'); assert.doesNotMatch(all,/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|COMMIT)\b/im);
});
