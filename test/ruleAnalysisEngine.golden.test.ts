import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { planItemsForFocus, runRuleAnalysis, type HearingStatementInput } from '../src/domain/ruleAnalysisEngine';

function stmt(planItemRef: string, knowledgeState: HearingStatementInput['knowledgeState'], requiresIndividualConfirmation = false): HearingStatementInput {
  return { planItemRef, knowledgeState, requiresIndividualConfirmation };
}

test('AIなしで完結する: ruleAnalysisEngine.ts / assessmentStructureRule.ts never reference Anthropic or any AI provider', () => {
  for (const f of ['../src/domain/ruleAnalysisEngine.ts', '../src/domain/assessmentStructureRule.ts']) {
    const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
    assert.doesNotMatch(src, /anthropic/i);
    assert.doesNotMatch(src, /AIProvider|ProviderFailure/);
  }
});

test('UNKNOWNを問題扱いしない: Focus外のUNKNOWNは一切評価されない（Secondary未選択時）', () => {
  const result = runRuleAnalysis({
    primaryFocus: 'M01_IT_MANAGEMENT_JUDGMENT', secondaryFocus: null,
    statements: [
      stmt('M01_IT_MANAGEMENT_JUDGMENT_CORE', 'KNOWN'),
      stmt('M01_IT_MANAGEMENT_JUDGMENT_DECISION', 'KNOWN'),
      // M02 is not the selected Focus -- its UNKNOWN must not surface as a finding.
      stmt('M02_IT_OPERATION_CONTINUITY_CORE', 'UNKNOWN'),
    ],
    hasStatedChangeIntent: false, hasStatedOpportunityIntent: false,
  });
  assert.equal(result.findings.length, 0);
  assert.equal(result.overallInvestigationNeed, 'NO_IMMEDIATE_INVESTIGATION_NEED');
});

test('outsourcingだけで問題判定しない / one-person ITだけでM02判定しない: どちらも素の事実文言は評価に使わない', () => {
  // The engine never reads statement free text content at all -- only knowledgeState and the
  // plan item it is attached to. A statement whose *text* says "outsourced" or "one-person IT"
  // but whose knowledgeState is KNOWN (i.e. the fact itself is well-established) triggers nothing.
  const result = runRuleAnalysis({
    primaryFocus: 'M02_IT_OPERATION_CONTINUITY', secondaryFocus: null,
    statements: [
      stmt('M02_IT_OPERATION_CONTINUITY_CORE', 'KNOWN'),
      stmt('M02_IT_OPERATION_CONTINUITY_DECISION', 'KNOWN'),
    ],
    hasStatedChangeIntent: false, hasStatedOpportunityIntent: false,
  });
  assert.equal(result.findings.length, 0);
  assert.equal(result.broadUnknownCollapse, false);
});

test('Changeだけで問題判定しない: Q2に回答があるだけでは何も発火しない（未解決項目が別途必要）', () => {
  const result = runRuleAnalysis({
    primaryFocus: 'M05_GROWTH_CHANGE_ADAPTATION', secondaryFocus: null,
    statements: [
      stmt('M05_GROWTH_CHANGE_ADAPTATION_CORE', 'KNOWN'),
      stmt('M05_GROWTH_CHANGE_ADAPTATION_DECISION', 'KNOWN'),
    ],
    hasStatedChangeIntent: true, hasStatedOpportunityIntent: false,
  });
  assert.equal(result.findings.length, 0);
});

test('T3 Change Trigger: Initial Ruleが明示したVerification Purpose + 未解決の経営判断項目 + Change意図がある場合のみ発火', () => {
  const result = runRuleAnalysis({
    primaryFocus: 'M05_GROWTH_CHANGE_ADAPTATION', secondaryFocus: null,
    statements: [
      stmt('M05_GROWTH_CHANGE_ADAPTATION_CORE', 'KNOWN'),
      stmt('M05_GROWTH_CHANGE_ADAPTATION_DECISION', 'PARTIAL'),
    ],
    hasStatedChangeIntent: true, hasStatedOpportunityIntent: false,
    verificationPurposes: [{ focus: 'M05_GROWTH_CHANGE_ADAPTATION', triggerType: 'T2_DECISION' }],
  });
  assert.ok(result.findings.some(f => f.triggerType === 'T2_DECISION'));
  assert.ok(result.findings.some(f => f.triggerType === 'T3_CHANGE'));
  assert.ok(!result.findings.some(f => f.triggerType === 'T4_OPPORTUNITY'));
});

