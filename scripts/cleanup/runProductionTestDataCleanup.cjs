/* One-shot governance operation. Requires a separately approved immutable artifact and migration-owner credentials. */
const path = require('node:path');
const { Pool } = require('pg');
const { readManifest, assertPreconditions, verifyLedger, fail, assert } = require('./productionTestDataCleanupContract.cjs');

const TRIGGERS = [
  ['diagnosis_reports','diagnosis_reports_freeze'],
  ['hearing_statement_v2','trg_hearing_statement_v2_immutable'],
  ['assessment_structure_suggestion','trg_assessment_structure_suggestion_immutable'],
  ['it_management_diagnosis_original_survey_snapshot_v2','original_survey_snapshot_v2_immutable'],
  ['it_management_diagnosis_current_state_revision_v2','current_state_revision_v2_immutable'],
  ['it_management_diagnosis_analysis_result_v2','analysis_result_v2_immutable'],
  ['it_management_diagnosis_generated_narrative_v2','generated_narrative_v2_immutable'],
  ['it_management_diagnosis_human_edited_narrative_v2','human_edited_narrative_v2_immutable'],
];
const qident = value => `"${value.replaceAll('"','""')}"`;
async function affected(client, sql, values) { return (await client.query(sql, values)).rowCount; }

async function deleteVs1(client, ids, related) {
  const companies=related.company_ids,contacts=related.contact_ids,activities=related.sales_activity_ids;
  const deleted={};
  deleted.pdfArtifacts=await affected(client,'DELETE FROM diagnosis_report_pdf_artifacts WHERE report_id IN (SELECT id FROM diagnosis_reports WHERE it_management_diagnosis_case_v2_id=ANY($1::uuid[]))',[ids]);
  deleted.humanReviews=await affected(client,'DELETE FROM human_reviews WHERE it_management_diagnosis_case_v2_id=ANY($1::uuid[])',[ids]);
  deleted.insightSources=await affected(client,'DELETE FROM insight_sources WHERE it_management_diagnosis_case_v2_id=ANY($1::uuid[])',[ids]);
  deleted.insights=await affected(client,'DELETE FROM diagnosis_insights WHERE it_management_diagnosis_case_v2_id=ANY($1::uuid[])',[ids]);
  deleted.feedbackDecisions=await affected(client,'DELETE FROM management_feedback_decisions WHERE it_management_diagnosis_case_v2_id=ANY($1::uuid[])',[ids]);
  deleted.reports=await affected(client,'DELETE FROM diagnosis_reports WHERE it_management_diagnosis_case_v2_id=ANY($1::uuid[])',[ids]);
  deleted.humanEdits=await affected(client,'DELETE FROM it_management_diagnosis_human_edited_narrative_v2 WHERE case_id=ANY($1::uuid[])',[ids]);
  deleted.generated=await affected(client,'DELETE FROM it_management_diagnosis_generated_narrative_v2 WHERE case_id=ANY($1::uuid[])',[ids]);
  deleted.analysis=await affected(client,'DELETE FROM it_management_diagnosis_analysis_result_v2 WHERE case_id=ANY($1::uuid[])',[ids]);
  deleted.current=await affected(client,'DELETE FROM it_management_diagnosis_current_state_revision_v2 WHERE case_id=ANY($1::uuid[])',[ids]);
  deleted.original=await affected(client,'DELETE FROM it_management_diagnosis_original_survey_snapshot_v2 WHERE case_id=ANY($1::uuid[])',[ids]);
  deleted.publicSubmissions=await affected(client,'DELETE FROM it_management_public_self_submission WHERE it_management_diagnosis_case_v2_id=ANY($1::uuid[])',[ids]);
  deleted.caseAudit=await affected(client,'DELETE FROM it_management_diagnosis_case_v2_audit WHERE case_id=ANY($1::uuid[])',[ids]);
  deleted.investigations=await affected(client,'DELETE FROM investigation_output WHERE rule_analysis_execution_id IN (SELECT id FROM rule_analysis_execution WHERE case_id=ANY($1::uuid[]))',[ids]);
  deleted.suggestions=await affected(client,'DELETE FROM assessment_structure_suggestion WHERE case_id=ANY($1::uuid[])',[ids]);
  deleted.statements=await affected(client,'DELETE FROM hearing_statement_v2 WHERE case_id=ANY($1::uuid[])',[ids]);
  deleted.intake=await affected(client,'DELETE FROM hearing_intake_response_v2 WHERE case_id=ANY($1::uuid[])',[ids]);
  deleted.ruleExecutions=await affected(client,'DELETE FROM rule_analysis_execution WHERE case_id=ANY($1::uuid[])',[ids]);
  deleted.cases=await affected(client,'DELETE FROM it_management_diagnosis_case_v2 WHERE id=ANY($1::uuid[])',[ids]);
  deleted.activities=await affected(client,'DELETE FROM sales_activity WHERE id=ANY($1::uuid[])',[activities]);
  deleted.contacts=await affected(client,'DELETE FROM contact WHERE id=ANY($1::uuid[])',[contacts]);
  deleted.companies=await affected(client,'DELETE FROM company WHERE id=ANY($1::uuid[])',[companies]);
  return deleted;
}

