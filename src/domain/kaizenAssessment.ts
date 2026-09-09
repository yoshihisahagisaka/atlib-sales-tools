import { z } from 'zod';

/**
 * 情シスKAIZEN｜60分無料診断（V5診断エンジン）の設計定数・カタログ・純粋関数を1箇所に集約。
 * domain/kaizenDiagnostic.ts（自己採点12問）とは別系統の「担当者主導の対話診断」で、
 * これは Web上の質問票ではなく、担当者が自然に会話し、AIが会話から事実を構造化するためのスキーマ集。
 *
 * カタログ（8問アンケート / 抽出項目 / 選択肢コードマスタ / Role Gap 5分類 / 成熟度アンカー /
 * KAIZEN 5分類）のいずれかを変更したら CATALOG_VERSION を手動でインクリメントすること
 * （回答・ブリーフ・レポートは JSONB スナップショットで凍結されるため、過去診断の表示は壊れない）。
 *
 * 設計原則（指示プロンプト + 承認時の反映事項 A〜I）:
 *  - A: 抽出項目は「網羅目標」にしない。AIが今回重要と判断した重点項目のみUIに出す。
 *  - B: Role Gap を無理に100%へ正規化しない。AI生値/AI推定値/担当者確認値を区別する。
 *  - C: transcript(顧客発言=一次情報) と handlerMemo(担当者メモ=二次情報) を Evidence として区別。
 *  - F: 診断ゴールは「BPO対象業務の特定」ではなく「最適な情シス運営体制の仮説」を作ること。
 *  - G: 業務ごとに remoteOperability/onsiteRequirement/standardizability/transferability/assumedOperator
 *       の器を残す（MVPで必須入力にしない・不明許容）。
 *  - H: 顧客に自己診断（外注できますか等）を求めない。事実・背景・目的・理想のみ取得する。
 */
export const CATALOG_VERSION = 'v1';
export const PRE_SURVEY_VERSION = 'v1';

// ============================================================================
// 事前アンケート（V5 13_事前アンケートマスター）
// ============================================================================

export type PreSurveyQuestionType = 'single' | 'multi';

export interface PreSurveyOption {
  value: string;
  label: string;
}

export interface PreSurveyQuestion {
  id: string;
  prompt: string;
  type: PreSurveyQuestionType;
  required: boolean;
  /** multi のときの選択上限。single では未使用。 */
  maxSelect?: number;
  /** 「その他」選択時に自由記述を1つ受け付けるか。 */
  allowOther?: boolean;
  /** この設問の回答が主にどの仮説につながるか（AI事前ブリーフのヒント）。 */
  connectsTo: string;
  options: PreSurveyOption[];
}

const OTHER_OPTION: PreSurveyOption = { value: 'other', label: 'その他' };

