import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contentHash } from '../src/domain/diagnosisReport';
import { DESIGN_V2_REPORT_FORMAT_VERSION, type DesignV2ReportContent } from '../src/domain/freeDiagnosisDesignV2Report';
import type { PaidAssessmentSourceHandoff } from '../src/services/paidAssessmentSourceHandoffRepo';
import { preparePaidAssessmentFromDesignV2, type DesignV2PreparationSelection } from '../src/services/paidAssessmentPreparationBridge';

const caseId = '11111111-1111-4111-8111-111111111111';
const reportId = '22222222-2222-4222-8222-222222222222';
const decisionId = '33333333-3333-4333-8333-333333333333';
const futureEntries = ['少人数で成長する', '経営判断を早くする'];

function reportContent(): DesignV2ReportContent {
  const keys = ['FUTURE', 'CURRENT_UNDERSTANDING', 'LENSES', 'UNKNOWNS', 'NEXT_FACTS'] as const;
  const sections = keys.map(key => ({
    key,
    title: key,
    entries: key === 'FUTURE' ? [...futureEntries] : ['まだ確認が必要'],
  }));
  const candidates: DesignV2ReportContent['factCandidates'][number][] = [
    { id: 'candidate-a', whatToVerify: '端末の管理方法', whyItMattersToFuture: '継続的なIT運用のため', whatMayBecomeKnowable: '管理対象', lenses: ['TECHNOLOGY'], sourceRuleIds: ['rule-a'] },
    { id: 'candidate-b', whatToVerify: '承認手続き', whyItMattersToFuture: '迅速な経営判断のため', whatMayBecomeKnowable: '判断経路', lenses: ['OPERATION', 'MANAGEMENT'], sourceRuleIds: ['rule-b'] },
  ];
  return {
    formatVersion: DESIGN_V2_REPORT_FORMAT_VERSION,
    recipient: { organizationDisplayName: '合成テスト企業' },
    diagnosisDate: '2026-11-25',
    issuer: { displayName: 'atLIB株式会社' },
    sections,
    diagnosisMap: sections.map(section => ({ ...section, overflowCount: 0 })),
    factCandidates: candidates,
    assessmentProposal: {
      status: 'NOT_SELECTED',
      source: 'ANALYSIS_FACT_CANDIDATES',
      candidates,
      // This customer-facing proposal does NOT authorize or auto-select E3 items.
      selectedCandidateIds: ['candidate-a'],
      durationText: '4週間',
      priceExcludingTaxText: '表示のみ・商用承認ではない',
    },
  };
}

function fixture() {
  const report = { id: reportId, version: 2, status: 'DELIVERED', content: reportContent() };
  const snapshot: PaidAssessmentSourceHandoff['snapshot'] = {
    schemaVersion: 1,
    sourceKind: 'FREE_DIAGNOSIS_DESIGN_V2',
    eligibility: {
      caseId,
      feedbackDecision: {
        id: decisionId, version: 3, contextHash: 'a'.repeat(64),
        decidedByUserId: 'operator@example.test', decidedAt: '2026-11-25T01:00:00.000Z',
      },
      report: {
        id: reportId, version: 2, contentHash: contentHash(report.content),
        approvalSnapshotHash: 'b'.repeat(64),
      },
    },
  };
  const handoff: PaidAssessmentSourceHandoff = {
    id: '44444444-4444-4444-8444-444444444444',
    sourceCaseId: caseId,
    version: 1,
    feedbackDecisionId: decisionId,
    reportId,
    snapshot,
    snapshotHash: contentHash(snapshot),
    createdByUserId: 'operator@example.test',
    createdAt: '2026-11-25T02:00:00.000Z',
  };
  const selections: DesignV2PreparationSelection = {
    futureEntryIndex: 1,
    candidates: [
      { candidateId: 'candidate-b', area: 'MANAGEMENT', confirmationQuestion: '承認経路の記録がありますか', requestedFrom: '経営者' },
      { candidateId: 'candidate-a', area: 'TECHNOLOGY' },
    ],
  };
  return { report, handoff, selections };
}

test('bridges explicit human selection to existing A/B with correct report and feedback refs', () => {
  const { report, handoff, selections } = fixture();
  const result = preparePaidAssessmentFromDesignV2(handoff, report, selections);
  assert.equal(result.preparation.caseId, caseId);
  assert.deepEqual(result.preparation.sourceRefs, {
    decision: { id: decisionId, version: 3, contextHash: 'a'.repeat(64) },
    report: { id: reportId, version: 2, contentHash: contentHash(report.content), approvalSnapshotHash: 'b'.repeat(64) },
  });
  assert.equal(result.preparation.future.statement, futureEntries[1]);
  assert.deepEqual(result.preparation.future.source, { kind: 'FREE_DIAGNOSIS_REPORT', id: reportId, version: 2, hash: contentHash(report.content) });
  assert.deepEqual(result.agenda.nextActions.map(action => action.itemId), ['candidate-b']);
  assert.deepEqual(result.agenda.pendingWithoutQuestion.map(item => item.id), ['candidate-a']);
  assert.equal(result.agenda.counts.verified, 0);
  assert.equal(result.agenda.counts.toConfirm, 1);
  assert.equal(result.agenda.counts.pendingWithoutQuestion, 1);
  assert.equal(result.agenda.nextActions[0]?.verificationState, 'UNKNOWN');
  assert.equal(result.agenda.nextActions[0]?.question, '承認経路の記録がありますか');
  assert.equal(result.agenda.nextActions[0]?.requestedFrom, '経営者');
  assert.equal(result.agenda.nextActions[0]?.source.id, reportId);
  assert.equal(result.agenda.nextActions[0]?.source.hash, contentHash(report.content));
  assert.equal(JSON.stringify(result).includes('表示のみ・商用承認ではない'), false);
});

