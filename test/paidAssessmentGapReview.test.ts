import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reviewPaidAssessmentGaps,
  type GapReviewItem,
} from '../src/domain/paidAssessmentGapReview';

const hashes = {
  future: 'a'.repeat(64),
  current: 'b'.repeat(64),
};

function item(
  id: string,
  verification: GapReviewItem['current']['verification'],
  assessment: GapReviewItem['comparison']['assessment'],
): GapReviewItem {
  return {
    id,
    area: 'TECHNOLOGY',
    futureCriterion: {
      statement: '障害時にも重要業務を継続できる状態にする',
      source: { kind: 'MANAGEMENT_FEEDBACK', id: `future-${id}`, version: 3, hash: hashes.future },
    },
    current: {
      statement: '復旧テストは年1回実施されている',
      source: verification === 'VERIFIED_REFERENCE'
        ? { kind: 'CORE_VERIFIED_REFERENCE', id: `current-${id}`, version: 7, hash: hashes.current }
        : { kind: verification === 'UNKNOWN' ? 'FREE_DIAGNOSIS_REPORT' : 'CUSTOMER_STATEMENT', id: `current-${id}`, version: 2 },
      verification,
    },
    comparison: {
      statement: '目標と現在の復旧確認範囲を比較した',
      rationale: '経営者が示した継続条件と検証済みの実施記録を比較したため',
      sourceIds: [`future-${id}`, `current-${id}`],
      assessment,
      reviewedBy: 'assessment-reviewer-1',
    },
  };
}

test('maps verified explicit DIFFERENCE to CONFIRMED_DIFFERENCE with exact provenance', () => {
  const input = item('difference', 'VERIFIED_REFERENCE', 'DIFFERENCE');
  const result = reviewPaidAssessmentGaps([input]);

  assert.equal(result.items[0]!.state, 'CONFIRMED_DIFFERENCE');
  assert.deepEqual(result.items[0]!.futureCriterion, input.futureCriterion);
  assert.deepEqual(result.items[0]!.current, input.current);
  assert.deepEqual(result.items[0]!.comparison, input.comparison);
  assert.deepEqual(result.counts, {
    CONFIRMED_DIFFERENCE: 1,
    NO_DIFFERENCE_IDENTIFIED: 0,
    INSUFFICIENT_EVIDENCE: 0,
  });
});

test('allows a verified explicit NO_DIFFERENCE healthy outcome', () => {
  const result = reviewPaidAssessmentGaps([
    item('healthy', 'VERIFIED_REFERENCE', 'NO_DIFFERENCE'),
  ]);
  assert.equal(result.items[0]!.state, 'NO_DIFFERENCE_IDENTIFIED');
  assert.equal(result.counts.NO_DIFFERENCE_IDENTIFIED, 1);
});

test('does not confirm a difference from an unverified customer statement', () => {
  const result = reviewPaidAssessmentGaps([
    item('statement', 'UNVERIFIED_STATEMENT', 'DIFFERENCE'),
  ]);
  assert.equal(result.items[0]!.state, 'INSUFFICIENT_EVIDENCE');
});

test('does not confirm a difference from UNKNOWN', () => {
  const result = reviewPaidAssessmentGaps([item('unknown', 'UNKNOWN', 'DIFFERENCE')]);
  assert.equal(result.items[0]!.state, 'INSUFFICIENT_EVIDENCE');
});

test('maps verified UNDETERMINED to INSUFFICIENT_EVIDENCE', () => {
  const result = reviewPaidAssessmentGaps([
    item('undetermined', 'VERIFIED_REFERENCE', 'UNDETERMINED'),
  ]);
  assert.equal(result.items[0]!.state, 'INSUFFICIENT_EVIDENCE');
});

test('preserves input order, Future intent and all source IDs, versions and hashes', () => {
  const inputs = [
    item('first', 'VERIFIED_REFERENCE', 'DIFFERENCE'),
    { ...item('second', 'VERIFIED_REFERENCE', 'NO_DIFFERENCE'), area: 'OPERATION' as const },
    { ...item('third', 'UNKNOWN', 'UNDETERMINED'), area: 'MANAGEMENT' as const },
  ];
  const result = reviewPaidAssessmentGaps(inputs);

  assert.deepEqual(result.items.map(entry => entry.id), ['first', 'second', 'third']);
  assert.deepEqual(result.items.map(entry => entry.futureCriterion), inputs.map(entry => entry.futureCriterion));
  assert.deepEqual(result.items.map(entry => entry.current.source), inputs.map(entry => entry.current.source));
  assert.deepEqual(result.counts, {
    CONFIRMED_DIFFERENCE: 1,
    NO_DIFFERENCE_IDENTIFIED: 1,
    INSUFFICIENT_EVIDENCE: 1,
  });
});

