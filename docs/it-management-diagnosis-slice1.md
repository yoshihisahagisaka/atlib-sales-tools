# 無料 IT経営診断 Slice 1 実装・検証記録

## 1. Summary

Web申込／営業訪問の代理入力から、DiagnosisCase作成、事前アンケート開始、9問＋任意自由記述、逐次保存・再開、回答完了まで実装した。

`CompleteSurvey`だけがQ01の保存済み回答を出典として`SURVEY_STATED` Futureを生成し、`SURVEY_COMPLETED`へ進める。回答の保存だけではFutureを生成せず、顧客の自己回答をFACT／Insightに変換しない。AI・スコア・成熟度・レーダー・自動サービス提案は新Domainに含まない。

参照基準（2026-09-12にorigin/mainをfetchして確認）：

| Repository | main commit | 扱い |
|---|---|---|
| `git_KAIZEN` | `024360d` | 文書17〜25を指定順に読了。25を実装指示書として適用 |
| `atlib-sales-tools` | `bd60802c85f27ba61e960796e2f4466f6d8ca647` | このmainから`feat/it-management-diagnosis-slice1`を作成 |
| `atlib-corporate-site` | `74dfd604a20925c20103e731302963a44af2fcae` | 現行LPを参照。変更なし |

## 2. Files changed

| 区分 | ファイル |
|---|---|
| Migration（追加のみ） | `migrations/007_it_management_diagnosis.sql` |
| Domain・質問定義 | `src/domain/itManagementDiagnosis.ts` |
| Repository / Application commands | `src/services/itManagementDiagnosisRepo.ts` |
| Public API | `src/routes/itManagementDiagnosis.ts` |
| Admin API | `src/routes/adminItManagementDiagnosis.ts` |
| Logging | `src/middleware/diagnosisLogging.ts` |
| 既存基盤への接続 | `src/server.ts`, `src/services/mailer.ts` |
| Public UI | `public/it-management-diagnosis.html` |
| Admin UI | `public/admin/it-management-diagnosis.html`, `public/admin/it-management-diagnosis-new.html`, `public/admin/it-management-diagnosis-detail.html` |
| 共通UIロジック | `public/js/it-management-diagnosis-survey.js`, `public/js/it-management-diagnosis-admin.js` |
| 追加スタイル | `public/css/it-management-diagnosis.css` |
| 入口リンク | `public/index.html` |
| Golden Tests | `test/itManagementDiagnosis.golden.test.ts` |
| ブラウザー検証 | `test/itManagementDiagnosis.browser.test.ts`, `test/diagnosis.playwright.config.ts` |
| 使い捨てDB / HTTPテスト基盤 | `test/support/diagnosisHarness.ts` |
| 開発依存・実行コマンド | `package.json`, `package-lock.json` |
| 生成物除外 | `.gitignore`, `.gcloudignore` |
| 引継ぎ・検証記録 | 本文書 |

## 3. Existing resource reuse decisions

| 既存資産 | 判断 |
|---|---|
| Express / TypeScript / pg pool / migration runner | 継続使用。別アプリやORMを導入しない |
| `requireStaffAuth` / `StaffAuthService` | 既存Google Workspace認証を再利用。新API・HTMLとも既存Gate内に配置 |
| Staff identity | 既存認証が保持するemailを`owner_user_id` / `entered_by_user_id` / actorに使用。リクエスト本文のスタッフ指定は受理しない |
| IP Rate Limit | 同じfactoryを再利用。公開申込5回/時間/IP、回答操作300回/15分/IP。管理側は既存Gate |
| pino | 構造化アクセスログを継続し、request serializerはmethod / queryを除いたURL / request id / remote addressだけを記録 |
| Mailer / Slack | 完了後の社内通知を再利用。顧客回答・tokenを通知に含めない。commitおよびHTTP応答後のbest effort |
| `public/kaizen-diagnostic.html` | contact form、card、動的質問描画、prefill、error/successの骨格を新ページに再利用 |
| 既存admin一覧・新規・詳細 | table/filter、一覧→概要→代理入力の骨格を再利用 |
| `public/css/style.css`, `public/css/lp.css` | 変更せず再利用。必要なスタイルだけ新CSSへ追加 |
| 旧Diagnosis Domain | 質問定義・zod・repositoryの実装パターンを参考にする。旧評価意味論は参照しない |
| `kaizen_diagnostics` / 旧API / 旧ページ / 旧migration | 変更・削除・データ移行なし |
| LP | 現行入口を維持。後述のhrefだけで段階切替可能 |

