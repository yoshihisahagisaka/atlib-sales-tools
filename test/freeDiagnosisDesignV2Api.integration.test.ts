import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import express from 'express';
import cookieParser from 'cookie-parser';
import { analyzeFreeDiagnosisV2 } from '../src/domain/freeDiagnosisAnalysisV2';
import type { CurrentStructuredStateV2 } from '../src/domain/freeDiagnosisDesignV2';
import { requireStaffAuth } from '../src/middleware/staffAuth';
import { createAdminFreeDiagnosisDesignV2Router } from '../src/routes/adminFreeDiagnosisDesignV2';
import { FreeDiagnosisDesignV2ApiService } from '../src/services/freeDiagnosisDesignV2ApiService';
import { FreeDiagnosisDesignV2PersistenceRepo, type DesignV2CurrentStateFields } from '../src/services/freeDiagnosisDesignV2PersistenceRepo';
import { StaffAuthService } from '../src/services/staffAuthService';
import { createFreeDiagnosisRuleBasedV1Harness } from './support/freeDiagnosisRuleBasedV1Harness';

const root = path.resolve(__dirname, '..');

function survey(overrides: Partial<CurrentStructuredStateV2> = {}): CurrentStructuredStateV2 {
  return {
    q1CompanyContext: { employeeRange: '11-30', siteRange: 'ONE' },
    q2Future: ['BUSINESS_GROWTH', 'LEAN_GROWTH'],
    q3ItExpectations: ['PRODUCTIVITY', 'MANAGEMENT_DECISION_SUPPORT'],
    q4CurrentInterest: 'MANAGEMENT_DECISION',
    q5Visibility: 'VISIBLE_PARTIAL',
    q6ManagementConnection: 'REPORTED_NOT_DECISION_USABLE',
    q7InterestThemes: ['AI'],
    ...overrides,
  };
}

function fields(value: CurrentStructuredStateV2): DesignV2CurrentStateFields {
  const { q1CompanyContext: _q1, ...state } = value;
  return state;
}

