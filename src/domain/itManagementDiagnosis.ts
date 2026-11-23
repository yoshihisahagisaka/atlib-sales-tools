import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const PROVIDER_NAME = 'atLIB株式会社';
export const SURVEY_VERSION = 2;
export const DIAGNOSIS_STATUSES = ['APPLICATION_STARTED', 'SURVEY_IN_PROGRESS', 'SURVEY_COMPLETED', 'PREPARATION_IN_PROGRESS', 'READY_FOR_DIAGNOSIS', 'DIAGNOSIS_IN_PROGRESS', 'HUMAN_REVIEW_REQUIRED', 'REPORT_REVIEW_REQUIRED', 'REPORT_APPROVED', 'FEEDBACK_PENDING', 'FEEDBACK_COMPLETED', 'CLOSED'] as const;
export type DiagnosisStatus = typeof DIAGNOSIS_STATUSES[number];
export type EntryChannel = 'WEB' | 'SALES_VISIT';
export type Actor = { kind: 'CUSTOMER'; token: string } | { kind: 'STAFF'; userId: string };
export type RawValue = string | string[];
export interface SurveyQuestion {
  question_code: string;
  version: number;
  display_order: number;
  question_text: string;
  answer_type: 'SINGLE_SELECT' | 'MULTI_SELECT' | 'TEXT';
  options_json: string[] | null;
  is_required: boolean;
  is_active: boolean;
}

// Seed derived from Canonical 17 / 25. Options express statements, never evaluations.
// Published definitions are immutable: append a new version when wording changes.
function question(code: string, order: number, text: string, type: SurveyQuestion['answer_type'], options: string[] | null): SurveyQuestion {
  return { question_code: code, version: SURVEY_VERSION, display_order: order, question_text: text,
    answer_type: type, options_json: options, is_required: order <= 9, is_active: true };
}
export const SURVEY_QUESTIONS: readonly SurveyQuestion[] = [
  question('Q01_FUTURE', 1, '今後1〜3年で、どのような会社の未来を実現したいですか？', 'MULTI_SELECT',
    ['売上・事業を成長させたい', '社員が本来の仕事に集中できる会社にしたい', '少人数でも無理なく事業を続けられる会社にしたい', '新しい事業や働き方に挑戦したい', '安心して事業を続けられる会社にしたい', 'その他', '分からない']),
  question('Q02_IT_EXPECTATION', 2, 'その未来のために、ITへどのようなことを期待していますか？', 'MULTI_SELECT',
    ['仕事の手間を減らすこと', '新しい事業・サービスを支えること', '経営判断に必要な情報を届けること', '安心して仕事を続けられること', '社員が働きやすくなること', 'その他', '分からない']),
  question('Q03_IT_PLANNING', 3, '現在、ITの計画や改善をどのように進めていますか？', 'SINGLE_SELECT',
    ['会社の未来とつなげた計画で進めている', '個別の計画や課題に沿って進めている', '困りごとが起きたときに対応している', '進めたいが着手できていない', '分からない']),
  question('Q04_IT_VISIBILITY', 4, '社内のIT環境を、どの程度把握できていますか？', 'SINGLE_SELECT',
    ['IT環境は完全に把握できている', 'おおむね把握できている', '一部は把握できている', '担当者に確認しないと分からない', '分からない']),
  question('Q05_DAILY_IT_OPERATION', 5, '日々のIT業務で、当てはまる状態を教えてください。', 'MULTI_SELECT',
    ['手作業や繰り返しの作業が多い', '特定の人に確認しないと進められない仕事がある', '問い合わせやトラブル対応に時間がかかる', '手順と実際の仕事が合っていないことがある', '改善に取り組む時間を取りにくい', '特に気になることはない', '分からない']),
  question('Q06_SECURITY_RISK', 6, 'セキュリティやITのリスクを、経営として把握できていますか？', 'SINGLE_SELECT',
    ['事業への影響を含めて把握している', '報告は受けているが事業への影響までは分からない', '担当者に任せている', '把握する機会がない', '分からない']),
  question('Q07_AUTHORITY_RESPONSIBILITY', 7, 'ITについて、誰が判断し責任を持っていますか？', 'SINGLE_SELECT',
    ['経営者・役員が判断している', '権限を持つ社内担当者が判断している', '内容によって判断する人が異なる', '外部の支援先と相談して判断している', '明確に決まっていない', '分からない']),
  question('Q08_MANAGEMENT_INFORMATION', 8, 'ITの情報は、経営判断に使える形で届いていますか？', 'SINGLE_SELECT',
    ['経営判断に使える形で届いている', '報告はあるが判断に使いにくい', '必要なときに担当者へ確認している', '経営への報告はない', '分からない']),
  question('Q09_IT_ORGANIZATION', 9, '現在のIT体制を教えてください。', 'MULTI_SELECT',
    ['専任の社内担当者がいる', '他の仕事と兼任する社内担当者がいる', '経営者が対応している', '外部の支援先が対応している', '担当者が決まっていない', '分からない']),
  question('Q10_FREE_COMMENT', 10, 'ITについて特に気になることがあれば教えてください。（任意）', 'TEXT', null),
];

