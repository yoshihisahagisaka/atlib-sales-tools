import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reviewPaidAssessmentGaps,
  type GapReviewItem,
  type GapReviewResult,
} from '../src/domain/paidAssessmentGapReview';
import {
  reviewPaidAssessmentRootCauses,
  type RootCauseEvidenceRef,
  type RootCauseHypothesis,
} from '../src/domain/paidAssessmentRootCauseReview';

const hashes = {
  future: 'a'.repeat(64),
  current: 'b'.repeat(64),
  evidence: 'c'.repeat(64),
};

function gapItem(id: string, assessment: GapReviewItem['comparison']['assessment']): GapReviewItem {
  return {
    id,
    area: 'OPERATION',
    futureCriterion: {
      statement: '障害時にも重要業務を継続できる状態にする',
      source: { kind: 'MANAGEMENT_FEEDBACK', id: `future-${id}`, version: 2, hash: hashes.future },
    },
    current: {
      statement: '復旧手順の実地確認は実施されていない',
      source: { kind: 'CORE_VERIFIED_REFERENCE', id: `current-${id}`, version: 6, hash: hashes.current },
      verification: 'VERIFIED_REFERENCE',
    },
    comparison: {
      statement: '目標と現在の復旧確認状態を比較した',
      rationale: '検証済みの実施記録と経営者の継続条件を比較したため',
      sourceIds: [`future-${id}`, `current-${id}`],
      assessment,
    },
  };
}

function gaps(): GapReviewResult {
  return reviewPaidAssessmentGaps([
    gapItem('confirmed', 'DIFFERENCE'),
    gapItem('no-difference', 'NO_DIFFERENCE'),
    gapItem('insufficient', 'UNDETERMINED'),
  ]);
}

function verifiedEvidence(relation: RootCauseEvidenceRef['relation'], id: string): RootCauseEvidenceRef {
  return {
    source: { kind: 'CORE_VERIFIED_REFERENCE', id, version: 4, hash: hashes.evidence },
    relation,
    verification: 'VERIFIED_REFERENCE',
    note: relation === 'SUPPORTS' ? '承認待ちで処理が停止した記録' : '同じ体制でも復旧確認できた記録',
  };
}

function hypothesis(id: string, gapId = 'confirmed'): RootCauseHypothesis {
  return {
    id,
    gapId,
    statement: '復旧確認の承認責任が明確でないことが一因である可能性がある',
    rationale: '実施記録と担当者ヒアリングを原因候補として整理したため',
    evidence: [],
    openQuestions: ['承認者不在時の代替手順は定義されていますか'],
    proposedBy: 'assessment-reviewer-1',
  };
}

test('classifies a confirmed gap with verified support without confirming causality', () => {
  const input = hypothesis('supported');
  input.evidence = [verifiedEvidence('SUPPORTS', 'support-1')];
  const result = reviewPaidAssessmentRootCauses(gaps(), [input]);

  assert.equal(result.hypotheses[0]!.state, 'HYPOTHESIS_WITH_VERIFIED_SUPPORT');
  assert.equal(result.hypotheses[0]!.statement, input.statement);
  assert.equal('ROOT_CAUSE_CONFIRMED' in result.hypotheses[0]!, false);
  assert.deepEqual(result.counts, {
    HYPOTHESIS_WITH_VERIFIED_SUPPORT: 1,
    HYPOTHESIS_CONTESTED: 0,
    HYPOTHESIS_UNSUBSTANTIATED: 0,
    BLOCKED_BY_GAP_EVIDENCE: 0,
  });
});

test('verified contradiction makes a hypothesis contested', () => {
  const input = hypothesis('contradicted');
  input.evidence = [verifiedEvidence('CONTRADICTS', 'contradiction-1')];
  const result = reviewPaidAssessmentRootCauses(gaps(), [input]);
  assert.equal(result.hypotheses[0]!.state, 'HYPOTHESIS_CONTESTED');
});

