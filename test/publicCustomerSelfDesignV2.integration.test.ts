import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createFreeDiagnosisRuleBasedV1Harness } from './support/freeDiagnosisRuleBasedV1Harness';
import { designV2PublicSurveyContract, publicCustomerSelfDesignV2SubmissionSchema } from '../src/domain/publicCustomerSelfDesignV2';
import type { PublicCustomerSelfDesignV2Submission } from '../src/domain/publicCustomerSelfDesignV2';

let h: Awaited<ReturnType<typeof createFreeDiagnosisRuleBasedV1Harness>>;
before(async () => { h = await createFreeDiagnosisRuleBasedV1Harness({ includeDesignV2: true }); });
after(async () => { await h?.close(); });

const payload = (key = randomUUID()): PublicCustomerSelfDesignV2Submission => ({
  idempotencyKey: key,
  company: { name: 'Design v2 Customer Self株式会社' },
  contact: { name: '山田 太郎', email: 'yamada@example.test', respondentRole: 'MANAGEMENT' as const },
  survey: {
    q1CompanyContext: { employeeRange: '31〜50人', siteRange: '2〜3か所' },
    q2Future: ['BUSINESS_GROWTH'], q3ItExpectations: ['PRODUCTIVITY', 'MANAGEMENT_DECISION_SUPPORT'],
    q4CurrentInterest: 'MANAGEMENT_DECISION' as const, q5Visibility: 'VISIBLE_PARTIAL' as const,
    q6ManagementConnection: 'REPORTED_NOT_DECISION_USABLE' as const, q7InterestThemes: ['AI'],
  },
  consent: { privacy: true as const, diagnosisUse: true as const, wordingVersion: 'it_management_public_self_consent_v1' as const },
  attribution: { utmSource: 'newsletter', utmMedium: 'email', utmCampaign: 'launch' },
});

test('public contract is the canonical Design v2 Q1–Q7 projection', () => {
  assert.deepEqual(designV2PublicSurveyContract.questions.map(question => question.code), ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7']);
  assert.equal(designV2PublicSurveyContract.questions.find(question => question.code === 'Q3')!.maxSelections, 2);
  assert.equal(designV2PublicSurveyContract.questions.find(question => question.code === 'Q7')!.maxSelections, 3);
  assert.ok(designV2PublicSurveyContract.questions.every(question => question.label.length > 0));
});

test('public route serves the same canonical survey contract', async () => {
  const response = await fetch(h.url + '/api/public/it-management-kaizen/free-diagnosis-v1/survey-contract');
  assert.equal(response.status, 200);
  const contract = await response.json() as { questions: Array<{ code: string }> };
  assert.deepEqual(contract.questions.map(question => question.code), ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7']);
});

test('Customer Self atomically creates Design v2 artifacts, booking state, consent and UTM-only sales attribution', async () => {
  const input = payload(); const created = await h.publicSelf.submit(input);
  assert.equal(created.created, true);
  const caseRow = (await h.pool.query<any>('SELECT status FROM it_management_diagnosis_case_v2 WHERE id=$1', [created.caseId])).rows[0];
  assert.equal(caseRow.status, 'BOOKING_PENDING');
  const original = (await h.pool.query<any>('SELECT entry_channel,entered_by_user_id,answers_json FROM it_management_diagnosis_original_survey_snapshot_v2 WHERE case_id=$1', [created.caseId])).rows[0];
  assert.equal(original.entry_channel, 'CUSTOMER_SELF'); assert.equal(original.entered_by_user_id, null); assert.deepEqual(original.answers_json.q7InterestThemes, ['AI']);
  for (const table of ['it_management_diagnosis_current_state_revision_v2', 'it_management_diagnosis_analysis_result_v2', 'it_management_diagnosis_generated_narrative_v2']) {
    assert.equal((await h.pool.query(`SELECT id FROM ${table} WHERE case_id=$1`, [created.caseId])).rowCount, 1);
  }
  assert.equal((await h.pool.query('SELECT id FROM hearing_intake_response_v2 WHERE case_id=$1', [created.caseId])).rowCount, 0);
  const activity = (await h.pool.query<any>('SELECT utm_source,utm_medium,acquisition_source_type FROM sales_activity WHERE id=(SELECT sales_activity_id FROM it_management_public_self_submission WHERE it_management_diagnosis_case_v2_id=$1)', [created.caseId])).rows[0];
  assert.deepEqual(activity, { utm_source: 'newsletter', utm_medium: 'email', acquisition_source_type: null });
  assert.equal((await h.pool.query('SELECT idempotency_key FROM it_management_public_self_submission WHERE it_management_diagnosis_case_v2_id=$1', [created.caseId])).rowCount, 1);
});

test('same key returns the same Design v2 Case without multiplying artifacts', async () => {
  const input = payload(); const first = await h.publicSelf.submit(input); const second = await h.publicSelf.submit(input);
  assert.equal(second.created, false); assert.equal(second.caseId, first.caseId);
  assert.equal((await h.pool.query('SELECT id FROM it_management_diagnosis_original_survey_snapshot_v2 WHERE case_id=$1', [first.caseId])).rowCount, 1);
  await assert.rejects(h.publicSelf.submit({ ...input, company: { name: '別会社' } }), /IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_SUBMISSION/);
});

test('invalid canonical answers fail before any partial Customer Self records', async () => {
  const input: any = payload(); input.company.name = 'Invalid Design v2 Customer Self株式会社'; input.survey.q3ItExpectations = ['PRODUCTIVITY', 'DATA_USE', 'RESILIENCE'];
  assert.equal(publicCustomerSelfDesignV2SubmissionSchema.safeParse(input).success, false);
  assert.equal((await h.pool.query("SELECT id FROM company WHERE name='Invalid Design v2 Customer Self株式会社'")).rowCount, 0);
});
