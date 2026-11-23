import { z } from 'zod';

/**
 * 情シスKAIZEN診断（corporate-site の LP `/joshisu-kaizen/` 向け診断ツール）の
 * 質問・配点・接続候補サービスタグ・スコア計算を1箇所に集約したモジュール。
 * domain/freeHearingAssessment.ts と全く同じ構造・同じ作法で、設問だけをLP文脈向けに
 * 12問へ絞り込んだ姉妹版（同じ3軸・同じ結果シート構造・同じ提案候補サービスカタログを流用する
 * ことで、無料Gap診断の結果シート/PPTX生成ロジックをそのまま使い回せるようにしている）。
 *
 * 質問・選択肢・配点・タグを変更したら QUESTION_SET_VERSION を手動でインクリメントすること
 * （回答はJSONBスナップショットで保存されるため、過去の回答表示は壊れない）。
 */
export const QUESTION_SET_VERSION = 'v1';

export type AxisId = 'cost' | 'risk' | 'attrition';
export type ServiceTag = 'infravision' | 'bpo' | 'security' | 'web-system' | 'secure-send' | 'infra';

export interface Axis {
  id: AxisId;
  label: string;
}

export interface Domain {
  id: string;
  label: string;
}

export interface QuestionOption {
  value: string;
  label: string;
  /** 2 = 整備済み相当 / 1 = 部分整備相当 / 0 = 未整備相当・わからない。主軸に加算される。 */
  score: number;
  /** 「わからない」選択肢。素点は0だが可視化不足フラグ・属人化シグナルの集計に使う。 */
  unknown?: boolean;
  /** この選択肢が出たときに提案候補となるatLIBサービス（無料Gap診断と同じ早見表）。 */
  suggestedServices?: ServiceTag[];
  /** 結果シート下部のコメントに差し込む一言（弱点選択肢のみ）。 */
  actionHint?: string;
  /** セキュリティ構築への緊急提案フラグ。直近1年のトラブル有無の設問でのみ使用。 */
  securityUrgent?: boolean;
}

export interface Question {
  id: string;
  domainId: string;
  axisId: AxisId;
  /** LPからの自己回答（Web上で直接読む前提）の設問文。 */
  prompt: string;
  options: QuestionOption[];
}

export const AXES: Axis[] = [
  { id: 'cost', label: 'コスト' },
  { id: 'risk', label: 'リスク' },
  { id: 'attrition', label: '属人化' },
];

export const DOMAINS: Domain[] = [
  { id: 'user-support', label: '社員サポート' },
  { id: 'account', label: 'アカウント・入退社' },
  { id: 'device', label: 'デバイス・PC管理' },
  { id: 'cloud', label: 'クラウド・SaaS' },
  { id: 'infra', label: 'インフラ' },
  { id: 'security', label: 'セキュリティ' },
  { id: 'vendor', label: 'ベンダー管理' },
  { id: 'budget', label: 'IT予算・経営' },
];

export const SUGGESTED_SERVICES: { id: ServiceTag; label: string }[] = [
  { id: 'infravision', label: 'atLIB InfraVision' },
  { id: 'bpo', label: '情シスBPO' },
  { id: 'security', label: 'セキュリティ構築' },
  { id: 'web-system', label: '自社専用Webシステム構築' },
  { id: 'secure-send', label: 'atLIB SecureSend' },
  { id: 'infra', label: 'ITインフラ基盤' },
];

const SERVICE_LABEL: Record<ServiceTag, string> = SUGGESTED_SERVICES.reduce(
  (acc, s) => {
    acc[s.id] = s.label;
    return acc;
  },
  {} as Record<ServiceTag, string>,
);

/** 「わからない」選択肢の共通生成（各設問の4択目）。 */
function unknownOption(qid: string, services: ServiceTag[]): QuestionOption {
  return { value: `${qid}-x`, label: 'わからない', score: 0, unknown: true, suggestedServices: services };
}

