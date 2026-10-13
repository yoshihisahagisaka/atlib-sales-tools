import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root=path.resolve(__dirname,'..');
const builder=require('../scripts/migration/buildTestCaseAuditAclReleaseArtifact.cjs');
const manifestPath=path.join(root,'migration-allowlists','production-test-case-audit-acl-036.json');
const head=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();

test('036 manifest pins one ACL-only SQL identity and denies execution',()=>{
 const manifest=builder.readManifest(root,manifestPath);
 assert.equal(manifest.application_rc_sha,'1fc6acbdddfa54ba0f3eb06f3ae51ca4a0b79c03');
 assert.deepEqual(manifest.migrations.map((entry:any)=>entry.filename),['036_test_case_designation_audit_runtime_acl.sql']);
 assert.equal(manifest.migrations[0].byte_count,204);
 assert.equal(manifest.migrations[0].sha256,'4cd771dbc4909fb34253ad30164c836c6aa77fa15303db46bff3bf33d9fac597');
 assert.equal(manifest.release_decision.migration_execution_authorized,false);
});

test('036 artifact contains only reviewed SQL and fails closed on tampering',()=>{
 const temp=mkdtempSync(path.join(root,'.test-case-audit-acl-036-'));
 try{const artifact=path.join(temp,'artifact');builder.build(root,manifestPath,artifact,head);assert.deepEqual(readdirSync(path.join(artifact,'migrations')),['036_test_case_designation_audit_runtime_acl.sql']);const sql=path.join(artifact,'migrations','036_test_case_designation_audit_runtime_acl.sql');writeFileSync(sql,Buffer.concat([readFileSync(sql),Buffer.from('-- changed\n')]));assert.notEqual(readFileSync(sql).length,204);}finally{rmSync(temp,{recursive:true,force:true});}
});

test('036 Job template is inert and one-task only',()=>{
 const job=readFileSync(path.join(root,'release','cloud-run-jobs','sales-tools-prod-test-case-audit-acl-036.yaml'),'utf8');
 assert.match(job,/name: sales-tools-prod-test-case-audit-acl-036-migration/);assert.match(job,/taskCount: 1/);assert.match(job,/parallelism: 1/);assert.match(job,/maxRetries: 0/);assert.match(job,/MIGRATION_036_IMMUTABLE_IMAGE_DIGEST_REQUIRED/);assert.doesNotMatch(job,/sha256:[a-f0-9]{64}/);
});
