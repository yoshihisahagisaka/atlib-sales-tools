import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Pool } from 'pg';
import { runMigrations } from '../src/db/migrate';

const root=path.resolve(__dirname,'..');
const migrationConfig={host:process.env.PGHOST??'127.0.0.1',port:Number(process.env.PGPORT??55438),database:'sales_tools',user:'sales_tools_migration',password:'rehearsal-only',max:2};
const appConfig={...migrationConfig,user:'sales_tools_app',password:'app-only'};
const verifier=require('../scripts/migration/verifyTestCaseAuditAclProduction.cjs');

test('PostgreSQL 16 rehearsal corrects only the append-only audit ACL',{
 skip:process.env.RUN_TEST_CASE_AUDIT_ACL_PG!=='1'?'BLOCKED_EXTERNAL: disposable PostgreSQL 16 required':false,timeout:240_000,
},async()=>{
 const pool=new Pool(migrationConfig),app=new Pool(appConfig);const baseline=fs.mkdtempSync(path.join(os.tmpdir(),'test-case-acl-036-baseline-')),target=fs.mkdtempSync(path.join(os.tmpdir(),'test-case-acl-036-target-'));
 try{
  for(const filename of fs.readdirSync(path.join(root,'migrations')).filter(name=>/^\d+_[a-z0-9_]+\.sql$/.test(name))){const number=Number(filename.slice(0,3));if(number<=35)fs.copyFileSync(path.join(root,'migrations',filename),path.join(baseline,filename));if(number===36)fs.copyFileSync(path.join(root,'migrations',filename),path.join(target,filename));}
  await runMigrations(pool,baseline);
  const caseAclBefore=(await pool.query("SELECT has_table_privilege('sales_tools_app','it_management_diagnosis_case_v2','UPDATE') AS value")).rows[0].value;
  for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await pool.query("SELECT has_table_privilege('sales_tools_app','it_management_diagnosis_test_case_designation_audit',$1) AS value",[privilege])).rows[0].value,true);
  await pool.query('BEGIN');await pool.query('REVOKE UPDATE, DELETE ON TABLE it_management_diagnosis_test_case_designation_audit FROM sales_tools_app');await pool.query('ROLLBACK');assert.equal((await pool.query("SELECT has_table_privilege('sales_tools_app','it_management_diagnosis_test_case_designation_audit','UPDATE') AS value")).rows[0].value,true);
  const first:object[]=[];await runMigrations(pool,target,event=>first.push(event));assert.deepEqual(first,[{event:'migration_applied',filename:'036_test_case_designation_audit_runtime_acl.sql'}]);const second:object[]=[];await runMigrations(pool,target,event=>second.push(event));assert.deepEqual(second,[{event:'migration_skipped',filename:'036_test_case_designation_audit_runtime_acl.sql'}]);
  await app.query("INSERT INTO it_management_diagnosis_test_case_designation_audit(id,case_id,action,actor_user_id,reason) VALUES('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','DESIGNATED','operator','ACL rehearsal')");assert.equal((await app.query('SELECT count(*)::int AS count FROM it_management_diagnosis_test_case_designation_audit')).rows[0].count,1);await assert.rejects(app.query("UPDATE it_management_diagnosis_test_case_designation_audit SET reason='changed'"),/permission denied/);await assert.rejects(app.query('DELETE FROM it_management_diagnosis_test_case_designation_audit'),/permission denied/);
  assert.equal((await pool.query("SELECT tgenabled FROM pg_trigger WHERE tgname='test_case_designation_audit_immutable'")).rows[0].tgenabled,'O');assert.equal((await pool.query("SELECT has_table_privilege('sales_tools_app','it_management_diagnosis_case_v2','UPDATE') AS value")).rows[0].value,caseAclBefore);
  const client=await pool.connect();try{await client.query('BEGIN READ ONLY');assert.equal((await verifier.collect(client)).runtimeAcl,'SELECT,INSERT');await client.query('ROLLBACK');}finally{client.release();}
 }finally{await app.end();await pool.end();fs.rmSync(baseline,{recursive:true,force:true});fs.rmSync(target,{recursive:true,force:true});}
});