export const QUESTIONS: Question[] = [
  // ===== 社員サポート =====
  {
    id: 'q1',
    domainId: 'user-support',
    axisId: 'attrition',
    prompt: '今の情シスご担当の方が急にお休みされたら、問い合わせ対応は問題なく回りますか？',
    options: [
      { value: 'q1-a', label: '問題ない', score: 2 },
      {
        value: 'q1-b',
        label: '少し不安',
        score: 1,
        suggestedServices: ['bpo'],
        actionHint: '情シス担当の不在時に業務が滞る懸念があります。情シスBPOで情シス機能をチームで引き受けられます。',
      },
      {
        value: 'q1-c',
        label: 'かなり不安',
        score: 0,
        suggestedServices: ['bpo'],
        actionHint: '情シスが完全に属人化しており、担当者の不在が事業リスクに直結します。情シスBPOで情シス機能をまるごと引き受けられます。',
      },
      unknownOption('q1', ['bpo']),
    ],
  },
  {
    id: 'q2',
    domainId: 'user-support',
    axisId: 'cost',
    prompt: '「PCの調子が悪い」等の定型的な問い合わせ対応に、月どれくらい時間が取られていますか（体感で構いません）？',
    options: [
      { value: 'q2-a', label: 'ほとんどかからない', score: 2 },
      { value: 'q2-b', label: '月10時間程度', score: 1 },
      {
        value: 'q2-c',
        label: '月20時間以上',
        score: 0,
        suggestedServices: ['bpo'],
        actionHint: '定型問い合わせに多くの時間が取られています。情シスBPO（ヘルプデスク）で一次対応を切り出すと、改善やDXに使う時間を取り戻せます。',
      },
      unknownOption('q2', ['bpo']),
    ],
  },

  // ===== アカウント・入退社 =====
  {
    id: 'q3',
    domainId: 'account',
    axisId: 'risk',
    prompt: '退職や異動があったとき、アカウントや権限を回収するフローは決まっていますか？',
    options: [
      { value: 'q3-a', label: '決まっている', score: 2 },
      {
        value: 'q3-b',
        label: 'なんとなく',
        score: 1,
        suggestedServices: ['security'],
        actionHint: '退職者・異動者のアカウント回収フローが未整備です。セキュリティ構築（ISMS運用）ではアカウント管理として審査対象になる重要項目です。',
      },
      {
        value: 'q3-c',
        label: '決まっていない',
        score: 0,
        suggestedServices: ['security'],
        actionHint: 'アカウント・権限回収のフローがなく、退職者アカウントの残存など不正アクセスのリスクがあります。セキュリティ構築で整備できます。',
      },
      unknownOption('q3', ['security']),
    ],
  },
  {
    id: 'q4',
    domainId: 'account',
    axisId: 'attrition',
    prompt: 'アカウントの発行・削除やライセンス管理は、特定の担当者に集中していませんか？',
    options: [
      { value: 'q4-a', label: '複数人で対応している', score: 2 },
      {
        value: 'q4-b',
        label: '1人に依存している',
        score: 1,
        suggestedServices: ['bpo'],
        actionHint: 'アカウント・ライセンス管理が1人に依存しています。情シスBPOで管理・更新を継続的な仕組みに移せます。',
      },
      {
        value: 'q4-c',
        label: '対応が後手に回ることがある',
        score: 0,
        suggestedServices: ['bpo'],
        actionHint: 'アカウント発行・削除が後手に回っています。情シスBPOで入退社対応を標準化・仕組み化できます。',
      },
      unknownOption('q4', ['bpo']),
    ],
  },

  // ===== デバイス・PC管理 =====
  {
    id: 'q5',
    domainId: 'device',
    axisId: 'cost',
    prompt: '社内のPC・デバイス、台数と利用者を台帳などで正確に把握していますか？',
    options: [
      { value: 'q5-a', label: '台帳で管理している', score: 2 },
      { value: 'q5-b', label: 'だいたい把握している', score: 1 },
      {
        value: 'q5-c',
        label: '把握できていない',
        score: 0,
        suggestedServices: ['bpo'],
        actionHint: 'PC・デバイスの実数が把握できていません。情シスBPO（PC・LCM）で調達〜キッティング〜資産管理〜廃棄まで一元化できます。',
      },
      unknownOption('q5', ['bpo']),
    ],
  },
  {
    id: 'q6',
    domainId: 'device',
    axisId: 'attrition',
    prompt: 'PCのキッティング（初期設定）は、誰が対応しても同じ手順でできる状態ですか？',
    options: [
      { value: 'q6-a', label: '手順化されている', score: 2 },
      {
        value: 'q6-b',
        label: '一部の人しかできない',
        score: 1,
        suggestedServices: ['bpo'],
        actionHint: 'キッティングが属人化しています。情シスBPO（PC・LCM）で仕組み化し、誰でも同じ品質で対応できるようにできます。',
      },
      {
        value: 'q6-c',
        label: 'その都度、対応がバラバラ',
        score: 0,
        suggestedServices: ['bpo'],
        actionHint: 'キッティング手順が標準化されておらず、品質のばらつきや対応漏れが起きやすい状態です。情シスBPOで標準化できます。',
      },
      unknownOption('q6', ['bpo']),
    ],
  },

  // ===== クラウド・SaaS =====
  {
    id: 'q7',
    domainId: 'cloud',
    axisId: 'cost',
    prompt: 'Microsoft 365やSaaSのライセンス、契約数と実際の利用者数は合っていますか？',
    options: [
      { value: 'q7-a', label: '合っている', score: 2 },
      {
        value: 'q7-b',
        label: '過不足がある',
        score: 1,
        suggestedServices: ['bpo'],
        actionHint: 'ライセンスの契約数と利用実態に差があります。情シスBPO（ライセンス管理）で棚卸しと最適化を継続できます。',
      },
      {
        value: 'q7-c',
        label: '把握していない',
        score: 0,
        suggestedServices: ['bpo'],
        actionHint: 'SaaSライセンスの利用実態が把握できていません。情シスBPOで契約・利用状況を可視化し、無駄なコストを見直せます。',
      },
      unknownOption('q7', ['bpo']),
    ],
  },

  // ===== インフラ =====
  {
    id: 'q8',
    domainId: 'infra',
    axisId: 'risk',
    prompt: 'ネットワーク構成図やサーバーのバックアップ体制は、最新の状態で整っていますか？',
    options: [
      { value: 'q8-a', label: '整っている・最新', score: 2 },
      {
        value: 'q8-b',
        label: 'ある・古い／一部のみ',
        score: 1,
        suggestedServices: ['infravision'],
        actionHint: '構成図やバックアップ体制が実態から乖離しています。atLIB InfraVisionで最新の構成図と健全性を自動で見える化できます。',
      },
      {
        value: 'q8-c',
        label: 'ない・整っていない',
        score: 0,
        suggestedServices: ['infravision'],
        actionHint: 'ネットワーク構成・バックアップ体制が可視化されておらず、障害時の事業継続に大きなリスクがあります。atLIB InfraVisionで見える化から始められます。',
      },
      unknownOption('q8', ['infravision']),
    ],
  },

  // ===== セキュリティ =====
  {
    id: 'q9',
    domainId: 'security',
    axisId: 'risk',
    prompt: '全端末へのEDR/アンチウイルス導入、パスワードポリシーの統一はできていますか？',
    options: [
      { value: 'q9-a', label: 'できている', score: 2 },
      {
        value: 'q9-b',
        label: '一部のみ',
        score: 1,
        suggestedServices: ['security'],
        actionHint: 'エンドポイント保護・認証ルールが部分的です。セキュリティ構築で全端末への導入と統一ポリシーを整えられます。',
      },
      {
        value: 'q9-c',
        label: 'できていない',
        score: 0,
        suggestedServices: ['security'],
        actionHint: 'エンドポイント保護・認証ルールが未整備で、不正アクセスやマルウェア被害のリスクが高い状態です。セキュリティ構築で早急に整備をおすすめします。',
      },
      unknownOption('q9', ['security']),
    ],
  },
  {
    id: 'q10',
    domainId: 'security',
    axisId: 'risk',
    prompt: '直近1年で、セキュリティやシステムのトラブルはありましたか？',
    options: [
      { value: 'q10-a', label: 'なかった', score: 2 },
      { value: 'q10-b', label: '軽微なものがあった', score: 1 },
      {
        value: 'q10-c',
        label: 'あった',
        score: 0,
        suggestedServices: ['security'],
        securityUrgent: true,
        actionHint: '直近1年でトラブルが発生しています。セキュリティ構築への緊急提案対象として優先的に扱ってください。',
      },
      unknownOption('q10', ['security']),
    ],
  },

  // ===== ベンダー管理 =====
  {
    id: 'q11',
    domainId: 'vendor',
    axisId: 'cost',
    prompt: 'ITベンダーとの契約内容・見積もりの妥当性を、定期的に見直せていますか？',
    options: [
      { value: 'q11-a', label: '見直している', score: 2 },
      { value: 'q11-b', label: '検討中', score: 1 },
      {
        value: 'q11-c',
        label: '特にしていない',
        score: 0,
        suggestedServices: ['bpo'],
        actionHint: 'ベンダー契約が見直されないまま固定化しています。情シスBPO（ベンダー管理）で契約・費用の妥当性を棚卸しできます。',
      },
      unknownOption('q11', ['bpo']),
    ],
  },

  // ===== IT予算・経営 =====
  {
    id: 'q12',
    domainId: 'budget',
    axisId: 'cost',
    prompt: 'IT予算の総額や内訳を、経営として把握されていますか？',
    options: [
      { value: 'q12-a', label: '把握している', score: 2 },
      { value: 'q12-b', label: 'おおまかに把握', score: 1 },
      {
        value: 'q12-c',
        label: '把握していない',
        score: 0,
        suggestedServices: ['security'],
        actionHint: 'IT予算の全体像が経営に見えていません。KAIZEN診断からIT戦略・ロードマップ提案につなげ、投資対効果を可視化できます。',
      },
      unknownOption('q12', ['security']),
    ],
  },
];

