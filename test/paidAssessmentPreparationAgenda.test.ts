import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  preparePaidAssessment,
  type PreparationInput,
  type PreparationOutput,
} from '../src/domain/paidAssessmentPreparation';
import { buildPaidAssessmentPreparationAgenda } from '../src/domain/paidAssessmentPreparationAgenda';

const hashes = {
  decision: 'a'.repeat(64),
  report: 'b'.repeat(64),
  approval: 'c'.repeat(64),
  source: 'd'.repeat(64),
};

function preparationFixture(): PreparationOutput {
  const input: PreparationInput = {
    caseId: 'case-v2-b1',
    decisionRef: { id: 'decision-b1', version: 2, contextHash: hashes.decision },
    reportRef: {
      id: 'report-b1',
      version: 4,
      contentHash: hashes.report,
      approvalSnapshotHash: hashes.approval,
    },
    future: {
      statement: '経営判断に必要な情報を継続的に把握できる状態にする',
      source: { kind: 'MANAGEMENT_FEEDBACK', id: 'future-source', version: 3, hash: hashes.source },
    },
    items: [
      {
        id: 'technology-known',
        area: 'TECHNOLOGY',
        topic: '主要端末の管理方式',
        purpose: '現在の管理対象を参照するため',
        source: { kind: 'CORE_VERIFIED_REFERENCE', id: 'core-1', version: 8, hash: hashes.source },
        state: 'VERIFIED_REFERENCE',
      },
      {
        id: 'operation-confirm',
        area: 'OPERATION',
        topic: '障害受付の属人化',
        purpose: '改善対象となる業務範囲を確認するため',
        source: { kind: 'CUSTOMER_STATEMENT', id: 'statement-1', version: 1 },
        state: 'UNVERIFIED_STATEMENT',
        confirmation: { question: '直近3か月の受付記録を確認できますか', requestedFrom: '情報システム責任者' },
      },
      {
        id: 'technology-confirm',
        area: 'TECHNOLOGY',
        topic: '復旧テストの実施状況',
        purpose: '事業継続上の前提を確認するため',
        source: { kind: 'FREE_DIAGNOSIS_REPORT', id: 'report-item-1', version: 4, hash: hashes.report },
        state: 'UNKNOWN',
        confirmation: { question: '最新の復旧テスト記録はありますか' },
      },
      {
        id: 'management-pending',
        area: 'MANAGEMENT',
        topic: '投資判断基準',
        purpose: '改善案の選択条件を把握するため',
        source: { kind: 'FREE_DIAGNOSIS_REPORT', id: 'report-item-2', version: 4 },
        state: 'UNKNOWN',
      },
    ],
  };
  return preparePaidAssessment(input);
}

test('builds an exact deterministic three-area agenda with Future, sources and counts', () => {
  const preparation = preparationFixture();
  const first = buildPaidAssessmentPreparationAgenda(preparation);
  const second = buildPaidAssessmentPreparationAgenda(preparation);

  assert.deepEqual(first, second);
  assert.deepEqual(first.future, preparation.future);
  assert.deepEqual(first.sourceRefs, preparation.sourceRefs);
  assert.deepEqual(first.counts, { verified: 1, toConfirm: 2, pendingWithoutQuestion: 1 });
  assert.deepEqual(first.nextActions, [
    {
      itemId: 'operation-confirm',
      area: 'OPERATION',
      topic: '障害受付の属人化',
      why: '改善対象となる業務範囲を確認するため',
      question: '直近3か月の受付記録を確認できますか',
      requestedFrom: '情報システム責任者',
      source: { kind: 'CUSTOMER_STATEMENT', id: 'statement-1', version: 1 },
      verificationState: 'UNVERIFIED_STATEMENT',
      nextActionLabel: '確認する',
    },
    {
      itemId: 'technology-confirm',
      area: 'TECHNOLOGY',
      topic: '復旧テストの実施状況',
      why: '事業継続上の前提を確認するため',
      question: '最新の復旧テスト記録はありますか',
      source: { kind: 'FREE_DIAGNOSIS_REPORT', id: 'report-item-1', version: 4, hash: hashes.report },
      verificationState: 'UNKNOWN',
      nextActionLabel: '確認する',
    },
  ]);
});

