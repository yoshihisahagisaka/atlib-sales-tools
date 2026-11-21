import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reviewPaidAssessmentGaps,
  type GapReviewItem,
  type GapReviewResult,
} from '../src/domain/paidAssessmentGapReview';
import {
  reviewPaidAssessmentRootCauses,
  type RootCauseHypothesis,
  type RootCauseReviewResult,
} from '../src/domain/paidAssessmentRootCauseReview';
import {
  reviewPaidAssessmentActOptions,
  type ActOptionCandidate,
} from '../src/domain/paidAssessmentActOptionReview';

const hashes = {
  future: 'a'.repeat(64),
  current: 'b'.repeat(64),
  evidence: 'c'.repeat(64),
};

function gap(id: string, assessment: GapReviewItem['comparison']['assessment']): GapReviewItem {
  return {
    id,
    area: 'OPERATION',
    futureCriterion: {
      statement: '人を増やさずに安定運用できる状態にする',
      source: { kind: 'MANAGEMENT_FEEDBACK', id: `future-${id}`, version: 3, hash: hashes.future },
    },
    current: {
      statement: '定型作業の手順と担当が統一されていない',
      source: { kind: 'CORE_VERIFIED_REFERENCE', id: `current-${id}`, version: 6, hash: hashes.current },
      verification: 'VERIFIED_REFERENCE',
    },
    comparison: {
      statement: '目標と現在の運用標準化状態を比較した',
      rationale: '経営目標と検証済み運用記録を比較したため',
      sourceIds: [`future-${id}`, `current-${id}`],
      assessment,
    },
  };
}

function gapResult(): GapReviewResult {
  return reviewPaidAssessmentGaps([
    gap('confirmed', 'DIFFERENCE'),
    gap('no-difference', 'NO_DIFFERENCE'),
    gap('insufficient', 'UNDETERMINED'),
  ]);
}

function cause(id: string, gapId: string, kind: 'supported' | 'contested' | 'empty'): RootCauseHypothesis {
  const evidence = kind === 'empty' ? [] : [{
    source: { kind: 'CORE_VERIFIED_REFERENCE' as const, id: `evidence-${id}`, version: 2, hash: hashes.evidence },
    relation: kind === 'contested' ? 'CONTRADICTS' as const : 'SUPPORTS' as const,
    verification: 'VERIFIED_REFERENCE' as const,
    note: kind === 'contested' ? '仮説と一致しない実施記録' : '仮説を支持する処理記録',
  }];
  return {
    id,
    gapId,
    statement: '手順の責任者が不明確である可能性がある',
    rationale: '記録とヒアリングから原因候補として整理したため',
    evidence,
    openQuestions: [],
  };
}

function rootCauseResult(): RootCauseReviewResult {
  const gaps = gapResult();
  return reviewPaidAssessmentRootCauses(gaps, [
    cause('supported', 'confirmed', 'supported'),
    cause('contested', 'confirmed', 'contested'),
    cause('unsubstantiated', 'confirmed', 'empty'),
    cause('blocked', 'insufficient', 'supported'),
  ]);
}

function option(id: string): ActOptionCandidate {
  return {
    id,
    title: '定型運用の責任と手順を標準化する',
    description: '対象となる定型作業の手順、承認者、代替担当を定義する',
    why: '人を増やさず安定運用するFutureへ近づけるため',
    area: 'OPERATION',
    lenses: ['STANDARDIZE'],
    future: {
      statement: '人を増やさずに安定運用できる状態にする',
      source: { kind: 'MANAGEMENT_FEEDBACK', id: 'future-option', version: 3, hash: hashes.future },
    },
    gapIds: ['confirmed'],
    rootCauseHypothesisIds: [],
    expectedChange: {
      statement: '定型作業の担当判断が統一されることを期待する',
      verificationApproach: '変更後3か月の差戻し件数と担当者判断を確認する',
    },
    assumptions: [],
    dependencies: ['対象作業の範囲確定'],
    risks: ['手順を増やしすぎると運用負荷になる可能性'],
    actorCandidates: ['CUSTOMER', 'EXISTING_VENDOR'],
    authoredBy: 'assessment-reviewer-1',
  };
}

test('makes a single-lens option with confirmed gap and no cause REVIEWABLE', () => {
  const input = option('reviewable-no-cause');
  const result = reviewPaidAssessmentActOptions(gapResult(), rootCauseResult(), [input]);

  assert.equal(result.options[0]!.state, 'REVIEWABLE');
  assert.deepEqual(result.options[0]!.reviewReasons, []);
  assert.deepEqual(result.options[0]!.gapIds, ['confirmed']);
  assert.deepEqual(result.options[0]!.lenses, ['STANDARDIZE']);
  assert.deepEqual(result.counts, {
    REVIEWABLE: 1,
    NEEDS_CONFIRMATION: 0,
    BLOCKED_BY_GAP_EVIDENCE: 0,
  });
});

