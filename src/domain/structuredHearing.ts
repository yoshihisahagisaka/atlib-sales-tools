import { z } from 'zod';
import type { ManagementFocus, RespondentRole, ResponseState } from './freeDiagnosisRuleBasedV1';

export const HEARING_SCHEMA_VERSION = 1 as const;
export type HearingAnswerValue = 'CAN_JUDGE' | 'PARTIALLY_JUDGE' | 'CANNOT_JUDGE' | 'OPPORTUNITY_IDENTIFIED' | 'NO_OPPORTUNITY' | 'UNKNOWN';
export interface HearingQuestionStep {
  key: 'FUTURE' | 'REQUIRED_STATE' | 'CURRENT' | 'DEEP_DIVE' | 'DECISION' | 'UNKNOWN';
  label: string;
  question: string;
  /** A prompt only: it neither becomes a fact nor a mandatory answer. */
  optional?: boolean;
}
export interface HearingUnit { unitCode: string; focus: ManagementFocus; verificationPurpose: string; standardQuestion: string; semanticKey: string; deepDiveTrigger: readonly string[]; completionCondition: string; questionSequence: readonly HearingQuestionStep[]; }

const catalog: Record<ManagementFocus, { semanticKey: string; question: string }> = {
  H00_MANAGEMENT_DISCOVERY: { semanticKey: 'management_discovery', question: '今後の経営判断に向け、確認しておきたいIT上のことはありますか？' },
  M01_IT_MANAGEMENT_JUDGMENT: { semanticKey: 'management_information_for_decision', question: '経営判断に必要なIT情報を得て、判断できていますか？ 難しい場合は、どの判断が難しいですか？' },
  M02_IT_OPERATION_CONTINUITY: { semanticKey: 'it_operation_continuity_for_future', question: '今後の変化に必要なIT運営を続けられるか、体制や代替可能性を判断できる情報はありますか？' },
  M03_BUSINESS_DEFENSE_CONTINUITY: { semanticKey: 'business_impact_of_it_risk', question: '重要なIT上のリスクを、事業への影響として理解し判断できていますか？' },
  M04_BUSINESS_PRODUCTIVITY: { semanticKey: 'business_productivity_opportunity', question: 'ITによって仕事を減らす・改善する価値がありそうな業務はどこですか？' },
  M05_GROWTH_CHANGE_ADAPTATION: { semanticKey: 'it_readiness_for_change', question: '予定している会社の変化に対し、現在のITで対応できるか判断できていますか？ 何の負担が増えそうですか？' },
  M06_IT_STRATEGIC_USE: { semanticKey: 'strategic_it_opportunity', question: '将来の事業に向けて、ITをもっと活用できる余地を判断できていますか？' },
};

