import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root=path.resolve(__dirname,'..');
const builder=require('../scripts/migration/buildItManagementCurrentDesignReleaseArtifact.cjs');
const preflight=require('../scripts/migration/preflightItManagementCurrentDesignV1Production.cjs');
const manifestPath=path.join(root,'migration-allowlists','production-it-management-current-design-v1-028-032.json');
const sha=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();

test('028-032 release manifest is an ordered five-file Git-blob contract',()=>{
 const manifest=builder.readManifest(root,manifestPath);
 assert.equal(manifest.application_rc_sha,'dffde2ffd73887650442bfeb18e258f258d7dac3');
 assert.deepEqual(manifest.migrations.map((entry:any)=>entry.order),[1,2,3,4,5]);
 assert.equal(manifest.release_decision.migration_execution_authorized,false);
});

test('allowlist artifact has exactly the reviewed SQL bytes and preflight verifier accepts its layout',()=>{
 const temp=mkdtempSync(path.join(os.tmpdir(),'it-management-release-package-'));
 try{
  const artifact=path.join(temp,'artifact');
  builder.build(root,manifestPath,artifact,sha);
  const manifest=builder.readManifest(root,manifestPath);
  assert.deepEqual(readdirSync(path.join(artifact,'migrations')).sort(),manifest.migrations.map((entry:any)=>entry.filename).sort());
  for(const entry of manifest.migrations){
   const blob=execFileSync('git',['-C',root,'show',`${manifest.application_rc_sha}:migrations/${entry.filename}`]);
   assert.deepEqual(readFileSync(path.join(artifact,'migrations',entry.filename)),blob);
  }
  assert.deepEqual(preflight.verifyArtifact(root,manifestPath,artifact).migrations.map((entry:any)=>entry.filename),manifest.migrations.map((entry:any)=>entry.filename));
 }finally{rmSync(temp,{recursive:true,force:true});}
});

test('artifact verification fails closed when a SQL byte changes',()=>{
 const temp=mkdtempSync(path.join(os.tmpdir(),'it-management-release-package-'));
 try{
  const artifact=path.join(temp,'artifact');builder.build(root,manifestPath,artifact,sha);
  const target=path.join(artifact,'migrations','032_sales_activity_referral_person_name.sql');
  writeFileSync(target,Buffer.concat([readFileSync(target),Buffer.from('-- tampered\n')]));
  assert.throws(()=>preflight.verifyArtifact(root,manifestPath,artifact),/ARTIFACT_SQL_BYTES/);
 }finally{rmSync(temp,{recursive:true,force:true});}
});