test('keeps a supported cause reviewable without claiming cause confirmation or actual change', () => {
  const input = option('supported-cause');
  input.rootCauseHypothesisIds = ['supported'];
  const result = reviewPaidAssessmentActOptions(gapResult(), rootCauseResult(), [input]);

  assert.equal(result.options[0]!.state, 'REVIEWABLE');
  assert.deepEqual(result.options[0]!.rootCauseHypothesisIds, ['supported']);
  assert.deepEqual(result.options[0]!.expectedChange, input.expectedChange);
  assert.equal('causeConfirmed' in result.options[0]!, false);
  assert.equal('actualChange' in result.options[0]!, false);
  assert.equal('approved' in result.options[0]!, false);
  assert.equal('priority' in result.options[0]!, false);
});

test('blocks an option when any linked gap is not confirmed', () => {
  const input = option('blocked-gap');
  input.gapIds = ['confirmed', 'no-difference', 'insufficient'];
  input.assumptions = ['確認対象の範囲が未確定'];
  const result = reviewPaidAssessmentActOptions(gapResult(), rootCauseResult(), [input]);

  assert.equal(result.options[0]!.state, 'BLOCKED_BY_GAP_EVIDENCE');
  assert.deepEqual(result.options[0]!.reviewReasons, [
    'GAP_NOT_CONFIRMED:no-difference',
    'GAP_NOT_CONFIRMED:insufficient',
  ]);
});

test('requires confirmation for contested or unsubstantiated causes and assumptions', () => {
  const input = option('needs-confirmation');
  input.rootCauseHypothesisIds = ['contested', 'unsubstantiated'];
  input.assumptions = ['現場責任者がレビューに参加できること'];
  const result = reviewPaidAssessmentActOptions(gapResult(), rootCauseResult(), [input]);

  assert.equal(result.options[0]!.state, 'NEEDS_CONFIRMATION');
  assert.deepEqual(result.options[0]!.reviewReasons, [
    'CAUSE_NOT_ESTABLISHED:contested',
    'CAUSE_NOT_ESTABLISHED:unsubstantiated',
    'ASSUMPTION_REMAINS',
  ]);
});

test('rejects unknown or mismatched gap and cause links', () => {
  const unknownGap = option('unknown-gap');
  unknownGap.gapIds = ['missing'];
  assert.throws(
    () => reviewPaidAssessmentActOptions(gapResult(), rootCauseResult(), [unknownGap]),
    /unknown gapId/,
  );

  const unknownCause = option('unknown-cause');
  unknownCause.rootCauseHypothesisIds = ['missing'];
  assert.throws(
    () => reviewPaidAssessmentActOptions(gapResult(), rootCauseResult(), [unknownCause]),
    /unknown root cause/,
  );

  const mismatched = option('mismatched-cause');
  mismatched.rootCauseHypothesisIds = ['blocked'];
  assert.throws(
    () => reviewPaidAssessmentActOptions(gapResult(), rootCauseResult(), [mismatched]),
    /not linked to an option gap/,
  );
});

test('rejects duplicate option, gap, cause and upstream IDs', () => {
  assert.throws(
    () => reviewPaidAssessmentActOptions(gapResult(), rootCauseResult(), [option('same'), option('same')]),
    /duplicate option id/,
  );
  const duplicateGapLink = option('duplicate-gap-link');
  duplicateGapLink.gapIds = ['confirmed', 'confirmed'];
  assert.throws(
    () => reviewPaidAssessmentActOptions(gapResult(), rootCauseResult(), [duplicateGapLink]),
    /duplicate gapId/,
  );
  const duplicateCauseLink = option('duplicate-cause-link');
  duplicateCauseLink.rootCauseHypothesisIds = ['supported', 'supported'];
  assert.throws(
    () => reviewPaidAssessmentActOptions(gapResult(), rootCauseResult(), [duplicateCauseLink]),
    /duplicate rootCauseHypothesisId/,
  );

  const duplicateGaps = gapResult();
  duplicateGaps.items.push({ ...duplicateGaps.items[0]! });
  assert.throws(() => reviewPaidAssessmentActOptions(duplicateGaps, rootCauseResult(), []), /duplicate gap id/);

  const duplicateCauses = rootCauseResult();
  duplicateCauses.hypotheses.push({ ...duplicateCauses.hypotheses[0]! });
  assert.throws(
    () => reviewPaidAssessmentActOptions(gapResult(), duplicateCauses, []),
    /duplicate root cause id/,
  );
});