/** 主軸ごとの設問数（正規化の分母に使う）。QUESTIONS から自動集計。 */
const AXIS_QUESTION_COUNT: Record<AxisId, number> = QUESTIONS.reduce(
  (acc, q) => {
    acc[q.axisId] += 1;
    return acc;
  },
  { cost: 0, risk: 0, attrition: 0 } as Record<AxisId, number>,
);

/** 「わからない」がこの数以上で「可視化不足」警告フラグを立てる（全12問中）。 */
export const VISIBILITY_GAP_THRESHOLD = 3;

/** 顧客向け結果シート末尾の定型文（有償ITアセスメント診断への接続）。無料Gap診断と共通の文言。 */
export const REPORT_FOOTER_TEXT =
  'この診断は自己申告に基づく簡易評価です。実態の正確な把握には、機器の実地棚卸しを伴うITアセスメント診断（有償）をおすすめします。';

function findQuestion(id: string): Question | undefined {
  return QUESTIONS.find((q) => q.id === id);
}

/** 質問リストからzodスキーマを動的生成する。設問を追加してもここのコードは変更不要。 */
export function buildAnswersSchema() {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const question of QUESTIONS) {
    const values = question.options.map((o) => o.value);
    shape[question.id] = z.enum(values as [string, ...string[]]);
  }
  return z.object(shape);
}

