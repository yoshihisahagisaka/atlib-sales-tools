import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAssessmentStructure, suggestAssessmentScope, type AssessmentStructureGates } from '../src/domain/assessmentStructureRule';

// 12 Regression Cases from
// docs/free-diagnosis-rule-based-v1-assessment-structure-and-suggested-scope-rule-20261003.md §12.
const cases: { n: number; desc: string; gates: AssessmentStructureGates; structure: string; scope: string }[] = [
  { n: 1, desc: '限定テーマ。確認経路が明確', gates: { structure_determinable: true, single_management_scope: true, requires_individual_confirmation_per_target: false, cross_theme_dependency: false }, structure: 'LIMITED', scope: 'COMPACT' },
  { n: 2, desc: '複数テーマが相互依存', gates: { structure_determinable: true, single_management_scope: false, requires_individual_confirmation_per_target: false, cross_theme_dependency: true }, structure: 'STANDARD_CROSS_FUNCTIONAL', scope: 'STANDARD' },
  { n: 3, desc: '拠点は複数だが共通運用・共通Evidenceで確認可能', gates: { structure_determinable: true, single_management_scope: true, requires_individual_confirmation_per_target: false, cross_theme_dependency: false }, structure: 'LIMITED', scope: 'COMPACT' },
  { n: 4, desc: '複数拠点をそれぞれ個別調査しなければ成立しない', gates: { structure_determinable: true, single_management_scope: false, requires_individual_confirmation_per_target: true, cross_theme_dependency: false }, structure: 'EXTENDED', scope: 'EXPANDED' },
  { n: 5, desc: 'IPO予定だが通常範囲で完結', gates: { structure_determinable: true, single_management_scope: true, requires_individual_confirmation_per_target: false, cross_theme_dependency: false }, structure: 'LIMITED', scope: 'COMPACT' },
  { n: 6, desc: 'IPOに関連し通常以上の証跡確認が必要', gates: { structure_determinable: true, single_management_scope: false, requires_individual_confirmation_per_target: true, cross_theme_dependency: false }, structure: 'EXTENDED', scope: 'EXPANDED' },
  { n: 7, desc: 'UNKNOWN多数だが確認経路は明確', gates: { structure_determinable: true, single_management_scope: true, requires_individual_confirmation_per_target: false, cross_theme_dependency: false }, structure: 'LIMITED', scope: 'COMPACT' },
  { n: 8, desc: '限定か横断か無料診断情報だけでは判定できない', gates: { structure_determinable: false, single_management_scope: false, requires_individual_confirmation_per_target: false, cross_theme_dependency: false }, structure: 'UNRESOLVED', scope: 'REVIEW' },
  { n: 9, desc: 'Investigation Need=RECOMMENDEDだが限定Scopeで完結可能', gates: { structure_determinable: true, single_management_scope: true, requires_individual_confirmation_per_target: false, cross_theme_dependency: false }, structure: 'LIMITED', scope: 'COMPACT' },
  { n: 10, desc: 'Investigation Need=OPTIONALだが横断Assessmentが必要', gates: { structure_determinable: true, single_management_scope: false, requires_individual_confirmation_per_target: false, cross_theme_dependency: true }, structure: 'STANDARD_CROSS_FUNCTIONAL', scope: 'STANDARD' },
  { n: 11, desc: '複数Vendorだが社内で一元管理されている', gates: { structure_determinable: true, single_management_scope: true, requires_individual_confirmation_per_target: false, cross_theme_dependency: false }, structure: 'LIMITED', scope: 'COMPACT' },
  { n: 12, desc: '複数Vendorが個別管理され全体像を把握する主体がいない', gates: { structure_determinable: true, single_management_scope: false, requires_individual_confirmation_per_target: true, cross_theme_dependency: false }, structure: 'EXTENDED', scope: 'EXPANDED' },
];

for (const c of cases) {
  test(`Regression Case ${c.n}: ${c.desc}`, () => {
    assert.equal(classifyAssessmentStructure(c.gates), c.structure);
    const suggestion = suggestAssessmentScope(c.gates);
    assert.equal(suggestion.structure, c.structure);
    assert.equal(suggestion.suggestedScope, c.scope);
  });
}

test('price mapping matches doc83 DECIDED prices exactly', () => {
  assert.equal(suggestAssessmentScope({ structure_determinable: true, single_management_scope: true, requires_individual_confirmation_per_target: false, cross_theme_dependency: false }).suggestedBasePriceYen, 800_000);
  assert.equal(suggestAssessmentScope({ structure_determinable: true, single_management_scope: false, requires_individual_confirmation_per_target: false, cross_theme_dependency: true }).suggestedBasePriceYen, 1_200_000);
  assert.equal(suggestAssessmentScope({ structure_determinable: true, single_management_scope: false, requires_individual_confirmation_per_target: true, cross_theme_dependency: false }).suggestedBasePriceYen, 1_200_000);
  assert.equal(suggestAssessmentScope({ structure_determinable: false, single_management_scope: false, requires_individual_confirmation_per_target: false, cross_theme_dependency: false }).suggestedBasePriceYen, null);
});

test('EXTENDED carries requiresIndividualQuote=true, no other structure does', () => {
  const extended = suggestAssessmentScope({ structure_determinable: true, single_management_scope: false, requires_individual_confirmation_per_target: true, cross_theme_dependency: false });
  assert.equal(extended.requiresIndividualQuote, true);
  const limited = suggestAssessmentScope({ structure_determinable: true, single_management_scope: true, requires_individual_confirmation_per_target: false, cross_theme_dependency: false });
  assert.equal(limited.requiresIndividualQuote, false);
});

test('Guardrail (type-level): suggestAssessmentScope has no parameter for Investigation Need, UNKNOWN count, or any numeric threshold', () => {
  // suggestAssessmentScope's only parameter is AssessmentStructureGates -- 4 booleans, no
  // Investigation Need field, no count field. This is verified structurally: every key is boolean.
  const gates: AssessmentStructureGates = { structure_determinable: true, single_management_scope: true, requires_individual_confirmation_per_target: false, cross_theme_dependency: false };
  for (const v of Object.values(gates)) assert.equal(typeof v, 'boolean');
  assert.deepEqual(Object.keys(gates).sort(), ['cross_theme_dependency', 'requires_individual_confirmation_per_target', 'single_management_scope', 'structure_determinable']);
});

test('ambiguous (not LIMITED, not EXTENDED, not cross) defaults to STANDARD_CROSS_FUNCTIONAL, never under-suggests', () => {
  // single_management_scope=false alone (without cross_theme_dependency) is the "中間的" case.
  const gates: AssessmentStructureGates = { structure_determinable: true, single_management_scope: false, requires_individual_confirmation_per_target: false, cross_theme_dependency: false };
  assert.equal(classifyAssessmentStructure(gates), 'STANDARD_CROSS_FUNCTIONAL');
});