test('rejects invalid lens, actor, source, version, hash and blank list entries', () => {
  const mutations: Array<(value: ActOptionCandidate) => void> = [
    value => { value.lenses = []; },
    value => { value.lenses = ['STANDARDIZE', 'STANDARDIZE']; },
    value => { (value.lenses as string[]) = ['PURCHASE']; },
    value => { (value.actorCandidates as string[]) = ['OWNER']; },
    value => { (value.future.source as { kind: string }).kind = 'DOCUMENT'; },
    value => { value.future.source.version = 0; },
    value => { value.future.source.hash = 'A'.repeat(64); },
    value => { value.assumptions = [' ']; },
    value => { value.dependencies = ['']; },
    value => { value.risks = [' ']; },
  ];
  for (const mutate of mutations) {
    const invalid = option('invalid');
    mutate(invalid);
    assert.throws(
      () => reviewPaidAssessmentActOptions(gapResult(), rootCauseResult(), [invalid]),
      TypeError,
    );
  }
});

test('allows zero options, one option and selected area/lens subsets without an 18-item audit', () => {
  assert.deepEqual(reviewPaidAssessmentActOptions(gapResult(), rootCauseResult(), []), {
    options: [],
    counts: { REVIEWABLE: 0, NEEDS_CONFIRMATION: 0, BLOCKED_BY_GAP_EVIDENCE: 0 },
  });

  const technology = option('technology');
  technology.area = 'TECHNOLOGY';
  technology.lenses = ['AUTOMATE', 'ORGANIZE'];
  const management = option('management');
  management.area = 'MANAGEMENT';
  management.lenses = ['RETAIN'];
  const result = reviewPaidAssessmentActOptions(gapResult(), rootCauseResult(), [technology, management]);
  assert.deepEqual(result.options.map(value => value.area), ['TECHNOLOGY', 'MANAGEMENT']);
  assert.deepEqual(result.options.map(value => value.lenses), [['AUTOMATE', 'ORGANIZE'], ['RETAIN']]);
  assert.equal(result.options.length, 2);
});

test('preserves provenance and order, is deterministic, immutable and deeply detached', () => {
  const firstOption = option('first');
  firstOption.rootCauseHypothesisIds = ['supported'];
  firstOption.lenses = ['STANDARDIZE', 'DELEGATE'];
  const secondOption = option('second');
  secondOption.assumptions = ['既存ベンダーの対応範囲が未確認'];
  const candidates = [firstOption, secondOption];
  const gaps = gapResult();
  const causes = rootCauseResult();
  const candidatesBefore = structuredClone(candidates);
  const gapsBefore = structuredClone(gaps);
  const causesBefore = structuredClone(causes);

  const first = reviewPaidAssessmentActOptions(gaps, causes, candidates);
  const second = reviewPaidAssessmentActOptions(gaps, causes, candidates);
  assert.deepEqual(first, second);
  assert.deepEqual(candidates, candidatesBefore);
  assert.deepEqual(gaps, gapsBefore);
  assert.deepEqual(causes, causesBefore);
  assert.deepEqual(first.options.map(value => value.id), ['first', 'second']);
  assert.deepEqual(first.options[0]!.future.source, candidates[0]!.future.source);
  assert.notEqual(first.options, candidates);
  assert.notEqual(first.options[0], candidates[0]);
  assert.notEqual(first.options[0]!.future, candidates[0]!.future);
  assert.notEqual(first.options[0]!.future.source, candidates[0]!.future.source);
  assert.notEqual(first.options[0]!.lenses, candidates[0]!.lenses);
  assert.notEqual(first.options[0]!.gapIds, candidates[0]!.gapIds);
  assert.notEqual(first.options[0]!.rootCauseHypothesisIds, candidates[0]!.rootCauseHypothesisIds);
  assert.notEqual(first.options[0]!.expectedChange, candidates[0]!.expectedChange);
  assert.notEqual(first.options[0]!.assumptions, candidates[0]!.assumptions);
  assert.notEqual(first.options[0]!.dependencies, candidates[0]!.dependencies);
  assert.notEqual(first.options[0]!.risks, candidates[0]!.risks);
  assert.notEqual(first.options[0]!.actorCandidates, candidates[0]!.actorCandidates);
});