export function normalizeCompanyName(value: string): string {
  return value.trim().replace(/(?:\s*様)+\s*$/u, '').trim();
}
export function companyDisplayName(value: string): string { return `${normalizeCompanyName(value)}様`; }
export const applicationSchema = z.object({
  companyName: z.string().max(200).transform(normalizeCompanyName).pipe(z.string().min(1)),
  contactName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(50).optional(),
  jobTitle: z.string().trim().max(200).optional(),
}).strict();
export type ApplicationInput = z.infer<typeof applicationSchema>;
export const responseSchema = z.object({ questionVersion: z.number().int().positive(), rawValue: z.union([z.string(), z.array(z.string())]) }).strict();

export class DiagnosisError extends Error {
  constructor(public readonly status: number, message: string, public readonly questionCodes?: string[]) { super(message); }
}

export function validateAnswer(q: SurveyQuestion, value: RawValue): void {
  const options = q.options_json ?? [];
  const valid = q.answer_type === 'TEXT'
    ? typeof value === 'string' && value.length <= 4000
    : q.answer_type === 'SINGLE_SELECT'
      ? typeof value === 'string' && (value === '' || options.includes(value))
      : Array.isArray(value) && value.length <= options.length && new Set(value).size === value.length && value.every(v => options.includes(v));
  if (!valid) throw new DiagnosisError(422, '回答の形式または選択肢を確認してください。', [q.question_code]);
}
export function hasAnswer(value: RawValue | undefined): boolean {
  return Array.isArray(value) ? value.length > 0 : typeof value === 'string' && value.trim().length > 0;
}
export function futureStatement(value: RawValue): string { return Array.isArray(value) ? value.join(' / ') : value; }
export function nextAction(status: DiagnosisStatus, assessmentStatus?:string, handoffStatus?:string): string {
  if(status==='FEEDBACK_COMPLETED'&&assessmentStatus){
    if(assessmentStatus==='ACCEPTED')return !handoffStatus?'Assessment Handoffを作成してください':['TRANSFERRED','ACCEPTED'].includes(handoffStatus)?'Caseを完了してください':'Assessmentへ引き渡してください';
    return ({NOT_PROPOSED:'Assessmentを提案してください',PROPOSED:'Assessment回答を確認してください',PENDING:'Assessment回答待ちです',DECLINED:'Caseを完了してください'} as Record<string,string>)[assessmentStatus]??'Assessmentの状態を確認してください';
  }
  return { APPLICATION_STARTED: '事前アンケートを開始してください', SURVEY_IN_PROGRESS: '事前アンケートの回答を続けてください',
    SURVEY_COMPLETED: 'AI事前整理を実行し、診断準備を開始してください',
    PREPARATION_IN_PROGRESS: '重点テーマと確認項目をレビューし、診断Planを確定してください',
    READY_FOR_DIAGNOSIS: '60分診断を開始してください',
    DIAGNOSIS_IN_PROGRESS: 'Futureに対して重要な点を確認し、診断を進めてください',
    HUMAN_REVIEW_REQUIRED: 'AI整理結果とRaw Sourceを確認し、診断ContextをHuman Reviewしてください',
    REPORT_REVIEW_REQUIRED: 'Human Approved Contextから無料診断レポートを作成してください',
    REPORT_APPROVED: '承認済みレポートをお届けし、送付済みとして記録してください',
    FEEDBACK_PENDING: '経営フィードバックを行い、顧客の発言を記録してください',
    FEEDBACK_COMPLETED: '経営フィードバックは完了しました', CLOSED: '完了' }[status];
}
export function surveyStatus(status: DiagnosisStatus): 'APPLICATION_STARTED' | 'SURVEY_IN_PROGRESS' | 'SURVEY_COMPLETED' {
  return status === 'APPLICATION_STARTED' || status === 'SURVEY_IN_PROGRESS' ? status : 'SURVEY_COMPLETED';
}
export function createAccessToken(): string { return randomBytes(32).toString('base64url'); }
export function hashAccessToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
export function tokenMatches(token: string, hash: string | null): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !hash || !/^[a-f0-9]{64}$/.test(hash)) return false;
  return timingSafeEqual(Buffer.from(hashAccessToken(token), 'hex'), Buffer.from(hash, 'hex'));
}