export interface AnswerInput {
  questionId: string;
  value: string;
}

export interface AnswerSnapshot {
  questionId: string;
  questionPrompt: string;
  domainId: string;
  axisId: AxisId;
  value: string;
  valueLabel: string;
  score: number;
  unknown: boolean;
  suggestedServices: ServiceTag[];
  actionHint?: string;
}

export interface SuggestedServiceHit {
  id: ServiceTag;
  label: string;
  hitCount: number;
}

export interface ScoredSubmission {
  questionSetVersion: string;
  answers: AnswerSnapshot[];
  /** 主軸ごとの素点合計。 */
  axisRaw: Record<AxisId, number>;
  /** 主軸ごとの0〜100正規化スコア（レーダーチャート用）。 */
  axisNormalized: Record<AxisId, number>;
  unknownCount: number;
  visibilityGapFlag: boolean;
  securityUrgentFlag: boolean;
  suggestedServices: SuggestedServiceHit[];
}

/**
 * サーバー側でスコアを計算する（クライアントの自己申告は信用しない）。
 * 質問文・選択肢ラベル・素点・タグも一緒にスナップショットして返す。
 */
export function scoreSubmission(rawAnswers: AnswerInput[]): ScoredSubmission {
  const answers: AnswerSnapshot[] = [];
  const axisRaw: Record<AxisId, number> = { cost: 0, risk: 0, attrition: 0 };
  const serviceHits: Record<string, number> = {};
  let unknownCount = 0;
  let securityUrgentFlag = false;

  for (const raw of rawAnswers) {
    const question = findQuestion(raw.questionId);
    if (!question) continue; // 未知の質問IDは無視（zodスキーマ側で弾かれている前提）

    const option = question.options.find((o) => o.value === raw.value);
    const score = option?.score ?? 0;
    const unknown = option?.unknown ?? false;
    const suggestedServices = option?.suggestedServices ?? [];

    answers.push({
      questionId: question.id,
      questionPrompt: question.prompt,
      domainId: question.domainId,
      axisId: question.axisId,
      value: raw.value,
      valueLabel: option?.label ?? raw.value,
      score,
      unknown,
      suggestedServices,
      actionHint: option?.actionHint,
    });

    axisRaw[question.axisId] += score;
    if (unknown) unknownCount += 1;
    if (option?.securityUrgent) securityUrgentFlag = true;
    for (const svc of suggestedServices) {
      serviceHits[svc] = (serviceHits[svc] ?? 0) + 1;
    }
  }

  const axisNormalized: Record<AxisId, number> = { cost: 0, risk: 0, attrition: 0 };
  for (const axis of AXES) {
    const denom = 2 * (AXIS_QUESTION_COUNT[axis.id] || 1);
    axisNormalized[axis.id] = Math.round((axisRaw[axis.id] / denom) * 100);
  }

  const suggestedServices: SuggestedServiceHit[] = SUGGESTED_SERVICES.map((s) => ({
    id: s.id,
    label: s.label,
    hitCount: serviceHits[s.id] ?? 0,
  }))
    .filter((s) => s.hitCount > 0)
    .sort((a, b) => b.hitCount - a.hitCount);

  return {
    questionSetVersion: QUESTION_SET_VERSION,
    answers,
    axisRaw,
    axisNormalized,
    unknownCount,
    visibilityGapFlag: unknownCount >= VISIBILITY_GAP_THRESHOLD,
    securityUrgentFlag,
    suggestedServices,
  };
}