const sequences: Record<ManagementFocus, readonly HearingQuestionStep[]> = {
  H00_MANAGEMENT_DISCOVERY: [
    { key: 'FUTURE', label: 'これから', question: '今後、経営として実現したいことを改めて伺えますか？' },
    { key: 'CURRENT', label: '現在', question: 'そのために、今どこまで分かっていることがありますか？' },
    { key: 'UNKNOWN', label: '次の確認', question: '判断のために、もう少し分かるとよいことはありますか？' },
  ],
  M01_IT_MANAGEMENT_JUDGMENT: [
    { key: 'FUTURE', label: 'これから', question: '今後の事業の変化に向け、どのような経営判断が重要になりそうですか？' },
    { key: 'CURRENT', label: '現在', question: '現在は、どのような情報を見て経営判断していますか？' },
    { key: 'DEEP_DIVE', label: '具体化', question: '情報を集めるために、集計・転記・担当者への確認などはありますか？', optional: true },
    { key: 'DECISION', label: '判断との関係', question: '必要な情報を、必要なタイミングで判断に使えていますか？' },
    { key: 'UNKNOWN', label: '次の確認', question: '判断のために次に確認する価値がある情報は何ですか？' },
  ],
  M02_IT_OPERATION_CONTINUITY: [
    { key: 'FUTURE', label: 'これから', question: '今後の変化に合わせて、IT運用で維持したい状態は何ですか？' },
    { key: 'CURRENT', label: '現在', question: '現在のIT運用は、誰がどのように支えていますか？' },
    { key: 'DEEP_DIVE', label: '具体化', question: '担当者依存、確認待ち、システム間の連携など、負担になりそうな箇所はありますか？', optional: true },
    { key: 'DECISION', label: '判断との関係', question: '事業が変化しても続けられるかを判断するために、何を確認する必要がありますか？' },
  ],
  M03_BUSINESS_DEFENSE_CONTINUITY: [
    { key: 'FUTURE', label: 'これから', question: '今後も守り続けたい事業上の大切なことは何ですか？' },
    { key: 'CURRENT', label: '現在', question: '現在、ITに関して事業への影響をどこまで把握していますか？' },
    { key: 'DEEP_DIVE', label: '具体化', question: '止まると困る業務・情報・連絡手段はありますか？', optional: true },
    { key: 'UNKNOWN', label: '次の確認', question: '安心して判断するために、次に確認したいことはありますか？' },
  ],
  M04_BUSINESS_PRODUCTIVITY: [
    { key: 'FUTURE', label: 'これから', question: '人を大きく増やさずに進めるとしたら、どのような仕事の進め方が必要ですか？' },
    { key: 'REQUIRED_STATE', label: '必要な状態', question: 'そのために、業務や情報はどのような状態になっている必要がありますか？' },
    { key: 'CURRENT', label: '現在', question: '現在、時間や手間がかかっている業務はありますか？' },
    { key: 'DEEP_DIVE', label: '具体化', question: '入力・転記、集計、確認待ち、情報探索、紙・メール・Excelなど、実際の進め方を教えてください。', optional: true },
    { key: 'DECISION', label: '判断との関係', question: 'どこを優先して見直すか、今の情報で判断できますか？' },
  ],
  M05_GROWTH_CHANGE_ADAPTATION: [
    { key: 'FUTURE', label: 'これから', question: '今後、事業をどのように広げ、または少人数でどのように運営していきたいですか？' },
    { key: 'REQUIRED_STATE', label: '必要な状態', question: 'そのとき、ITや情報はどのような状態になっている必要がありますか？' },
    { key: 'CURRENT', label: '現在', question: '今の業務やITのまま規模が広がった場合、負担が増えそうなところはありますか？' },
    { key: 'DEEP_DIVE', label: '具体化', question: '人手、手作業、情報共有、システム連携、IT運用のどこに制約がありそうですか？', optional: true },
    { key: 'UNKNOWN', label: '次の確認', question: '対応できる範囲を判断するために、次に確認すべきことは何ですか？' },
  ],
  M06_IT_STRATEGIC_USE: [
    { key: 'FUTURE', label: 'これから', question: '将来の事業で、ITにどのような役割を期待していますか？' },
    { key: 'CURRENT', label: '現在', question: '現在の業務や情報の使い方で、活かせていること・活かし切れていないことはありますか？' },
    { key: 'DEEP_DIVE', label: '具体化', question: '実際の業務、情報、既存の仕組みで確認しておきたいことはありますか？', optional: true },
    { key: 'UNKNOWN', label: '次の確認', question: '可能性を判断するために、次に確認する価値があることは何ですか？' },
  ],
};

export function hearingUnitForFocus(focus: ManagementFocus): HearingUnit {
  const entry = catalog[focus];
  return { unitCode: `${focus}_CORE`, focus, semanticKey: entry.semanticKey, verificationPurpose: `${focus}_CONFIRMATION`, standardQuestion: entry.question,
    deepDiveTrigger: ['PARTIAL', 'UNKNOWN', 'NOT_IN_POSITION_TO_ANSWER', 'RECOGNITION_DIFFERENCE', 'FUTURE_RELATION_UNCLEAR'],
    completionCondition: '構造化回答、回答者・情報源、必要な未来または経営判断との関係、未解決事項の明示があること',
    questionSequence: sequences[focus],
  };
}