export const PRE_SURVEY_QUESTIONS: PreSurveyQuestion[] = [
  {
    id: 'q1',
    prompt: '従業員数を教えてください',
    type: 'single',
    required: true,
    connectsTo: 'IT環境・運用規模の前提',
    options: [
      { value: 'lt50', label: '～49名' },
      { value: '50_99', label: '50～99名' },
      { value: '100_299', label: '100～299名' },
      { value: '300_499', label: '300～499名' },
      { value: '500_999', label: '500～999名' },
      { value: 'gte1000', label: '1,000名以上' },
    ],
  },
  {
    id: 'q2',
    prompt: '現在の情シス体制を教えてください',
    type: 'multi',
    required: true,
    maxSelect: 6,
    allowOther: true,
    connectsTo: '実行体制・属人性の前提',
    options: [
      { value: 'dedicated', label: '専任担当者がいる' },
      { value: 'concurrent', label: '他業務との兼任' },
      { value: 'department', label: '複数名の情シス部門' },
      { value: 'outsourced', label: '外部委託を利用' },
      { value: 'none', label: '実質的に担当者不在' },
      OTHER_OPTION,
    ],
  },
  {
    id: 'q3',
    prompt: 'ITを活用して、今後どんな会社にしていきたいですか？',
    type: 'multi',
    required: true,
    maxSelect: 3,
    allowOther: true,
    connectsTo: '未来像の仮説',
    options: [
      { value: 'dx_ai', label: 'DX・AIを活用したい' },
      { value: 'productivity', label: '社員の生産性を高めたい' },
      { value: 'security_trust', label: 'セキュリティ・社会的信用を高めたい' },
      { value: 'isms_governance', label: 'ISMS等の認証・IT統制を強化したい' },
      { value: 'cloud', label: 'クラウド活用を進めたい' },
      { value: 'data', label: 'データを経営・業務に活かしたい' },
      { value: 'cost', label: 'ITコストを最適化したい' },
      OTHER_OPTION,
    ],
  },
  {
    id: 'q4',
    prompt: '今後、情シスに期待している役割は何ですか？',
    type: 'multi',
    required: true,
    maxSelect: 3,
    allowOther: true,
    connectsTo: '理想Roleの仮説',
    options: [
      { value: 'it_strategy', label: 'IT戦略・企画' },
      { value: 'dx_ai', label: 'DX・AI推進' },
      { value: 'improvement', label: '業務改善・自動化' },
      { value: 'security', label: 'セキュリティ強化' },
      { value: 'infra', label: 'IT基盤の改善' },
      { value: 'user_enable', label: '社員のIT活用支援' },
      { value: 'stable_ops', label: '安定した日常運用' },
      { value: 'undecided', label: 'まだ明確ではない' },
      OTHER_OPTION,
    ],
  },
  {
    id: 'q5',
    prompt: '現在、情シスの時間を特に使っている仕事は何ですか？',
    type: 'multi',
    required: true,
    maxSelect: 3,
    allowOther: true,
    connectsTo: '代表業務の選定',
    options: [
      { value: 'user_support', label: '社員からの問い合わせ' },
      { value: 'kitting', label: 'PCキッティング・端末管理' },
      { value: 'account', label: 'アカウント・権限管理' },
      { value: 'asset_license', label: 'IT資産・ライセンス管理' },
      { value: 'infra_ops', label: 'システム・インフラ運用' },
      { value: 'security', label: 'セキュリティ対応' },
      { value: 'admin_clerical', label: '契約・請求・台帳等の事務' },
      { value: 'incident', label: '障害・トラブル対応' },
      { value: 'system_intro', label: 'システム導入・更改' },
      OTHER_OPTION,
    ],
  },
  {
    id: 'q6',
    prompt: '本当は進めたいのに、後回しになっていることはありますか？',
    type: 'multi',
    required: true,
    maxSelect: 3,
    allowOther: true,
    connectsTo: 'Role Gapの仮説',
    options: [
      { value: 'dx_ai', label: 'DX・AI活用' },
      { value: 'improvement', label: '業務改善・自動化' },
      { value: 'security', label: 'セキュリティ強化' },
      { value: 'isms_audit', label: 'ISMS・監査・IT統制' },
      { value: 'cloud_infra', label: 'クラウド化・インフラ刷新' },
      { value: 'id_auth', label: 'ID・認証環境の改善' },
      { value: 'data', label: 'データ活用' },
      { value: 'it_roadmap', label: 'IT戦略・中長期計画' },
      { value: 'none', label: '特にない・分からない' },
      OTHER_OPTION,
    ],
  },
  {
    id: 'q7',
    prompt: '現在、情シスについて特に感じていることを教えてください',
    type: 'multi',
    required: true,
    maxSelect: 3,
    allowOther: true,
    connectsTo: '仮説・制約条件（事実ではなく検証すべき仮説として扱う）',
    options: [
      { value: 'overwhelmed', label: '日常業務に追われている' },
      { value: 'attrition', label: '属人化している' },
      { value: 'understaffed', label: '人手が足りない' },
      { value: 'manual_dup', label: '手作業・二重入力が多い' },
      { value: 'cross_dept', label: '他部門との調整に時間がかかる' },
      { value: 'legacy', label: 'IT環境が複雑・古い' },
      { value: 'cannot_improve', label: '改善したいが進められない' },
      { value: 'hard_to_pitch', label: '経営層にIT投資の必要性を伝えにくい' },
      { value: 'no_issue', label: '特に大きな問題はない' },
      OTHER_OPTION,
    ],
  },
  {
    id: 'q8',
    prompt: '今回の60分診断で、特に改善したいと感じているテーマは？',
    type: 'multi',
    required: false,
    maxSelect: 2,
    allowOther: true,
    connectsTo: '顧客の関心・優先度（改善手段は選ばせず診断の重点だけ決める）',
    options: [
      { value: 'daily_burden', label: '日常業務の負担' },
      { value: 'attrition', label: '属人化' },
      { value: 'user_support', label: '社員問い合わせ' },
      { value: 'infra_ops', label: 'IT基盤・運用' },
      { value: 'security', label: 'セキュリティ' },
      { value: 'dx_ai', label: 'DX・AI' },
      { value: 'org', label: '情シス体制' },
      { value: 'where_to_start', label: '何から手をつけるべきか分からない' },
      OTHER_OPTION,
    ],
  },
];

// ============================================================================
// AI抽出項目マスター（V5 02_AI抽出項目マスター）
// ============================================================================

export type ExtractionDomain =
  | '会社・未来'
  | 'Role'
  | '組織条件'
  | '業務プロセス'
  | 'IT基盤'
  | '問い合わせ';

export type ExtractionImportance = 'must' | 'high' | 'mid';
export type StandardCodeSet = 'AUTH' | 'MGT' | 'WORK' | 'DEP' | 'FLOW';

export interface ExtractionItem {
  code: string;
  domain: ExtractionDomain;
  /** 取得する事実（何を事実として取るか）。 */
  label: string;
  dataType: string;
  importance: ExtractionImportance;
  /** 主にどの判定へ効くか。 */
  judgesInto: string;
  /** 不足時の追加確認のヒント。 */
  followUpHint: string;
  /** 標準分類コードのセット（あれば）。 */
  standardCodeSet?: StandardCodeSet;
}

