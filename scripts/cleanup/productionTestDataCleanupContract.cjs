const fs = require('node:fs');
const crypto = require('node:crypto');

const fail = message => { throw Error(`PRODUCTION_TEST_DATA_CLEANUP_CONTRACT_FAILED:${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const EXPECTED_LEDGER = [
  '027_free_diagnosis_rule_based_v1.sql', '028_free_diagnosis_current_design_v1_phase1_draft.sql',
  '029_vs1_report_feedback_shared_artifacts.sql', '030_sales_activity_marketing_attribution.sql',
  '031_public_customer_self_submission.sql', '032_sales_activity_referral_person_name.sql',
  '033_free_diagnosis_design_v2_persistence.sql', '034_marketing_initiative_v1.sql',
];

function readManifest(filename) {
  const bytes = fs.readFileSync(filename);
  const manifest = JSON.parse(bytes.toString('utf8'));
  assert(manifest.status === 'PREPARED_NOT_AUTHORIZED' && manifest.execution_authorized === false, 'MANIFEST_MUST_NOT_AUTHORIZE_EXECUTION');
  assert(manifest.database === 'sales_tools', 'DATABASE');
  assert(/^[a-f0-9]{40}$/.test(manifest.canonical_base_sha), 'CANONICAL_SHA');
  assert(manifest.historical_v1_case_ids?.length === 1 && manifest.vs1_case_ids?.length === 15, 'CASE_COUNTS');
  const ids = [...manifest.historical_v1_case_ids, ...manifest.vs1_case_ids];
  assert(new Set(ids).size === 16 && ids.every(id => UUID.test(id)), 'CASE_ALLOWLIST');
  for (const [key,length] of [['company_ids',15],['contact_ids',15],['sales_activity_ids',15],['report_ids',3]]) {
    const values=manifest.related_ids?.[key];assert(values?.length===length&&new Set(values).size===length&&values.every(id=>UUID.test(id)),`RELATED_ALLOWLIST:${key}`);
  }
  assert(manifest.preserve?.marketing_initiative_ids?.length === 1 && UUID.test(manifest.preserve.marketing_initiative_ids[0]), 'PRESERVE_INITIATIVE');
  return { manifest, manifestSha256: sha256(bytes) };
}

async function rows(client, sql, values = []) { return (await client.query(sql, values)).rows; }
async function scalar(client, sql, values = []) { return Number((await rows(client, sql, values))[0].count); }

async function verifyLedger(client) {
  const ledger = await rows(client, 'SELECT filename,count(*)::int AS count FROM schema_migrations GROUP BY filename');
  const counts = new Map(ledger.map(row => [row.filename, Number(row.count)]));
  for (const filename of EXPECTED_LEDGER) assert(counts.get(filename) === 1, `LEDGER:${filename}`);
  assert(!ledger.some(row => { const match = /^(\d+)_/.exec(row.filename); return match && Number(match[1]) > 34; }), 'UNEXPECTED_MIGRATION');
  return ledger.length;
}

async function collectState(client, manifest) {
  const v1 = manifest.historical_v1_case_ids;
  const vs1 = manifest.vs1_case_ids;
  const initiative = manifest.preserve.marketing_initiative_ids;
  const counts = {};
  counts.historical_v1_cases = await scalar(client, 'SELECT count(*) FROM diagnosis_cases WHERE id=ANY($1::uuid[])', [v1]);
  counts.vs1_cases = await scalar(client, 'SELECT count(*) FROM it_management_diagnosis_case_v2 WHERE id=ANY($1::uuid[])', [vs1]);
  counts.companies = await scalar(client, 'SELECT count(DISTINCT company_id) FROM it_management_diagnosis_case_v2 WHERE id=ANY($1::uuid[])', [vs1]);
  counts.contacts = await scalar(client, 'SELECT count(DISTINCT contact_id) FROM it_management_diagnosis_case_v2 WHERE id=ANY($1::uuid[])', [vs1]);
  counts.sales_activities = await scalar(client, 'SELECT count(DISTINCT sales_activity_id) FROM it_management_diagnosis_case_v2 WHERE id=ANY($1::uuid[])', [vs1]);
  counts.hearing_intake_responses = await scalar(client, 'SELECT count(*) FROM hearing_intake_response_v2 WHERE case_id=ANY($1::uuid[])', [vs1]);
  counts.hearing_statements = await scalar(client, 'SELECT count(*) FROM hearing_statement_v2 WHERE case_id=ANY($1::uuid[])', [vs1]);
  counts.rule_executions = await scalar(client, 'SELECT count(*) FROM rule_analysis_execution WHERE case_id=ANY($1::uuid[])', [vs1]);
  counts.investigation_outputs = await scalar(client, 'SELECT count(*) FROM investigation_output WHERE rule_analysis_execution_id IN (SELECT id FROM rule_analysis_execution WHERE case_id=ANY($1::uuid[]))', [vs1]);
  counts.assessment_suggestions = await scalar(client, 'SELECT count(*) FROM assessment_structure_suggestion WHERE case_id=ANY($1::uuid[])', [vs1]);
  counts.original_surveys = await scalar(client, 'SELECT count(*) FROM it_management_diagnosis_original_survey_snapshot_v2 WHERE case_id=ANY($1::uuid[])', [vs1]);
  counts.current_states = await scalar(client, 'SELECT count(*) FROM it_management_diagnosis_current_state_revision_v2 WHERE case_id=ANY($1::uuid[])', [vs1]);
  counts.analysis_results = await scalar(client, 'SELECT count(*) FROM it_management_diagnosis_analysis_result_v2 WHERE case_id=ANY($1::uuid[])', [vs1]);
  counts.generated_narratives = await scalar(client, 'SELECT count(*) FROM it_management_diagnosis_generated_narrative_v2 WHERE case_id=ANY($1::uuid[])', [vs1]);
  counts.human_edits = await scalar(client, 'SELECT count(*) FROM it_management_diagnosis_human_edited_narrative_v2 WHERE case_id=ANY($1::uuid[])', [vs1]);
  counts.insights = await scalar(client, 'SELECT count(*) FROM diagnosis_insights WHERE it_management_diagnosis_case_v2_id=ANY($1::uuid[])', [vs1]);
  counts.insight_sources = await scalar(client, 'SELECT count(*) FROM insight_sources WHERE it_management_diagnosis_case_v2_id=ANY($1::uuid[])', [vs1]);
  counts.reports = await scalar(client, 'SELECT count(*) FROM diagnosis_reports WHERE it_management_diagnosis_case_v2_id=ANY($1::uuid[])', [vs1]);
  counts.approved_reports = await scalar(client, "SELECT count(*) FROM diagnosis_reports WHERE it_management_diagnosis_case_v2_id=ANY($1::uuid[]) AND status IN ('APPROVED','DELIVERED')", [vs1]);
  counts.pdf_artifacts = await scalar(client, 'SELECT count(*) FROM diagnosis_report_pdf_artifacts WHERE report_id IN (SELECT id FROM diagnosis_reports WHERE it_management_diagnosis_case_v2_id=ANY($1::uuid[]))', [vs1]);
  counts.feedback_decisions = await scalar(client, 'SELECT count(*) FROM management_feedback_decisions WHERE it_management_diagnosis_case_v2_id=ANY($1::uuid[])', [vs1]);
  counts.case_audits = await scalar(client, 'SELECT count(*) FROM it_management_diagnosis_case_v2_audit WHERE case_id=ANY($1::uuid[])', [vs1]);
  counts.public_submissions = await scalar(client, 'SELECT count(*) FROM it_management_public_self_submission WHERE it_management_diagnosis_case_v2_id=ANY($1::uuid[])', [vs1]);
  counts.initiative_matching_activities = await scalar(client, `SELECT count(*) FROM sales_activity s JOIN marketing_initiative i ON i.initiative_id=ANY($1::uuid[]) AND s.selected_service=i.service_key AND s.utm_source IS NOT DISTINCT FROM i.utm_source AND s.utm_medium IS NOT DISTINCT FROM i.utm_medium AND s.utm_campaign IS NOT DISTINCT FROM i.utm_campaign AND s.utm_content IS NOT DISTINCT FROM i.utm_content AND s.utm_term IS NOT DISTINCT FROM i.utm_term`, [initiative]);
  counts.historical_participants = await scalar(client, 'SELECT count(*) FROM participants WHERE diagnosis_case_id=ANY($1::uuid[])', [v1]);
  counts.historical_survey_responses = await scalar(client, 'SELECT count(*) FROM survey_responses WHERE diagnosis_case_id=ANY($1::uuid[])', [v1]);
  counts.historical_source_records = await scalar(client, 'SELECT count(*) FROM source_records WHERE diagnosis_case_id=ANY($1::uuid[])', [v1]);
  counts.historical_ai_executions = await scalar(client, 'SELECT count(*) FROM ai_executions WHERE diagnosis_case_id=ANY($1::uuid[])', [v1]);
  counts.historical_ai_proposals = await scalar(client, 'SELECT count(*) FROM ai_proposals WHERE diagnosis_case_id=ANY($1::uuid[])', [v1]);
  counts.historical_ai_proposal_sources = await scalar(client, 'SELECT count(*) FROM ai_proposal_sources WHERE diagnosis_case_id=ANY($1::uuid[])', [v1]);
  counts.historical_futures = await scalar(client, 'SELECT count(*) FROM diagnosis_futures WHERE diagnosis_case_id=ANY($1::uuid[])', [v1]);
  counts.historical_themes = await scalar(client, 'SELECT count(*) FROM diagnosis_themes WHERE diagnosis_case_id=ANY($1::uuid[])', [v1]);
  counts.historical_plan_items = await scalar(client, 'SELECT count(*) FROM diagnosis_plan_items WHERE diagnosis_case_id=ANY($1::uuid[])', [v1]);
  counts.historical_policy_acknowledgements = await scalar(client, 'SELECT count(*) FROM diagnosis_policy_acknowledgements WHERE diagnosis_case_id=ANY($1::uuid[])', [v1]);
  counts.historical_transitions = await scalar(client, 'SELECT count(*) FROM case_transitions WHERE diagnosis_case_id=ANY($1::uuid[])', [v1]);
  counts.historical_audit_logs = await scalar(client, 'SELECT count(*) FROM diagnosis_audit_logs WHERE diagnosis_case_id=ANY($1::uuid[])', [v1]);
  counts.historical_participant_roles = await scalar(client, 'SELECT count(*) FROM participant_roles WHERE participant_id IN (SELECT id FROM participants WHERE diagnosis_case_id=ANY($1::uuid[]))', [v1]);
  counts.historical_reports = await scalar(client, 'SELECT count(*) FROM diagnosis_reports WHERE diagnosis_case_id=ANY($1::uuid[])', [v1]);
  counts.active_retention_holds = await scalar(client, 'SELECT count(*) FROM diagnosis_retention_holds WHERE diagnosis_case_id=ANY($1::uuid[]) AND ended_at IS NULL', [v1]);
  return counts;
}

async function assertPreconditions(client, manifest, options = {}) {
  const identity = (await rows(client, "SELECT current_database() AS database,current_user,current_setting('server_version') AS version,current_setting('transaction_read_only') AS read_only"))[0];
  assert(options.syntheticIdentity === true || (identity.database === 'sales_tools' && /^16\./.test(identity.version)), 'DB_IDENTITY');
  if (options.requireReadOnly === true) assert(identity.read_only === 'on', 'READ_ONLY_TRANSACTION_REQUIRED');
  const ledgerCount = await verifyLedger(client);
  const counts = await collectState(client, manifest);
  for (const [key, expected] of Object.entries(manifest.expected_before)) assert(counts[key] === expected, `EXPECTED_COUNT:${key}:${counts[key]}:${expected}`);
  assert(await scalar(client, 'SELECT count(*) FROM marketing_initiative WHERE initiative_id=ANY($1::uuid[])', [manifest.preserve.marketing_initiative_ids]) === 1, 'PRESERVED_INITIATIVE_MISSING');
  const shared = await scalar(client, `WITH target AS (SELECT company_id,contact_id,sales_activity_id FROM it_management_diagnosis_case_v2 WHERE id=ANY($1::uuid[])) SELECT count(*) FROM it_management_diagnosis_case_v2 c WHERE c.id<>ALL($1::uuid[]) AND (c.company_id IN (SELECT company_id FROM target) OR c.contact_id IN (SELECT contact_id FROM target) OR c.sales_activity_id IN (SELECT sales_activity_id FROM target))`, [manifest.vs1_case_ids]);
  assert(shared === 0, 'SHARED_VS1_REFERENCE');
  const targetOwnership = (await rows(client, `WITH target AS (SELECT company_id,contact_id,sales_activity_id FROM it_management_diagnosis_case_v2 WHERE id=ANY($1::uuid[])) SELECT (SELECT count(*) FROM contact WHERE company_id IN (SELECT company_id FROM target))::int AS contacts,(SELECT count(*) FROM sales_activity WHERE company_id IN (SELECT company_id FROM target))::int AS activities`, [manifest.vs1_case_ids]))[0];
  assert(targetOwnership.contacts === manifest.expected_before.contacts && targetOwnership.activities === manifest.expected_before.sales_activities, 'SHARED_COMPANY_CHILDREN');
  const relationMismatch=await scalar(client,`SELECT count(*) FROM it_management_diagnosis_case_v2 WHERE id=ANY($1::uuid[]) AND (company_id<>ALL($2::uuid[]) OR contact_id<>ALL($3::uuid[]) OR sales_activity_id<>ALL($4::uuid[]))`,[manifest.vs1_case_ids,manifest.related_ids.company_ids,manifest.related_ids.contact_ids,manifest.related_ids.sales_activity_ids]);
  assert(relationMismatch===0,'RELATED_ID_MISMATCH');
  assert(await scalar(client,'SELECT count(*) FROM diagnosis_reports WHERE id=ANY($1::uuid[]) AND it_management_diagnosis_case_v2_id=ANY($2::uuid[])',[manifest.related_ids.report_ids,manifest.vs1_case_ids])===3,'REPORT_ID_MISMATCH');
  const v1SharedOrganization = await scalar(client, 'SELECT count(*) FROM diagnosis_cases WHERE id<>ALL($1::uuid[]) AND organization_id IN (SELECT organization_id FROM diagnosis_cases WHERE id=ANY($1::uuid[]))', [manifest.historical_v1_case_ids]);
  assert(v1SharedOrganization === 0, 'SHARED_V1_ORGANIZATION');
  const unsupported = (await rows(client, `SELECT
    (SELECT count(*) FROM diagnosis_report_pdf_artifacts WHERE report_id IN (SELECT id FROM diagnosis_reports WHERE it_management_diagnosis_case_v2_id=ANY($1::uuid[])))::int AS v2_pdf,
    (SELECT count(*) FROM human_reviews WHERE it_management_diagnosis_case_v2_id=ANY($1::uuid[]))::int AS v2_human_review,
    (SELECT count(*) FROM assessment_handoffs WHERE diagnosis_case_id=ANY($2::uuid[]))::int AS v1_handoff,
    (SELECT count(*) FROM diagnosis_report_pdf_artifacts WHERE diagnosis_case_id=ANY($2::uuid[]))::int AS v1_pdf,
    (SELECT count(*) FROM management_feedback_decisions WHERE diagnosis_case_id=ANY($2::uuid[]))::int AS v1_feedback,
    (SELECT count(*) FROM human_reviews WHERE diagnosis_case_id=ANY($2::uuid[]))::int AS v1_human_review,
    (SELECT count(*) FROM assessment_confirmation_items WHERE diagnosis_case_id=ANY($2::uuid[]))::int AS v1_confirmation,
    (SELECT count(*) FROM diagnosis_insights WHERE diagnosis_case_id=ANY($2::uuid[]))::int AS v1_insight,
    (SELECT count(*) FROM insight_sources WHERE diagnosis_case_id=ANY($2::uuid[]))::int AS v1_insight_source,
    (SELECT count(*) FROM assessment_scope_clarifications WHERE diagnosis_case_id=ANY($2::uuid[]))::int AS v1_scope,
    (SELECT count(*) FROM diagnosis_hearing_record_revisions WHERE diagnosis_case_id=ANY($2::uuid[]))::int AS v1_hearing_revision,
    (SELECT count(*) FROM diagnosis_hearing_records WHERE diagnosis_case_id=ANY($2::uuid[]))::int AS v1_hearing,
    (SELECT count(*) FROM diagnosis_public_application_idempotency WHERE diagnosis_case_id=ANY($2::uuid[]))::int AS v1_public_idempotency,
    (SELECT count(*) FROM diagnosis_transcript_consents WHERE diagnosis_case_id=ANY($2::uuid[]))::int AS v1_transcript_consent,
    (SELECT count(*) FROM diagnosis_deletion_requests WHERE diagnosis_case_id=ANY($2::uuid[]))::int AS deletion_request,
    (SELECT count(*) FROM diagnosis_retention_holds WHERE diagnosis_case_id=ANY($2::uuid[]))::int AS retention_hold,
    (SELECT count(*) FROM diagnosis_deletion_tombstones WHERE diagnosis_case_id=ANY($2::uuid[]))::int AS tombstone,
    (SELECT count(*) FROM sales_conversation_intakes WHERE diagnosis_case_id=ANY($2::uuid[]))::int AS conversation_intake,
    (SELECT count(*) FROM sales_intake_audit_logs WHERE diagnosis_case_id=ANY($2::uuid[]))::int AS intake_audit,
    (SELECT count(*) FROM it_management_diagnosis_case_v2 WHERE id=ANY($1::uuid[]) AND feedback_report_id IS NOT NULL)::int AS feedback_pointer`, [manifest.vs1_case_ids, manifest.historical_v1_case_ids]))[0];
  assert(Object.values(unsupported).every(value => Number(value) === 0), `UNSUPPORTED_DEPENDENCY:${JSON.stringify(unsupported)}`);
  return { identity, ledgerCount, counts };
}

module.exports = { readManifest, verifyLedger, collectState, assertPreconditions, EXPECTED_LEDGER, fail, assert, sha256 };
