import { z } from 'zod';
import {
  CURRENT_INTEREST_CODES_V2, FUTURE_CODES_V2, INTEREST_THEME_CODES_V2,
  IT_EXPECTATION_CODES_V2, MANAGEMENT_CONNECTION_CODES_V2,
  type CurrentStructuredStateV2, VISIBILITY_CODES_V2,
} from './freeDiagnosisDesignV2';
import { ACQUISITION_SOURCE_TYPE, RESPONDENT_ROLE } from './freeDiagnosisRuleBasedV1';
import { projectFreeDiagnosisSemanticV2 } from './freeDiagnosisSemanticProjectionV2';

export const DESIGN_V2_PUBLIC_SURVEY_VERSION = 'design-v2-public-1';
export const Q1_EMPLOYEE_RANGES_V2 = ['1〜10人', '11〜30人', '31〜50人', '51〜100人', '101〜300人', '301人以上'] as const;
export const Q1_SITE_RANGES_V2 = ['1か所', '2〜3か所', '4〜10か所', '11か所以上'] as const;

type Option = { value: string; label: string };
const options = <T extends readonly string[]>(codes: T, labels: readonly string[]): Option[] => codes.map((value, index) => ({ value, label: labels[index]! }));

/** A public-safe projection of the canonical Design v2 survey. Values come from the domain enums above. */
export const designV2PublicSurveyContract = {
  surveyVersion: DESIGN_V2_PUBLIC_SURVEY_VERSION,
  questions: [
    { code: 'Q1', label: '会社の状況について教えてください。', type: 'COMPANY_CONTEXT', employeeOptions: options(Q1_EMPLOYEE_RANGES_V2, Q1_EMPLOYEE_RANGES_V2), siteOptions: options(Q1_SITE_RANGES_V2, Q1_SITE_RANGES_V2) },
    { code: 'Q2', label: '今後1〜3年で、どのような会社の未来を実現したいですか？', type: 'MULTI_SELECT', maxSelections: FUTURE_CODES_V2.length, exclusiveValues: ['NO_MAJOR_CHANGE', 'UNDECIDED'], options: options(FUTURE_CODES_V2, ['売上・事業を成長させたい', '社員が本来の仕事に集中できる会社にしたい', '少人数でも無理なく成長・運営できる会社にしたい', '新しい事業・サービスや働き方に挑戦したい', '安心して事業を続けられる会社にしたい', '特に大きな変化は予定していない', 'まだ具体的には決まっていない']) },
    { code: 'Q3', label: 'その未来に向けて、ITに特に期待していることを選んでください。', type: 'MULTI_SELECT', maxSelections: 2, exclusiveValues: ['UNDECIDED'], options: options(IT_EXPECTATION_CODES_V2, ['生産性を高めたい', '人を大きく増やさずに回せるようにしたい', '経営判断を支えたい', '情報をもっと活用できるようにしたい', '事業や組織の変化に対応しやすくしたい', '社員が働きやすい環境にしたい', '安心して事業を続けられるようにしたい', 'IT運用の負担を減らしたい', 'まだ具体的には決まっていない']) },
    { code: 'Q4', label: '現在、特に確認しておきたいことに近いものを1つ選んでください。', type: 'SINGLE_SELECT', options: options(CURRENT_INTEREST_CODES_V2, ['経営判断に関すること', '日々の業務の効率や生産性に関すること', '情報共有やデータ活用に関すること', '事業拡大や組織変化への対応に関すること', 'ITの運用や管理体制に関すること', 'セキュリティや事業継続に関すること', '特に決まっていない']) },
    { code: 'Q5', label: '現在の業務やITの状況について、どの程度把握できていますか？', type: 'SINGLE_SELECT', options: options(VISIBILITY_CODES_V2, ['全体として把握できている', 'おおむね把握できている', '分かることと分からないことがある', '担当者に確認しないと分からないことが多い', 'ほとんど把握できていない', 'よく分からない']) },
    { code: 'Q6', label: 'ITの管理状況や経営への報告について、現在の状態に最も近いものを選んでください。', type: 'SINGLE_SELECT', options: options(MANAGEMENT_CONNECTION_CODES_V2, ['ほとんど管理されておらず、経営として状況を把握できていない', '管理はされているが、経営への定期的な報告・共有はほとんどない', '報告・共有はあるが、数字の羅列や専門用語が多く、経営判断には使いにくい', '経営判断に必要な情報として整理され、ある程度活用できている', '経営課題や事業計画と結びつけて報告・提案され、経営判断に活用できている', 'よく分からない']) },
    { code: 'Q7', label: '現在、関心のあるITテーマを選んでください。', type: 'MULTI_SELECT', maxSelections: 3, exclusiveValues: ['UNDECIDED'], options: options(INTEREST_THEME_CODES_V2, ['AI・生成AI', '業務の自動化・効率化', 'データ活用・見える化', 'セキュリティ', '社員のITリテラシー・教育', 'システムの老朽化・更新', 'クラウド活用', 'ITコスト・予算', 'IT運用・情シス体制', 'システム間の連携', '新しい働き方・業務環境', '特に決まっていない']) },
  ],
} as const;