export const EXTRACTION_ITEMS: ExtractionItem[] = [
  { code: 'F01', domain: '会社・未来', label: '3年後の会社像（IT活用で実現したい会社・顧客・社員・経営の変化）', dataType: '自由記述', importance: 'must', judgesInto: '未来像', followUpHint: '実現したと分かる変化は？' },
  { code: 'F02', domain: '会社・未来', label: '優先テーマ（未来像の中で優先度が高いテーマ）', dataType: '複数選択＋自由記述', importance: 'high', judgesInto: '優先順位', followUpHint: '最優先は何か？' },
  { code: 'F03', domain: 'Role', label: '理想の情シスRole（将来担いたい役割）', dataType: '自由記述', importance: 'must', judgesInto: 'Role Gap', followUpHint: 'どんな仕事に時間を使いたい？' },
  { code: 'F04', domain: 'Role', label: '現在の時間配分（実際に時間を使う仕事の構成）', dataType: '割合＋自由記述', importance: 'must', judgesInto: 'Role Gap', followUpHint: '直近1〜2週間の上位業務は？' },
  { code: 'F05', domain: '組織条件', label: '情シス体制（人数・役割・責任範囲・兼務）', dataType: '数値＋自由記述', importance: 'high', judgesInto: '実行可能性', followUpHint: '何名でどこまで担当？' },
  { code: 'F06', domain: '組織条件', label: '経営・予算制約（IT理解・予算承認・意思決定の制約）', dataType: '自由記述', importance: 'high', judgesInto: '実行計画', followUpHint: '施策が止まる主因は？' },
  { code: 'P01', domain: '業務プロセス', label: '起点（業務が始まる出来事・依頼元）', dataType: '自由記述', importance: 'must', judgesInto: '全KAIZEN', followUpHint: '最初に何が起きた？' },
  { code: 'P02', domain: '業務プロセス', label: '工程（起点から完了まで実際に行う作業）', dataType: '時系列', importance: 'must', judgesInto: '標準化/自動化', followUpHint: 'その次は？' },
  { code: 'P03', domain: '業務プロセス', label: '完了条件（何をもって業務完了か）', dataType: '自由記述', importance: 'mid', judgesInto: '標準化/任せる', followUpHint: '最後に何が終われば完了？' },
  { code: 'P04', domain: '業務プロセス', label: '頻度・件数（月間/週間の発生頻度と概算件数）', dataType: '数値', importance: 'high', judgesInto: '優先度/創出時間', followUpHint: '月に何件くらい？' },
  { code: 'P05', domain: '業務プロセス', label: '実作業時間（人が手を動かす時間）', dataType: '数値', importance: 'high', judgesInto: '創出時間', followUpHint: '実際に手を動かす時間は？' },
  { code: 'P06', domain: '業務プロセス', label: '待ち・調整時間（他部門確認や承認待ち等の経過時間）', dataType: '数値＋自由記述', importance: 'high', judgesInto: '運用Gap', followUpHint: '途中で誰を待った？' },
  { code: 'P07', domain: '業務プロセス', label: '判断特性（人が判断する箇所と定型処理の箇所）', dataType: '分類＋根拠', importance: 'must', judgesInto: '自動化/任せる/社内に残す', followUpHint: '担当者が判断したのはどこ？', standardCodeSet: 'WORK' },
  { code: 'P08', domain: '業務プロセス', label: '例外（通常手順から外れるケース）', dataType: '自由記述', importance: 'high', judgesInto: '標準化/自動化', followUpHint: '最近例外はあった？' },
  { code: 'P09', domain: '業務プロセス', label: '属人性（担当変更時にやり方・結果が変わるか）', dataType: '分類＋根拠', importance: 'must', judgesInto: '標準化/任せる', followUpHint: '別の人でも同じ結果になる？', standardCodeSet: 'DEP' },
  { code: 'P10', domain: '業務プロセス', label: '管理媒体（情報・進捗・台帳を何で管理するか）', dataType: '複数選択', importance: 'high', judgesInto: '運用Gap/自動化', followUpHint: 'どこに記録が残る？', standardCodeSet: 'MGT' },
  { code: 'P11', domain: '業務プロセス', label: '部門連携（他部門から情報を受け渡す方法と品質）', dataType: '自由記述＋分類', importance: 'high', judgesInto: '運用Gap', followUpHint: '誰から何がどう来た？', standardCodeSet: 'FLOW' },
  { code: 'P12', domain: '業務プロセス', label: '社内固有判断・権限（社内の人でなければ難しい判断・調整・権限）', dataType: '自由記述', importance: 'must', judgesInto: '任せる/社内に残す', followUpHint: '社内でしかできない判断は？' },
  { code: 'P13', domain: '業務プロセス', label: '目的・受益者（業務の目的と結果を使う人）', dataType: '自由記述', importance: 'high', judgesInto: 'なくす・減らす', followUpHint: '何のため、誰が使う？' },
  { code: 'T01', domain: 'IT基盤', label: '認証・ID（認証基盤・アカウント作成・SSO・権限）', dataType: '構造化', importance: 'high', judgesInto: 'IT基盤Gap', followUpHint: '実際の入社1件から確認', standardCodeSet: 'AUTH' },
  { code: 'T02', domain: 'IT基盤', label: '端末管理（PC管理・パッチ・セキュリティ・在庫）', dataType: '構造化', importance: 'high', judgesInto: 'IT基盤/運用Gap', followUpHint: '最後の棚卸し・更新から確認' },
  { code: 'T03', domain: 'IT基盤', label: 'SaaS・ライセンス（利用サービス・責任者・台帳・棚卸し）', dataType: '構造化', importance: 'high', judgesInto: '運用Gap', followUpHint: '誰がどこまで把握？' },
  { code: 'I01', domain: '問い合わせ', label: '受付経路（問い合わせがどこから入るか）', dataType: '複数選択', importance: 'high', judgesInto: '標準化/任せる', followUpHint: '最後の1件はどう来た？' },
  { code: 'I02', domain: '問い合わせ', label: '記録率・記録方法（どの問い合わせが記録されるか）', dataType: '分類＋根拠', importance: 'high', judgesInto: '運用Gap', followUpHint: 'その1件は記録した？' },
  { code: 'I03', domain: '問い合わせ', label: '反復性・自己解決（同種再発・FAQ/ナレッジ・自己解決状況）', dataType: '構造化', importance: 'high', judgesInto: 'なくす/標準化/自動化', followUpHint: '似た問い合わせは最近も？' },
];

