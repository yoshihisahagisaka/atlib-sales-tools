import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInitialRule } from '../src/domain/initialRuleEngine';
import { projectIntakeSemantics } from '../src/domain/intakeSemanticProjection';
import { runFinalRule } from '../src/domain/finalRuleEngine';
import { hearingUnitForFocus } from '../src/domain/structuredHearing';
import type { IntakeAnswerEnvelopeV1 } from '../src/domain/freeDiagnosisRuleBasedV1';

const intake = (questionCode: string, answerValue: unknown): IntakeAnswerEnvelopeV1 => ({
  schemaVersion: 1, questionCode: questionCode as IntakeAnswerEnvelopeV1['questionCode'], answerValue: answerValue as never,
  responseState: 'ANSWERED', respondent: { role: 'MANAGEMENT' }, provenance: { channel: 'SELF', source: 'CUSTOMER_SELF' },
});

test('HA case: Future × Desired × Current deterministically exposes management, productivity and growth confirmation themes', () => {
  const projection = projectIntakeSemantics([
    intake('Q1', { employeeSize: 'EMP_21_50', locations: 'SITE_1' }),
    intake('Q2', ['BUSINESS_EXPANSION', 'LEAN_SCALING']),
    intake('Q3', ['IMPROVE_PRODUCTIVITY', 'ENABLE_MANAGEMENT_DECISION']),
    intake('Q4', 'MANAGEMENT_DECISION_CONCERN'),
    intake('Q5', 'PARTIALLY_VISIBLE'),
    intake('Q6', 'DELIVERED_NOT_USABLE'),
  ]);
  const result = runInitialRule(projection);
  assert.deepEqual(result.focusItems.map(x => [x.focus, x.role]), [
    ['M01_IT_MANAGEMENT_JUDGMENT', 'PRIMARY'],
    ['M05_GROWTH_CHANGE_ADAPTATION', 'OPPORTUNITY'],
    ['M04_BUSINESS_PRODUCTIVITY', 'OPPORTUNITY'],
  ]);
  assert.equal(result.problemFindings.length, 0);
  assert.equal(result.assessmentEscalated, false);
  for (const focus of result.focusItems.map(x => x.focus)) {
    const unit = hearingUnitForFocus(focus);
    assert.ok(unit.questionSequence.length >= 4 || focus === 'H00_MANAGEMENT_DISCOVERY');
    assert.ok(unit.questionSequence.some(x => x.key === 'CURRENT'));
    assert.ok(unit.questionSequence.some(x => x.key === 'DEEP_DIVE' || x.key === 'UNKNOWN'));
  }
});

test('Future alone remains a relevance reference, not a forced hearing problem or focus', () => {
  const projection = projectIntakeSemantics([
    intake('Q1', { employeeSize: 'EMP_21_50', locations: 'SITE_1' }),
    intake('Q2', ['BUSINESS_EXPANSION']), intake('Q3', ['UNDECIDED']),
    intake('Q4', 'NO_MAJOR_CONCERN'), intake('Q5', 'VISIBLE_ENOUGH'), intake('Q6', 'REGULAR_AND_USABLE'),
  ]);
  const result = runInitialRule(projection);
  assert.deepEqual(result.focusItems.map(x => [x.focus, x.role]), [['M05_GROWTH_CHANGE_ADAPTATION', 'OPPORTUNITY']]);
  assert.equal(result.noImportantConfirmation, true);
  assert.equal(result.problemFindings.length, 0);
});

test('Structured results become improvement possibility and next confirmation without turning into FACT', () => {
  const m01 = hearingUnitForFocus('M01_IT_MANAGEMENT_JUDGMENT');
  const m04 = hearingUnitForFocus('M04_BUSINESS_PRODUCTIVITY');
  const result = runFinalRule({ intake: projectIntakeSemantics([]), answers: [
    { schemaVersion: 1, hearingUnitCode: m01.unitCode, semanticKey: m01.semanticKey, answerValue: 'PARTIALLY_JUDGE', responseState: 'ANSWERED', respondent: { role: 'MANAGEMENT' }, provenance: { channel: 'PROXY', source: 'SALES_PROXY' }, completionStatus: 'COMPLETE' },
    { schemaVersion: 1, hearingUnitCode: m04.unitCode, semanticKey: m04.semanticKey, answerValue: ['INPUT_TRANSCRIPTION', 'AGGREGATION_REPORTING'], responseState: 'ANSWERED', respondent: { role: 'MANAGEMENT' }, provenance: { channel: 'PROXY', source: 'SALES_PROXY' }, completionStatus: 'COMPLETE' },
  ] });
  assert.match(result.gapPossibilities[0]!.statement, /確認する価値/);
  assert.match(result.improvementOpportunities[0]!.statement, /可能性/);
  assert.match(result.evidenceCandidates[0]!.purpose, /情報/);
  assert.equal(JSON.stringify(result).includes('FACT'), false);
});