test('verified contradiction takes precedence over verified support', () => {
  const input = hypothesis('mixed');
  input.evidence = [
    verifiedEvidence('SUPPORTS', 'support-2'),
    verifiedEvidence('CONTRADICTS', 'contradiction-2'),
  ];
  const result = reviewPaidAssessmentRootCauses(gaps(), [input]);
  assert.equal(result.hypotheses[0]!.state, 'HYPOTHESIS_CONTESTED');
});

test('unverified statements and UNKNOWN do not substantiate or contest a hypothesis', () => {
  const input = hypothesis('unverified');
  input.evidence = [
    {
      source: { kind: 'CUSTOMER_STATEMENT', id: 'statement-1', version: 1 },
      relation: 'SUPPORTS',
      verification: 'UNVERIFIED_STATEMENT',
      note: '担当者は承認先が不明と発言した',
    },
    {
      source: { kind: 'FREE_DIAGNOSIS_REPORT', id: 'unknown-1', version: 2 },
      relation: 'CONTRADICTS',
      verification: 'UNKNOWN',
      note: '代替承認手順の有無は未確認',
    },
  ];
  const result = reviewPaidAssessmentRootCauses(gaps(), [input]);
  assert.equal(result.hypotheses[0]!.state, 'HYPOTHESIS_UNSUBSTANTIATED');
});

test('non-confirmed C1 gaps block hypothesis review regardless of verified evidence', () => {
  const noDifference = hypothesis('blocked-no-difference', 'no-difference');
  noDifference.evidence = [verifiedEvidence('SUPPORTS', 'support-3')];
  const insufficient = hypothesis('blocked-insufficient', 'insufficient');
  insufficient.evidence = [verifiedEvidence('CONTRADICTS', 'contradiction-3')];
  const result = reviewPaidAssessmentRootCauses(gaps(), [noDifference, insufficient]);

  assert.deepEqual(result.hypotheses.map(item => item.state), [
    'BLOCKED_BY_GAP_EVIDENCE',
    'BLOCKED_BY_GAP_EVIDENCE',
  ]);
  assert.equal(result.counts.BLOCKED_BY_GAP_EVIDENCE, 2);
});

test('accepts empty evidence, questions and hypotheses', () => {
  const empty = hypothesis('empty');
  empty.openQuestions = [];
  assert.equal(
    reviewPaidAssessmentRootCauses(gaps(), [empty]).hypotheses[0]!.state,
    'HYPOTHESIS_UNSUBSTANTIATED',
  );
  assert.deepEqual(reviewPaidAssessmentRootCauses(gaps(), []), {
    hypotheses: [],
    counts: {
      HYPOTHESIS_WITH_VERIFIED_SUPPORT: 0,
      HYPOTHESIS_CONTESTED: 0,
      HYPOTHESIS_UNSUBSTANTIATED: 0,
      BLOCKED_BY_GAP_EVIDENCE: 0,
    },
  });
});

test('rejects invalid source, verification mismatch, hash, version, note and relation', () => {
  const mutations: Array<(value: RootCauseEvidenceRef) => void> = [
    value => { (value.source as { kind: string }).kind = 'DOCUMENT'; },
    value => { value.source.kind = 'CUSTOMER_STATEMENT'; },
    value => { value.source.hash = 'A'.repeat(64); },
    value => { value.source.version = 0; },
    value => { value.note = ' '; },
    value => { (value as { relation: string }).relation = 'REFUTES'; },
    value => { (value as { verification: string }).verification = 'FACT'; },
  ];
  for (const mutate of mutations) {
    const invalid = hypothesis('invalid-evidence');
    const evidence = verifiedEvidence('SUPPORTS', 'invalid-source');
    mutate(evidence);
    invalid.evidence = [evidence];
    assert.throws(() => reviewPaidAssessmentRootCauses(gaps(), [invalid]), TypeError);
  }
});

