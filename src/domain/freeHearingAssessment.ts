import { z } from 'zod';

/**
 * 無料Gap診断（無料ヒアリング診断）の質問・配点・接続候補サービスタグ・スコア計算を1箇所に集約したモジュール。
 * domain/ismsDiagnostic.ts と同じ作法（コード内定数 + サーバー側スコア計算 + 回答スナップショット）。
 *
 * 設問の実体は sales-tools/無料Gap診断_ヒアリング設計_商談トーク版.md 3章（Q1〜Q19、会話フレーズ版）。
 * 各設問は主軸（コスト/リスク/属人化）を1つ持ち、低スコア選択肢に「接続候補サービスタグ」を紐付ける。
 * これにより結果シートに「レーダーチャート＋次に提案すべきサービス名」まで自動で出せる。
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
  /** この選択肢が出たときに提案候補となるatLIBサービス（早見表準拠）。頻度集計してシートに上位表示する。 */
  suggestedServices?: ServiceTag[];
  /** 結果シート下部のコメントに差し込む一言（弱点選択肢のみ）。 */
  actionHint?: string;
  /** Q18「あった」専用。セキュリティ構築への緊急提案フラグを立てる。 */
  securityUrgent?: boolean;
}

export interface Question {
  id: string;
  domainId: string;
  axisId: AxisId;
  /** 商談中に営業担当が実際に口にする問いかけ。 */
  prompt: string;
  options: QuestionOption[];
}

export const AXES: Axis[] = [
  { id: 'cost', label: 'コスト' },
  { id: 'risk', label: 'リスク' },
  { id: 'attrition', label: '属人化' },
];

