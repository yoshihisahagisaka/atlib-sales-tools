# 調査メモ: ISMS診断フォーム流用検討（無料Gap診断ツール）

作成日: 2026-09-03
対象: `無料Gap診断（無料ヒアリング診断）` を `sales-tools` に新設するにあたり、既存の ISMS支援プラン診断フォームをどこまで流用できるかの事前調査。
関連: `無料ヒアリング診断ツール_設計指示書.md`（当初指示書）、`sales-tools/無料Gap診断_ヒアリング設計_商談トーク版.md`（設問の実体・19問）

---

## 1. 結論サマリ

| 論点 | 結論 |
|---|---|
| 流用元 | `sales-tools` の ISMS支援プラン診断フォーム一式。Sensor Edge 前提の有償診断（`assessment-tool`）ではなく、同じ「自己申告フォーム＋自動スコアリング」である ISMS 側に構造が近い |
| 質問・回答データの保持方式 | **コード内定義**（`src/domain/ismsDiagnostic.ts` の定数配列）。DBは回答スナップショットのみ JSONB で保持。→ 新機能も同方式（`src/domain/freeHearingAssessment.ts` を新設） |
| スコアリング方式 | **軸ごとの単純合計 → レンジ判定**。重み付けなし。サーバー側計算。→ 新機能も軸合計を流用し、配点・軸・正規化のみ差し替え |
| レポート出力形式 | 現状 ISMS は **画面表示のHTML + `window.print()`** のみ。PDF/PPTX生成ライブラリ・チャートライブラリは未使用。→ 新機能は `zabbixserver/atlib_monthly_report.html` の pptxgenjs 方式（html2canvas → addImage）を流用して PPTX ダウンロードを追加。`window.print()` も併設 |
| `/api/isms-diagnostic` の認証 | **無認証**（IPレート制限のみ）。→ 見込み客が自分で回答する公開フォーム（パターンB）の受け口設計を直接流用できる |
| デプロイ・ドメイン構成 | Cloud Run サービス `sales-tools` 配下にルート追加するだけ。**新規ドメイン不要・新env var不要・デプロイ手順変更なし**（マイグレーション適用のみ追加） |
| 設問セット | 当初指示書3章の18問ではなく、`無料Gap診断_ヒアリング設計_商談トーク版.md` 3章の **19問（会話フレーズ版）＋接続候補サービスタグ** に差し替え |
| アクセス範囲 | 入力は「公開フォーム（無認証）」＋「管理画面フォーム（スタッフ認証）」の2入口。結果表（結果シート・一覧・詳細）は `/admin/` 配下でスタッフのみ |

---

## 2. ISMS診断フォームの構成（流用元パターン）

### 2.1 ファイル一覧

| 関心事 | ファイル |
|---|---|
| 質問・配点・しきい値・スコア関数・zodスキーマ生成 | `src/domain/ismsDiagnostic.ts` |
| 永続化（生SQL） | `src/services/ismsDiagnosticRepo.ts` |
| DBテーブル | `migrations/001_isms_diagnostic.sql` |
| 公開ルート（無認証） | `src/routes/ismsDiagnostic.ts`（`/api/isms-diagnostic`） |
| 管理ルート（スタッフ認証） | `src/routes/adminIsmsDiagnostic.ts`（`/api/admin/isms-diagnostic`） |
| ルート登録・認証ゲート | `src/server.ts` |
| 公開フォーム画面 | `public/isms-diagnostic.html` |
| 管理一覧画面 | `public/admin/isms-diagnostic.html` |
| 管理詳細＋顧客向けレポート画面 | `public/admin/isms-diagnostic-detail.html` |

### 2.2 認証

- 認証機構は Google Workspace OAuth（Authorization Code + PKCE）のみ。id-token の `hd === 'atlib.jp'` を検証。ロール区分なし（atlib.jp ドメインの全アカウントが同一権限）。セッションは HttpOnly Cookie の JWT（24h）。`src/middleware/staffAuth.ts` / `src/services/staffAuthService.ts` / `src/routes/staffAuth.ts`。
- Basic 認証は 2026-08-25 に廃止済み。
- `server.ts` の `adminAuthGate = [createIpRateLimiter({windowMs: 15min, maxRequests: 300}), requireStaffAuth(staffAuthService)]` を、`/api/admin/*` の各ルートと `/admin` 静的配信の**両方**に適用している。
- gated リクエストでは `req.staffEmail`（middleware が JWT から復元）が使える。
- 公開側 `/api/isms-diagnostic` は **認証ミドルウェアなし**。ルーター内部で `GET /questions`（レート制限なし）と `POST /`（`createIpRateLimiter({windowMs: 1h, maxRequests: 5})`）。
- 公開静的HTML（`public/isms-diagnostic.html` 等）は catch-all の `express.static(public)` で無認証配信。`/admin/*.html` は `adminAuthGate` の後段の `express.static(public/admin)` で配信されるため gated。