test('Package C Design v2 Admin API acceptance (24 contracts)', async t => {
  const h = await createFreeDiagnosisRuleBasedV1Harness();
  let failNextAnalysis = false;
  const persistence = new FreeDiagnosisDesignV2PersistenceRepo(h.pool, state => {
    if (failNextAnalysis) { failNextAnalysis = false; throw new Error('injected analysis failure'); }
    return analyzeFreeDiagnosisV2(state);
  });
  const service = new FreeDiagnosisDesignV2ApiService(h.cases, persistence);
  const auth = new StaffAuthService('package-c-disposable-key');
  const cookie = `staff_session=${auth.issueSessionToken({ email: 'design-v2-operator@atlib.jp' })}`;
  const app = express();
  app.use(express.json()); app.use(cookieParser());
  app.use('/api/admin/free-diagnosis-v1', requireStaffAuth(auth), createAdminFreeDiagnosisDesignV2Router(service));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/free-diagnosis-v1`;

  async function api(method: string, suffix: string, body?: unknown, authenticated = true) {
    return fetch(base + suffix, {
      method,
      headers: {
        ...(authenticated ? { cookie } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  try {
    await h.db.exec(fs.readFileSync(path.join(root, 'migrations/033_free_diagnosis_design_v2_persistence.sql'), 'utf8'));
    const activity = await h.launcher.createSalesActivity({ name: 'Package C', contact: { name: 'A' }, selectedService: 'IT_KAIZEN' }, 'operator@atlib.jp');
    const kase = await h.cases.createCase(activity.companyId, activity.contactId, activity.salesActivityId, 'operator@atlib.jp');
    const initial = await persistence.initializeDesignV2FromCompletedSurvey({
      caseId: kase.id, answers: survey(), surveyVersion: 'design-v2-api-test', entryChannel: 'STAFF_PROXY',
      answeredByRole: 'OWNER', actor: 'operator@atlib.jp',
    });
    await h.pool.query(
      `INSERT INTO hearing_statement_v2
       (id,case_id,statement_text,operator_note_text,knowledge_state,structured_answer_json,recorded_by_user_id)
       VALUES($1,$2,$3,$4,'KNOWN',$5,$6)`,
      [randomUUID(), kase.id, '表示用のHearing記録', 'Ruleへ渡さないoperator note', JSON.stringify({ semanticKey: 'DISPLAY_ONLY' }), 'operator@atlib.jp'],
    );
    const reportCountBefore = Number((await h.pool.query('SELECT count(*)::int count FROM diagnosis_reports')).rows[0].count);

    const firstResponse = await api('GET', `/cases/${kase.id}/design-v2/post-hearing-analysis`);
    const first = await firstResponse.json() as any;
    await t.test('1 Original and Current are separate response objects', () => {
      assert.equal(firstResponse.status, 200);
      assert.notEqual(first.originalSurvey, first.currentStructuredState);
      assert.deepEqual(first.originalSurvey.answers.q2Future, first.currentStructuredState.q2Future);
      assert.equal(first.currentStateRevision.revisionNo, 1);
    });
    await t.test('2 Hearing records are display material in Workspace', () => {
      assert.equal(first.hearingRecords.length, 1);
      assert.equal(first.hearingRecords[0].operatorNoteText, 'Ruleへ渡さないoperator note');
      assert.equal(first.hearingRecords[0].structuredAnswer.semanticKey, 'DISPLAY_ONLY');
    });

    const revision2State = fields(survey({ q5Visibility: 'RELIES_ON_OTHERS' }));
    const save2Response = await api('POST', `/cases/${kase.id}/design-v2/current-state-revisions`, {
      expectedRevision: 1, state: revision2State, supplements: { q5: 'Human-confirmed' },
      changeReason: 'Hearingで確認',
    });
    const saved2 = await save2Response.json() as any;
    await t.test('3 Saving Q5 appends revision and uses authenticated actor', () => {
      assert.equal(save2Response.status, 201);
      assert.equal(saved2.revisionNo, 2);
      assert.equal(saved2.updatedByUserId, 'design-v2-operator@atlib.jp');
      assert.equal(saved2.state.q5Visibility, 'RELIES_ON_OTHERS');
    });
    await t.test('4 Original remains immutable after Current save', async () => {
      const original = await persistence.getOriginalSurvey(kase.id);
      assert.equal(original?.contentHash, initial.originalSurvey.contentHash);
      assert.equal(original?.answers.q5Visibility, 'VISIBLE_PARTIAL');
    });
    await t.test('5 Save does not run analysis and freshness becomes required', async () => {
      const workspace = await (await api('GET', `/cases/${kase.id}/design-v2/post-hearing-analysis`)).json() as any;
      assert.equal(workspace.analysisFreshness, 'REANALYSIS_REQUIRED');
      assert.equal(workspace.latestAnalysisResult, null);
      assert.equal(workspace.latestGeneratedNarrative, null);
    });

    const reanalysis2Response = await api('POST', `/cases/${kase.id}/design-v2/reanalyze`, { expectedCurrentStateRevision: 2 });
    const reanalysis2 = await reanalysis2Response.json() as any;
    await t.test('6 Re-analysis makes exact latest revision CURRENT', async () => {
      assert.equal(reanalysis2Response.status, 200);
      assert.equal(reanalysis2.current.revisionNo, 2);
      const workspace = await (await api('GET', `/cases/${kase.id}/design-v2/post-hearing-analysis`)).json() as any;
      assert.equal(workspace.analysisFreshness, 'CURRENT');
      assert.equal(workspace.latestAnalysisResult.currentStateId, saved2.id);
    });
    await t.test('7 Q5 change produces a new Narrative generation', () => {
      assert.notEqual(reanalysis2.generated.contentHash, initial.latestGeneratedNarrative.contentHash);
    });

    await h.pool.query(
      `INSERT INTO hearing_statement_v2
       (id,case_id,statement_text,operator_note_text,knowledge_state,structured_answer_json,recorded_by_user_id)
       VALUES($1,$2,'changed memo only','INJECTED_NOTE','KNOWN',$3,'operator@atlib.jp')`,
      [randomUUID(), kase.id, JSON.stringify({ semanticKey: 'INJECTED', answerValue: 'INJECTED' })],
    );
    const save3 = await api('POST', `/cases/${kase.id}/design-v2/current-state-revisions`, {
      expectedRevision: 2, state: revision2State, changeReason: 'same semantic state',
    });
    assert.equal(save3.status, 201);
    const reanalysis3 = await (await api('POST', `/cases/${kase.id}/design-v2/reanalyze`, { expectedCurrentStateRevision: 3 })).json() as any;
    await t.test('8 Hearing memo alone does not change semantic analysis', () => {
      assert.equal(reanalysis3.analysis.resultHash, reanalysis2.analysis.resultHash);
      assert.equal(JSON.stringify(reanalysis3.analysis.analysis).includes('INJECTED'), false);
    });

    await t.test('9 expectedRevision mismatch returns 409', async () => {
      const response = await api('POST', `/cases/${kase.id}/design-v2/current-state-revisions`, { expectedRevision: 2, state: revision2State });
      assert.equal(response.status, 409);
      assert.equal((await response.json() as any).error, 'CURRENT_STATE_REVISION_CONFLICT');
    });

    await t.test('10 Concurrent saves with one revision allow exactly one success', async () => {
      const activityC = await h.launcher.createSalesActivity({ name: 'Package C concurrency', contact: { name: 'C' }, selectedService: 'IT_KAIZEN' }, 'operator@atlib.jp');
      const caseC = await h.cases.createCase(activityC.companyId, activityC.contactId, activityC.salesActivityId, 'operator@atlib.jp');
      await persistence.initializeDesignV2FromCompletedSurvey({ caseId: caseC.id, answers: survey(), surveyVersion: 'test', entryChannel: 'STAFF_PROXY', answeredByRole: 'OWNER', actor: 'operator@atlib.jp' });
      const responses = await Promise.all([
        api('POST', `/cases/${caseC.id}/design-v2/current-state-revisions`, { expectedRevision: 1, state: fields(survey({ q5Visibility: 'VISIBLE_FULL' })) }),
        api('POST', `/cases/${caseC.id}/design-v2/current-state-revisions`, { expectedRevision: 1, state: fields(survey({ q5Visibility: 'LOW_VISIBILITY' })) }),
      ]);
      assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
    });

    const editResponse = await api('POST', `/cases/${kase.id}/design-v2/narrative-edits`, {
      generatedNarrativeId: reanalysis3.generated.id,
      content: reanalysis3.generated.content,
      editReason: 'Human wording confirmation',
    });
    const edit = await editResponse.json() as any;
    await t.test('17 Human Edit is append-only and derives CURRENT', async () => {
      assert.equal(editResponse.status, 201);
      const workspace = await (await api('GET', `/cases/${kase.id}/design-v2/post-hearing-analysis`)).json() as any;
      assert.equal(workspace.humanEditedNarrativeStatus, 'CURRENT');
      assert.equal(workspace.latestHumanEditedNarrative.id, edit.id);
    });

    const revision4State = fields(survey({ q5Visibility: 'LOW_VISIBILITY' }));
    const save4Response = await api('POST', `/cases/${kase.id}/design-v2/current-state-revisions`, {
      expectedRevision: 3, state: revision4State, changeReason: 'further confirmation',
    });
    assert.equal(save4Response.status, 201);
    await t.test('18 Current change makes the old Human Edit stale without mutation', async () => {
      const workspace = await (await api('GET', `/cases/${kase.id}/design-v2/post-hearing-analysis`)).json() as any;
      assert.equal(workspace.humanEditedNarrativeStatus, 'STALE_REVIEW_REQUIRED');
      assert.equal(workspace.latestHumanEditedNarrative.id, edit.id);
    });

    failNextAnalysis = true;
    const failedAnalysis = await api('POST', `/cases/${kase.id}/design-v2/reanalyze`, { expectedCurrentStateRevision: 4 });
    await t.test('11 Analyzer failure preserves Human Current revision', async () => {
      assert.equal(failedAnalysis.status, 500);
      assert.equal((await failedAnalysis.json() as any).error, 'ANALYSIS_FAILED');
      const revisions = await persistence.listCurrentStateRevisions(kase.id);
      assert.deepEqual(revisions.map(item => item.revisionNo), [1, 2, 3, 4]);
    });
    await t.test('12 Analyzer failure leaves no Analysis or Generated for that revision', async () => {
      const workspace = await persistence.getDesignV2PersistenceWorkspace(kase.id);
      assert.equal(workspace?.latestAnalysisResult, null);
      assert.equal(workspace?.latestGeneratedNarrative, null);
    });
    await t.test('13 Analyzer failure derives REANALYSIS_REQUIRED', async () => {
      const workspace = await (await api('GET', `/cases/${kase.id}/design-v2/post-hearing-analysis`)).json() as any;
      assert.equal(workspace.analysisFreshness, 'REANALYSIS_REQUIRED');
      assert.equal(workspace.currentStateRevision.revisionNo, 4);
    });
    const retryResponse = await api('POST', `/cases/${kase.id}/design-v2/reanalyze`, { expectedCurrentStateRevision: 4 });
    const retry = await retryResponse.json() as any;
    await t.test('14 Failed analysis can be retried and identical retry is idempotent', async () => {
      assert.equal(retryResponse.status, 200);
      const second = await (await api('POST', `/cases/${kase.id}/design-v2/reanalyze`, { expectedCurrentStateRevision: 4 })).json() as any;
      assert.equal(second.reused, true);
      assert.equal(second.analysis.id, retry.analysis.id);
      assert.equal(second.generated.id, retry.generated.id);
    });

    await t.test('15 Q7 AI interest does not become an AI recommendation', async () => {
      const activityAi = await h.launcher.createSalesActivity({ name: 'AI interest', contact: { name: 'AI' }, selectedService: 'IT_KAIZEN' }, 'operator@atlib.jp');
      const caseAi = await h.cases.createCase(activityAi.companyId, activityAi.contactId, activityAi.salesActivityId, 'operator@atlib.jp');
      const result = await persistence.initializeDesignV2FromCompletedSurvey({ caseId: caseAi.id, answers: survey({ q7InterestThemes: ['AI'] }), surveyVersion: 'test', entryChannel: 'STAFF_PROXY', answeredByRole: 'OWNER', actor: 'operator@atlib.jp' });
      assert.equal(JSON.stringify(result.latestGeneratedNarrative.content).includes('AIを導入'), false);
    });
    await t.test('16 Healthy state does not force a Problem, Gap, or Assessment', async () => {
      const activityHealthy = await h.launcher.createSalesActivity({ name: 'Healthy', contact: { name: 'H' }, selectedService: 'IT_KAIZEN' }, 'operator@atlib.jp');
      const caseHealthy = await h.cases.createCase(activityHealthy.companyId, activityHealthy.contactId, activityHealthy.salesActivityId, 'operator@atlib.jp');
      const healthy = await persistence.initializeDesignV2FromCompletedSurvey({
        caseId: caseHealthy.id,
        answers: survey({ q5Visibility: 'VISIBLE_FULL', q6ManagementConnection: 'STRATEGICALLY_CONNECTED', q7InterestThemes: ['UNDECIDED'] }),
        surveyVersion: 'test', entryChannel: 'STAFF_PROXY', answeredByRole: 'OWNER', actor: 'operator@atlib.jp',
      });
      assert.equal(healthy.latestAnalysisResult.analysis.healthyGuard.noImportantGapIdentified, true);
      assert.equal(JSON.stringify(healthy.latestGeneratedNarrative.content).includes('Assessment'), false);
    });
    await t.test('19 New edit against stale Generated is rejected', async () => {
      const response = await api('POST', `/cases/${kase.id}/design-v2/narrative-edits`, {
        generatedNarrativeId: reanalysis3.generated.id, content: reanalysis3.generated.content,
      });
      assert.equal(response.status, 409);
      assert.equal((await response.json() as any).error, 'STALE_GENERATED_NARRATIVE');
    });
    await t.test('20 Cross-case Generated edit is rejected', async () => {
      const activityB = await h.launcher.createSalesActivity({ name: 'Package C B', contact: { name: 'B' }, selectedService: 'IT_KAIZEN' }, 'operator@atlib.jp');
      const caseB = await h.cases.createCase(activityB.companyId, activityB.contactId, activityB.salesActivityId, 'operator@atlib.jp');
      await persistence.initializeDesignV2FromCompletedSurvey({ caseId: caseB.id, answers: survey(), surveyVersion: 'test', entryChannel: 'STAFF_PROXY', answeredByRole: 'OWNER', actor: 'operator@atlib.jp' });
      const response = await api('POST', `/cases/${caseB.id}/design-v2/narrative-edits`, {
        generatedNarrativeId: retry.generated.id, content: retry.generated.content,
      });
      assert.equal(response.status, 409);
    });
    await t.test('21 Invalid semantic code is rejected', async () => {
      const response = await api('POST', `/cases/${kase.id}/design-v2/current-state-revisions`, {
        expectedRevision: 4, state: { ...revision4State, q5Visibility: 'FABRICATED_CODE' },
      });
      assert.equal(response.status, 400);
      assert.equal((await response.json() as any).error, 'INVALID_REQUEST');
    });
    await t.test('22 Unauthenticated Design v2 API access is rejected', async () => {
      const response = await api('GET', `/cases/${kase.id}/design-v2/post-hearing-analysis`, undefined, false);
      assert.equal(response.status, 401);
    });
    await t.test('23 Structured Hearing content is display-only, not analyzer input', () => {
      assert.equal(JSON.stringify(reanalysis3.analysis.analysis).includes('DISPLAY_ONLY'), false);
      assert.equal(JSON.stringify(reanalysis3.analysis.analysis).includes('INJECTED'), false);
    });
    await t.test('24 Package C does not finalize a customer Report', async () => {
      const after = Number((await h.pool.query('SELECT count(*)::int count FROM diagnosis_reports')).rows[0].count);
      assert.equal(after, reportCountBefore);
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await h.close();
  }
});
