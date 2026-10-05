import type { IntakeAnswerEnvelopeV1, ManagementFocus, RespondentRole } from './freeDiagnosisRuleBasedV1';

export type VisibilitySubject = 'MANAGEMENT' | 'IT_MANAGEMENT' | 'OPERATIONAL';
export type Delivery = 'REGULAR' | 'AVAILABLE' | 'ON_REQUEST' | 'INSUFFICIENT' | 'UNCONFIRMED';
export type Usability = 'USABLE' | 'INSUFFICIENT' | 'UNCONFIRMED';
export interface AuthorityConfirmationCandidate { questionCode: string; reason: 'NOT_IN_POSITION_TO_ANSWER'; }
export interface SemanticStatement { semanticKey: string; value: string; respondent: { role?: RespondentRole }; source: 'HEARING'; }
export interface RecognitionDifferenceCandidate { semanticKey: string; values: readonly SemanticStatement[]; }

export interface IntakeSemanticProjection {
  futureReference: readonly string[];
  desiredState: readonly string[];
  focusCandidates: readonly ManagementFocus[];
  visibility?: { subject: VisibilitySubject; state: string };
  managementInformation?: { delivery: Delivery; usability: Usability };
  authorityConfirmationCandidates: readonly AuthorityConfirmationCandidate[];
  knowledgeUnknownQuestionCodes: readonly string[];
}

const focusByConcern: Record<string, ManagementFocus | undefined> = {
  MANAGEMENT_DECISION_CONCERN: 'M01_IT_MANAGEMENT_JUDGMENT', IT_OPERATION_CONCERN: 'M02_IT_OPERATION_CONTINUITY',
  BUSINESS_PROTECTION_CONCERN: 'M03_BUSINESS_DEFENSE_CONTINUITY', PRODUCTIVITY_OPPORTUNITY: 'M04_BUSINESS_PRODUCTIVITY',
  CHANGE_READINESS_CONCERN: 'M05_GROWTH_CHANGE_ADAPTATION', STRATEGIC_USE_OPPORTUNITY: 'M06_IT_STRATEGIC_USE',
};
const informationByAnswer: Record<string, { delivery: Delivery; usability: Usability }> = {
  REGULAR_AND_USABLE: { delivery: 'REGULAR', usability: 'USABLE' }, DELIVERED_NOT_USABLE: { delivery: 'AVAILABLE', usability: 'INSUFFICIENT' },
  ON_REQUEST_USABLE: { delivery: 'ON_REQUEST', usability: 'USABLE' }, NOT_SUFFICIENTLY_DELIVERED: { delivery: 'INSUFFICIENT', usability: 'UNCONFIRMED' },
  INFORMATION_NEED_UNCLEAR: { delivery: 'UNCONFIRMED', usability: 'UNCONFIRMED' },
};

export function projectIntakeSemantics(answers: readonly IntakeAnswerEnvelopeV1[]): IntakeSemanticProjection {
  const futureReference: string[] = [], desiredState: string[] = [], focusCandidates: ManagementFocus[] = [], authorityConfirmationCandidates: AuthorityConfirmationCandidate[] = [], knowledgeUnknownQuestionCodes: string[] = [];
  let visibility: IntakeSemanticProjection['visibility']; let managementInformation: IntakeSemanticProjection['managementInformation'];
  for (const answer of answers) {
    if (answer.responseState === 'NOT_IN_POSITION_TO_ANSWER') { authorityConfirmationCandidates.push({ questionCode: answer.questionCode, reason: 'NOT_IN_POSITION_TO_ANSWER' }); continue; }
    if (answer.responseState === 'UNKNOWN') { knowledgeUnknownQuestionCodes.push(answer.questionCode); continue; }
    if (answer.questionCode === 'Q2' && Array.isArray(answer.answerValue)) futureReference.push(...answer.answerValue);
    if (answer.questionCode === 'Q3' && Array.isArray(answer.answerValue)) desiredState.push(...answer.answerValue);
    if (answer.questionCode === 'Q4' && typeof answer.answerValue === 'string') { const focus = focusByConcern[answer.answerValue]; if (focus) focusCandidates.push(focus); }
    if (answer.questionCode === 'Q5' && typeof answer.answerValue === 'string') {
      const subject: VisibilitySubject = answer.respondent.role === 'MANAGEMENT' ? 'MANAGEMENT' : answer.respondent.role === 'IT_DECISION_OWNER' ? 'IT_MANAGEMENT' : 'OPERATIONAL';
      visibility = { subject, state: answer.answerValue };
    }
    if (answer.questionCode === 'Q6' && typeof answer.answerValue === 'string') managementInformation = informationByAnswer[answer.answerValue];
  }
  return { futureReference, desiredState, focusCandidates: [...new Set(focusCandidates)], visibility, managementInformation, authorityConfirmationCandidates, knowledgeUnknownQuestionCodes };
}

export function recognitionDifferenceCandidates(statements: readonly SemanticStatement[]): RecognitionDifferenceCandidate[] {
  const grouped = new Map<string, SemanticStatement[]>();
  for (const statement of statements) grouped.set(statement.semanticKey, [...(grouped.get(statement.semanticKey) ?? []), statement]);
  return [...grouped.entries()].filter(([, group]) => new Set(group.map(x => x.value)).size > 1).map(([semanticKey, values]) => ({ semanticKey, values }));
}