test('does not auto-select report proposal candidates, questions, price or verified FACT', () => {
  const { report, handoff } = fixture();
  const result = preparePaidAssessmentFromDesignV2(handoff, report, { futureEntryIndex: 0, candidates: [] });
  assert.equal(result.preparation.future.statement, futureEntries[0]);
  assert.deepEqual(result.preparation.toConfirm, []);
  assert.deepEqual(result.preparation.unknownWithoutAction, []);
  assert.deepEqual(result.agenda.nextActions, []);
  assert.deepEqual(result.agenda.knownContext, []);
});

test('rejects an unverified or mismatched E1 handoff', () => {
  const mutations: Array<(input: ReturnType<typeof fixture>) => void> = [
    input => { input.handoff.snapshotHash = 'f'.repeat(64); },
    input => { input.handoff.reportId = caseId; },
    input => { input.handoff.feedbackDecisionId = caseId; },
    input => { input.handoff.sourceCaseId = reportId; },
    input => { input.handoff.snapshot.schemaVersion = 2 as unknown as 1; },
  ];
  for (const mutate of mutations) {
    const input = fixture(); mutate(input);
    assert.throws(() => preparePaidAssessmentFromDesignV2(input.handoff, input.report, input.selections), /E3_HANDOFF_INTEGRITY_MISMATCH/);
  }
});

test('rejects source report mismatch, content tampering, wrong version and non-DELIVERED states', () => {
  const mutations: Array<(input: ReturnType<typeof fixture>) => void> = [
    input => { input.report.status = 'APPROVED'; },
    input => { input.report.id = caseId; },
    input => { input.report.version = 1; },
    input => { input.report.content.sections = input.report.content.sections.map(section => section.key === 'FUTURE' ? { ...section, entries: ['改ざん', ...section.entries.slice(1)] } : section); },
    input => { input.report.content.formatVersion = 'untrusted' as unknown as typeof DESIGN_V2_REPORT_FORMAT_VERSION; },
  ];
  for (const mutate of mutations) {
    const input = fixture(); mutate(input);
    assert.throws(() => preparePaidAssessmentFromDesignV2(input.handoff, input.report, input.selections), /E3_REPORT_INTEGRITY_MISMATCH/);
  }
});

test('requires a deliberate existing Future entry and never creates future text', () => {
  const invalidIndices = [-1, 99, 1.2, NaN];
  for (const futureEntryIndex of invalidIndices) {
    const { handoff, report, selections } = fixture();
    assert.throws(() => preparePaidAssessmentFromDesignV2(handoff, report, { ...selections, futureEntryIndex }), /E3_FUTURE_SELECTION_INVALID/);
  }
  const { handoff, report, selections } = fixture();
  report.content.sections = report.content.sections.map(section => section.key === 'FUTURE' ? { ...section, entries: [section.entries[0]!, '  '] } : section);
  handoff.snapshot.eligibility.report.contentHash = contentHash(report.content);
  handoff.snapshotHash = contentHash(handoff.snapshot);
  assert.throws(() => preparePaidAssessmentFromDesignV2(handoff, report, selections), /E3_FUTURE_SELECTION_INVALID/);
});

test('rejects unknown and duplicate candidates, and invalid explicit areas/questions', () => {
  const variants: DesignV2PreparationSelection[] = [
    { futureEntryIndex: 0, candidates: [{ candidateId: 'not-in-report', area: 'MANAGEMENT' }] },
    { futureEntryIndex: 0, candidates: [{ candidateId: 'candidate-a', area: 'TECHNOLOGY' }, { candidateId: 'candidate-a', area: 'TECHNOLOGY' }] },
    { futureEntryIndex: 0, candidates: [{ candidateId: 'candidate-a', area: 'OTHER' as 'TECHNOLOGY' }] },
    { futureEntryIndex: 0, candidates: [{ candidateId: 'candidate-a', area: 'TECHNOLOGY', confirmationQuestion: '  ' }] },
    { futureEntryIndex: 0, candidates: [{ candidateId: 'candidate-a', area: 'TECHNOLOGY', requestedFrom: '担当者' }] },
  ];
  for (const selections of variants) {
    const { handoff, report } = fixture();
    assert.throws(() => preparePaidAssessmentFromDesignV2(handoff, report, selections), /E3_/);
  }
});

test('fails closed for ambiguous duplicate source candidate identities', () => {
  const { handoff, report, selections } = fixture();
  report.content.factCandidates[1]!.id = 'candidate-a';
  handoff.snapshot.eligibility.report.contentHash = contentHash(report.content);
  handoff.snapshotHash = contentHash(handoff.snapshot);
  assert.throws(() => preparePaidAssessmentFromDesignV2(handoff, report, selections), /E3_REPORT_CANDIDATES_INVALID/);
});

test('is deterministic and leaves source, human choice and result arrays detached', () => {
  const { handoff, report, selections } = fixture();
  const original = structuredClone({ handoff, report, selections });
  const first = preparePaidAssessmentFromDesignV2(handoff, report, selections);
  const second = preparePaidAssessmentFromDesignV2(handoff, report, selections);
  assert.deepEqual(first, second);
  assert.deepEqual({ handoff, report, selections }, original);
  assert.notEqual(first.preparation, second.preparation);
  assert.notEqual(first.preparation.future.source, first.agenda.future.source);
  assert.notEqual(first.preparation.toConfirm[0]?.source, first.agenda.nextActions[0]?.source);
});