export const MUST_ITEM_CODES: string[] = EXTRACTION_ITEMS.filter((i) => i.importance === 'must').map((i) => i.code);
export const EXTRACTION_ITEM_CODES: string[] = EXTRACTION_ITEMS.map((i) => i.code);

// ============================================================================
// 標準選択肢マスター（V5 04_選択肢マスター）
// ============================================================================

export interface OptionCode {
  code: string;
  label: string;
}

export const OPTION_CODE_MASTER: Record<StandardCodeSet, OptionCode[]> = {
  AUTH: [
    { code: 'AUTH01', label: 'オンプレAD中心' },
    { code: 'AUTH02', label: 'AD＋Entra ID' },
    { code: 'AUTH03', label: 'Entra ID中心' },
    { code: 'AUTH04', label: 'ローカルアカウント中心' },
    { code: 'AUTH05', label: '混在' },
    { code: 'AUTH99', label: '不明' },
  ],
  MGT: [
    { code: 'MGT01', label: '専用SaaS' },
    { code: 'MGT02', label: '既存クラウド基盤' },
    { code: 'MGT03', label: 'ワークフロー' },
    { code: 'MGT04', label: 'Excel・スプレッドシート' },
    { code: 'MGT05', label: '複数Excel・個人台帳' },
    { code: 'MGT06', label: 'メール' },
    { code: 'MGT07', label: '口頭・チャット' },
    { code: 'MGT99', label: '不明' },
  ],
  WORK: [
    { code: 'WORK01', label: 'ほぼ定型' },
    { code: 'WORK02', label: '一部判断あり' },
    { code: 'WORK03', label: '高度な判断あり' },
    { code: 'WORK04', label: '例外が多い' },
    { code: 'WORK99', label: '不明' },
  ],
  DEP: [
    { code: 'DEP01', label: '誰でも対応可能' },
    { code: 'DEP02', label: '手順があれば対応可能' },
    { code: 'DEP03', label: '特定担当者中心' },
    { code: 'DEP04', label: '本人しかできない' },
    { code: 'DEP99', label: '不明' },
  ],
  FLOW: [
    { code: 'FLOW01', label: 'システム連携' },
    { code: 'FLOW02', label: 'ワークフロー連携' },
    { code: 'FLOW03', label: '定型フォーム' },
    { code: 'FLOW04', label: 'Excel・メール' },
    { code: 'FLOW05', label: '口頭・都度連絡' },
    { code: 'FLOW99', label: '不明' },
  ],
};

export const ALL_STANDARD_CODES: string[] = Object.values(OPTION_CODE_MASTER)
  .flat()
  .map((c) => c.code);

// ============================================================================
// 情シスRole Gap（V5 08_情シスRole_Gap）— 正式な5分類
// ============================================================================

export type RoleGapCategoryId = 'daily' | 'maintain' | 'admin' | 'improve' | 'strategy';

export interface RoleGapCategory {
  id: RoleGapCategoryId;
  label: string;
  /** 代表業務例。 */
  examples: string;
  /** 診断上の意味。 */
  meaning: string;
}

export const ROLE_GAP_CATEGORIES: RoleGapCategory[] = [
  { id: 'daily', label: '日常運用', examples: '問い合わせ対応 / 定常監視 / アカウント運用 / 定例作業', meaning: '安定運用に必要だが、仕組み化・効率化の対象' },
  { id: 'maintain', label: '維持・更新', examples: 'サーバー更改 / EOL対応 / 機器更新 / パッチ・バージョン更新', meaning: '事業継続のための維持活動。「改善」とは分けて把握' },
  { id: 'admin', label: '管理・事務', examples: '契約 / 請求 / 台帳 / ライセンス / 棚卸し / 報告', meaning: '必要性・重複・手作業を見極め、減らす/自動化/標準化を検討' },
  { id: 'improve', label: '改善', examples: '業務改善 / 自動化 / 標準化 / 利用環境改善', meaning: '増やしたい価値創出時間。既存業務をより良くする活動' },
  { id: 'strategy', label: '戦略・企画', examples: 'DX / AI / セキュリティ戦略 / IT投資 / 経営連携', meaning: '最も増やしたい価値創出時間。会社の未来に直結' },
];

export const ROLE_GAP_CATEGORY_IDS = ROLE_GAP_CATEGORIES.map((c) => c.id) as RoleGapCategoryId[];

/** 「改善」と「維持・更新」の切り分けルール（V5 08 R12）。C1 の system プロンプトに逐語で使う。 */
export const ROLE_GAP_RULES =
  '「改善」は現状をより良くするための能動的な活動。EOL対応・老朽化更新・必須更改など、現状維持のために必要な活動は「維持・更新」として分離する。単に新しいシステムを導入した／プロジェクトとして実施している、という理由だけで「改善」と判定しない。';

export type RoleGapDistribution = Record<RoleGapCategoryId, number | null>;

// ============================================================================
// 成熟度・Gap採点（V5 07_成熟度・Gap採点）
// ============================================================================

export interface MaturityArea {
  id: string;
  label: string;
  /** 1〜5 のアンカー説明。 */
  anchors: Record<'1' | '2' | '3' | '4' | '5', string>;
  /** スコアの読み方。 */
  reading: string;
}

