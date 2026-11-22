import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  BUSINESS_KAIZEN_OPTION_CODES,
  BUSINESS_KAIZEN_QUESTION_IDS,
  diagnoseBusinessKaizen,
  diagnoseBusinessKaizenSnapshot,
  type BusinessKaizenAnswers,
} from '../src/domain/businessKaizenDiagnosis';

const base = (): BusinessKaizenAnswers => ({
  Q01: 'MANAGER', Q02: ['SMOOTH_WORKFLOW'], Q03: 'OPEN',
  Q04: 0, Q05: 0, Q06: 0, Q07: 0, Q08: 0, Q09: 0, Q10: 0,
  Q11: 0, Q12: ['EXCEL'], Q13: 0, Q14: 0, Q15: 'LOCAL',
});
const answers = (overrides: Partial<BusinessKaizenAnswers> = {}): BusinessKaizenAnswers => ({ ...base(), ...overrides });
const sha256 = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const T05: BusinessKaizenAnswers = {
  Q01: 'MANAGER', Q02: ['FIT_FOR_BUSINESS', 'SMOOTH_WORKFLOW', 'SHARED_INFORMATION'], Q03: 'CONDITIONAL',
  Q04: 2, Q05: 2, Q06: 2, Q07: 3, Q08: 1, Q09: 2, Q10: 2, Q11: 1,
  Q12: ['LOW_CODE_NO_CODE'], Q13: 3, Q14: 3, Q15: 'CONNECTED',
};
const T10: BusinessKaizenAnswers = {
  Q01: 'EXECUTIVE', Q02: ['SHARED_INFORMATION', 'TRANSFERABLE_WORK', 'SCALABLE_OPERATION'], Q03: 'OPEN',
  Q04: 3, Q05: 3, Q06: 3, Q07: 3, Q08: 3, Q09: 3, Q10: 3, Q11: 3,
  Q12: ['EXCEL'], Q13: 1, Q14: 2, Q15: 'UNKNOWN',
};

test('question IDs, option codes and answer format remain the Corporate v1 contract', () => {
  assert.deepEqual(BUSINESS_KAIZEN_QUESTION_IDS, Array.from({ length: 15 }, (_, index) => `Q${String(index + 1).padStart(2, '0')}`));
  assert.deepEqual(BUSINESS_KAIZEN_OPTION_CODES.Q11, [0, 1, 2, 3, 'UNKNOWN', 'N_A']);
  assert.ok(BUSINESS_KAIZEN_OPTION_CODES.Q02.includes('UNKNOWN'));
  assert.ok(BUSINESS_KAIZEN_OPTION_CODES.Q12.includes('CUSTOM_SYSTEM'));
});

test('Corporate PR #74 T05 and T10 oracle snapshots match in full', () => {
  const t05 = diagnoseBusinessKaizenSnapshot(T05);
  const t10 = diagnoseBusinessKaizenSnapshot(T10);
  assert.equal(sha256(t05), '2ec62777c3bc583ce95f04255b80a0a40aaae108c98719ecb2403c718e8c7231');
  assert.equal(sha256(t10), '446d61e895f24fc55c6a02d6c9030c69c4dd3d4a72edce25e20acbd1759f4dea');
  assert.deepEqual(t05.sixAxisGaps, {
    workflow: { level: 'LARGE', coverage: 'HIGH', knownCount: 4, eligibleCount: 4, average: 2.5 },
    information: { level: 'MODERATE', coverage: 'HIGH', knownCount: 3, eligibleCount: 3, average: 2 },
    decision: { level: 'MODERATE', coverage: 'HIGH', knownCount: 2, eligibleCount: 2, average: 2 },
    dependency: { level: 'MODERATE', coverage: 'HIGH', knownCount: 2, eligibleCount: 2, average: 1.5 },
    scalability: { level: 'SOME', coverage: 'HIGH', knownCount: 1, eligibleCount: 1, average: 1 },
    toolConstraint: { level: 'LARGE', coverage: 'HIGH', knownCount: 2, eligibleCount: 2, average: 3 },
  });
  assert.equal(t05.direction, 'BC'); assert.equal(t05.confidence, 'HIGH');
  assert.deepEqual(t05.bottlenecks, ['B01', 'B02', 'B04']);
  assert.equal(t10.direction, null); assert.equal(t10.directionStatus, 'SCOPE_CLARIFICATION');
  assert.equal(t10.confidence, 'LOW'); assert.equal(t10.unknownItems.length, 1);
});

