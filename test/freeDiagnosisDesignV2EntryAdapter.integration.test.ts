import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { CurrentStructuredStateV2 } from '../src/domain/freeDiagnosisDesignV2';
import { FreeDiagnosisDesignV2ValidationError } from '../src/domain/freeDiagnosisSemanticProjectionV2';
import { FreeDiagnosisDesignV2EntryAdapter, FreeDiagnosisDesignV2EntryAdapterError } from '../src/services/freeDiagnosisDesignV2EntryAdapter';
import { FreeDiagnosisDesignV2PersistenceRepo, FreeDiagnosisDesignV2PersistenceError } from '../src/services/freeDiagnosisDesignV2PersistenceRepo';
import { createFreeDiagnosisRuleBasedV1Harness } from './support/freeDiagnosisRuleBasedV1Harness';

const root = path.resolve(__dirname, '..');

function survey(overrides: Partial<CurrentStructuredStateV2> = {}): CurrentStructuredStateV2 {
  return {
    q1CompanyContext: { employeeRange: '11-30', siteRange: 'ONE' },
    q2Future: ['BUSINESS_GROWTH'],
    q3ItExpectations: ['PRODUCTIVITY', 'MANAGEMENT_DECISION_SUPPORT'],
    q4CurrentInterest: 'MANAGEMENT_DECISION',
    q5Visibility: 'VISIBLE_PARTIAL',
    q6ManagementConnection: 'REPORTED_NOT_DECISION_USABLE',
    q7InterestThemes: ['AI'],
    ...overrides,
  };
}

async function createCase(h: Awaited<ReturnType<typeof createFreeDiagnosisRuleBasedV1Harness>>, name: string) {
  const activity = await h.launcher.createSalesActivity({ name, contact: { name: '担当者' }, selectedService: 'IT_KAIZEN' }, 'operator@atlib.jp');
  return h.cases.createCase(activity.companyId, activity.contactId, activity.salesActivityId, 'operator@atlib.jp');
}

async function artifactCounts(h: Awaited<ReturnType<typeof createFreeDiagnosisRuleBasedV1Harness>>, caseId: string) {
  const { rows } = await h.pool.query<{
    original_count: number; current_count: number; analysis_count: number; narrative_count: number; audit_count: number;
  }>(`SELECT
      (SELECT count(*)::int FROM it_management_diagnosis_original_survey_snapshot_v2 WHERE case_id=$1) original_count,
      (SELECT count(*)::int FROM it_management_diagnosis_current_state_revision_v2 WHERE case_id=$1) current_count,
      (SELECT count(*)::int FROM it_management_diagnosis_analysis_result_v2 WHERE case_id=$1) analysis_count,
      (SELECT count(*)::int FROM it_management_diagnosis_generated_narrative_v2 WHERE case_id=$1) narrative_count,
      (SELECT count(*)::int FROM it_management_diagnosis_case_v2_audit WHERE case_id=$1 AND command='CompleteDesignV2OriginalSurvey') audit_count`, [caseId]);
  return rows[0]!;
}