/**
 * 結果シート下部のルールベースのコメント（低スコア軸・弱点項目トップ3）。
 * scoreSubmission の結果のみに依存する純関数。
 */
export function buildSheetComments(scored: ScoredSubmission): string[] {
  const comments: string[] = [];

  const axisMeta = AXES.map((a) => ({ label: a.label, value: scored.axisNormalized[a.id] })).sort(
    (x, y) => x.value - y.value,
  );
  const weakest = axisMeta[0];
  if (weakest) {
    comments.push(
      `3軸のうち「${weakest.label}」の評価が最も低く（${weakest.value}点）、優先的に着手する価値があります。`,
    );
  }

  const seen = new Set<string>();
  const hints = scored.answers
    .filter((a): a is AnswerSnapshot & { actionHint: string } => !a.unknown && !!a.actionHint)
    .sort((a, b) => a.score - b.score);
  for (const a of hints) {
    if (seen.has(a.actionHint)) continue;
    seen.add(a.actionHint);
    comments.push(a.actionHint);
    if (seen.size >= 3) break;
  }

  if (scored.visibilityGapFlag) {
    comments.push(
      `「わからない」という回答が${scored.unknownCount}項目ありました。自己申告だけでは実態が見えにくい領域が残っています。`,
    );
  }

  return comments;
}

export { SERVICE_LABEL };
