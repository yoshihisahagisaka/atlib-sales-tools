import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diagnosisSnapshotSchema, prepareConsultation, DIAGNOSIS_DEFINITION, DIAGNOSIS_VERSION, LOGIC_VERSION } from '../src/domain/businessWebConsultation';

function snapshot(overrides: Record<string, unknown> = {}) {
  const base = {
    diagnosisDefinition: DIAGNOSIS_DEFINITION, diagnosisVersion: DIAGNOSIS_VERSION, logicVersion: LOGIC_VERSION,
    originalAnswers: { Q01:'MANAGER',Q02:['SMOOTH_WORKFLOW'],Q03:'OPEN',Q04:2,Q05:2,Q06:2,Q07:2,Q08:1,Q09:1,Q10:2,Q11:1,Q12:['EXCEL'],Q13:2,Q14:2,Q15:'CONNECTED' },
    targetState: { clarity:'CLEAR', selected:['SMOOTH_WORKFLOW'] },
    sixAxisGaps: { workflow:{level:'MODERATE',coverage:'HIGH',knownCount:4,eligibleCount:4,average:2}, information:{level:'SOME',coverage:'HIGH',knownCount:3,eligibleCount:3,average:1.66}, decision:{level:'MODERATE',coverage:'HIGH',knownCount:2,eligibleCount:2,average:2}, dependency:{level:'SOME',coverage:'HIGH',knownCount:2,eligibleCount:2,average:1}, scalability:{level:'SOME',coverage:'HIGH',knownCount:1,eligibleCount:1,average:1}, toolConstraint:{level:'MODERATE',coverage:'HIGH',knownCount:2,eligibleCount:2,average:2} },
    confirmedFacts:['多くの業務で、人による集計・報告・進捗確認が必要です。'], unknownItems:[], bottlenecks:['B01','B02'], direction:'BC', directionStatus:'DETERMINED', confidence:'HIGH', renderedImprovementDirection:'確認できた状況を踏まえ、業務と情報の流れを整理します。',
  };
  return structuredClone({ ...base, ...overrides });
}

test('T01/T05: confirmed facts are not re-asked; major areas and bottlenecks become deterministic candidates', () => {
  const input = diagnosisSnapshotSchema.parse(snapshot()); const result = prepareConsultation(input, '2026-10-01T00:00:00.000Z');
  assert.equal(result.preparationGeneratedAt, '2026-10-01T00:00:00.000Z');
  assert.deepEqual(result.confirmedFacts, input.confirmedFacts); assert.ok(result.skipQuestions[0]?.startsWith('確認済み:'));
  assert.ok(result.majorImprovementAreas.some(x => x.axis === 'workflow')); assert.ok(result.deepDiveCandidates.some(x => x.key === 'B01'));
  assert.equal(result.direction, 'BC'); assert.equal(result.directionStatus, 'DETERMINED');
});

test('T07: TO-BE clarification stays context; it is not recalculated by preparation', () => {
  const input = diagnosisSnapshotSchema.parse(snapshot({ originalAnswers:{...snapshot().originalAnswers,Q02:['UNKNOWN']}, targetState:{clarity:'UNKNOWN',selected:['UNKNOWN']}, direction:null, directionStatus:'TO_BE_CLARIFICATION', confidence:'LOW' }));
  const result = prepareConsultation(input); assert.equal(result.direction, null); assert.equal(result.directionStatus, 'TO_BE_CLARIFICATION');
});

test('T09: Scope UNKNOWN adds the explicit purpose and neutral scope question without inferring scope', () => {
  const input = diagnosisSnapshotSchema.parse(snapshot({ originalAnswers:{...snapshot().originalAnswers,Q15:'UNKNOWN'}, unknownItems:['今回確認された課題が、特定の業務だけで発生しているのか、前後の業務や他部門にも関係しているのかについては確認できませんでした。'], direction:'B', directionStatus:'DETERMINED', confidence:'MEDIUM' }));
  const result = prepareConsultation(input); const scope = result.standardQuestions.find(x => x.key === 'scope_unknown');
  assert.ok(scope); assert.match(scope!.purpose, /局所/); assert.match(scope!.question, /前後の業務や他の部門/); assert.equal(result.direction, 'B');
});

test('T10: Scope clarification remains null and does not become a service recommendation', () => {
  const input = diagnosisSnapshotSchema.parse(snapshot({ originalAnswers:{...snapshot().originalAnswers,Q15:'UNKNOWN'}, unknownItems:['Scope / Connectionは確認できませんでした。'], direction:null, directionStatus:'SCOPE_CLARIFICATION', confidence:'LOW' }));
  const result = prepareConsultation(input); assert.equal(result.direction, null); assert.equal(result.directionStatus, 'SCOPE_CLARIFICATION'); assert.ok(result.standardQuestions.some(x => x.key === 'scope_unknown'));
});

test('snapshot contract rejects wrong version, inconsistent target state, and inferred direction during clarification', () => {
  assert.equal(diagnosisSnapshotSchema.safeParse(snapshot({ logicVersion:'2.0' })).success, false);
  assert.equal(diagnosisSnapshotSchema.safeParse(snapshot({ targetState:{clarity:'UNKNOWN',selected:['SMOOTH_WORKFLOW']} })).success, false);
  assert.equal(diagnosisSnapshotSchema.safeParse(snapshot({ directionStatus:'SCOPE_CLARIFICATION', direction:'B' })).success, false);
});
