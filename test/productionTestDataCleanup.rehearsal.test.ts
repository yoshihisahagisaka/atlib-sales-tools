import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {PGlite} from '@electric-sql/pglite';

const {readManifest}=require('../scripts/cleanup/productionTestDataCleanupContract.cjs');
const {runCleanup,TRIGGERS}=require('../scripts/cleanup/runProductionTestDataCleanup.cjs');
const {verify}=require('../scripts/cleanup/verifyProductionTestDataCleanup.cjs');
const {seed}=require('../scripts/cleanup/rehearseProductionTestDataCleanup.cjs');

test('synthetic PostgreSQL cleanup removes only the fixed graph, restores guards, changes KPI 4 to 0 and rejects rerun',{timeout:180000},async()=>{
 const db=new PGlite();await db.waitReady;const root=path.resolve(__dirname,'..');
 const migrations=['007_it_management_diagnosis.sql','008_it_management_diagnosis_preparation.sql','009_it_management_diagnosis_workspace.sql','010_it_management_diagnosis_human_review.sql','011_it_management_diagnosis_report_feedback.sql','012_it_management_diagnosis_assessment_handoff.sql','013_it_management_diagnosis_policy_closure.sql','015_management_feedback_decision.sql','016_assessment_scope_clarifications.sql','018_sales_conversation_intake.sql','019_diagnosis_hearing_records.sql','020_diagnosis_hearing_source_references.sql','021_diagnosis_report_pdf_artifacts.sql','022_diagnosis_report_pdf_generation_lease.sql','023_diagnosis_report_pdf_source_content_hash.sql','024_diagnosis_public_application_idempotency.sql','027_free_diagnosis_rule_based_v1.sql','028_free_diagnosis_current_design_v1_phase1_draft.sql','029_vs1_report_feedback_shared_artifacts.sql','030_sales_activity_marketing_attribution.sql','031_public_customer_self_submission.sql','032_sales_activity_referral_person_name.sql','033_free_diagnosis_design_v2_persistence.sql','034_marketing_initiative_v1.sql'];
 try{
  for(const migration of migrations)await db.exec(fs.readFileSync(path.join(root,'migrations',migration),'utf8'));
  await db.exec('CREATE TABLE schema_migrations(filename text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())');
  for(const filename of ['027_free_diagnosis_rule_based_v1.sql','028_free_diagnosis_current_design_v1_phase1_draft.sql','029_vs1_report_feedback_shared_artifacts.sql','030_sales_activity_marketing_attribution.sql','031_public_customer_self_submission.sql','032_sales_activity_referral_person_name.sql','033_free_diagnosis_design_v2_persistence.sql','034_marketing_initiative_v1.sql'])await db.query('INSERT INTO schema_migrations(filename) VALUES($1)',[filename]);
  const client={query:(sql:string,values?:unknown[])=>db.query(sql,values)};const {manifest}=readManifest(path.join(root,'cleanup-manifests/production-test-data-cleanup-20261013.json'));const control=await seed(client,manifest);
  const beforeKpi=Number(((await db.query("SELECT count(*) AS count FROM sales_activity WHERE utm_campaign='202610_shusei'")).rows[0] as any).count);assert.equal(beforeKpi,4);
  const currentUser=String(((await db.query('SELECT current_user AS value')).rows[0] as any).value);const ledgerBefore=Number(((await db.query('SELECT count(*) AS count FROM schema_migrations')).rows[0] as any).count);
  await db.exec("CREATE FUNCTION synthetic_cleanup_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic cleanup failure'; END $$; CREATE TRIGGER synthetic_cleanup_failure BEFORE DELETE ON sales_activity FOR EACH ROW EXECUTE FUNCTION synthetic_cleanup_failure()");
  await assert.rejects(()=>runCleanup(client,manifest,{expectedOwner:currentUser,syntheticIdentity:true}),/synthetic cleanup failure/);await db.exec('ROLLBACK');
  assert.equal(Number(((await db.query('SELECT count(*) AS count FROM it_management_diagnosis_case_v2 WHERE id=ANY($1::uuid[])',[manifest.vs1_case_ids])).rows[0] as any).count),15);
  const restored=(await db.query("SELECT count(*) AS count FROM pg_trigger WHERE NOT tgisinternal AND tgname=ANY($1::text[]) AND tgenabled='O'",[TRIGGERS.map((entry:[string,string])=>entry[1])])).rows[0] as any;assert.equal(Number(restored.count),TRIGGERS.length);
  await db.exec('DROP TRIGGER synthetic_cleanup_failure ON sales_activity; DROP FUNCTION synthetic_cleanup_failure()');
  const result=await runCleanup(client,manifest,{expectedOwner:currentUser,syntheticIdentity:true});await db.exec('COMMIT');assert.equal(result.before.vs1_cases,15);
  await db.exec('BEGIN READ ONLY');const verified=await verify(client,manifest,{controlVs1:{sql:`SELECT count(*) FROM it_management_diagnosis_case_v2 WHERE id='${control.case}'`,expected:1},controlV1:{sql:`SELECT count(*) FROM diagnosis_cases WHERE id='${control.v1Case}'`,expected:1},ledger:{sql:'SELECT count(*) FROM schema_migrations',expected:ledgerBefore}},{syntheticIdentity:true});await db.exec('ROLLBACK');assert.equal(verified.initiativeMatches,0);assert.equal(verified.triggersEnabled,TRIGGERS.length);
  await assert.rejects(()=>runCleanup(client,manifest,{expectedOwner:currentUser,syntheticIdentity:true}),/EXPECTED_COUNT/);try{await db.exec('ROLLBACK')}catch{}
 }finally{await db.close();}
});