test('keeps verified references as known context and never turns them into actions', () => {
  const agenda = buildPaidAssessmentPreparationAgenda(preparationFixture());
  assert.deepEqual(agenda.knownContext.map(item => item.id), ['technology-known']);
  assert.equal(agenda.knownContext[0]!.state, 'VERIFIED_REFERENCE');
  assert.equal(agenda.nextActions.some(action => action.itemId === 'technology-known'), false);
  assert.deepEqual(agenda.nextActions.map(action => action.verificationState), [
    'UNVERIFIED_STATEMENT',
    'UNKNOWN',
  ]);
});

test('keeps UNKNOWN without a question pending and does not fabricate an action', () => {
  const agenda = buildPaidAssessmentPreparationAgenda(preparationFixture());
  assert.deepEqual(agenda.pendingWithoutQuestion.map(item => item.id), ['management-pending']);
  assert.equal(agenda.pendingWithoutQuestion[0]!.confirmation, undefined);
  assert.equal(agenda.nextActions.some(action => action.itemId === 'management-pending'), false);
});

test('preserves stable order, does not mutate input and detaches nested output objects', () => {
  const preparation = preparationFixture();
  const before = structuredClone(preparation);
  const agenda = buildPaidAssessmentPreparationAgenda(preparation);

  assert.deepEqual(preparation, before);
  assert.deepEqual(agenda.nextActions.map(action => action.itemId), ['operation-confirm', 'technology-confirm']);
  assert.notEqual(agenda.future, preparation.future);
  assert.notEqual(agenda.future.source, preparation.future.source);
  assert.notEqual(agenda.sourceRefs, preparation.sourceRefs);
  assert.notEqual(agenda.sourceRefs.decision, preparation.sourceRefs.decision);
  assert.notEqual(agenda.sourceRefs.report, preparation.sourceRefs.report);
  assert.notEqual(agenda.knownContext, preparation.confirmed);
  assert.notEqual(agenda.knownContext[0], preparation.confirmed[0]);
  assert.notEqual(agenda.knownContext[0]!.source, preparation.confirmed[0]!.source);
  assert.notEqual(agenda.pendingWithoutQuestion[0], preparation.unknownWithoutAction[0]);
  assert.notEqual(agenda.nextActions[0]!.source, preparation.toConfirm[0]!.source);
});

test('rejects toConfirm entries without a question or with VERIFIED state', () => {
  const missingQuestion = preparationFixture();
  delete missingQuestion.toConfirm[0]!.confirmation;
  assert.throws(
    () => buildPaidAssessmentPreparationAgenda(missingQuestion),
    /requires a nonblank confirmation question/,
  );

  const verified = preparationFixture();
  verified.toConfirm[0]!.state = 'VERIFIED_REFERENCE';
  assert.throws(() => buildPaidAssessmentPreparationAgenda(verified), /must remain unverified/);
});

test('rejects duplicate item IDs across classification lists', () => {
  const preparation = preparationFixture();
  preparation.unknownWithoutAction[0]!.id = preparation.confirmed[0]!.id;
  assert.throws(() => buildPaidAssessmentPreparationAgenda(preparation), /duplicate item id/);
});

test('rejects contradictory confirmed and pending classifications', () => {
  const invalidConfirmed = preparationFixture();
  invalidConfirmed.confirmed[0]!.state = 'UNKNOWN';
  assert.throws(() => buildPaidAssessmentPreparationAgenda(invalidConfirmed), /must be VERIFIED_REFERENCE/);

  const pendingWithQuestion = preparationFixture();
  pendingWithQuestion.unknownWithoutAction[0]!.confirmation = { question: '自動移動してよいですか' };
  assert.throws(() => buildPaidAssessmentPreparationAgenda(pendingWithQuestion), /must not contain confirmation/);
});

test('rejects malformed list sources instead of producing invalid counts', () => {
  for (const key of ['confirmed', 'toConfirm', 'unknownWithoutAction'] as const) {
    const preparation = preparationFixture();
    const malformed = preparation as unknown as Record<string, unknown>;
    malformed[key] = null;
    assert.throws(() => buildPaidAssessmentPreparationAgenda(preparation), /must be an array/);
  }
});