test('rejects blank questions, duplicate IDs, unknown gap IDs and invalid gap states', () => {
  const blankQuestion = hypothesis('blank-question');
  blankQuestion.openQuestions = [' '];
  assert.throws(() => reviewPaidAssessmentRootCauses(gaps(), [blankQuestion]), TypeError);

  assert.throws(
    () => reviewPaidAssessmentRootCauses(gaps(), [hypothesis('duplicate'), hypothesis('duplicate')]),
    /duplicate hypothesis id/,
  );
  assert.throws(
    () => reviewPaidAssessmentRootCauses(gaps(), [hypothesis('unknown-gap', 'missing')]),
    /unknown gap id/,
  );

  const duplicateGaps = gaps();
  duplicateGaps.items.push({ ...duplicateGaps.items[0]! });
  assert.throws(() => reviewPaidAssessmentRootCauses(duplicateGaps, []), /duplicate gap id/);

  const invalidState = gaps();
  (invalidState.items[0] as { state: string }).state = 'GAP_CONFIRMED';
  assert.throws(() => reviewPaidAssessmentRootCauses(invalidState, []), /state is invalid/);
});

test('rejects hypotheses when no matching gap exists', () => {
  const emptyGaps: GapReviewResult = {
    items: [],
    counts: {
      CONFIRMED_DIFFERENCE: 0,
      NO_DIFFERENCE_IDENTIFIED: 0,
      INSUFFICIENT_EVIDENCE: 0,
    },
  };
  assert.throws(
    () => reviewPaidAssessmentRootCauses(emptyGaps, [hypothesis('orphan')]),
    /unknown gap id/,
  );
});

test('preserves order and provenance, is deterministic, immutable and deeply detached', () => {
  const firstHypothesis = hypothesis('first');
  firstHypothesis.evidence = [
    verifiedEvidence('SUPPORTS', 'support-order'),
    {
      source: { kind: 'CUSTOMER_STATEMENT', id: 'statement-order', version: 3 },
      relation: 'SUPPORTS',
      verification: 'UNVERIFIED_STATEMENT',
      note: '補助的な未検証発言',
    },
  ];
  const secondHypothesis = hypothesis('second');
  secondHypothesis.openQuestions = ['質問1', '質問2'];
  const inputs = [firstHypothesis, secondHypothesis];
  const gapsInput = gaps();
  const hypothesesBefore = structuredClone(inputs);
  const gapsBefore = structuredClone(gapsInput);

  const first = reviewPaidAssessmentRootCauses(gapsInput, inputs);
  const second = reviewPaidAssessmentRootCauses(gapsInput, inputs);
  assert.deepEqual(first, second);
  assert.deepEqual(inputs, hypothesesBefore);
  assert.deepEqual(gapsInput, gapsBefore);
  assert.deepEqual(first.hypotheses.map(value => value.id), ['first', 'second']);
  assert.deepEqual(first.hypotheses[0]!.evidence.map(value => value.source.id), [
    'support-order',
    'statement-order',
  ]);
  assert.deepEqual(first.hypotheses[1]!.openQuestions, ['質問1', '質問2']);
  assert.notEqual(first.hypotheses, inputs);
  assert.notEqual(first.hypotheses[0], inputs[0]);
  assert.notEqual(first.hypotheses[0]!.evidence, inputs[0]!.evidence);
  assert.notEqual(first.hypotheses[0]!.evidence[0], inputs[0]!.evidence[0]);
  assert.notEqual(first.hypotheses[0]!.evidence[0]!.source, inputs[0]!.evidence[0]!.source);
  assert.notEqual(first.hypotheses[0]!.openQuestions, inputs[0]!.openQuestions);
  assert.equal('priority' in first.hypotheses[0]!, false);
  assert.equal('severity' in first.hypotheses[0]!, false);
  assert.equal('actOptions' in first.hypotheses[0]!, false);
});