export const MATURITY_AREAS: MaturityArea[] = [
  {
    id: 'future_clarity',
    label: '未来像明確度',
    anchors: { '1': 'ITの未来像なし', '2': '抽象的な希望', '3': 'テーマはある', '4': '会社価値と接続', '5': '経営成果まで明確' },
    reading: '高いほど未来像が明確',
  },
  {
    id: 'infra_maturity',
    label: 'IT基盤成熟度',
    anchors: { '1': 'ローカル/バラバラ・未管理', '2': 'AD中心・個別運用/台帳中心', '3': 'ハイブリッド/一部統合・一部MDM', '4': 'クラウドID・MDMで概ね統合', '5': 'ライフサイクル・ゼロタッチまで統合' },
    reading: '高いほどIT基盤が仕組み化',
  },
  {
    id: 'ops_maturity',
    label: '運用成熟度',
    anchors: { '1': '個人管理・口頭/個人依存', '2': '複数Excel・メール中心', '3': '共通台帳・定型フォーム', '4': 'SaaS等で一元化・WFで標準化', '5': '連携・自動更新・例外管理まで定着' },
    reading: '高いほど運用が仕組み化',
  },
  {
    id: 'role_maturity',
    label: '情シスRole成熟度',
    anchors: { '1': 'ほぼ作業のみ', '2': '運用が大半', '3': '改善も実施', '4': '改善・戦略に時間', '5': '経営ITを牽引・KPIで継続改善' },
    reading: '高いほど価値業務へシフト',
  },
  {
    id: 'ideal_gap',
    label: '理想との差',
    anchors: { '1': 'ほぼ一致', '2': '小さい', '3': '中程度', '4': '大きい', '5': '極めて大きい' },
    reading: '高いほど理想との差が大きい',
  },
  {
    id: 'kaizen_room',
    label: 'KAIZEN余地',
    anchors: { '1': 'ほぼなし', '2': '小', '3': '中', '4': '大', '5': '非常に大' },
    reading: '高いほど改善余地が大きい',
  },
];

export const MATURITY_AREA_IDS = MATURITY_AREAS.map((a) => a.id);

// ============================================================================
// KAIZEN分類（V5 04 KZ01-05 / 06_診断ロジック）
// ============================================================================

export type KaizenCategoryId = 'eliminate' | 'automate' | 'standardize' | 'delegate' | 'keep';

export interface KaizenCategory {
  id: KaizenCategoryId;
  label: string;
  definition: string;
}

export const KAIZEN_CATEGORIES: KaizenCategory[] = [
  { id: 'eliminate', label: 'なくす・減らす', definition: '必要性/頻度/重複を見直す（廃止・頻度削減・統合）' },
  { id: 'automate', label: '自動化する', definition: '定型デジタル処理を機械化（連携・WF・スクリプト）' },
  { id: 'standardize', label: '標準化する', definition: '手順・ルール・受付を揃える（手順書・窓口統一）' },
  { id: 'delegate', label: '任せる', definition: '標準化可能な運用を外部化（BPO/MSP）' },
  { id: 'keep', label: '社内に残す', definition: '社内固有の判断・戦略を保持（IT戦略・投資判断）' },
];

export const KAIZEN_CATEGORY_IDS = KAIZEN_CATEGORIES.map((c) => c.id) as KaizenCategoryId[];

/** 一次判定の判断順序（V5 00 R13 / 06_診断ロジック）。C2 の system プロンプトに逐語で使う。 */
export const KAIZEN_JUDGMENT_ORDER: string[] = [
  'そもそも必要か（目的・受益者・重複を見直す）',
  '運用変更で改善できないか',
  '既存環境で改善できないか',
  '自動化・連携できないか',
  '新しい仕組みが必要か',
  '外部へ任せるべきか',
];

// ============================================================================
// 業務ごとの将来拡張フィールド（反映事項G）— MVPで必須入力にしない・不明許容
// ============================================================================

export const BUSINESS_OPERATING_FIELDS = {
  remoteOperability: ['yes', 'partial', 'no', 'unknown'] as const,
  onsiteRequirement: ['high', 'low', 'none', 'unknown'] as const,
  standardizability: ['high', 'mid', 'low', 'unknown'] as const,
  transferability: ['easy', 'hard', 'unknown'] as const,
  assumedOperator: ['customer', 'atlib', 'joint', 'unknown'] as const,
};

export const BUSINESS_OPERATING_FIELD_LABELS: Record<keyof typeof BUSINESS_OPERATING_FIELDS, string> = {
  remoteOperability: 'リモート運用可能性',
  onsiteRequirement: '現地対応の必要性',
  standardizability: '標準化可能性',
  transferability: '担当者変更時の移管可能性',
  assumedOperator: '想定運用主体',
};

// ============================================================================
// レポート（V5 10_診断レポート / 12_有償Assessment境界）
// ============================================================================

/** 顧客向けレポート末尾の定型フッター。無料診断は「仮説」までであることを明示。 */
export const REPORT_FOOTER_TEXT =
  '本レポートは60分ヒアリングと確認できた事実に基づく「改善仮説」です。確定した削減工数・ROI・最終To-Be・BPO範囲は、有償「情シスKAIZEN 設計アセスメント」で確定します。';

/** 診断ゴール（反映事項F）。system プロンプト・レポート冒頭で共有する。 */
export const ASSESSMENT_GOAL_TEXT =
  'この診断のゴールは「BPO対象業務を特定すること」ではなく、「顧客にとって最適な情シス運営体制の仮説を作ること」です。';

// ============================================================================
// zod builders / スナップショット
// ============================================================================

export interface PreSurveyRawAnswers {
  [questionId: string]: string | string[];
}

