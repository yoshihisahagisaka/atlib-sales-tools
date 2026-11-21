import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  preparePaidAssessment,
  type PreparationInput,
} from '../src/domain/paidAssessmentPreparation';

const hashes = {
  decision: 'a'.repeat(64),
  content: 'b'.repeat(64),
  approval: 'c'.repeat(64),
  future: 'd'.repeat(64),
  source: 'e'.repeat(64),
};

function fixture(): PreparationInput {
  return {
    caseId: 'case-v2-1',
    decisionRef: { id: 'decision-1', version: 2, contextHash: hashes.decision },
    reportRef: {
      id: 'report-1',
      version: 4,
      contentHash: hashes.content,
      approvalSnapshotHash: hashes.approval,
    },
    future: {
      statement: '経営判断に必要な情報を短時間で確認できる状態にする',
      source: { kind: 'MANAGEMENT_FEEDBACK', id: 'feedback-1', version: 3, hash: hashes.future },
    },
    items: [
      {
        id: 'technology-verified',
        area: 'TECHNOLOGY',
        topic: '主要端末の管理方式',
        purpose: '現状の管理対象を確定するため',
        source: { kind: 'CORE_VERIFIED_REFERENCE', id: 'core-ref-1', version: 7, hash: hashes.source },
        state: 'VERIFIED_REFERENCE',
      },
      {
        id: 'operation-statement',
        area: 'OPERATION',
        topic: '障害受付の属人化',
        purpose: '改善対象の業務範囲を確認するため',
        source: { kind: 'CUSTOMER_STATEMENT', id: 'statement-1', version: 1 },
        state: 'UNVERIFIED_STATEMENT',
        confirmation: { question: '直近3か月の受付記録を確認できますか', requestedFrom: '情報システム責任者' },
      },
      {
        id: 'management-unknown',
        area: 'MANAGEMENT',
        topic: '投資判断基準',
        purpose: '改善案の選択条件を把握するため',
        source: { kind: 'FREE_DIAGNOSIS_REPORT', id: 'report-item-1', version: 4, hash: hashes.content },
        state: 'UNKNOWN',
      },
      {
        id: 'technology-unknown-question',
        area: 'TECHNOLOGY',
        topic: 'バックアップ復旧確認',
        purpose: '事業継続上の前提を確認するため',
        source: { kind: 'FREE_DIAGNOSIS_REPORT', id: 'report-item-2', version: 4 },
        state: 'UNKNOWN',
        confirmation: { question: '最新の復旧テスト記録はありますか' },
      },
      {
        id: 'operation-statement-no-question',
        area: 'OPERATION',
        topic: '月次集計に時間がかかるとの発言',
        purpose: '業務負荷の事実確認が必要なため',
        source: { kind: 'CUSTOMER_STATEMENT', id: 'statement-2', version: 1 },
        state: 'UNVERIFIED_STATEMENT',
      },
    ],
  };
}

test('creates a deterministic three-area preparation projection and preserves every source reference', () => {
  const input = fixture();
  const first = preparePaidAssessment(input);
  const second = preparePaidAssessment(input);

  assert.deepEqual(first, second);
  assert.deepEqual(first.sourceRefs, { decision: input.decisionRef, report: input.reportRef });
  assert.deepEqual(first.future, input.future);
  assert.deepEqual(first.confirmed.map(item => item.id), ['technology-verified']);
  assert.deepEqual(first.toConfirm.map(item => item.id), ['operation-statement', 'technology-unknown-question']);
  assert.deepEqual(first.unknownWithoutAction.map(item => item.id), [
    'management-unknown',
    'operation-statement-no-question',
  ]);
  assert.equal(first.confirmed.length + first.toConfirm.length + first.unknownWithoutAction.length, input.items.length);
  assert.deepEqual(first.confirmed[0]!.source, input.items[0]!.source);
  assert.deepEqual(first.toConfirm[0]!.source, input.items[1]!.source);
});