test('Security concernだけでScope upしない: Assessment Structure Gatesは個別確認フラグが立った項目でのみ変化する', () => {
  const resultWithoutFlag = runRuleAnalysis({
    primaryFocus: 'M03_BUSINESS_DEFENSE_CONTINUITY', secondaryFocus: null,
    statements: [
      stmt('M03_BUSINESS_DEFENSE_CONTINUITY_CORE', 'PARTIAL', false),
      stmt('M03_BUSINESS_DEFENSE_CONTINUITY_DECISION', 'KNOWN', false),
    ],
    hasStatedChangeIntent: false, hasStatedOpportunityIntent: false,
  });
  assert.equal(resultWithoutFlag.assessmentStructureGates.requires_individual_confirmation_per_target, false);
  assert.equal(resultWithoutFlag.assessmentStructureGates.single_management_scope, true);
});

test('Investigation NeedからScopeを直接決めない: Purposeが無いUNKNOWNはNeedを作らず、gatesは独立して決まる', () => {
  // Case A: Purpose未選択のUNKNOWNはNeedを作らないが、gatesはLIMITED-shaped.
  const caseA = runRuleAnalysis({
    primaryFocus: 'M01_IT_MANAGEMENT_JUDGMENT', secondaryFocus: null,
    statements: [stmt('M01_IT_MANAGEMENT_JUDGMENT_CORE', 'UNKNOWN', false), stmt('M01_IT_MANAGEMENT_JUDGMENT_DECISION', 'KNOWN', false)],
    hasStatedChangeIntent: false, hasStatedOpportunityIntent: false,
  });
  assert.equal(caseA.overallInvestigationNeed, 'NO_IMMEDIATE_INVESTIGATION_NEED');
  assert.equal(caseA.assessmentStructureGates.single_management_scope, true);
  assert.equal(caseA.assessmentStructureGates.requires_individual_confirmation_per_target, false);
  // Case B: no investigation need at all, but requires_individual_confirmation flag is set --
  // gates must still reflect EXTENDED-shaped structure regardless of Investigation Need being none.
  const caseB = runRuleAnalysis({
    primaryFocus: 'M01_IT_MANAGEMENT_JUDGMENT', secondaryFocus: null,
    statements: [stmt('M01_IT_MANAGEMENT_JUDGMENT_CORE', 'KNOWN', true), stmt('M01_IT_MANAGEMENT_JUDGMENT_DECISION', 'KNOWN', false)],
    hasStatedChangeIntent: false, hasStatedOpportunityIntent: false,
  });
  assert.equal(caseB.overallInvestigationNeed, 'NO_IMMEDIATE_INVESTIGATION_NEED');
  assert.equal(caseB.assessmentStructureGates.requires_individual_confirmation_per_target, true);
});

test('数量閾値でCOMPACT/STANDARD/EXPANDEDを決めない: 未解決項目が1件でも10件でもrequires_individual_confirmationが無ければEXTENDEDにならない', () => {
  const manyUnresolved = runRuleAnalysis({
    primaryFocus: 'M04_BUSINESS_PRODUCTIVITY', secondaryFocus: null,
    statements: [stmt('M04_BUSINESS_PRODUCTIVITY_CORE', 'UNKNOWN', false), stmt('M04_BUSINESS_PRODUCTIVITY_DECISION', 'UNKNOWN', false)],
    hasStatedChangeIntent: true, hasStatedOpportunityIntent: true,
  });
  assert.equal(manyUnresolved.assessmentStructureGates.requires_individual_confirmation_per_target, false);
});