export const DOMAINS: Domain[] = [
  { id: 'kikan', label: '基幹システム' },
  { id: 'network', label: '社内ネットワーク' },
  { id: 'server', label: 'サーバー' },
  { id: 'client-pc', label: 'クライアントPC' },
  { id: 'asset', label: '資産管理' },
  { id: 'license', label: 'ライセンス管理' },
  { id: 'user-support', label: 'ユーザー対応' },
  { id: 'security', label: 'セキュリティ' },
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
  // ===== 領域1：基幹システム =====
  {
    id: 'q1',
    domainId: 'kikan',
    axisId: 'attrition',
    prompt: '基幹システムで何かトラブルが起きたとき、対応できる方は社内に何人くらいいらっしゃいますか？',
    options: [
      { value: 'q1-a', label: '複数名いる', score: 2 },
      {
        value: 'q1-b',
        label: '1名のみ',
        score: 1,
        suggestedServices: ['bpo'],
        actionHint: '基幹システムの対応が1名に集中しています。情シスBPOで専門チームによる運用体制に切り替えると属人化を解消できます。',
      },
      {
        value: 'q1-c',
        label: '外部ベンダー任せ',
        score: 0,
        suggestedServices: ['bpo'],
        actionHint: '対応が外部ベンダー任せで社内に知見が蓄積されていません。情シスBPOで運用状況を可視化しコントロールを取り戻せます。',
      },
      unknownOption('q1', ['bpo']),
    ],
  },
  {
    id: 'q2',
    domainId: 'kikan',
    axisId: 'cost',
    prompt: '基幹システムの保守費用、ここ1年で見直しの機会はありましたか？',
    options: [
      { value: 'q2-a', label: '見直した', score: 2 },
      { value: 'q2-b', label: '検討中', score: 1 },
      {
        value: 'q2-c',
        label: '特にしていない',
        score: 0,
        suggestedServices: ['bpo'],
        actionHint: '保守費用が見直されないまま固定化しています。情シスBPOのITインフラ健全性チェック診断で費用の妥当性を棚卸しできます。',
      },
      unknownOption('q2', ['bpo']),
    ],
  },

  // ===== 領域2：社内ネットワーク =====
  {
    id: 'q3',
    domainId: 'network',
    axisId: 'risk',
    prompt: '社内のネットワーク構成図、今も最新の状態で残っていますか？',
    options: [
      { value: 'q3-a', label: 'ある・最新', score: 2 },
      {
        value: 'q3-b',
        label: 'ある・古い',
        score: 1,
        suggestedServices: ['infravision'],
        actionHint: '構成図が実態から乖離しています。atLIB InfraVision（Sensor Edgeを挿すだけ）で最新の構成図を自動生成・月次更新できます。',
      },
      {
        value: 'q3-c',
        label: 'ない',
        score: 0,
        suggestedServices: ['infravision'],
        actionHint: 'ネットワーク構成が可視化されていません。atLIB InfraVisionで構成図と健全性を自動で見える化できます。',
      },
      unknownOption('q3', ['infravision']),
    ],
  },

  // ===== 領域3：サーバー =====
  {
    id: 'q4',
    domainId: 'server',
    axisId: 'cost',
    prompt: 'サーバーは今、オンプレとクラウド、どちらが中心ですか？',
    options: [
      {
        value: 'q4-a',
        label: 'オンプレ中心',
        score: 1,
        suggestedServices: ['infra'],
        actionHint: 'オンプレ中心のままだと更改時に大きな一括投資が発生します。ITインフラ基盤（クラウド環境構築・最適化）で費用を平準化できます。',
      },
      { value: 'q4-b', label: 'クラウド中心', score: 2 },
      { value: 'q4-c', label: '混在', score: 1 },
      unknownOption('q4', ['infra']),
    ],
  },
  {
    id: 'q5',
    domainId: 'server',
    axisId: 'risk',
    prompt: '万が一サーバーが止まってしまった場合のバックアップ体制は、整っていますか？',
    options: [
      { value: 'q5-a', label: '整っている', score: 2 },
      {
        value: 'q5-b',
        label: '一部のみ',
        score: 1,
        suggestedServices: ['infravision', 'infra'],
        actionHint: 'バックアップが部分的です。atLIB InfraVisionで異常を早期検知し、ITインフラ基盤でバックアップ設計を見直すと復旧リスクを下げられます。',
      },
      {
        value: 'q5-c',
        label: '整っていない',
        score: 0,
        suggestedServices: ['infravision', 'infra'],
        actionHint: 'バックアップ体制が未整備で、障害時の事業継続に大きなリスクがあります。ITインフラ基盤での再設計を優先的に検討してください。',
      },
      unknownOption('q5', ['infravision']),
    ],
  },

  // ===== 領域4：クライアントPC =====
  {
    id: 'q6',
    domainId: 'client-pc',
    axisId: 'cost',
    prompt: '社内のPC・デバイス、台数と利用者を正確に把握されていますか？',
    options: [
      { value: 'q6-a', label: '台帳で管理', score: 2 },
      { value: 'q6-b', label: 'だいたい把握', score: 1 },
      {
        value: 'q6-c',
        label: '把握できていない',
        score: 0,
        suggestedServices: ['bpo'],
        actionHint: 'PC・デバイスの実数が把握できていません。情シスBPO（PC・LCM）で調達〜キッティング〜資産管理〜廃棄まで一元化できます。',
      },
      unknownOption('q6', ['bpo']),
    ],
  },
  {
    id: 'q7',
    domainId: 'client-pc',
    axisId: 'attrition',
    prompt: 'PCの管理は、専用ツール・台帳・特に決まった方法がない、のどれに近いですか？',
    options: [
      { value: 'q7-a', label: 'MDMツールで一元管理', score: 2 },
      { value: 'q7-b', label: '台帳で管理', score: 1 },
      {
        value: 'q7-c',
        label: '特に方法がない',
        score: 0,
        suggestedServices: ['bpo', 'infravision'],
        actionHint: 'PC管理の方法が定まっていません。情シスBPO（PC・LCM）で仕組み化し、atLIB InfraVisionで未知の機器も自動検知できます。',
      },
      unknownOption('q7', ['bpo']),
    ],
  },

  // ===== 領域5：資産管理 =====
  {
    id: 'q8',
    domainId: 'asset',
    axisId: 'cost',
    prompt: 'IT資産台帳と、実際の利用状況は一致していると言えますか？',
    options: [
      { value: 'q8-a', label: '一致している', score: 2 },
      { value: 'q8-b', label: 'おおむね一致', score: 1 },
      {
        value: 'q8-c',
        label: 'ずれがある',
        score: 0,
        suggestedServices: ['bpo'],
        actionHint: '資産台帳と実態にずれがあり、余剰コストや管理漏れの温床になっています。情シスBPO（資産管理）で実態と台帳を継続的に一致させられます。',
      },
      unknownOption('q8', ['bpo']),
    ],
  },
  {
    id: 'q9',
    domainId: 'asset',
    axisId: 'risk',
    prompt: '退職や異動があったとき、アカウントや機器を回収するフローは決まっていますか？',
    options: [
      { value: 'q9-a', label: '決まっている', score: 2 },
      { value: 'q9-b', label: 'なんとなく', score: 1 },
      {
        value: 'q9-c',
        label: '決まっていない',
        score: 0,
        suggestedServices: ['security'],
        actionHint: '退職者・異動者のアカウント／機器回収フローが未整備です。セキュリティ構築（ISMS運用）ではアカウント管理として審査対象になる重要項目です。',
      },
      unknownOption('q9', ['security']),
    ],
  },

  // ===== 領域6：ライセンス管理 =====
  {
    id: 'q10',
    domainId: 'license',
    axisId: 'cost',
    prompt:
      'SaaSやツールのライセンス、契約数と実際の利用者数は合っていますか？ また、kintoneのようなツールで、費用や使い勝手に不満はありませんか？',
    options: [
      { value: 'q10-a', label: '合っている・満足', score: 2 },
      {
        value: 'q10-b',
        label: '過不足がある',
        score: 1,
        suggestedServices: ['bpo'],
        actionHint: 'ライセンスの契約数と利用実態に差があります。情シスBPO（ライセンス管理）で棚卸しと最適化を継続できます。',
      },
      {
        value: 'q10-c',
        label: '費用や使い勝手に不満がある',
        score: 0,
        suggestedServices: ['web-system'],
        actionHint: '既製ツールが高い・使いづらい・機能追加のたびに課金増、という状態です。自社専用Webシステム構築で必要な機能だけを最適コストで持てます。',
      },
      unknownOption('q10', ['bpo']),
    ],
  },
  {
    id: 'q11',
    domainId: 'license',
    axisId: 'attrition',
    prompt: 'ライセンスの契約・更新は、特定の方に任せきりになっていませんか？',
    options: [
      { value: 'q11-a', label: '複数人で管理', score: 2 },
      {
        value: 'q11-b',
        label: '1人に依存',
        score: 1,
        suggestedServices: ['bpo'],
        actionHint: 'ライセンス管理が1人に依存しています。情シスBPOで管理・更新を継続的な仕組みに移せます。',
      },
      {
        value: 'q11-c',
        label: '管理自体していない',
        score: 0,
        suggestedServices: ['bpo'],
        actionHint: 'ライセンスが管理されておらず、契約の重複・失効・不正利用のリスクがあります。情シスBPOで管理体制を整えられます。',
      },
      unknownOption('q11', ['bpo']),
    ],
  },

  // ===== 領域7：ユーザー対応 =====
  {
    id: 'q12',
    domainId: 'user-support',
    axisId: 'attrition',
    prompt: '社内から「パソコンの調子が悪い」といった問い合わせがあったとき、窓口は明確ですか？',
    options: [
      { value: 'q12-a', label: '明確な窓口がある', score: 2 },
      {
        value: 'q12-b',
        label: 'なんとなく特定の人に集まる',
        score: 1,
        suggestedServices: ['bpo'],
        actionHint: '問い合わせが特定の人に偏っています。情シスBPO（ヘルプデスク）なら一次回答率・初動対応時間をSLAで管理できます。',
      },
      {
        value: 'q12-c',
        label: '窓口がない',
        score: 0,
        suggestedServices: ['bpo'],
        actionHint: '問い合わせ窓口がなく、対応が場当たり的になっています。情シスBPOのヘルプデスクで一次回答〜エスカレーションを標準化できます。',
      },
      unknownOption('q12', ['bpo']),
    ],
  },
  {
    id: 'q13',
    domainId: 'user-support',
    axisId: 'attrition',
    prompt: '今の情シスご担当の方が急にお休みされたら、業務は問題なく回りますか？',
    options: [
      { value: 'q13-a', label: '問題ない', score: 2 },
      {
        value: 'q13-b',
        label: '少し不安',
        score: 1,
        suggestedServices: ['bpo'],
        actionHint: '情シス担当の不在時に業務が滞る懸念があります。情シスBPOで情シス機能をチームで引き受けられます。',
      },
      {
        value: 'q13-c',
        label: 'かなり不安',
        score: 0,
        suggestedServices: ['bpo'],
        actionHint: '情シスが完全に属人化しており、担当者の不在が事業リスクに直結します。情シスBPOで情シス機能をまるごと引き受けられます。',
      },
      unknownOption('q13', ['bpo']),
    ],
  },

  // ===== 領域8：セキュリティ =====
  {
    id: 'q14',
    domainId: 'security',
    axisId: 'risk',
    prompt: 'EDRやアンチウイルスは、全端末に導入されていますか？',
    options: [
      { value: 'q14-a', label: '全端末導入済み', score: 2 },
      {
        value: 'q14-b',
        label: '一部のみ',
        score: 1,
        suggestedServices: ['security'],
        actionHint: 'EDR/アンチウイルスに未導入端末があります。セキュリティ構築（GMOサイバーセキュリティ byイエラエとの脆弱性診断）で穴を塞げます。',
      },
      {
        value: 'q14-c',
        label: '未導入',
        score: 0,
        suggestedServices: ['security'],
        actionHint: 'エンドポイント保護が未整備で、マルウェア感染時の被害が拡大しやすい状態です。セキュリティ構築で全端末への導入と運用を整えられます。',
      },
      unknownOption('q14', ['security']),
    ],
  },
  {
    id: 'q15',
    domainId: 'security',
    axisId: 'risk',
    prompt: '万が一セキュリティ事故が起きたときの対応フロー、文書化されていますか？',
    options: [
      { value: 'q15-a', label: '文書化済み', score: 2 },
      {
        value: 'q15-b',
        label: '一部口頭で共有',
        score: 1,
        suggestedServices: ['security'],
        actionHint: 'インシデント対応が口頭共有にとどまっています。セキュリティ構築（ISMS・Pマーク取得支援、SecureNavi活用）で対応フローを文書化できます。',
      },
      {
        value: 'q15-c',
        label: '特にない',
        score: 0,
        suggestedServices: ['security'],
        actionHint: 'インシデント対応フローがなく、事故発生時に初動が遅れます。セキュリティ構築で規程・体制を整備できます。',
      },
      unknownOption('q15', ['security']),
    ],
  },
  {
    id: 'q16',
    domainId: 'security',
    axisId: 'risk',
    prompt: 'パスワードポリシーや多要素認証は、社内で統一されていますか？',
    options: [
      { value: 'q16-a', label: '統一されている', score: 2 },
      {
        value: 'q16-b',
        label: '一部のみ',
        score: 1,
        suggestedServices: ['security'],
        actionHint: '認証ルールが部分的です。セキュリティ構築でパスワードポリシー・多要素認証を全社で統一できます。',
      },
      {
        value: 'q16-c',
        label: '特にルールがない',
        score: 0,
        suggestedServices: ['security'],
        actionHint: '認証ルールがなく、不正アクセスやアカウント乗っ取りのリスクが高い状態です。セキュリティ構築で統一ポリシーを導入できます。',
      },
      unknownOption('q16', ['security']),
    ],
  },
  {
    id: 'q17',
    domainId: 'security',
    axisId: 'cost',
    prompt: 'IT予算の総額や内訳を、経営として把握されていますか？',
    options: [
      { value: 'q17-a', label: '把握している', score: 2 },
      { value: 'q17-b', label: 'おおまかに把握', score: 1 },
      {
        value: 'q17-c',
        label: '把握していない',
        score: 0,
        suggestedServices: ['security'],
        actionHint: 'IT予算の全体像が経営に見えていません。無料Gap診断からISMS/SCSパッケージへ進むと、投資対効果の可視化とロードマップ提案ができます。',
      },
      unknownOption('q17', ['security']),
    ],
  },
  {
    id: 'q18',
    domainId: 'security',
    axisId: 'risk',
    prompt: '直近1年で、セキュリティやシステムのトラブルはありましたか？',
    options: [
      { value: 'q18-a', label: 'なかった', score: 2 },
      { value: 'q18-b', label: '軽微なものがあった', score: 1 },
      {
        value: 'q18-c',
        label: 'あった',
        score: 0,
        suggestedServices: ['security'],
        securityUrgent: true,
        actionHint: '直近1年でトラブルが発生しています。セキュリティ構築への緊急提案対象として、商談後半で優先的に扱ってください。',
      },
      unknownOption('q18', ['security']),
    ],
  },

  // ===== 追加設問（アイスブレイク兼用・強い訴求ポイント） =====
  {
    id: 'q19',
    domainId: 'security',
    axisId: 'risk',
    prompt:
      '取引先とのファイルのやり取りで、パスワード付きzipをメールで送る、いわゆるPPAPは今も行っていますか？',
    options: [
      { value: 'q19-a', label: '別の方法に切り替え済み', score: 2 },
      {
        value: 'q19-b',
        label: 'PPAPを続けている',
        score: 0,
        suggestedServices: ['secure-send'],
        actionHint: 'PPAP（パスワード付きzip）を継続中です。取引先からも敬遠されつつあります。atLIB SecureSendで安全なファイル共有に移行できます。',
      },
      {
        value: 'q19-c',
        label: '特に決まっていない',
        score: 1,
        suggestedServices: ['secure-send'],
        actionHint: '社外とのファイル共有方法が定まっていません。atLIB SecureSendで標準化できます。',
      },
      unknownOption('q19', ['secure-send']),
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

/** 「わからない」がこの数以上で「可視化不足」警告フラグを立てる（全19問中）。 */
export const VISIBILITY_GAP_THRESHOLD = 5;

/** 顧客向け結果シート末尾の定型文（有償ITアセスメント診断への接続）。 */
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