| ルート | 認証 |
|---|---|
| `GET /api/isms-diagnostic/questions` | 公開・無制限 |
| `POST /api/isms-diagnostic` | 公開・5回/時/IP |
| `GET /isms-diagnostic.html` | 公開 |
| `GET/PATCH /api/admin/isms-diagnostic*` | Google Workspace 認証 + 300回/15分/IP |
| `GET /admin/isms-diagnostic*.html` | 同上 |

### 2.3 質問項目の保持方法

**DBではなくコード内定数**（`src/domain/ismsDiagnostic.ts`）。
- `QUESTION_SET_VERSION`（文字列。変更時に手動インクリメント）
- `CATEGORIES: Category[]`（採点軸。`scored` 真偽と `thresholds`）
- `QUESTIONS: Question[]`（各設問 `id` / `categoryId` / `prompt` / `type` / `required` / `scored` / `options[]`。選択肢は `value` / `label` / `score?` / `actionHint?`）
- `buildAnswersSchema()` が `QUESTIONS` から zod スキーマを動的生成（設問追加時にルート・スキーマ変更不要）
- 回答は submit 時に「質問文・選択肢ラベル・素点」までスナップショットして JSONB 保存 → 後から `QUESTIONS` を変更しても過去回答が壊れない

### 2.4 スコアリングロジック

`scoreSubmission(rawAnswers)`（`src/domain/ismsDiagnostic.ts`）。ルート（`src/routes/ismsDiagnostic.ts`）からサーバー側で呼ぶ。クライアント申告スコアは信用しない。

- 各選択肢の `score` を **カテゴリ（軸）ごとに単純加算**（重み付けなし）: `categoryScores[categoryId] += option.score`
- カテゴリごとの `thresholds`（`{min, max, planCode, label, ...}`）を走査し `score` がレンジ内のものを推奨として採用
- `profile` カテゴリは `scored: false` で判定に不使用

→ 新機能の「軸ごと合計 → 0〜100正規化 → レーダー表示」は、この軸合計部分をそのまま流用し、レンジ判定の代わりに正規化と各種フラグ算出に差し替える。

### 2.5 レポート／結果表示

- **画面表示のHTMLのみ。** `pptxgenjs` / `pdfkit` / `puppeteer` / `jsPDF` / `pdf-lib` / `exceljs` などは `package.json`・`src`・`public` のいずれにも存在しない。チャートライブラリ（Chart.js 等）も未使用。
- 見込み客には結果を一切返さない（`POST /api/isms-diagnostic` は `204`）。顧客向けレポートは `public/admin/isms-diagnostic-detail.html`（スタッフ認証必須）でクライアントサイド描画。
- 「PDF出力」は `window.print()` + `@media print` + `.no-print` クラスのみ。ボタン1つで印刷ダイアログを開く。
- 通知は `nodemailer`（Google Workspace SMTP）＋ Slack Incoming Webhook。どちらも best-effort、DB行が最終防波堤。

### 2.6 参考: `zabbixserver/atlib_monthly_report.html` の pptxgenjs 実装

- CDN 読み込み: `pptxgenjs@3.12.0`（`cdn.jsdelivr.net/gh/gitbrent/pptxgenjs@3.12.0/dist/pptxgen.bundle.js`）、`html2canvas@1.4.1`、`chart.js@4.4.0`
- `exportToPPTX()` は約48行。**各スライドDOMを `html2canvas` で PNG 化 → `pptx.addSlide().addImage({data, x:0, y:0, w:10, h:5.625})` で全面貼り付け**。`addChart`/`addTable`/`addText` は不使用（pptxgenjs は実質 `.pptx` コンテナのライター）。
- エクスポート前に `<select>` を選択テキストの `<span>` に差し替え、`contenteditable` を外す「export-mode」に入り、`finally` で復元。
- 新機能は結果シート1枚だけなのでスライドループ不要。

---

## 3. データベース

- **PostgreSQL**（Cloud SQL インスタンス `msp-customer-portal-db` 内の新規DB `sales_tools`）。`pgcrypto` / `gen_random_uuid()` / `JSONB` / `TIMESTAMPTZ` / `CHECK (... IN (...))` を使用。
- ランタイムDBアクセスは `pg`（node-postgres）の `Pool` を生SQLで。ORM無し。`src/db/pool.ts` の `createPool()`（本番は Cloud SQL Unix ソケット、ローカルは TCP、`max: 5`）。
- マイグレーション: `migrations/*.sql` を `migrations/runner.ts` がファイル名昇順・トランザクションで適用、`schema_migrations(filename)` に記録。命名は `NNN_snake_case.sql`（3桁連番）。既存は `001_isms_diagnostic.sql` / `002_cost_estimation.sql` / `003_market_research_baseline.sql`。**次番号は `004`**。
- `npm run migrate` = `node --env-file=.env -r ts-node/register migrations/runner.ts`。
- 案件コード（`asmt`＋6桁連番）等の採番の仕組みは `sales-tools` に存在しない。定義元の `IT_アセスメント_SensorEdge流用_設計指示書.md` はこのリポジトリに無い。