test('Broad Unknown Collapseはretire: UNKNOWNだけではfindingもInvestigation Needも作らない', () => {
  const result = runRuleAnalysis({
    primaryFocus: 'M06_IT_STRATEGIC_USE', secondaryFocus: null,
    statements: [stmt('M06_IT_STRATEGIC_USE_CORE', 'UNKNOWN'), stmt('M06_IT_STRATEGIC_USE_DECISION', 'PARTIAL')],
    hasStatedChangeIntent: true, hasStatedOpportunityIntent: true,
  });
  assert.equal(result.broadUnknownCollapse, false);
  assert.equal(result.findings.length, 0);
  assert.equal(result.overallInvestigationNeed, 'NO_IMMEDIATE_INVESTIGATION_NEED');
});

test('Broad Unknown Collapseは一つでもKNOWN/AVAILABLEがあれば発火しない', () => {
  const result = runRuleAnalysis({
    primaryFocus: 'M06_IT_STRATEGIC_USE', secondaryFocus: null,
    statements: [stmt('M06_IT_STRATEGIC_USE_CORE', 'KNOWN'), stmt('M06_IT_STRATEGIC_USE_DECISION', 'UNKNOWN')],
    hasStatedChangeIntent: false, hasStatedOpportunityIntent: false,
  });
  assert.equal(result.broadUnknownCollapse, false);
});

test('cross_theme_dependency: Secondary Focusを選んだ場合のみtrueになる（単一Focusでは常にfalse）', () => {
  const single = runRuleAnalysis({
    primaryFocus: 'M01_IT_MANAGEMENT_JUDGMENT', secondaryFocus: null,
    statements: [stmt('M01_IT_MANAGEMENT_JUDGMENT_CORE', 'KNOWN')],
    hasStatedChangeIntent: false, hasStatedOpportunityIntent: false,
  });
  assert.equal(single.assessmentStructureGates.cross_theme_dependency, false);
  const dual = runRuleAnalysis({
    primaryFocus: 'M01_IT_MANAGEMENT_JUDGMENT', secondaryFocus: 'M04_BUSINESS_PRODUCTIVITY',
    statements: [stmt('M01_IT_MANAGEMENT_JUDGMENT_CORE', 'KNOWN'), stmt('M04_BUSINESS_PRODUCTIVITY_CORE', 'KNOWN')],
    hasStatedChangeIntent: false, hasStatedOpportunityIntent: false,
  });
  assert.equal(dual.assessmentStructureGates.cross_theme_dependency, true);
});

test('structure_determinable: Focus選択済みでも確認結果が0件なら安全側(false)に倒す', () => {
  const result = runRuleAnalysis({
    primaryFocus: 'M01_IT_MANAGEMENT_JUDGMENT', secondaryFocus: null,
    statements: [], hasStatedChangeIntent: false, hasStatedOpportunityIntent: false,
  });
  assert.equal(result.assessmentStructureGates.structure_determinable, false);
});

test('整理モードでの再確認（append-only）は最新のknowledgeStateを採用する', () => {
  const result = runRuleAnalysis({
    primaryFocus: 'M01_IT_MANAGEMENT_JUDGMENT', secondaryFocus: null,
    statements: [
      stmt('M01_IT_MANAGEMENT_JUDGMENT_CORE', 'UNKNOWN'),
      stmt('M01_IT_MANAGEMENT_JUDGMENT_CORE', 'KNOWN'), // 整理モードでの再確認、古い行を書き換えない
      stmt('M01_IT_MANAGEMENT_JUDGMENT_DECISION', 'KNOWN'),
    ],
    hasStatedChangeIntent: false, hasStatedOpportunityIntent: false,
  });
  assert.equal(result.findings.length, 0); // 最新はKNOWNなので何も発火しない
});

test('planItemsForFocus: 各Focusにつき2件（CORE/DECISION）、他Focusと重複しないcodeを持つ', () => {
  const items = planItemsForFocus('M02_IT_OPERATION_CONTINUITY');
  assert.equal(items.length, 2);
  assert.deepEqual(items.map(i => i.triggerType).sort(), ['T1_KNOWLEDGE', 'T2_DECISION']);
  assert.ok(items.every(i => i.code.startsWith('M02_IT_OPERATION_CONTINUITY')));
});