test('all six determined Direction classes retain the Corporate decision table', () => {
  const cases: Array<[string, Partial<BusinessKaizenAnswers>]> = [
    ['D', {}],
    ['A', { Q04: 1, Q06: 1, Q07: 1 }],
    ['B', { Q13: 3, Q14: 3 }],
    ['AB', { Q04: 1, Q13: 3, Q14: 3 }],
    ['C', { Q04: 3, Q05: 3, Q06: 3, Q07: 3, Q08: 3, Q09: 3, Q10: 3, Q15: 'CONNECTED' }],
    ['BC', { Q04: 3, Q05: 3, Q06: 3, Q07: 3, Q08: 3, Q09: 3, Q10: 3, Q13: 3, Q14: 3, Q15: 'CONNECTED' }],
  ];
  for (const [expected, overrides] of cases) {
    const result = diagnoseBusinessKaizen(answers(overrides));
    assert.equal(result.direction, expected); assert.equal(result.directionStatus, 'DETERMINED');
  }
});

test('UNKNOWN, N_A and LOW/MEDIUM/HIGH Coverage preserve existing semantics', () => {
  const low = diagnoseBusinessKaizen(answers({ Q04: 3, Q06: 'UNKNOWN', Q07: 'UNKNOWN', Q14: 'UNKNOWN', Q11: 'N_A' }));
  assert.deepEqual(low.axes.workflow, { level: 'LARGE', coverage: 'LOW', knownCount: 1, eligibleCount: 4, average: 3 });
  assert.deepEqual(low.axes.scalability, { level: 'UNKNOWN', coverage: 'LOW', knownCount: 0, eligibleCount: 0, average: null });
  const medium = diagnoseBusinessKaizen(answers({ Q04: 3, Q06: 3, Q07: 'UNKNOWN', Q14: 'UNKNOWN' }));
  assert.equal(medium.axes.workflow.coverage, 'MEDIUM');
  const high = diagnoseBusinessKaizen(answers({ Q04: 3, Q06: 3, Q07: 3, Q14: 'UNKNOWN' }));
  assert.equal(high.axes.workflow.coverage, 'HIGH');
  const unknowns = diagnoseBusinessKaizen(answers({ Q03: 'UNKNOWN', Q10: 'UNKNOWN', Q15: 'UNKNOWN' }));
  assert.equal(unknowns.unknowns.length, 3);
  assert.match(unknowns.unknowns[1]!, /管理者や経営者/);
  assert.match(unknowns.unknowns[2]!, /前後の業務や他部門/);
});

test('Confidence remains LOW for clarification, MEDIUM for capped/partial B and HIGH for complete evidence', () => {
  assert.equal(diagnoseBusinessKaizen(answers({ Q02: ['UNKNOWN'] })).confidence, 'LOW');
  const medium = diagnoseBusinessKaizen(answers({ Q04: 2, Q13: 3, Q14: 'UNKNOWN' }));
  assert.equal(medium.direction, 'AB'); assert.equal(medium.axes.toolConstraint.coverage, 'MEDIUM'); assert.equal(medium.confidence, 'MEDIUM');
  assert.equal(diagnoseBusinessKaizen(answers({ Q13: 3, Q14: 3 })).confidence, 'HIGH');
});

test('output is deterministic and independent from property order, display state and attribution', () => {
  const canonical = diagnoseBusinessKaizen(T05);
  assert.deepEqual(diagnoseBusinessKaizen(T05), canonical);
  const reversed = Object.fromEntries(Object.entries(T05).reverse()) as unknown as BusinessKaizenAnswers;
  assert.deepEqual(diagnoseBusinessKaizen(reversed), canonical);
  const withPresentationMetadata = { ...T05, utmSource: 'campaign', screen: 'result', entryChannel: 'STAFF_PROXY' } as unknown as BusinessKaizenAnswers;
  const { answers: _canonicalAnswers, ...canonicalDecision } = canonical;
  const { answers: _metadataAnswers, ...metadataDecision } = diagnoseBusinessKaizen(withPresentationMetadata);
  assert.deepEqual(metadataDecision, canonicalDecision);
});
