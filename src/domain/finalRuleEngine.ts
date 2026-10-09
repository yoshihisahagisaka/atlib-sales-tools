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
function focusFromUnit(unitCode: string): string {
  return unitCode.replace(/_CORE$/, '');
}
function gapStatement(unitCode: string): string {
  switch (focusFromUnit(unitCode)) {
    case 'M01_IT_MANAGEMENT_JUDGMENT': return '経営判断に必要な情報の集め方や整理の仕方を、今後の事業の変化に照らして確認する価値があります。';
    case 'M04_BUSINESS_PRODUCTIVITY': return '日々の業務で時間や手間がかかる箇所を具体化し、負担を減らせる可能性を確認する価値があります。';
    case 'M05_GROWTH_CHANGE_ADAPTATION': return '事業の拡大や少人数での運営に対して、現在の業務・情報・ITで対応できる範囲を確認する価値があります。';
    case 'M02_IT_OPERATION_CONTINUITY': return '今後の変化に合わせてIT運用を続けられるか、体制や情報を確認する価値があります。';
    default: return '経営判断に必要な状況を、さらに確認する価値がある可能性があります。';
  }
}
function improvementStatement(unitCode: string): string {
  switch (focusFromUnit(unitCode)) {
    case 'M04_BUSINESS_PRODUCTIVITY': return '業務手順や情報の扱い方を見直すことで、日々の負担を減らせる可能性があります。';
    case 'M05_GROWTH_CHANGE_ADAPTATION': return '情報の集め方や日々のIT運用を見直すことで、事業規模の拡大に対応できる体制を整えられる可能性があります。';
    case 'M01_IT_MANAGEMENT_JUDGMENT': return '経営判断に必要な情報を整理することで、判断に使いやすい状態にできる可能性があります。';
    default: return '確認した範囲について、ITで良くできる可能性を具体化する価値があります。';
  }
}
function confirmationPurpose(unitCode: string): string {
  switch (focusFromUnit(unitCode)) {
    case 'M01_IT_MANAGEMENT_JUDGMENT': return '経営判断に必要な情報の集め方・整理の仕方';
    case 'M04_BUSINESS_PRODUCTIVITY': return '手作業、転記、集計、確認待ちなどの業務負荷';
    case 'M05_GROWTH_CHANGE_ADAPTATION': return '事業拡大に伴って増える業務や情報、現在の仕組みで対応できる範囲';
    case 'M02_IT_OPERATION_CONTINUITY': return '現在のIT運用の役割、体制、継続性';
    default: return '判断に必要な状況';
  }
}
export function runFinalRule(input: { intake: IntakeSemanticProjection; answers: readonly StructuredHearingAnswer[]; knowledgeStates?: readonly { hearingUnitCode: string; semanticKey: string; knowledgeState: KnowledgeState }[] }): FinalRuleResult {
  const currentUnderstanding = input.answers.map(a => ({ hearingUnitCode: a.hearingUnitCode, semanticKey: a.semanticKey, answerValue: a.answerValue, responseState: a.responseState }));
  const partialOrUnknown = new Set((input.knowledgeStates ?? []).filter(x => x.knowledgeState === 'PARTIAL' || x.knowledgeState === 'UNKNOWN').map(x => `${x.hearingUnitCode}:${x.semanticKey}`));
  const remainingUnknown = input.answers.filter(a => a.responseState === 'UNKNOWN' || a.answerValue === 'UNKNOWN' || (Array.isArray(a.answerValue) && a.answerValue.includes('UNKNOWN')) || partialOrUnknown.has(`${a.hearingUnitCode}:${a.semanticKey}`)).map(a => ({ hearingUnitCode: a.hearingUnitCode, semanticKey: a.semanticKey }));
  const authorityConfirmation = input.answers.filter(a => a.responseState === 'NOT_IN_POSITION_TO_ANSWER').map(a => ({ unitCode: a.hearingUnitCode, reason: 'NOT_IN_POSITION_TO_ANSWER' as const }));
  const semantic: SemanticStatement[] = input.answers.filter(a => a.responseState === 'ANSWERED').map(a => ({ semanticKey: a.semanticKey, value: JSON.stringify(a.answerValue), respondent: a.respondent, source: 'HEARING' }));
  const recognitionDifferences = recognitionDifferenceCandidates(semantic);
  const gapPossibilities = input.answers.filter(a => a.answerValue === 'CANNOT_JUDGE' || a.answerValue === 'PARTIALLY_JUDGE').map(a => ({ hearingUnitCode: a.hearingUnitCode, statement: gapStatement(a.hearingUnitCode) }));
  const improvementOpportunities = input.answers.filter(a => a.answerValue === 'OPPORTUNITY_IDENTIFIED' || (Array.isArray(a.answerValue) && !a.answerValue.includes('NONE') && !a.answerValue.includes('UNKNOWN'))).map(a => ({ hearingUnitCode: a.hearingUnitCode, statement: improvementStatement(a.hearingUnitCode) }));
  const unresolved = [...remainingUnknown, ...authorityConfirmation, ...recognitionDifferences];
  const nextConfirmation = unresolved.map(x => ({ hearingUnitCode: 'hearingUnitCode' in x ? x.hearingUnitCode : 'unitCode' in x ? x.unitCode : x.values[0]!.semanticKey, purpose: '追加確認が必要な範囲を明確にする' }));
  const evidenceCandidates = gapPossibilities.map(x => ({ hearingUnitCode: x.hearingUnitCode, purpose: confirmationPurpose(x.hearingUnitCode) }));
  return { ruleVersion: FINAL_RULE_VERSION, currentUnderstanding, remainingUnknown, authorityConfirmation, recognitionDifferences, gapPossibilities, whyHypotheses: [], nextConfirmation, evidenceCandidates, improvementOpportunities,
    noImportantGapIdentified: gapPossibilities.length === 0 && improvementOpportunities.length === 0 && authorityConfirmation.length === 0 && recognitionDifferences.length === 0 };
}