---

## 4. デプロイ・ドメイン構成

- ホスティング: Google Cloud Run サービス `sales-tools`（project `msp-zabbix` / region `asia-northeast1`）。`Dockerfile`（node:20-alpine 2段ビルド）必須。CI/CD無し、ローカルから `gcloud run deploy sales-tools --source=.` で手動デプロイ。
- 独自ドメイン: 運用手順書（2026-08-23）は「未割当」だが、コード・`.env.example` は `sales.atlib.jp` を前提（2026-08-25以降）。いずれにせよ **今回の機能追加でドメイン構成の変更は不要**（既存サービス配下にルートを足すだけ）。
- マイグレーションは `msp-frontend-server`（GCE VM）に SSH し、`/opt/atlib-msp-dev/sales-tools` で `git pull && npm run migrate`（同VMの `cloud-sql-proxy` 経由で `sales_tools` DB に到達）。その後 Cloud Run デプロイ。
- 環境変数は「Cloud Run サービス本体」と「`msp-frontend-server` 上の `.env`」の2箇所。`src/config.ts` の `required()` に新値を足すと未設定時に起動失敗する。→ **今回は新しい必須env varを追加しない**（通知を実装しないため）。任意項目も追加しない。

---

## 5. 当初指示書10章「未確定事項」への回答

| 未確定事項 | 回答 |
|---|---|
| レポート出力形式（PDF/PPTX/画面表示） | 画面表示のHTML結果シート ＋ `pptxgenjs`（html2canvas→addImage）による PPTX ダウンロード。`window.print()` も併設。ISMS側にファイル出力機能は無かったため「A案」は非該当、`zabbixserver` 流用の「B案」を採る |
| 質問項目・回答データの保持方式 | コード内定義（`src/domain/freeHearingAssessment.ts`）。ISMS と同方式。回答は JSONB スナップショット |
| `/api/isms-diagnostic` の認証設定 | 無認証（IPレート制限のみ）。→ パターンB（見込み客の自己回答フォーム）の受け口を同方式で新設できる。本件では公開フォーム `/api/free-hearing-assessment` を無認証で追加する |
| デプロイ・ドメイン構成の変化 | 変化なし。`sales.atlib.jp`（＝Cloud Run サービス `sales-tools`）配下にルート追加。新ドメイン・新env var不要。マイグレーション `004` の適用のみ追加 |

---

## 6. 新機能の実装方針（詳細は実装計画に記載）

- `migrations/004_free_hearing_assessments.sql` — `free_hearing_assessments` テーブル新設（公開・スタッフ両入口を1テーブルで受ける。`input_source` で区別）
- `src/domain/freeHearingAssessment.ts` — 商談トーク版19問、3軸（コスト/リスク/属人化）、6サービスタグ、`scoreSubmission()`（軸合計→0-100正規化、`unknownCount`/`visibilityGapFlag`/`securityUrgentFlag`、`suggestedServices` 集計）、`buildSheetComments()`
- `src/services/freeHearingAssessmentRepo.ts` — `ismsDiagnosticRepo.ts` 複製
- `src/routes/freeHearingAssessment.ts` — 公開（無認証・レート制限、`GET /questions` / `POST /` → 204）
- `src/routes/adminFreeHearingAssessment.ts` — 管理（`adminAuthGate` 配下、一覧 / 詳細 / `POST` → 201 / `PATCH /:id/status` / `PATCH /:id/conversion`）
- `src/server.ts` — 上記2ルーターのマウントを**追記のみ**
- `public/free-hearing-assessment.html` — 公開フォーム（`public/isms-diagnostic.html` 複製）
- `public/admin/free-hearing-assessment.html` / `-new.html` / `-detail.html` — 管理一覧・スタッフ入力・結果シート（`public/admin/isms-diagnostic*.html` 複製、結果シートに Chart.js レーダー＋提案候補サービス＋PPTXダウンロードを追加）

### 非破壊

ISMS診断フォーム関連ファイルは一切変更しない。既存ファイルで触るのは `src/server.ts`（ルーターマウントの追記のみ）と、任意で `public/index.html`（公開フォームへの導線リンク1行の追記）のみ。

### TODO（別文書入手待ち）

- `assessment_case_code`（`asmt`＋6桁連番）の書式・採番ルールは、`IT_アセスメント_SensorEdge流用_設計指示書.md` を入手してから突合する。現時点では nullable カラムを用意し手動更新とする。
