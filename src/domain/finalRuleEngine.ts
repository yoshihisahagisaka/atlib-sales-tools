import type { IntakeSemanticProjection, RecognitionDifferenceCandidate, SemanticStatement } from './intakeSemanticProjection';
import { recognitionDifferenceCandidates } from './intakeSemanticProjection';
import type { StructuredHearingAnswer } from './structuredHearing';
import type { KnowledgeState } from './freeDiagnosisRuleBasedV1';

export const FINAL_RULE_VERSION = 'current-design-v1-final-rule-1.0.0';
export interface FinalRuleResult {
  ruleVersion: string; currentUnderstanding: readonly { hearingUnitCode: string; semanticKey: string; answerValue: unknown; responseState: string }[];
  remainingUnknown: readonly { hearingUnitCode: string; semanticKey: string }[];
  authorityConfirmation: readonly { unitCode: string; reason: 'NOT_IN_POSITION_TO_ANSWER' }[];
  recognitionDifferences: readonly RecognitionDifferenceCandidate[];
  gapPossibilities: readonly { hearingUnitCode: string; statement: string }[];
  whyHypotheses: readonly never[];
  nextConfirmation: readonly { hearingUnitCode: string; purpose: string }[];
  evidenceCandidates: readonly { hearingUnitCode: string; purpose: string }[];
  improvementOpportunities: readonly { hearingUnitCode: string; statement: string }[];
  noImportantGapIdentified: boolean;
}
export function runFinalRule(input: { intake: IntakeSemanticProjection; answers: readonly StructuredHearingAnswer[]; knowledgeStates?: readonly { hearingUnitCode: string; semanticKey: string; knowledgeState: KnowledgeState }[] }): FinalRuleResult {
  const currentUnderstanding = input.answers.map(a => ({ hearingUnitCode: a.hearingUnitCode, semanticKey: a.semanticKey, answerValue: a.answerValue, responseState: a.responseState }));
  const partialOrUnknown = new Set((input.knowledgeStates ?? []).filter(x => x.knowledgeState === 'PARTIAL' || x.knowledgeState === 'UNKNOWN').map(x => `${x.hearingUnitCode}:${x.semanticKey}`));
  const remainingUnknown = input.answers.filter(a => a.responseState === 'UNKNOWN' || a.answerValue === 'UNKNOWN' || (Array.isArray(a.answerValue) && a.answerValue.includes('UNKNOWN')) || partialOrUnknown.has(`${a.hearingUnitCode}:${a.semanticKey}`)).map(a => ({ hearingUnitCode: a.hearingUnitCode, semanticKey: a.semanticKey }));
  const authorityConfirmation = input.answers.filter(a => a.responseState === 'NOT_IN_POSITION_TO_ANSWER').map(a => ({ unitCode: a.hearingUnitCode, reason: 'NOT_IN_POSITION_TO_ANSWER' as const }));
  const semantic: SemanticStatement[] = input.answers.filter(a => a.responseState === 'ANSWERED').map(a => ({ semanticKey: a.semanticKey, value: JSON.stringify(a.answerValue), respondent: a.respondent, source: 'HEARING' }));
  const recognitionDifferences = recognitionDifferenceCandidates(semantic);
  const gapPossibilities = input.answers.filter(a => a.answerValue === 'CANNOT_JUDGE' || a.answerValue === 'PARTIALLY_JUDGE').map(a => ({ hearingUnitCode: a.hearingUnitCode, statement: '経営判断に必要な状況を、さらに確認する価値がある可能性があります。' }));
  const improvementOpportunities = input.answers.filter(a => a.answerValue === 'OPPORTUNITY_IDENTIFIED' || (Array.isArray(a.answerValue) && !a.answerValue.includes('NONE') && !a.answerValue.includes('UNKNOWN'))).map(a => ({ hearingUnitCode: a.hearingUnitCode, statement: '改善可能性を具体的に確認する価値がある領域です。' }));
  const unresolved = [...remainingUnknown, ...authorityConfirmation, ...recognitionDifferences];
  const nextConfirmation = unresolved.map(x => ({ hearingUnitCode: 'hearingUnitCode' in x ? x.hearingUnitCode : 'unitCode' in x ? x.unitCode : x.values[0]!.semanticKey, purpose: '追加確認が必要な範囲を明確にする' }));
  const evidenceCandidates = gapPossibilities.map(x => ({ hearingUnitCode: x.hearingUnitCode, purpose: '判断に必要な状況を確認する' }));
  return { ruleVersion: FINAL_RULE_VERSION, currentUnderstanding, remainingUnknown, authorityConfirmation, recognitionDifferences, gapPossibilities, whyHypotheses: [], nextConfirmation, evidenceCandidates, improvementOpportunities,
    noImportantGapIdentified: gapPossibilities.length === 0 && improvementOpportunities.length === 0 && authorityConfirmation.length === 0 && recognitionDifferences.length === 0 };
}