test('E4-A Design v2 entry adapter acceptance', async t => {
  const h = await createFreeDiagnosisRuleBasedV1Harness();
  try {
    await h.db.exec(fs.readFileSync(path.join(root, 'migrations/033_free_diagnosis_design_v2_persistence.sql'), 'utf8'));
    const adapter = new FreeDiagnosisDesignV2EntryAdapter(new FreeDiagnosisDesignV2PersistenceRepo(h.pool));

    await t.test('CUSTOMER_SELF initializes canonical artifacts and advances to booking pending', async () => {
      const kase = await createCase(h, 'Customer Self');
      const result = await adapter.complete({
        caseId: kase.id, answers: survey(), surveyVersion: 'design-v2-entry-test', entryChannel: 'CUSTOMER_SELF',
        answeredByRole: 'MANAGEMENT', enteredByUserId: null, actor: 'public-customer-self',
      });
      assert.equal(result.caseStatus, 'BOOKING_PENDING');
      assert.equal(result.workspace.originalSurvey.entryChannel, 'CUSTOMER_SELF');
      assert.equal(result.workspace.originalSurvey.enteredByUserId, null);
      assert.equal(result.workspace.currentStructuredState.revisionNo, 1);
      assert.ok(result.workspace.latestAnalysisResult.analysis.factCandidates.length > 0);
      assert.ok(result.workspace.latestGeneratedNarrative.id);
      assert.deepEqual(await artifactCounts(h, kase.id), { original_count: 1, current_count: 1, analysis_count: 1, narrative_count: 1, audit_count: 1 });
      assert.equal((await h.cases.getCase(kase.id))?.status, 'BOOKING_PENDING');
    });

    await t.test('STAFF_PROXY records its authenticated actor and advances to intake completed', async () => {
      const kase = await createCase(h, 'Staff Proxy');
      const result = await adapter.complete({
        caseId: kase.id, answers: survey(), surveyVersion: 'design-v2-entry-test', entryChannel: 'STAFF_PROXY',
        answeredByRole: 'MANAGEMENT', enteredByUserId: 'operator@atlib.jp', actor: 'operator@atlib.jp',
      });
      assert.equal(result.caseStatus, 'INTAKE_COMPLETED');
      assert.equal(result.workspace.originalSurvey.entryChannel, 'STAFF_PROXY');
      assert.equal(result.workspace.originalSurvey.enteredByUserId, 'operator@atlib.jp');
      assert.equal((await h.cases.getCase(kase.id))?.status, 'INTAKE_COMPLETED');
    });

    await t.test('the same survey has equal semantic state and analysis regardless of entry provenance', async () => {
      const customer = await createCase(h, 'Equivalent Self');
      const staff = await createCase(h, 'Equivalent Staff');
      const self = await adapter.complete({ caseId: customer.id, answers: survey(), surveyVersion: 'design-v2-entry-test', entryChannel: 'CUSTOMER_SELF', answeredByRole: 'MANAGEMENT', enteredByUserId: null, actor: 'public-customer-self' });
      const proxy = await adapter.complete({ caseId: staff.id, answers: survey(), surveyVersion: 'design-v2-entry-test', entryChannel: 'STAFF_PROXY', answeredByRole: 'MANAGEMENT', enteredByUserId: 'operator@atlib.jp', actor: 'operator@atlib.jp' });
      assert.deepEqual(self.workspace.currentStructuredState.state, proxy.workspace.currentStructuredState.state);
      assert.deepEqual(self.workspace.latestAnalysisResult.analysis, proxy.workspace.latestAnalysisResult.analysis);
    });

    await t.test('invalid canonical enum, selection count, and exclusivity reject without artifacts or a lifecycle transition', async () => {
      const invalidEnum = await createCase(h, 'Invalid Enum');
      const invalidCount = await createCase(h, 'Invalid Count');
      const invalidExclusive = await createCase(h, 'Invalid Exclusive');
      const reject = async (caseId: string, answers: CurrentStructuredStateV2) => {
        await assert.rejects(adapter.complete({
          caseId, answers, surveyVersion: 'test', entryChannel: 'CUSTOMER_SELF', answeredByRole: 'MANAGEMENT',
          enteredByUserId: null, actor: 'public-customer-self',
        }), FreeDiagnosisDesignV2ValidationError);
        assert.deepEqual(await artifactCounts(h, caseId), { original_count: 0, current_count: 0, analysis_count: 0, narrative_count: 0, audit_count: 0 });
        assert.equal((await h.cases.getCase(caseId))?.status, 'INTAKE_IN_PROGRESS');
      };
      await reject(invalidEnum.id, survey({ q5Visibility: 'NOT_A_CANONICAL_VALUE' as CurrentStructuredStateV2['q5Visibility'] }));
      await reject(invalidCount.id, survey({ q3ItExpectations: ['PRODUCTIVITY', 'DATA_USE', 'RESILIENCE'] }));
      await reject(invalidExclusive.id, survey({ q2Future: ['BUSINESS_GROWTH', 'UNDECIDED'] }));
    });

    await t.test('a missing Case is rejected before artifacts can exist', async () => {
      await assert.rejects(adapter.complete({
        caseId: randomUUID(), answers: survey(), surveyVersion: 'test', entryChannel: 'CUSTOMER_SELF',
        answeredByRole: 'MANAGEMENT', enteredByUserId: null, actor: 'public-customer-self',
      }), (error: unknown) => error instanceof FreeDiagnosisDesignV2PersistenceError && error.code === 'CASE_NOT_FOUND');
    });

    await t.test('invalid channel and actor combinations reject before initialization', async () => {
      const customer = await createCase(h, 'Invalid Customer');
      const staff = await createCase(h, 'Invalid Staff');
      await assert.rejects(adapter.complete({ caseId: customer.id, answers: survey(), surveyVersion: 'test', entryChannel: 'CUSTOMER_SELF', answeredByRole: 'MANAGEMENT', enteredByUserId: 'operator@atlib.jp', actor: 'public-customer-self' }), FreeDiagnosisDesignV2EntryAdapterError);
      await assert.rejects(adapter.complete({ caseId: staff.id, answers: survey(), surveyVersion: 'test', entryChannel: 'STAFF_PROXY', answeredByRole: 'MANAGEMENT', enteredByUserId: null, actor: 'operator@atlib.jp' }), FreeDiagnosisDesignV2EntryAdapterError);
      assert.deepEqual(await artifactCounts(h, customer.id), { original_count: 0, current_count: 0, analysis_count: 0, narrative_count: 0, audit_count: 0 });
      assert.deepEqual(await artifactCounts(h, staff.id), { original_count: 0, current_count: 0, analysis_count: 0, narrative_count: 0, audit_count: 0 });
    });

    await t.test('duplicate initialization rejects without artifact growth or another status transition', async () => {
      const kase = await createCase(h, 'Duplicate');
      await adapter.complete({ caseId: kase.id, answers: survey(), surveyVersion: 'test', entryChannel: 'STAFF_PROXY', answeredByRole: 'MANAGEMENT', enteredByUserId: 'operator@atlib.jp', actor: 'operator@atlib.jp' });
      const before = await artifactCounts(h, kase.id);
      await assert.rejects(adapter.complete({ caseId: kase.id, answers: survey(), surveyVersion: 'test', entryChannel: 'STAFF_PROXY', answeredByRole: 'MANAGEMENT', enteredByUserId: 'operator@atlib.jp', actor: 'operator@atlib.jp' }), FreeDiagnosisDesignV2PersistenceError);
      assert.deepEqual(await artifactCounts(h, kase.id), before);
      assert.equal((await h.cases.getCase(kase.id))?.status, 'INTAKE_COMPLETED');
    });

    await t.test('analyzer failure rolls back artifacts and leaves case status unchanged', async () => {
      const kase = await createCase(h, 'Analyzer Failure');
      const failing = new FreeDiagnosisDesignV2EntryAdapter(new FreeDiagnosisDesignV2PersistenceRepo(h.pool, () => { throw new Error('analyzer failed'); }));
      await assert.rejects(failing.complete({ caseId: kase.id, answers: survey(), surveyVersion: 'test', entryChannel: 'STAFF_PROXY', answeredByRole: 'MANAGEMENT', enteredByUserId: 'operator@atlib.jp', actor: 'operator@atlib.jp' }));
      assert.deepEqual(await artifactCounts(h, kase.id), { original_count: 0, current_count: 0, analysis_count: 0, narrative_count: 0, audit_count: 0 });
      assert.equal((await h.cases.getCase(kase.id))?.status, 'INTAKE_IN_PROGRESS');
    });
  } finally { await h.close(); }
});