/** 事前アンケートの回答スキーマを PRE_SURVEY_QUESTIONS から動的生成。 */
export function buildPreSurveySchema() {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const q of PRE_SURVEY_QUESTIONS) {
    const values = q.options.map((o) => o.value) as [string, ...string[]];
    if (q.type === 'single') {
      const base = z.enum(values);
      shape[q.id] = q.required ? base : base.optional();
    } else {
      const base = z
        .array(z.enum(values))
        .max(q.maxSelect ?? values.length);
      shape[q.id] = q.required ? base.min(1) : base.optional();
    }
  }
  return z.object(shape).extend({
    // Q2 の人数（任意）と、各設問の「その他」自由記述（任意・500字まで）
    q2Count: z.coerce.number().int().min(0).max(10000).optional(),
    otherTexts: z.record(z.string().max(500)).optional(),
  });
}

export interface PreSurveySelectedOption {
  value: string;
  label: string;
}

export interface PreSurveyAnswerSnapshotEntry {
  questionId: string;
  prompt: string;
  type: PreSurveyQuestionType;
  selected: PreSurveySelectedOption[];
  otherText?: string;
}

export interface PreSurveySnapshot {
  preSurveyVersion: string;
  q2Count?: number;
  entries: PreSurveyAnswerSnapshotEntry[];
}

/** 送信された生回答を、設問文・選択肢ラベルまで凍結したスナップショットに変換する。 */
export function buildPreSurveySnapshot(raw: Record<string, unknown>): PreSurveySnapshot {
  const otherTexts = (raw.otherTexts ?? {}) as Record<string, string>;
  const entries: PreSurveyAnswerSnapshotEntry[] = [];

  for (const q of PRE_SURVEY_QUESTIONS) {
    const value = raw[q.id];
    const selectedValues: string[] =
      value === undefined || value === null
        ? []
        : Array.isArray(value)
          ? (value as string[])
          : [String(value)];

    const selected: PreSurveySelectedOption[] = selectedValues.map((v) => {
      const opt = q.options.find((o) => o.value === v);
      return { value: v, label: opt?.label ?? v };
    });

    const entry: PreSurveyAnswerSnapshotEntry = {
      questionId: q.id,
      prompt: q.prompt,
      type: q.type,
      selected,
    };
    const other = otherTexts[q.id];
    if (q.allowOther && selectedValues.includes('other') && other) {
      entry.otherText = other;
    }
    entries.push(entry);
  }

  const q2CountRaw = raw.q2Count;
  const q2Count = typeof q2CountRaw === 'number' ? q2CountRaw : undefined;

  return {
    preSurveyVersion: PRE_SURVEY_VERSION,
    ...(q2Count !== undefined ? { q2Count } : {}),
    entries,
  };
}

/** 事前アンケートQ1（従業員数）の選択値を employee_band 列へ非正規化するための取り出し。 */
export function extractEmployeeBand(raw: Record<string, unknown>): string | null {
  const v = raw.q1;
  return typeof v === 'string' && v.length > 0 ? v : null;
}

// ============================================================================
// AIコールの出力スキーマ（生JSON Schema は AI service 側で併記）
// ============================================================================

export const roleGapDistributionSchema = z.object({
  daily: z.number().nullable(),
  maintain: z.number().nullable(),
  admin: z.number().nullable(),
  improve: z.number().nullable(),
  strategy: z.number().nullable(),
});

// --- Call A: 事前ブリーフ ---
export const preBriefSchema = z.object({
  customerSummary: z.string(),
  assumedRoleGap: z.object({
    narrative: z.string(),
    hypothesizedCurrent: roleGapDistributionSchema,
    hypothesizedIdeal: roleGapDistributionSchema,
  }),
  priorityThemes: z.array(z.object({ title: z.string(), why: z.string() })).max(3),
  firstQuestions: z.array(z.object({ theme: z.string(), question: z.string() })),
  factsToConfirm: z.array(z.string()),
  hypothesesToTest: z.array(z.string()).max(5),
  orgConstraints: z.array(z.string()),
  questionsToAvoid: z.array(z.string()),
  liveUpdateRules: z.array(z.string()),
  focusItemCodes: z.array(z.object({ itemCode: z.string(), reason: z.string() })),
});
export type PreBrief = z.infer<typeof preBriefSchema>;

// --- Call B: 会話解析（事実抽出 + 標準分類 + 不足検出 + 会話ナビ） ---
export const analyzeFactSchema = z.object({
  itemCode: z.string(),
  value: z.string().nullable(),
  standardCode: z.string().nullable(),
  confidence: z.enum(['high', 'mid', 'low']),
  evidenceQuote: z.string(),
  evidenceSourceType: z.enum(['transcript', 'handler_memo', 'none']),
  flag: z.enum(['ok', 'unknown', 'conflict', 'needs_confirmation']),
  followupQuestion: z.string().nullable(),
});
export const analyzeConversationSchema = z.object({
  facts: z.array(analyzeFactSchema),
  focusItems: z.array(
    z.object({
      itemCode: z.string(),
      status: z.enum(['acquired', 'unknown', 'needs_confirmation']),
      reason: z.string(),
    }),
  ),
  nextQuestion: z.object({
    question: z.string(),
    targetItemCodes: z.array(z.string()),
    rationale: z.string(),
  }),
  followUps: z.array(z.object({ question: z.string(), targetItemCodes: z.array(z.string()) })).max(3),
  doNotAsk: z.array(z.object({ itemCode: z.string(), reason: z.string() })),
});
export type AnalyzeConversationResult = z.infer<typeof analyzeConversationSchema>;
export type AnalyzeFact = z.infer<typeof analyzeFactSchema>;