### PersistenceとCommandの詳細

- Case作成はOrganization、Case、Participant、RESPONDENT Role、初期遷移、Auditを1トランザクションで保存。同名の会社を自動マージしない。
- 9テーブルを追加。会社名は末尾の敬称を入力境界で除き、DB制約でも末尾`様`を拒否。表示モデルで`様`を付与。
- 質問は文書17・25に基づくversion 1の中央定義。申込トランザクションが`survey_questions`に初回seedを追加し、競合時は既存定義を変更しない。既存CaseはDB上の固定versionを読む。将来の文言変更はversionを追加する。
- `StartSurvey`は回答中なら冪等。`SubmitSurveyResponse`は質問/version/typeを検証してRaw回答のみupsert。空への変更も保存でき、必須回答の有無はCompleteで検証する。
- `CompleteSurvey`は必須回答検証、Future、Case状態、遷移、Auditを1トランザクションで処理する。不足時422＋question codes。完了後の書換え・再完了は409。
- 全Case操作は`SELECT ... FOR UPDATE`で直列化。失効、保存、完了の競合でも認証・状態確認を同一transactionで行う。完了後の回答は変更できない。
- Caseの`completed_at`は診断案件全体の終了日時用として保留。Survey完了日時は`CompleteSurvey`の遷移とFuture作成日時に記録。
- Next Actionは状態から読取時に導出。Assessmentは別fieldで`NOT_PROPOSED`を維持。
- SurveyResponseの複製SourceRecordは作らない。FutureはSurveyResponseのIDを同一Case制約付きで参照する（One source, one record）。

### API

公開prefixは`/api/it-management-diagnosis`、管理prefixは`/api/admin/it-management-diagnosis`。

| Method / suffix | 公開 | 管理 |
|---|---|---|
| `POST /cases` | WEB申込、tokenを一度だけ返す | SALES_VISIT作成 |
| `GET /cases` | なし | 状態/channelでfilter、limit/offsetでページング |
| `GET /cases/:id/overview` | なし | Future / Next Action / 連絡先 / Raw回答 / 遷移 |
| `GET /cases/:id/survey` | 保存回答の読出し | 同じSurveyモデルの読出し |
| `POST /cases/:id/survey/start` | 開始 | 代理開始 |
| `PUT /cases/:id/survey/responses/:questionCode` | 保存 | 代理保存 |
| `POST /cases/:id/survey/complete` | 完了 | 代理完了 |
| `POST /cases/:id/access/revoke` | なし | 顧客token失効 |

申込本文：`{ companyName, contactName, email, phone?, jobTitle? }`。

回答本文：`{ questionVersion: 1, rawValue: string | string[] }`。`TEXT`は文字列、`SINGLE_SELECT`は定義済み文字列、`MULTI_SELECT`は定義済み文字列配列。余分な判定fieldは受理しない。

公開のCase読出し／更新には`Authorization: Bearer <token>`が必要。256-bit乱数、SHA-256 hashのみDB保存、Case単位、30日期限、スタッフ失効可能。再開URLは`/it-management-diagnosis.html#case=<id>&token=<token>`。fragmentはHTTPリクエスト／Refererへ送られない。APIは`Cache-Control: no-store`。新ページは`Referrer-Policy`相当のmetaを設定する。

管理更新は既存staff cookieに加えて`X-Diagnosis-Command: 1`を要求し、cross-siteアクセスを拒否する。公開tokenで管理APIは使用できない。

## 4. Tests and results

2026-09-12、Windows / PowerShellで実施。PowerShellの`npm.ps1`実行制限があるため、同じnpm CLIの`npm.cmd`を使用。

| コマンド | 結果 |
|---|---|
| `npm.cmd install` | 成功 |
| `npm.cmd install --save-dev @electric-sql/pglite @playwright/test` | 成功。テスト専用依存を追加 |
| `npm.cmd run build` | 成功 |
| `npm.cmd run test:kaizen` | 12成功、0失敗、1 skip（既存AIライブテスト：ANTHROPIC_API_KEY未設定） |
| `npm.cmd run test:diagnosis` | 11成功、0失敗 |
| `npm.cmd run test:diagnosis:browser` | 6成功、0失敗（desktop / mobile各3） |
| `git diff --check` | 問題なし |