async function deleteHistoricalV1(client, ids) {
  const organizations=(await client.query('SELECT DISTINCT organization_id FROM diagnosis_cases WHERE id=ANY($1::uuid[])',[ids])).rows.map(r=>r.organization_id);
  const deleted={};
  deleted.assessmentHandoffs=await affected(client,'DELETE FROM assessment_handoffs WHERE diagnosis_case_id=ANY($1::uuid[])',[ids]);
  deleted.pdfArtifacts=await affected(client,'DELETE FROM diagnosis_report_pdf_artifacts WHERE diagnosis_case_id=ANY($1::uuid[])',[ids]);
  deleted.managementFeedback=await affected(client,'DELETE FROM management_feedback_decisions WHERE diagnosis_case_id=ANY($1::uuid[])',[ids]);
  deleted.humanReviews=await affected(client,'DELETE FROM human_reviews WHERE diagnosis_case_id=ANY($1::uuid[])',[ids]);
  deleted.confirmationItems=await affected(client,'DELETE FROM assessment_confirmation_items WHERE diagnosis_case_id=ANY($1::uuid[])',[ids]);
  deleted.insightSources=await affected(client,'DELETE FROM insight_sources WHERE diagnosis_case_id=ANY($1::uuid[])',[ids]);
  deleted.insights=await affected(client,'DELETE FROM diagnosis_insights WHERE diagnosis_case_id=ANY($1::uuid[])',[ids]);
  deleted.scopeClarifications=await affected(client,'DELETE FROM assessment_scope_clarifications WHERE diagnosis_case_id=ANY($1::uuid[])',[ids]);
  deleted.hearingRevisions=await affected(client,'DELETE FROM diagnosis_hearing_record_revisions WHERE diagnosis_case_id=ANY($1::uuid[])',[ids]);
  deleted.hearingRecords=await affected(client,'DELETE FROM diagnosis_hearing_records WHERE diagnosis_case_id=ANY($1::uuid[])',[ids]);
  deleted.aiProposalSources=await affected(client,'DELETE FROM ai_proposal_sources WHERE diagnosis_case_id=ANY($1::uuid[])',[ids]);
  deleted.planItems=await affected(client,'DELETE FROM diagnosis_plan_items WHERE diagnosis_case_id=ANY($1::uuid[])',[ids]);
  deleted.themes=await affected(client,'DELETE FROM diagnosis_themes WHERE diagnosis_case_id=ANY($1::uuid[])',[ids]);
  deleted.proposals=await affected(client,'DELETE FROM ai_proposals WHERE diagnosis_case_id=ANY($1::uuid[])',[ids]);
  deleted.executions=await affected(client,'DELETE FROM ai_executions WHERE diagnosis_case_id=ANY($1::uuid[])',[ids]);
  deleted.futures=await affected(client,'DELETE FROM diagnosis_futures WHERE diagnosis_case_id=ANY($1::uuid[])',[ids]);
  deleted.surveyResponses=await affected(client,'DELETE FROM survey_responses WHERE diagnosis_case_id=ANY($1::uuid[])',[ids]);
  deleted.sourceRecords=await affected(client,'DELETE FROM source_records WHERE diagnosis_case_id=ANY($1::uuid[])',[ids]);
  deleted.reports=await affected(client,'DELETE FROM diagnosis_reports WHERE diagnosis_case_id=ANY($1::uuid[])',[ids]);
  deleted.publicIdempotency=await affected(client,'DELETE FROM diagnosis_public_application_idempotency WHERE diagnosis_case_id=ANY($1::uuid[])',[ids]);
  deleted.policyAcknowledgements=await affected(client,'DELETE FROM diagnosis_policy_acknowledgements WHERE diagnosis_case_id=ANY($1::uuid[])',[ids]);
  deleted.transcriptConsents=await affected(client,'DELETE FROM diagnosis_transcript_consents WHERE diagnosis_case_id=ANY($1::uuid[])',[ids]);
  deleted.transitions=await affected(client,'DELETE FROM case_transitions WHERE diagnosis_case_id=ANY($1::uuid[])',[ids]);
  deleted.audit=await affected(client,'DELETE FROM diagnosis_audit_logs WHERE diagnosis_case_id=ANY($1::uuid[])',[ids]);
  deleted.participantRoles=await affected(client,'DELETE FROM participant_roles WHERE participant_id IN (SELECT id FROM participants WHERE diagnosis_case_id=ANY($1::uuid[]))',[ids]);
  deleted.participants=await affected(client,'DELETE FROM participants WHERE diagnosis_case_id=ANY($1::uuid[])',[ids]);
  deleted.cases=await affected(client,'DELETE FROM diagnosis_cases WHERE id=ANY($1::uuid[])',[ids]);
  deleted.organizations=await affected(client,'DELETE FROM organizations WHERE id=ANY($1::uuid[])',[organizations]);
  return deleted;
}