// --- Call C1: 業務構造化 + Role Gap + 成熟度 ---
const businessOperatingSchema = z.object({
  remoteOperability: z.enum(BUSINESS_OPERATING_FIELDS.remoteOperability),
  onsiteRequirement: z.enum(BUSINESS_OPERATING_FIELDS.onsiteRequirement),
  standardizability: z.enum(BUSINESS_OPERATING_FIELDS.standardizability),
  transferability: z.enum(BUSINESS_OPERATING_FIELDS.transferability),
  assumedOperator: z.enum(BUSINESS_OPERATING_FIELDS.assumedOperator),
});
export const structuredBusinessSchema = z
  .object({
    ordinal: z.number(),
    name: z.string(),
    purpose: z.string(),
    beneficiary: z.string(),
    trigger: z.string(),
    doneCondition: z.string(),
    frequency: z.string(),
    countPerMonth: z.number().nullable(),
    minutesPerCase: z.number().nullable(),
    judgmentType: z.string(),
    exceptions: z.string(),
    medium: z.string(),
    attribution: z.string(),
    internalRules: z.string(),
    evidenceQuote: z.string(),
    flags: z.object({
      eliminate: z.boolean(),
      automate: z.boolean(),
      standardize: z.boolean(),
      delegate: z.boolean(),
      keep: z.boolean(),
    }),
  })
  .merge(businessOperatingSchema);
export const structureAssessmentSchema = z.object({
  businesses: z.array(structuredBusinessSchema).max(15),
  roleGap: z.object({
    raw: z.object({ current: roleGapDistributionSchema, ideal: roleGapDistributionSchema }),
    estimate: z
      .object({
        current: roleGapDistributionSchema,
        ideal: roleGapDistributionSchema,
        filledCats: z.array(z.string()),
      })
      .nullable(),
    evidenceSufficiency: z.enum(['sufficient', 'insufficient']),
    note: z.string(),
  }),
  maturity: z.object({
    areas: z.array(
      z.object({
        areaId: z.string(),
        score: z.number(),
        anchorMet: z.string(),
        evidence: z.string(),
      }),
    ),
  }),
});
export type StructureAssessmentResult = z.infer<typeof structureAssessmentSchema>;
export type StructuredBusiness = z.infer<typeof structuredBusinessSchema>;

// --- Call C2: 一次判定（5分類） + レポート下書き ---
export const draftReportSchema = z.object({
  operatingModelHypothesis: z.object({
    summary: z.string(),
    byCategory: z.object({
      eliminate: z.array(z.string()),
      automate: z.array(z.string()),
      standardize: z.array(z.string()),
      delegate: z.array(z.string()),
      keep: z.array(z.string()),
    }),
    openQuestions: z.array(z.string()),
  }),
  hypotheses: z
    .array(
      z.object({
        ordinal: z.number(),
        target: z.string(),
        confirmedFacts: z.array(z.string()),
        futureVisionImpact: z.string(),
        gapType: z.string(),
        categories: z.array(z.enum(KAIZEN_CATEGORY_IDS as [KaizenCategoryId, ...KaizenCategoryId[]])),
        priority: z.enum(['high', 'mid', 'low']),
        freedTimeGoesTo: z.string(),
        isHypothesis: z.literal(true),
      }),
    )
    .max(10),
  report: z.object({
    b01_future: z.string(),
    b02_idealJoshisu: z.string(),
    b03_gap: z.object({
      table: z.array(z.object({ area: z.string(), current: z.number(), ideal: z.number(), gap: z.number() })),
      narrative: z.string(),
    }),
    b04_timeShift: z.object({
      rows: z.array(z.object({ category: z.string(), currentPct: z.number(), idealPct: z.number(), diffPct: z.number() })),
      narrative: z.string(),
    }),
    b05_priorityKaizen: z.array(z.object({ title: z.string(), body: z.string() })),
    b06_next90days: z.array(z.object({ when: z.string(), action: z.string() })),
  }),
});
export type DraftReportResult = z.infer<typeof draftReportSchema>;

// ============================================================================
// 純粋関数
// ============================================================================

export interface RoleGapSumCheck {
  currentSum: number;
  idealSum: number;
  okCurrent: boolean;
  okIdeal: boolean;
}

function sumDistribution(dist: RoleGapDistribution | undefined | null): number {
  if (!dist) return 0;
  return ROLE_GAP_CATEGORY_IDS.reduce((acc, id) => acc + (dist[id] ?? 0), 0);
}

/** Role Gap の各列合計を確認する（情報表示のみ。ハードフェイルしない）。 */
export function validateRoleGapSums(roleGap: {
  current?: RoleGapDistribution | null;
  ideal?: RoleGapDistribution | null;
}): RoleGapSumCheck {
  const currentSum = sumDistribution(roleGap.current);
  const idealSum = sumDistribution(roleGap.ideal);
  return {
    currentSum,
    idealSum,
    okCurrent: Math.abs(currentSum - 100) <= 1,
    okIdeal: Math.abs(idealSum - 100) <= 1,
  };
}

/**
 * Role Gap を合計100へ clamp/rescale する。**自動実行しない**（担当者が明示操作したときだけ呼ぶ）。
 * null は 0 とみなす。全て 0 の列はそのまま返す（0除算回避）。
 */
