import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createFreeDiagnosisRuleBasedV1Harness } from './support/freeDiagnosisRuleBasedV1Harness';
import { FreeDiagnosisDesignV2PersistenceRepo } from '../src/services/freeDiagnosisDesignV2PersistenceRepo';

const survey = {
  q1CompanyContext: { employeeRange: 'EMP_21_50', siteRange: 'SITE_1' },
  q2Future: ['BUSINESS_GROWTH', 'LEAN_GROWTH'] as const,
  q3ItExpectations: ['PRODUCTIVITY', 'MANAGEMENT_DECISION_SUPPORT'] as const,
  q4CurrentInterest: 'MANAGEMENT_DECISION' as const,
  q5Visibility: 'VISIBLE_PARTIAL' as const,
  q6ManagementConnection: 'REPORTED_NOT_DECISION_USABLE' as const,
  q7InterestThemes: ['AI'] as const,
};

test('Package D reuses append-only plain Hearing memo without changing Design v2 semantics', async () => {
  const h = await createFreeDiagnosisRuleBasedV1Harness();
  try {
    await h.db.exec(fs.readFileSync(path.resolve(__dirname, '../migrations/033_free_diagnosis_design_v2_persistence.sql'), 'utf8'));
    const activity = await h.launcher.createSalesActivity({ name: 'Package D memo', contact: { name: '担当者' }, selectedService: 'IT_KAIZEN' }, 'operator@atlib.jp');
    const kase = await h.cases.createCase(activity.companyId, activity.contactId, activity.salesActivityId, 'operator@atlib.jp');
    const persistence = new FreeDiagnosisDesignV2PersistenceRepo(h.pool);
    const initialized = await persistence.initializeDesignV2FromCompletedSurvey({ caseId: kase.id, answers: survey, surveyVersion: 'package-d-test', entryChannel: 'STAFF_PROXY', answeredByRole: 'OWNER', actor: 'operator@atlib.jp' });
    await h.pool.query("UPDATE it_management_diagnosis_case_v2 SET status='HEARING_IN_PROGRESS' WHERE id=$1", [kase.id]);
    const response = await fetch(`${h.url}/api/admin/free-diagnosis-v1/cases/${kase.id}/hearing/statements`, { method: 'POST', headers: { cookie: h.staffCookie, 'content-type': 'application/json' }, body: JSON.stringify({ statementText: '<img src=x onerror=alert(1)> plain memo', knowledgeState: 'KNOWN', requiresIndividualConfirmation: false, isNegativeAnswer: false }) });
    assert.equal(response.status, 201);
    const row = (await h.pool.query('SELECT plan_item_ref,structured_answer_json,statement_text,recorded_by_user_id FROM hearing_statement_v2 WHERE case_id=$1', [kase.id])).rows[0];
    assert.equal(row.plan_item_ref, null); assert.equal(row.structured_answer_json, null);
    assert.equal(row.statement_text, '<img src=x onerror=alert(1)> plain memo'); assert.equal(row.recorded_by_user_id, 'operator@atlib.jp');
    const after = await persistence.getDesignV2PersistenceWorkspace(kase.id);
    assert.equal(after?.currentStructuredState.revisionNo, 1);
    assert.equal(after?.latestAnalysisResult?.resultHash, initialized.latestAnalysisResult.resultHash);
    assert.equal((await persistence.listDesignV2HearingRecords(kase.id))[0]!.structuredAnswer, null);
  } finally { await h.close(); }
});
