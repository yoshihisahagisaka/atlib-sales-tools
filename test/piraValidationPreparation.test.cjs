'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{target,approvedTargets}=require('../scripts/pira/validationTarget.cjs');
test('validation package matches frozen DDL/dependency/preparation hashes without DB access',()=>{const {verify}=require('../scripts/pira/verifyValidationPackage.cjs');const m=verify();assert.equal(m.implementationSha,'03679c544da26b0749efa5b81a9291c15e7dcc2a');});
test('real validation harness stays disconnected without explicit approval',()=>{assert.equal(approvedTargets({}),null);assert.equal(approvedTargets({PIRA_VALIDATION_DML_APPROVED:'true'}),null);});
test('validation target rejects Production, FACTACT, Send, wrong role, port and URL overrides',()=>{
 const good='postgresql://sales_tools_app:synthetic-only@127.0.0.1:55442/pira_joint_purchase_validation';assert.equal(target(good,'sales_tools_app'),good);
 for(const bad of [good.replace('127.0.0.1','production.example.invalid'),good.replace('55442','54322'),good.replace('55442','55443'),good.replace('pira_joint_purchase_validation','secure_send_validation'),good.replace('sales_tools_app:','postgres:'),good+'?host=production.example.invalid'])assert.throws(()=>target(bad,'sales_tools_app'),/REJECTED/);
});
test('read-only metadata collector SQL runs against embedded synthetic catalogs and never outputs company values',async()=>{
 const {PGlite}=require('@electric-sql/pglite'),{main}=require('../scripts/pira/preflight.cjs');let output='';
 class EmbeddedClient{
  async connect(){this.db=new PGlite();await this.db.exec("CREATE TABLE company(id UUID PRIMARY KEY,name TEXT,corporate_number TEXT);CREATE TABLE schema_migrations(filename TEXT PRIMARY KEY,applied_at TIMESTAMPTZ DEFAULT now());INSERT INTO company VALUES('11111111-1111-4111-8111-111111111111','PrivateSyntheticName','1000000000001'),('22222222-2222-4222-8222-222222222222','PrivateSyntheticName','1000000000001');");}
  async query(sql,args){return this.db.query(sql,args);}
  async end(){await this.db.close();}
 }
 const result=await main({Client:EmbeddedClient,env:{PIRA_READONLY_DB_URL:'unused-injected-fixture',PIRA_EXPECTED_DATABASE:'postgres'},emit:s=>{output=s;},emitError:s=>{throw Error(s);}});
 assert.equal(result.identity.read_only,'on');assert.equal(result.companyCounts.total,2);assert.equal(result.duplicateNumberGroups.groups,1);assert.equal(result.duplicateNameCandidateGroups.groups,1);assert.doesNotMatch(output,/PrivateSyntheticName|1000000000001/);assert.ok(Array.isArray(result.indexes)&&Array.isArray(result.defaultAcl)&&Array.isArray(result.runtimeEffectiveAcl));
});