async function runCleanup(client, manifest, options = {}) {
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SET LOCAL statement_timeout='120s'");
  await client.query('SELECT pg_advisory_xact_lock($1::bigint)', ['731013183706']);
  const before=await assertPreconditions(client,manifest,options);
  assert(before.identity.current_user===(options.expectedOwner||'sales_tools_migration'),'MIGRATION_OWNER_REQUIRED');
  for(const [table,trigger] of TRIGGERS) await client.query(`ALTER TABLE ${qident(table)} DISABLE TRIGGER ${qident(trigger)}`);
  const vs1=await deleteVs1(client,manifest.vs1_case_ids,manifest.related_ids);
  const historical=await deleteHistoricalV1(client,manifest.historical_v1_case_ids);
  for(const [table,trigger] of [...TRIGGERS].reverse()) await client.query(`ALTER TABLE ${qident(table)} ENABLE TRIGGER ${qident(trigger)}`);
  assert(await affected(client,'SELECT 1 FROM it_management_diagnosis_case_v2 WHERE id=ANY($1::uuid[])',[manifest.vs1_case_ids])===0,'VS1_REMAINS');
  assert(await affected(client,'SELECT 1 FROM diagnosis_cases WHERE id=ANY($1::uuid[])',[manifest.historical_v1_case_ids])===0,'V1_REMAINS');
  assert(await affected(client,'SELECT 1 FROM company WHERE id=ANY($1::uuid[])',[manifest.related_ids.company_ids])===0,'COMPANY_REMAINS');
  assert(await affected(client,'SELECT 1 FROM contact WHERE id=ANY($1::uuid[])',[manifest.related_ids.contact_ids])===0,'CONTACT_REMAINS');
  assert(await affected(client,'SELECT 1 FROM sales_activity WHERE id=ANY($1::uuid[])',[manifest.related_ids.sales_activity_ids])===0,'SALES_ACTIVITY_REMAINS');
  assert(await affected(client,'SELECT 1 FROM diagnosis_reports WHERE id=ANY($1::uuid[])',[manifest.related_ids.report_ids])===0,'REPORT_REMAINS');
  assert(vs1.cases===manifest.expected_before.vs1_cases&&vs1.companies===manifest.expected_before.companies&&vs1.contacts===manifest.expected_before.contacts&&vs1.activities===manifest.expected_before.sales_activities&&vs1.reports===manifest.expected_before.reports,'VS1_DELETE_COUNT_MISMATCH');
  assert(historical.cases===manifest.expected_before.historical_v1_cases&&historical.participants===manifest.expected_before.historical_participants&&historical.participantRoles===manifest.expected_before.historical_participant_roles&&historical.surveyResponses===manifest.expected_before.historical_survey_responses&&historical.sourceRecords===manifest.expected_before.historical_source_records&&historical.executions===manifest.expected_before.historical_ai_executions&&historical.proposals===manifest.expected_before.historical_ai_proposals&&historical.aiProposalSources===manifest.expected_before.historical_ai_proposal_sources&&historical.futures===manifest.expected_before.historical_futures&&historical.themes===manifest.expected_before.historical_themes&&historical.planItems===manifest.expected_before.historical_plan_items&&historical.policyAcknowledgements===manifest.expected_before.historical_policy_acknowledgements&&historical.transitions===manifest.expected_before.historical_transitions&&historical.audit===manifest.expected_before.historical_audit_logs,'V1_DELETE_COUNT_MISMATCH');
  assert(await affected(client,'SELECT 1 FROM marketing_initiative WHERE initiative_id=ANY($1::uuid[])',[manifest.preserve.marketing_initiative_ids])===1,'INITIATIVE_NOT_PRESERVED');
  await verifyLedger(client);
  return {before:before.counts,deleted:{vs1,historical}};
}

