import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { CurrentStructuredStateV2, FreeDiagnosisNarrativeV2 } from '../src/domain/freeDiagnosisDesignV2';
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
    q2Future: ['BUSINESS_GROWTH'], q3ItExpectations: ['PRODUCTIVITY'], q4CurrentInterest: 'PRODUCTIVITY',
    q5Visibility: 'VISIBLE_PARTIAL', q6ManagementConnection: 'REPORTED_NOT_DECISION_USABLE', q7InterestThemes: ['AI'],
    ...overrides,
  };
}

function fields(value: CurrentStructuredStateV2): DesignV2CurrentStateFields {
  const { q1CompanyContext: _q1, ...state } = value;
  return state;
}

test('E1 Design v2 Report Draft uses only latest canonical sources and creates a VS1-owned version', async t => {
  const h = await createFreeDiagnosisRuleBasedV1Harness();
  const persistence = new FreeDiagnosisDesignV2PersistenceRepo(h.pool);
  const service = new FreeDiagnosisDesignV2ApiService(h.cases, persistence);
  const auth = new StaffAuthService('design-v2-e1-test-key');
  const cookie = `staff_session=${auth.issueSessionToken({ email: 'e1-operator@atlib.jp' })}`;
  const app = express(); app.use(express.json()); app.use(cookieParser());
  app.use('/api/admin/free-diagnosis-v1', requireStaffAuth(auth), createAdminFreeDiagnosisDesignV2Router(service));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/free-diagnosis-v1`;
  const post = (suffix: string, body?: unknown) => fetch(base + suffix, {
    method: 'POST', headers: { cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  try {
    await h.db.exec(fs.readFileSync(path.join(root, 'migrations/033_free_diagnosis_design_v2_persistence.sql'), 'utf8'));
    const activity = await h.launcher.createSalesActivity({ name: 'E1 report company', contact: { name: 'Operator' }, selectedService: 'IT_KAIZEN' }, 'operator@atlib.jp');
    const kase = await h.cases.createCase(activity.companyId, activity.contactId, activity.salesActivityId, 'operator@atlib.jp');
    const initial = await persistence.initializeDesignV2FromCompletedSurvey({
      caseId: kase.id, answers: survey(), surveyVersion: 'e1-test', entryChannel: 'STAFF_PROXY', answeredByRole: 'OWNER', actor: 'operator@atlib.jp',
    });
    await h.pool.query(
      `INSERT INTO hearing_statement_v2(id,case_id,statement_text,operator_note_text,knowledge_state,structured_answer_json,recorded_by_user_id)
       VALUES($1,$2,$3,$4,'KNOWN',$5,$6)`,
      [randomUUID(), kase.id, 'Hearing only evidence', 'memo must not enter the report', JSON.stringify({ hidden: 'HEARING_ONLY' }), 'operator@atlib.jp'],
    );

    const staleContent = structuredClone(initial.latestGeneratedNarrative.content) as FreeDiagnosisNarrativeV2;
    staleContent.future = { ...staleContent.future, entries: ['STALE HUMAN EDIT MUST NOT BE USED'] };
    const firstEdit = await post(`/cases/${kase.id}/design-v2/narrative-edits`, {
      generatedNarrativeId: initial.latestGeneratedNarrative.id, content: staleContent, editReason: 'initial wording',
    });
    assert.equal(firstEdit.status, 201);

    const revision2 = await post(`/cases/${kase.id}/design-v2/current-state-revisions`, {
      expectedRevision: 1, state: fields(survey({ q5Visibility: 'RELIES_ON_OTHERS' })), changeReason: 'post-hearing update',
    });
    assert.equal(revision2.status, 201);
    const state2 = await revision2.json() as { revisionNo: number };
    const reanalysis = await post(`/cases/${kase.id}/design-v2/reanalyze`, { expectedCurrentStateRevision: state2.revisionNo });
    assert.equal(reanalysis.status, 200);
    const latest = await reanalysis.json() as any;

    const firstDraft = await post(`/cases/${kase.id}/design-v2/report-drafts`);
    assert.equal(firstDraft.status, 201);
    const first = await firstDraft.json() as any;
    await t.test('stale Human Edit is not adopted, and Hearing memo is not an input', async () => {
      assert.equal(first.context.adoptedNarrative.source, 'SYSTEM_GENERATED');
      assert.equal(first.context.generatedNarrative.id, latest.generated.id);
      assert.equal(JSON.stringify(first.content).includes('STALE HUMAN EDIT MUST NOT BE USED'), false);
      assert.equal(JSON.stringify(first.content).includes('Hearing only evidence'), false);
      assert.equal(JSON.stringify(first.content).includes('memo must not enter the report'), false);
    });
    await t.test('the first Draft is VS1-owned and captures exact provenance', async () => {
      const report = (await h.pool.query<any>('SELECT * FROM diagnosis_reports WHERE id=$1', [first.id])).rows[0];
      assert.equal(report.it_management_diagnosis_case_v2_id, kase.id);
      assert.equal(report.diagnosis_case_id, null);
      assert.equal(report.version, 1);
      assert.equal(report.status, 'REVIEW_REQUIRED');
      assert.equal(first.context.currentState.id, latest.current.id);
      assert.equal(first.context.analysisResult.id, latest.analysis.id);
      assert.equal(first.context.generatedNarrative.id, latest.generated.id);
      assert.equal(first.content.formatVersion, 'free-diagnosis-design-v2-report-1');
      assert.deepEqual(first.content.factCandidates, latest.analysis.analysis.factCandidates);
      assert.equal(first.content.assessmentProposal.status, 'NOT_SELECTED');
    });

    const currentContent = structuredClone(latest.generated.content) as FreeDiagnosisNarrativeV2;
    currentContent.currentUnderstanding = { ...currentContent.currentUnderstanding, entries: ['CURRENT HUMAN EDIT IS ADOPTED'] };
    const currentEdit = await post(`/cases/${kase.id}/design-v2/narrative-edits`, {
      generatedNarrativeId: latest.generated.id, content: currentContent, editReason: 'reviewed wording',
    });
    assert.equal(currentEdit.status, 201);
    const currentEditBody = await currentEdit.json() as any;
    const secondDraft = await post(`/cases/${kase.id}/design-v2/report-drafts`);
    assert.equal(secondDraft.status, 201);
    const second = await secondDraft.json() as any;
    await t.test('CURRENT Human Edit wins and each request creates a new report version', async () => {
      assert.equal(second.version, 2);
      assert.equal(second.context.adoptedNarrative.source, 'HUMAN_EDITED');
      assert.equal(second.context.adoptedNarrative.id, currentEditBody.id);
      assert.equal(second.context.adoptedNarrative.generatedNarrativeId, latest.generated.id);
      assert.deepEqual(second.content.sections.find((section: any) => section.key === 'CURRENT_UNDERSTANDING')?.entries, ['CURRENT HUMAN EDIT IS ADOPTED']);
      const audit = await h.pool.query<any>(
        `SELECT detail_json FROM it_management_diagnosis_case_v2_audit
          WHERE case_id=$1 AND command='CreateDesignV2ReportDraft' ORDER BY created_at DESC LIMIT 1`, [kase.id],
      );
      assert.equal(audit.rows[0].detail_json.human_edited_narrative_id, currentEditBody.id);
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await h.close();
  }
});
