import { z } from 'zod';

/**
 * IT経営KAIZEN 顧客適合性チェック（Excel「IT経営KAIZEN_顧客適合性チェックシート_v1.xlsx」基準）。
 * 営業担当の感覚だけで判断せず、FACT / UNKNOWN / 営業仮説（HYPOTHESIS）を分離して記録し、
 * 最終的な提案要否は必ず人（Human Decision）が判断する。このモジュールは自動採点・自動判定を持たない。
 *
 * 7項目の軸名・確認文・判定上の意味はExcel原本（顧客適合性チェックシート Row11-17）をそのまま踏襲。
 * 更新頻度が低いためDBには持たずコード内定数として保持する（変更時はここを直接編集すればよい）。
 */

export type FitCheckAnswer = 'YES' | 'NO' | 'UNKNOWN';
export type HumanDecision = 'A' | 'B' | 'C' | 'D';

export interface CustomerFitCheckItemDefinition {
  itemNo: number;
  axis: string;
  question: string;
  /** NOの場合に何を意味するか（Excel D列）。UI上はヘルプテキストとして表示するのみで、判定には使わない。 */
  meaning: string;
}

export const CUSTOMER_FIT_CHECK_ITEMS: CustomerFitCheckItemDefinition[] = [
  {
    itemNo: 1,
    axis: '改善対象',
    question: '組織として管理・改善すべきIT・業務が存在する',
    meaning: 'NOならIT経営KAIZENの改善余地が小さい可能性',
  },
  {
    itemNo: 2,
    axis: 'FUTURE',
    question: '経営者に実現したい会社の未来がある',
    meaning: 'NOならFUTURE起点の支援が成立しにくい',
  },
  {
    itemNo: 3,
    axis: 'IT活用余地',
    question: 'ITを会社の改善・成長に活用する余地がある',
    meaning: 'NOなら個別作業・他サービスの方が適切な可能性',
  },
  {
    itemNo: 4,
    axis: 'Human Decision',
    question: '経営者自身が判断する意思がある',
    meaning: 'NOなら『全部決めてほしい』型で思想と不一致',
  },
  {
    itemNo: 5,
    axis: 'FACT協力',
    question: '必要なアンケート・ヒアリング・情報確認に協力してもらえる',
    meaning: 'NOならFACTに基づく診断・Assessmentが成立しにくい',
  },
  {
    itemNo: 6,
    axis: '依頼目的',
    question: '単純な製品導入・作業依頼だけが目的ではない',
    meaning: 'NOならIT経営KAIZENではなく個別IT支援を検討',
  },
  {
    itemNo: 7,
    axis: '改善可能性',
    question: 'IT経営KAIZENで改善余地があると考えられる',
    meaning: '他項目と確認FACTを踏まえ、人が判断',
  },
];

export const HUMAN_DECISION_OPTIONS: { value: HumanDecision; label: string; description: string }[] = [
  { value: 'A', label: 'A：提案する', description: 'IT経営KAIZENで価値を出せる可能性があり、必要な条件も概ね確認できている' },
  { value: 'B', label: 'B：要確認', description: '現時点では判断材料が不足している' },
  { value: 'C', label: 'C：提案しない', description: 'IT経営KAIZENの提供条件・思想と合わない、または改善余地が小さい' },
  { value: 'D', label: 'D：別サービス', description: 'IT経営KAIZENではなく、atLIBの個別支援等の方が目的に合う' },
];

const answerSchema = z.enum(['YES', 'NO', 'UNKNOWN']);
const humanDecisionSchema = z.enum(['A', 'B', 'C', 'D']);

export const itemInputSchema = z.object({
  itemNo: z.number().int().min(1).max(7),
  answer: answerSchema,
  factNote: z.string().max(2000).nullable().optional(),
  unknownNote: z.string().max(2000).nullable().optional(),
  hypothesisNote: z.string().max(2000).nullable().optional(),
});

/**
 * 7項目すべての回答を要求する（5分で埋めるのが前提のため項目数は固定）。
 * ただし answer は UNKNOWN を正式な選択肢として認め、「わからない」まま保存できる
 * （UNKNOWNをYES/NOへ推測変換しない、という設計原則をスキーマ側でも担保）。
 */
export const customerFitCheckInputSchema = z.object({
  customerName: z.string().min(1).max(300),
  checkedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 形式で指定してください'),
  decisionMakerContext: z.string().max(2000).nullable().optional(),
  engagementContext: z.string().max(2000).nullable().optional(),
  sourceContext: z.string().max(2000).nullable().optional(),
  items: z.array(itemInputSchema).length(7),
  overallFacts: z.string().max(4000).nullable().optional(),
  overallUnknowns: z.string().max(4000).nullable().optional(),
  overallHypotheses: z.string().max(4000).nullable().optional(),
  nextActions: z.string().max(4000).nullable().optional(),
  humanDecision: humanDecisionSchema.nullable().optional(),
  decisionReason: z.string().max(4000).nullable().optional(),
});

export type CustomerFitCheckInput = z.infer<typeof customerFitCheckInputSchema>;

export const listQuerySchema = z.object({
  humanDecision: humanDecisionSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