async function main() {
  if(process.env.CLEANUP_EXECUTION_AUTHORIZED!=='true')fail('EXECUTION_NOT_AUTHORIZED');
  for(const key of ['DB_NAME','DB_MIGRATION_USER','DB_MIGRATION_PASSWORD','CLEANUP_APPROVAL_ID','CLEANUP_APPROVED_BY','CLEANUP_EXECUTED_BY','CLEANUP_BACKUP_VERIFIED_AT','CLEANUP_PITR_VERIFIED_AT','CLEANUP_EXPECTED_MANIFEST_SHA256'])if(!process.env[key])fail(`MISSING_${key}`);
  const manifestPath=path.resolve(process.argv[2]||'cleanup-manifest.json');const {manifest,manifestSha256}=readManifest(manifestPath);
  assert(manifestSha256===process.env.CLEANUP_EXPECTED_MANIFEST_SHA256,'MANIFEST_SHA256');
  const pool=new Pool({host:process.env.DB_SOCKET_PATH||process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||5432),database:process.env.DB_NAME,user:process.env.DB_MIGRATION_USER,password:process.env.DB_MIGRATION_PASSWORD,max:1,connectionTimeoutMillis:10000});const client=await pool.connect();
  const evidence={manifestSha256,approvalId:process.env.CLEANUP_APPROVAL_ID,approvedBy:process.env.CLEANUP_APPROVED_BY,executedBy:process.env.CLEANUP_EXECUTED_BY,backupVerifiedAt:process.env.CLEANUP_BACKUP_VERIFIED_AT,pitrVerifiedAt:process.env.CLEANUP_PITR_VERIFIED_AT,startedAt:new Date().toISOString()};
  try{const result=await runCleanup(client,manifest);await client.query('COMMIT');console.log(JSON.stringify({event:'production_test_data_cleanup_committed',...evidence,completedAt:new Date().toISOString(),...result}));}
  catch(error){try{await client.query('ROLLBACK');}catch{}console.error(JSON.stringify({event:'production_test_data_cleanup_rolled_back',...evidence,failedAt:new Date().toISOString(),reason:error.message}));throw error;}
  finally{client.release();await pool.end();}
}
if(require.main===module)main().catch(()=>{process.exitCode=1;});
module.exports={TRIGGERS,deleteVs1,deleteHistoricalV1,runCleanup};
