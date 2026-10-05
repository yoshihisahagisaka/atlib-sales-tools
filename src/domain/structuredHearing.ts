import { z } from 'zod';
import type { ManagementFocus, RespondentRole, ResponseState } from './freeDiagnosisRuleBasedV1';

export const HEARING_SCHEMA_VERSION = 1 as const;
export type HearingAnswerValue = 'CAN_JUDGE' | 'PARTIALLY_JUDGE' | 'CANNOT_JUDGE' | 'OPPORTUNITY_IDENTIFIED' | 'NO_OPPORTUNITY' | 'UNKNOWN';
export interface HearingUnit { unitCode: string; focus: ManagementFocus; verificationPurpose: string; standardQuestion: string; semanticKey: string; deepDiveTrigger: readonly string[]; completionCondition: string; }

const catalog: Record<ManagementFocus, { semanticKey: string; question: string }> = {
  H00_MANAGEMENT_DISCOVERY: { semanticKey: 'management_discovery', question: '今後の経営判断に向け、確認しておきたいIT上のことはありますか？' },
  M01_IT_MANAGEMENT_JUDGMENT: { semanticKey: 'management_information_for_decision', question: '経営判断に必要なIT情報を得て、判断できていますか？ 難しい場合は、どの判断が難しいですか？' },
  M02_IT_OPERATION_CONTINUITY: { semanticKey: 'it_operation_continuity_for_future', question: '今後の変化に必要なIT運営を続けられるか、体制や代替可能性を判断できる情報はありますか？' },
  M03_BUSINESS_DEFENSE_CONTINUITY: { semanticKey: 'business_impact_of_it_risk', question: '重要なIT上のリスクを、事業への影響として理解し判断できていますか？' },
  M04_BUSINESS_PRODUCTIVITY: { semanticKey: 'business_productivity_opportunity', question: 'ITによって仕事を減らす・改善する価値がありそうな業務はどこですか？' },
  M05_GROWTH_CHANGE_ADAPTATION: { semanticKey: 'it_readiness_for_change', question: '予定している会社の変化に対し、現在のITで対応できるか判断できていますか？ 何の負担が増えそうですか？' },
  M06_IT_STRATEGIC_USE: { semanticKey: 'strategic_it_opportunity', question: '将来の事業に向けて、ITをもっと活用できる余地を判断できていますか？' },
};

export function hearingUnitForFocus(focus: ManagementFocus): HearingUnit {
  const entry = catalog[focus];
  return { unitCode: `${focus}_CORE`, focus, semanticKey: entry.semanticKey, verificationPurpose: `${focus}_CONFIRMATION`, standardQuestion: entry.question,
    deepDiveTrigger: ['PARTIAL', 'UNKNOWN', 'NOT_IN_POSITION_TO_ANSWER', 'RECOGNITION_DIFFERENCE', 'FUTURE_RELATION_UNCLEAR'],
    completionCondition: '構造化回答、回答者・情報源、必要な未来または経営判断との関係、未解決事項の明示があること' };
}

export const structuredHearingAnswerSchema = z.object({
  schemaVersion: z.literal(HEARING_SCHEMA_VERSION), hearingUnitCode: z.string().min(1), semanticKey: z.string().min(1),
  answerValue: z.union([z.enum(['CAN_JUDGE', 'PARTIALLY_JUDGE', 'CANNOT_JUDGE', 'OPPORTUNITY_IDENTIFIED', 'NO_OPPORTUNITY', 'UNKNOWN']), z.array(z.enum(['INPUT_TRANSCRIPTION', 'AGGREGATION_REPORTING', 'APPROVAL', 'SEARCH', 'INQUIRY', 'CUSTOMER_RESPONSE', 'PROGRESS', 'SYSTEM_INTEGRATION', 'NONE', 'UNKNOWN', 'OTHER'])).min(1)]),
  responseState: z.enum(['ANSWERED', 'UNKNOWN', 'NOT_IN_POSITION_TO_ANSWER']), respondent: z.object({ role: z.enum(['MANAGEMENT', 'IT_DECISION_OWNER', 'IT_OR_BUSINESS_STAFF']).optional() }).strict(),
  provenance: z.object({ channel: z.enum(['SELF', 'PROXY']), source: z.enum(['CUSTOMER_SELF', 'SALES_PROXY']) }).strict(),
  completionStatus: z.enum(['COMPLETE', 'INCOMPLETE']), deepDive: z.object({ asked: z.boolean(), result: z.string().trim().min(1).max(4000).optional() }).strict().optional(),
}).strict();
export type StructuredHearingAnswer = z.infer<typeof structuredHearingAnswerSchema>;

export function structuredAuthority(answer: StructuredHearingAnswer): { unitCode: string; reason: 'NOT_IN_POSITION_TO_ANSWER' }[] {
  return answer.responseState === 'NOT_IN_POSITION_TO_ANSWER' ? [{ unitCode: answer.hearingUnitCode, reason: 'NOT_IN_POSITION_TO_ANSWER' }] : [];
}
export function isConditionalDeepDive(answer: StructuredHearingAnswer): boolean {
  return answer.responseState !== 'ANSWERED' || answer.answerValue === 'PARTIALLY_JUDGE' || answer.answerValue === 'UNKNOWN' || answer.deepDive?.asked === true;
}