export const structuredHearingAnswerSchema = z.object({
  schemaVersion: z.literal(HEARING_SCHEMA_VERSION), hearingUnitCode: z.string().min(1), semanticKey: z.string().min(1),
  answerValue: z.union([z.enum(['CAN_JUDGE', 'PARTIALLY_JUDGE', 'CANNOT_JUDGE', 'OPPORTUNITY_IDENTIFIED', 'NO_OPPORTUNITY', 'UNKNOWN']), z.array(z.enum(['INPUT_TRANSCRIPTION', 'AGGREGATION_REPORTING', 'APPROVAL', 'SEARCH', 'INQUIRY', 'CUSTOMER_RESPONSE', 'PROGRESS', 'SYSTEM_INTEGRATION', 'NONE', 'UNKNOWN', 'OTHER'])).min(1)]),
  responseState: z.enum(['ANSWERED', 'UNKNOWN', 'NOT_IN_POSITION_TO_ANSWER']), respondent: z.object({ role: z.enum(['MANAGEMENT', 'IT_DECISION_OWNER', 'IT_OR_BUSINESS_STAFF']).optional() }).strict(),
  provenance: z.object({ channel: z.enum(['SELF', 'PROXY']), source: z.enum(['CUSTOMER_SELF', 'SALES_PROXY']) }).strict(),
  completionStatus: z.enum(['COMPLETE', 'INCOMPLETE']), deepDive: z.object({ asked: z.boolean(), result: z.string().trim().min(1).max(4000).optional() }).strict().optional(),
}).strict();
export type StructuredHearingAnswer = z.infer<typeof structuredHearingAnswerSchema>;

/** Customer-facing labels for the existing structured answer contract. Rule and DB values stay codes. */
const HEARING_ANSWER_LABEL_JA: Record<string, string> = {
  CAN_JUDGE: '判断できている', PARTIALLY_JUDGE: '一部は判断できる', CANNOT_JUDGE: '判断が難しい',
  OPPORTUNITY_IDENTIFIED: '改善の余地がありそう', NO_OPPORTUNITY: '現時点では特にない', UNKNOWN: 'まだ分からない',
  INPUT_TRANSCRIPTION: '入力・転記', AGGREGATION_REPORTING: '集計・報告', APPROVAL: '承認', SEARCH: '情報検索',
  INQUIRY: '問い合わせ対応', CUSTOMER_RESPONSE: '顧客対応', PROGRESS: '進捗確認', SYSTEM_INTEGRATION: 'システム間連携',
  NONE: '特にない', OTHER: 'その他',
};

export function hearingAnswerDisplayLabel(answerValue: unknown): string {
  if (Array.isArray(answerValue)) return answerValue.map(value => HEARING_ANSWER_LABEL_JA[String(value)] ?? 'その他').join('、');
  return HEARING_ANSWER_LABEL_JA[String(answerValue)] ?? '今回確認した状態';
}

export function structuredAuthority(answer: StructuredHearingAnswer): { unitCode: string; reason: 'NOT_IN_POSITION_TO_ANSWER' }[] {
  return answer.responseState === 'NOT_IN_POSITION_TO_ANSWER' ? [{ unitCode: answer.hearingUnitCode, reason: 'NOT_IN_POSITION_TO_ANSWER' }] : [];
}
export function isConditionalDeepDive(answer: StructuredHearingAnswer): boolean {
  return answer.responseState !== 'ANSWERED' || answer.answerValue === 'PARTIALLY_JUDGE' || answer.answerValue === 'UNKNOWN' || answer.deepDive?.asked === true;
}