const optionalText = (max: number) => z.string().trim().min(1).max(max).optional();
const attributionSchema = z.object({
  acquisitionSourceType: z.enum(ACQUISITION_SOURCE_TYPE).optional(), acquisitionSourceName: optionalText(200),
  utmSource: optionalText(200), utmMedium: optionalText(200), utmCampaign: optionalText(200), utmContent: optionalText(200), utmTerm: optionalText(200),
  landingUrl: z.string().trim().url().max(2000).optional(), referrer: z.string().trim().url().max(2000).optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.acquisitionSourceType == null) !== (value.acquisitionSourceName == null)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'PUBLIC_ACQUISITION_SOURCE_PAIR_REQUIRED' });
});

export const designV2SurveyAnswerSchema = z.object({
  q1CompanyContext: z.object({ employeeRange: z.enum(Q1_EMPLOYEE_RANGES_V2), siteRange: z.enum(Q1_SITE_RANGES_V2) }).strict(),
  q2Future: z.array(z.enum(FUTURE_CODES_V2)).min(1), q3ItExpectations: z.array(z.enum(IT_EXPECTATION_CODES_V2)).min(1).max(2),
  q4CurrentInterest: z.enum(CURRENT_INTEREST_CODES_V2), q5Visibility: z.enum(VISIBILITY_CODES_V2), q6ManagementConnection: z.enum(MANAGEMENT_CONNECTION_CODES_V2),
  q7InterestThemes: z.array(z.enum(INTEREST_THEME_CODES_V2)).min(1).max(3),
}).strict().superRefine((value, ctx) => {
  try { projectFreeDiagnosisSemanticV2(value as CurrentStructuredStateV2); }
  catch { ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'INVALID_DESIGN_V2_SURVEY' }); }
});

export const publicCustomerSelfDesignV2SubmissionSchema = z.object({
  idempotencyKey: z.string().uuid(),
  company: z.object({ name: z.string().trim().min(1).max(200), corporateNumber: optionalText(50) }).strict(),
  contact: z.object({ name: z.string().trim().min(1).max(200), email: z.string().trim().email().max(320), phone: optionalText(50), jobTitle: optionalText(100), respondentRole: z.enum(RESPONDENT_ROLE) }).strict(),
  survey: designV2SurveyAnswerSchema,
  consent: z.object({ privacy: z.literal(true), diagnosisUse: z.literal(true), wordingVersion: z.literal('it_management_public_self_consent_v1') }).strict(),
  referralPersonName: optionalText(200), attribution: attributionSchema,
}).strict().superRefine((value, ctx) => {
  try { projectFreeDiagnosisSemanticV2(value.survey as CurrentStructuredStateV2); }
  catch { ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['survey'], message: 'INVALID_DESIGN_V2_SURVEY' }); }
});

export type PublicCustomerSelfDesignV2Submission = z.infer<typeof publicCustomerSelfDesignV2SubmissionSchema>;