テストDBはPGlite（WASM PostgreSQL）のメモリーDB。実際のSQL、FK/CHECK、transaction、PL/pgSQL triggerを実行する。既存005を適用して旧データを挿入した後に新007を適用し、旧データ保持と旧APIの新規保存を検証した。

Golden Testsは自己申告／「分からない」の正常保存、部分再開、Q01変更、Q06不足422、SURVEY_COMPLETED／SURVEY_STATED、会社名表示、冪等開始、不正・他Case・失効・期限切れtoken、actor分離、旧API互換、新APIに評価fieldがないことを含む。追加で失敗時rollback、二重完了、質問version/type、自由記述原文、ログ秘匿、Rate Limitを検証。

ブラウザー検証は通信を中断して未保存入力を保持→再保存、別タブ再開、同一タブの再開リンク変更、必須guard、完了後reload、営業代理入力、一覧／概要、失効UI、自由記述のXSS防止まで含む。

## 5. Manual verification

ローカルの使い捨てDB＋実際のHTTP/router/認証middleware＋Chromiumで上記導線を操作した。操作はPlaywrightで再現可能にし、生成したdesktop概要・mobile完了画面を画像でも確認した。本番顧客・実Google OAuthへのログイン・実メール／Slack送信は実施していない。

デプロイ後の確認手順：

1. `/it-management-diagnosis.html`で会社名／担当者／メールを入力して申込。
2. `ABC株式会社様`、提供会社`atLIB株式会社`、Future Firstの9問＋自由記述を確認。
3. 2〜3問に回答し、保存済み表示後に再開リンクを別タブで開く。保存済み回答が戻ることを確認。
4. Q01を変更。管理概要のFutureはまだ作られないことを確認。
5. Q06未回答のまま完了し、必須項目エラーを確認。「分からない」を選んで完了する。
6. `/admin/it-management-diagnosis.html`に既存Google Workspace認証でログイン。状態、Next Action、Future、Survey、Assessmentを確認。
7. 一覧の「営業訪問の代理入力」から同じ回答フローを完了し、`SALES_VISIT`とログイン担当者の記録を確認。
8. 別のWEB Caseの管理概要でリンクを失効し、顧客リンクで読出し／更新できなくなることを確認。

## 6. Remaining issues / rollout

- ローカルSlice 1検証は完了。本番DBへのmigration、Cloud Runへのデプロイ、実Google OAuth・SMTP・Slackの疎通、実顧客確認は未実施。
- Docker daemonが動作していないため、通常のPostgreSQLサーバーへのネットワーク接続と複数DBセッションでの同時実行は未検証。PGliteではSQL transactionとrollbackを実行済みだが、テストadapterは1接続を直列化する。
- ブラウザー未導入の端末では`npx playwright install chromium`後にブラウザーテストを実行する。
- 既存migration runnerを使い、まず対象環境に007を適用してから新ルートを公開する。既存のデプロイ手順書も参照。旧tableの削除や旧migrationの編集は不要。
- 通知はbest effortで再送queueを持たない。通知が失敗しても管理一覧から完了案件を確認できる。
- 期限切れ／失効したリンクの再発行はSlice 1に含めない。既存staff認証で代理入力を継続できる。

### LP切替に必要な具体的変更（未適用）

確認した最新LPの`public/joshisu-kaizen/index.html:1088`は、旧request-linkではなく`kaizen-assessment-intake.html`への直接リンクになっている。

新フォームの環境検証後、`.js-intake-cta`のhrefだけを以下へ変更すれば新申込へ移行できる。

```text
before: https://sales.atlib.jp/kaizen-assessment-intake.html
after:  https://sales.atlib.jp/it-management-diagnosis.html
```

既存クリック計測はそのまま利用できる。LPのBusiness message・価格は変更しない。新画面からAPIへの通信はsales.atlib.jp内なのでCORS追加は不要。旧request-link APIと旧メール配信リンクは現在の動作を維持する。

## 7. Canonical deviations

None.

質問の具体的な選択肢をversion付きseedとして作ること、認証済みemailをstaff principalとして再利用すること、Next Actionの導出、新ページ・新namespace、token期限30日、SourceRecordへの回答複製を避けることは、文書23〜25の許容範囲での実装判断。
