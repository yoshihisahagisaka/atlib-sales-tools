import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hearingAnswerDisplayLabel, hearingUnitForFocus, isConditionalDeepDive } from '../src/domain/structuredHearing';
import { runFinalRule } from '../src/domain/finalRuleEngine';

const intake = { futureReference: [], desiredState: [], focusCandidates: [], authorityConfirmationCandidates: [], knowledgeUnknownQuestionCodes: [] } as const;
const unit = hearingUnitForFocus('M01_IT_MANAGEMENT_JUDGMENT');
const answer = (value: any, responseState: any = 'ANSWERED') => ({ schemaVersion: 1 as const, hearingUnitCode: unit.unitCode, semanticKey: unit.semanticKey, answerValue: value, responseState, respondent: { role: 'MANAGEMENT' as const }, provenance: { channel: 'PROXY' as const, source: 'SALES_PROXY' as const }, completionStatus: 'COMPLETE' as const });

test('Structured Hearing Answer: provenanceを保持し、operator noteやstatement textをFinal Ruleへ渡さない', () => {
  const result = runFinalRule({ intake, answers: [answer('CANNOT_JUDGE')] });
  assert.equal(result.currentUnderstanding[0]!.answerValue, 'CANNOT_JUDGE');
  assert.equal(JSON.stringify(result), JSON.stringify(result).includes('operator') ? 'unexpected' : JSON.stringify(result));
  assert.equal(result.gapPossibilities.length, 1);
  assert.equal(result.whyHypotheses.length, 0);
});
test('UNKNOWNとNOT_IN_POSITIONは正常に残り、Authority Confirmationになる', () => {
  const result = runFinalRule({ intake, answers: [answer('UNKNOWN', 'NOT_IN_POSITION_TO_ANSWER')] });
  assert.equal(result.authorityConfirmation.length, 1); assert.equal(result.gapPossibilities.length, 0);
});
test('同一semanticKeyの不一致だけRecognition Differenceとなり、別semanticKeyはConflictにしない', () => {
  const other = { ...answer('CAN_JUDGE'), respondent: { role: 'IT_DECISION_OWNER' as const } };
  assert.equal(runFinalRule({ intake, answers: [answer('CANNOT_JUDGE'), other] }).recognitionDifferences.length, 1);
  assert.equal(runFinalRule({ intake, answers: [answer('CANNOT_JUDGE'), { ...other, semanticKey: 'different_semantic' }] }).recognitionDifferences.length, 0);
});
test('Deep Diveは条件付きであり、Healthy CaseはNO_IMPORTANT_GAP_IDENTIFIEDになる', () => {
  assert.equal(isConditionalDeepDive(answer('CAN_JUDGE')), false);
  assert.equal(isConditionalDeepDive(answer('PARTIALLY_JUDGE')), true);
  const result = runFinalRule({ intake, answers: [answer('CAN_JUDGE')] });
  assert.equal(result.noImportantGapIdentified, true); assert.equal(result.evidenceCandidates.length, 0);
});
test('M04は改善可能性であり、FACTや確定Solutionを生成しない', () => {
  const m04 = hearingUnitForFocus('M04_BUSINESS_PRODUCTIVITY');
  const result = runFinalRule({ intake, answers: [{ ...answer(['INPUT_TRANSCRIPTION']), hearingUnitCode: m04.unitCode, semanticKey: m04.semanticKey }] });
  assert.equal(result.improvementOpportunities.length, 1); assert.equal(result.gapPossibilities.length, 0);
});

test('PARTIALのKnowledge Stateは既存Structured Answerを保ったままRemaining UNKNOWNへ反映する', () => {
  const m04 = hearingUnitForFocus('M04_BUSINESS_PRODUCTIVITY');
  const structured = { ...answer(['INPUT_TRANSCRIPTION', 'AGGREGATION_REPORTING']), hearingUnitCode: m04.unitCode, semanticKey: m04.semanticKey };
  const result = runFinalRule({ intake, answers: [structured], knowledgeStates: [{ hearingUnitCode: m04.unitCode, semanticKey: m04.semanticKey, knowledgeState: 'PARTIAL' }] });
  assert.equal(result.currentUnderstanding.length, 1);
  assert.equal(result.remainingUnknown.length, 1);
  assert.equal(result.nextConfirmation.length, 1);
  assert.equal(hearingAnswerDisplayLabel(structured.answerValue), '入力・転記、集計・報告');
});