export function normalizeRoleGap(dist: RoleGapDistribution): { normalized: Record<RoleGapCategoryId, number>; adjusted: boolean } {
  const raw: Record<RoleGapCategoryId, number> = {
    daily: Math.max(0, dist.daily ?? 0),
    maintain: Math.max(0, dist.maintain ?? 0),
    admin: Math.max(0, dist.admin ?? 0),
    improve: Math.max(0, dist.improve ?? 0),
    strategy: Math.max(0, dist.strategy ?? 0),
  };
  const total = ROLE_GAP_CATEGORY_IDS.reduce((acc, id) => acc + raw[id], 0);
  if (total === 0) return { normalized: raw, adjusted: false };
  if (Math.abs(total - 100) <= 1) return { normalized: raw, adjusted: false };
  const normalized: Record<RoleGapCategoryId, number> = { daily: 0, maintain: 0, admin: 0, improve: 0, strategy: 0 };
  for (const id of ROLE_GAP_CATEGORY_IDS) {
    normalized[id] = Math.round((raw[id] / total) * 100);
  }
  return { normalized, adjusted: true };
}

/** ideal - current を分類ごとに算出（どちらかが null の分類は null）。 */
export function computeRoleGapDiff(
  current: RoleGapDistribution | null | undefined,
  ideal: RoleGapDistribution | null | undefined,
): RoleGapDistribution {
  const diff: RoleGapDistribution = { daily: null, maintain: null, admin: null, improve: null, strategy: null };
  for (const id of ROLE_GAP_CATEGORY_IDS) {
    const c = current?.[id];
    const i = ideal?.[id];
    diff[id] = c === null || c === undefined || i === null || i === undefined ? null : i - c;
  }
  return diff;
}

export type RoleGapStatus = 'provisional' | 'confirmed';

/** handler 値が入っていれば confirmed、それ以外は provisional（反映事項B）。 */
export function roleGapStatus(hasHandlerValue: boolean): RoleGapStatus {
  return hasHandlerValue ? 'confirmed' : 'provisional';
}

export interface MaturityRollup {
  overallGap: number | null;
  weakestAreaId: string | null;
  byArea: Record<string, number>;
}

/** 成熟度の領域別スコア（handler 優先、なければ ai）を丸め、理想との差と最弱領域を出す。 */
export function rollupMaturity(
  areas: { areaId: string; aiScore?: number | null; handlerScore?: number | null }[],
): MaturityRollup {
  const byArea: Record<string, number> = {};
  for (const a of areas) {
    const score = a.handlerScore ?? a.aiScore ?? 0;
    byArea[a.areaId] = score;
  }
  const idealGap = byArea['ideal_gap'];
  let weakestAreaId: string | null = null;
  let weakest = Infinity;
  for (const a of MATURITY_AREAS) {
    if (a.id === 'ideal_gap' || a.id === 'kaizen_room') continue;
    const s = byArea[a.id];
    if (s !== undefined && s < weakest) {
      weakest = s;
      weakestAreaId = a.id;
    }
  }
  return { overallGap: idealGap ?? null, weakestAreaId, byArea };
}

export type HandlerFactStatus = 'pending' | 'approved' | 'revised' | 'hold';

export interface FactRowLike {
  handlerStatus: HandlerFactStatus;
  handlerValue?: string | null;
  aiValue?: string | null;
  aiExtractedAt?: string | null;
  handlerAt?: string | null;
}

/** 確定診断値。approved/revised のときのみ値を返し、それ以外は null（= 未確定）。 */
export function finalFactValue(row: FactRowLike): string | null {
  if (row.handlerStatus === 'approved' || row.handlerStatus === 'revised') {
    return row.handlerValue ?? row.aiValue ?? null;
  }
  return null;
}

/** レビュー後にAIが更新したか（UIバッジ用）。 */
export function aiDriftFlag(row: FactRowLike): boolean {
  if (!row.aiExtractedAt || !row.handlerAt) return false;
  return new Date(row.aiExtractedAt).getTime() > new Date(row.handlerAt).getTime();
}

export interface FocusFactSummary {
  focusTotal: number;
  acquired: number;
  unknown: number;
  needsConfirmation: number;
  mustPending: number;
}

/**
 * 重点項目の 取得済み/不明/要確認 集計（反映事項A: 「31項目中○件」ではなくこれをUIに出す）。
 * 取得済み = handler が approved/revised もしくは ai_flag='ok'。
 */
export function focusFactSummary(
  facts: { itemCode: string; aiInFocus: boolean; aiFlag?: string | null; handlerStatus: HandlerFactStatus }[],
): FocusFactSummary {
  const focus = facts.filter((f) => f.aiInFocus);
  let acquired = 0;
  let unknown = 0;
  let needsConfirmation = 0;
  let mustPending = 0;
  for (const f of focus) {
    const done = f.handlerStatus === 'approved' || f.handlerStatus === 'revised' || f.aiFlag === 'ok';
    if (done) acquired += 1;
    else if (f.aiFlag === 'unknown') unknown += 1;
    else needsConfirmation += 1;
    if (MUST_ITEM_CODES.includes(f.itemCode) && f.handlerStatus === 'pending') mustPending += 1;
  }
  return {
    focusTotal: focus.length,
    acquired,
    unknown,
    needsConfirmation,
    mustPending,
  };
}

/** 事前アンケートスナップショットを AI事前ブリーフ入力用のテキストに整形する。 */
export function buildPreBriefContext(snapshot: PreSurveySnapshot): string {
  const lines: string[] = [];
  for (const e of snapshot.entries) {
    const picked = e.selected.map((s) => s.label).join(' / ') || '(未回答)';
    const other = e.otherText ? `（その他: ${e.otherText}）` : '';
    lines.push(`${e.prompt}\n  → ${picked}${other}`);
  }
  if (snapshot.q2Count !== undefined) {
    lines.push(`情シス人数（自己申告）: ${snapshot.q2Count} 名`);
  }
  return lines.join('\n');
}