test('rejects missing or mismatched comparison source IDs', () => {
  const malformed: GapReviewItem[] = [
    { ...item('empty', 'VERIFIED_REFERENCE', 'DIFFERENCE'), comparison: { ...item('empty', 'VERIFIED_REFERENCE', 'DIFFERENCE').comparison, sourceIds: [] } },
    { ...item('future-missing', 'VERIFIED_REFERENCE', 'DIFFERENCE'), comparison: { ...item('future-missing', 'VERIFIED_REFERENCE', 'DIFFERENCE').comparison, sourceIds: ['current-future-missing'] } },
    { ...item('current-missing', 'VERIFIED_REFERENCE', 'DIFFERENCE'), comparison: { ...item('current-missing', 'VERIFIED_REFERENCE', 'DIFFERENCE').comparison, sourceIds: ['future-current-missing'] } },
  ];
  for (const invalid of malformed) {
    assert.throws(() => reviewPaidAssessmentGaps([invalid]), TypeError);
  }
});

test('rejects invalid source hashes, versions, areas, states and assessments', () => {
  const mutations: Array<(value: GapReviewItem) => void> = [
    value => { value.futureCriterion.source.hash = 'A'.repeat(64); },
    value => { value.current.source.hash = 'short'; },
    value => { value.current.source.version = 0; },
    value => { (value as { area: string }).area = 'SECURITY'; },
    value => { (value.current as { verification: string }).verification = 'FACT'; },
    value => { (value.comparison as { assessment: string }).assessment = 'MATCH'; },
    value => { value.current.source.kind = 'CUSTOMER_STATEMENT'; },
  ];
  for (const mutate of mutations) {
    const invalid = item('invalid', 'VERIFIED_REFERENCE', 'DIFFERENCE');
    mutate(invalid);
    assert.throws(() => reviewPaidAssessmentGaps([invalid]), TypeError);
  }
});

test('rejects duplicate item IDs', () => {
  assert.throws(
    () => reviewPaidAssessmentGaps([
      item('duplicate', 'VERIFIED_REFERENCE', 'DIFFERENCE'),
      item('duplicate', 'UNKNOWN', 'UNDETERMINED'),
    ]),
    /duplicate item id/,
  );
});

test('is deterministic, does not mutate input and returns detached nested data', () => {
  const inputs = [item('detached', 'VERIFIED_REFERENCE', 'DIFFERENCE')];
  const before = structuredClone(inputs);
  const first = reviewPaidAssessmentGaps(inputs);
  const second = reviewPaidAssessmentGaps(inputs);

  assert.deepEqual(first, second);
  assert.deepEqual(inputs, before);
  assert.notEqual(first.items, inputs);
  assert.notEqual(first.items[0], inputs[0]);
  assert.notEqual(first.items[0]!.futureCriterion, inputs[0]!.futureCriterion);
  assert.notEqual(first.items[0]!.futureCriterion.source, inputs[0]!.futureCriterion.source);
  assert.notEqual(first.items[0]!.current, inputs[0]!.current);
  assert.notEqual(first.items[0]!.current.source, inputs[0]!.current.source);
  assert.notEqual(first.items[0]!.comparison, inputs[0]!.comparison);
  assert.notEqual(first.items[0]!.comparison.sourceIds, inputs[0]!.comparison.sourceIds);
  assert.equal('rootCause' in first.items[0]!, false);
  assert.equal('priority' in first.items[0]!, false);
  assert.equal('severity' in first.items[0]!, false);
  assert.equal('recommendation' in first.items[0]!, false);
});

test('accepts an empty input as a valid no-gap result', () => {
  assert.deepEqual(reviewPaidAssessmentGaps([]), {
    items: [],
    counts: {
      CONFIRMED_DIFFERENCE: 0,
      NO_DIFFERENCE_IDENTIFIED: 0,
      INSUFFICIENT_EVIDENCE: 0,
    },
  });
});