test('keeps Future as an intention rather than a current confirmed FACT', () => {
  const output = preparePaidAssessment(fixture());
  assert.deepEqual(output.future, fixture().future);
  assert.equal(output.confirmed.some(item => item.id === 'feedback-1'), false);
});

test('does not promote a customer statement to a verified reference', () => {
  const input = fixture();
  (input.items[0] as { source: { kind: string } }).source.kind = 'CUSTOMER_STATEMENT';
  assert.throws(() => preparePaidAssessment(input), /CORE_VERIFIED_REFERENCE/);
});

test('keeps UNKNOWN and unverified statements without questions visible without inventing gaps or questions', () => {
  const output = preparePaidAssessment(fixture());
  assert.deepEqual(output.unknownWithoutAction.map(item => item.state), ['UNKNOWN', 'UNVERIFIED_STATEMENT']);
  assert.ok(output.unknownWithoutAction.every(item => item.confirmation === undefined));
});

test('includes each explicitly requested confirmation exactly once and no blanket questions', () => {
  const output = preparePaidAssessment(fixture());
  assert.equal(new Set(output.toConfirm.map(item => item.id)).size, output.toConfirm.length);
  assert.deepEqual(output.toConfirm.map(item => item.confirmation?.question), [
    '直近3か月の受付記録を確認できますか',
    '最新の復旧テスト記録はありますか',
  ]);
});

test('rejects duplicate item IDs', () => {
  const input = fixture();
  input.items = [...input.items, { ...input.items[0]! }];
  assert.throws(() => preparePaidAssessment(input), /duplicate item id/);
});

test('rejects blank identifiers and invalid versions or hashes', () => {
  const cases: Array<(input: PreparationInput) => void> = [
    input => { input.caseId = ' '; },
    input => { input.decisionRef.id = ''; },
    input => { input.reportRef.id = ''; },
    input => { input.future.source.id = ''; },
    input => { input.decisionRef.version = 0; },
    input => { input.reportRef.version = 1.5; },
    input => { input.items[0]!.source.version = -1; },
    input => { input.decisionRef.contextHash = 'A'.repeat(64); },
    input => { input.reportRef.contentHash = 'abc'; },
    input => { input.reportRef.approvalSnapshotHash = 'g'.repeat(64); },
    input => { input.future.source.hash = ''; },
  ];
  for (const mutate of cases) {
    const input = fixture();
    mutate(input);
    assert.throws(() => preparePaidAssessment(input), TypeError);
  }
});

test('rejects malformed areas, states, source kinds and blank explicit questions', () => {
  const cases: Array<(input: PreparationInput) => void> = [
    input => { (input.items[0]! as { area: string }).area = 'SECURITY'; },
    input => { (input.items[0]! as { state: string }).state = 'FACT'; },
    input => { (input.items[0]!.source as { kind: string }).kind = 'REPORT'; },
    input => { input.items[1]!.confirmation!.question = ' '; },
    input => { input.items[1]!.confirmation!.requestedFrom = ''; },
  ];
  for (const mutate of cases) {
    const input = fixture();
    mutate(input);
    assert.throws(() => preparePaidAssessment(input), TypeError);
  }
});

test('does not mutate input and returns detached nested objects and arrays', () => {
  const input = fixture();
  const before = structuredClone(input);
  const output = preparePaidAssessment(input);

  assert.deepEqual(input, before);
  assert.notEqual(output.sourceRefs.decision, input.decisionRef);
  assert.notEqual(output.sourceRefs.report, input.reportRef);
  assert.notEqual(output.future, input.future);
  assert.notEqual(output.future.source, input.future.source);
  assert.notEqual(output.confirmed[0], input.items[0]);
  assert.notEqual(output.confirmed[0]!.source, input.items[0]!.source);
  assert.notEqual(output.toConfirm[0]!.confirmation, input.items[1]!.confirmation);
});
