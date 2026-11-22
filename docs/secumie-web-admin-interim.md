# SECU:MIE Web｜管理画面（暫定運用・DB接続待ち）

## 2026-11-22 本番WSCのスタッフ手動UAT受入（現行）

- ユーザーが**現行本番 `https://sales.atlib.jp/admin/web-security-check.html`** にGoogle Workspaceでログインし、自社URL `https://www.atlib.jp/` を診断してPDFを作成する一連の操作について、「上記動作確認問題なし」と報告した。現行100% Revisionは `sales-tools-bks-20261122040419`、imageは `sha256:d132d93c5ffcc998633f10caaec397722422d4389322bccca8b5949397b7560e`。**このスタッフ操作の実運用受入をPASS（ユーザー目視報告）**として記録する。
- この受入は本番の**既存WSC機能**についてのみ有効。今回の確認は新しい`/admin/secumie-web.html`（PR #51、未公開）の実スタッフ認証、申込DBの自動一覧、コーポレート側PR #75の署名付き転記、提出済み監査、新候補イメージの安全性を検証したものではない。また、LP申込・顧客メール送付を再実施したという主張をしない。
- **次の最小read-only Gate**：Google Cloud公式の`Cloud SQL Studio`が権限・DB認証条件を満たすなら、新しいJob/踏み台/公開IPを作らず、既存 `msp-zabbix:asia-northeast1:secumie-sg-shared-staging-db` のデータベース `postgres` に接続し、`design/secumie-web/staging-catalog-readonly.sql`（SELECT 5件のみ）を実行する。Studioを使えない場合、DB権限・APIを勝手に拡張せずSTOPし、既存承認済みPrivate接続経路を再確認する。
- パスワード・Secret値・顧客レコード・SQLのクエリ本文／接続先情報に含まれる機密値をGit、ログ、チャットへ出力しない。共有可能な証跡はDB名・role名・接続数のメタデータのみ。DB schema/user/Secret・Job/Traffic・DNSの書き込みは未承認。Web専用DBが未作成のため内部スキーマMigration台帳照合は**作成後Gate**であり、現時点で存在したと主張しない。
- **PR #51 Draft／SECURITY_NO_GO／Production No-Go継続**。本番WSC動作PASSはWeb新画面の公開承認ではない。


## 2026-11-22 本番BKSイメージの来歴照合（現行）

- 現行100% Cloud Run Revision `sales-tools-bks-20261122040419` のイメージは `asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/sales-tools@sha256:d132d93c5ffcc998633f10caaec397722422d4389322bccca8b5949397b7560e`。ユーザーが `gcloud run revisions describe`（read-only）で確認した。
- 既存の業務KAIZEN公開ログ `20261122-040846` では Cloud Build ID `71c1edea-14c6-4483-8524-82342eaf4cce` が、直前の本番候補image `sha256:61393fcc9f47b429f69de72186a508743f17b6d2bcd31e451d7f065257b10a7c` を `FROM` として、3コンパイル済みJS（`dist/config.js`、`dist/services/mailer.js`、`dist/routes/businessWebConsultationLead.js`）と管理HTML2ファイルだけを重ねて新digestを作成している。Git差分のlabelは `jp.atlib.business-kaizen-sales-head=70d154d22657923ae99860bedfdeb7bb917d9815`。
- `70d154d...` は業務KAIZEN差分のGit HEADであり、既存Imageのすべての機能・Migrationを表す**単一のProduction source HEADではない**。このイメージは継承された実行成果物を含むため、PR #51のbase `main 850e1f0...` からの単純な再ビルド・replace・mergeで同等性を主張してはならない。
- 業務KAIZEN公開受入では、移行元の画像とSMTP設定を固定し、既存コンテンツ維持・業務KAIZENの表示名と送信者 `system@atlib.jp` の差分を確認した。ただし、公開ログ中の既存コンテンツ保持GateがPASSでも、現在のWSCスタッフ認証画面・診断PDFの実ブラウザ操作は別に検証する。
- **PR #51の公開順序**：まず本番の認証済みWSC /admin/web-security-check.html で画面と診断機能が継続稼働していることを確認する。次に現行Production Image digest／実配備機能／DB ledger／別レーンPRの差分を合わせて統合候補を確定。新候補はtraffic 0のタグ付き受入から開始する。新DB・Secret・Migration・本番Traffic・PR mergeはいずれも別承認／No-Goのまま。
- この調査はread-onlyの既存証跡・Git照合のみであり、実GCP、Cloud Run、DB、DNS、Secrets、Productionは変更していない。SECU:MIE WEBの管理画面を公開完了と宣言しない。


## 2026-11-22 実GCP Inventory受領・共有Cloud SQL Canonical照合（現行）

この節は2026-11-22にユーザーがWindows PowerShellから採取した**実GCP読み取り専用の結果**であり、古い2026-11-22午前の配信revision記録より優先する。GCP設定変更・SQL接続・Migrationは行っていない。

- Project `msp-zabbix`／Region `asia-northeast1` のProduction `sales-tools`は**`sales-tools-bks-20261122040419`へ100%配信**（`latestReadyRevisionName`も同一）。旧`sales-tools-wsc-release`はタグ付きrevisionとして残るが**100%配信ではない**。本件によるTraffic戻しは禁止。現在の100% revisionに既存WSC管理画面/APIが含まれるかは追加確認が必要。
- Staging `sales-tools-staging`の100%配信先は`sales-tools-staging-p228`で変更なし。Stagingの既存配信先も変更しない。
- 共有Cloud SQL `secumie-sg-shared-staging-db`は`RUNNABLE`／`POSTGRES_16`、Private IP `172.20.0.3`のみ、backup/PITR/deletion protection有効。
- Cloud SQL Admin API DB一覧は`postgres`、`secumie_insight_staging`、`secure_guard_staging`の3件。Web専用`secumie_web_staging`は**未作成**。ユーザー一覧は既存Insight 5＋Secure Guard 3＋postgresで、Web専用3 roleは**未作成**（ただしPostgreSQL `pg_roles`内部確認は未実施）。
- 共有Cloud SQL Canonical（PR #46／`docs/secumie-shared-staging-db-bootstrap-approval-20261106.md` §19.23）では、**2026-11-18経営者承認で既存Cloud SQL／既存Insight・Secure Guard資産の保全期限を2026-12-04 10:12:12 JSTに延長**。追加費用運用上限75 USDは旧75 USDとは別枠。**Web用新規database、role、Secret、Migration、Jobの追加作成はこの保全承認に含まれない**。費用実績はUNKNOWN、適用前の費用・承認を別Gateとする。
- Web DB内部のread-only次Gate用に`design/secumie-web/staging-catalog-readonly.sql`（5件のSELECTだけ）を追加した。既存承認済みのPrivate接続を`postgres`へ行える場合だけ実行する。接続先context、`pg_database`のDB/owner/ACL、`pg_roles`のWeb候補不在、`pg_stat_activity`の接続数、PG16の上限/予約枠を取得。申込・個人情報・Secretは照会しない。SQL未実行のため内部カタログ結果は**UNKNOWN**。
- 最小構築方針：共有instanceにWeb専用DB（migration owner、runtime、adminは別role）、既存`runMigrations`とWeb固有の単一番号付きDDL、既存GRANT SQLを利用。Cloud SQL/Secret/SA/Job/Productionへの書込み、番号付き正式Migrationへの昇格は**別途承認・実行Gate**。適用後に署名付きメール連携と実Google Workspace受入、イメージ安全判定を行う。今はPR #51 Draft／SECURITY_NO_GO／Production No-Goを維持。


## 2026-11-22 Windowsからの実Staging read-only preflight と Migration Fit/Gap

- `scripts/secumie-web-staging-readonly.ps1`を追加。Windows PowerShell 5.1+と既存`gcloud.cmd`を利用する。Cloud Run既存2サービスの100% traffic、共有Staging Cloud SQLのRUNNABLE/PG16/backup/PITR/deletion protection/public IP、既存DB名・Web専用DB/user名を**読み取り専用**で点検する。Secret値、DB内の企業情報、ログインパスワードを取得・表示しない。
- WindowsでリポジトリのPR #51ブランチ最新版を取得した後、`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\secumie-web-staging-readonly.ps1 -DryRun`で操作範囲を確認し、同じコマンドの`-DryRun`を外して実クラウドのメタデータ確認を行う。現場実行はまだ未実施。CIでは`pwsh -NoProfile -File scripts/secumie-web-staging-readonly.ps1 -DryRun`を実行する。
- Cloud SQL APIのusers一覧はDB内部の`pg_roles`、DB owner、ACL、`schema_migrations`台帳を完全には証明しない。これらは既存の承認済みプライベート接続経路を使う別の**SELECTのみ**の受入が必要であり、現工程では実施していない。
- **Migration方式の実Fit/Gap**：既存`src/db/migrate.ts`のrunnerが自動実行する対象ファイル名は`/^\\d+_[a-z0-9_]+\\.sql$/`に一致するSQLのみ。現行`design/secumie-web/assembly-intake.draft.sql`と`staging-role-grants.draft.sql`はどちらも非該当。そのため`MIGRATIONS_DIR=design/secumie-web`を指定するだけでは**0件適用でも正常終了するおそれがあり禁止**。Sales Toolsの通常`migrations/`（001〜036等）をWeb専用DBに指定することも禁止。
- Web用の承認済みDDLファイル番号・SHA-256・台帳位置・schema owner・別role/Secret・対象DB確認を固定し、既存の`runMigrations`を**Web専用のファイルだけに制限した実行経路**で利用する方針。新runner、新CRM、Insight/SGの既存DB変更はしない。現在のDraft SQLをそのままStagingへ適用しない。
- **合成DBでの既存runner受入（Run `45024012140` SUCCESS）**：`test/secumieWebAdminDb.acceptance.cjs`は使い捨てPostgreSQL16に独立migration login roleとowner databaseを用意し、既存のDraft DDLを一時ディレクトリの番号付きSQL **1ファイルのみ**へコピーして`runMigrations`を実行。Web DB内の`schema_migrations`に1件だけ記録され、同じrunner再実行でも重複しないことを検証。さらに既存GRANT SQL、署名付き転記、一覧、監査、別roleのWeb DB接続拒否も確認した。Webテスト10 PASS/0 FAIL/0 SKIP、KAIZEN 12 PASS/1 SKIP、Business Web 5 PASS。Chromium Run `45024012149` 4 PASS、境界 Run `45024012165` 7+9 PASS。**この番号付きSQLはCI一時生成物であり、リポジトリの正式Migration artifactではない**。正式SHA・所有者・実行権限・Staging承認・実Cloud SQL接続は未完了。
- 新管理画面の機能CIと実Cloud SQL確認は別Gate。PR #51 Draft、`SECURITY_NO_GO`、既存LPメール正本および既存WSCの本番継続を維持する。


## 2026-11-22 Staging DB 接続準備：現行の差分と実行境界

この節は最新のStaging準備状況。**SQLはDraftのまま、実共有Cloud SQLのdatabase/role/Secret/Migration/Cloud Runは変更していない。**

- PostgreSQLでは新規DBへPUBLIC CONNECT/TEMPORARYが標準付与され得るため、`design/secumie-web/staging-role-grants.draft.sql`で対象`secumie_web_staging`に限りそれらをREVOKEし、Webのruntime/admin roleのみにCONNECTを明示GRANTする。既存Insight・Secure Guard DBの権限は触らない。
- 既存の合成PostgreSQL16受入`test/secumieWebAdminDb.acceptance.cjs`で、同じWeb専用GRANT SQLを適用した後、**無関係なログインロールのWeb DB接続拒否**、Web runtime/adminの必要操作成功、公開runtimeのUPDATE拒否、adminのDELETE拒否を確認する。実Cloud SQLでの接続可否・所有者は未確認。
- `scripts/secumie-web-admin-preflight.sh`はread-onlyでGit HEAD、既存Cloud Runトラフィック、共有Staging Cloud SQLのRUNNABLE/PG16/backup/PITR/deletion protection、SQL Admin API上のDB/user一覧を照合する。Web専用DB/userが既存なら停止する。**Cloud SQL Admin APIのusers一覧だけでPostgreSQL `pg_roles` やACLの不在は証明できない**ため、実際のbootstrap前にはDBカタログで最終照合が必要。
- PR #51は、既存のWSCと管理画面を一体にする最小Slice。PR #50のOTP/組合公開Runtimeを取り込まない。公開LPはコーポレート側Draft PR #75のメール正本を維持し、SMTP成功時のみ署名付きで任意転記する。実Staging接続後に疑似申込・送信失敗時フォールバック・一覧/提出状態・実スタッフ認証を検証する。
- PR #51はZod v4移行に伴う`zod/v3`互換importも含むため、既存KAIZENおよびBusiness WebのGolden TestをWebのCIで追加実行する。前回実測（Run `45022193086`）：KAIZEN 12 PASS/1 SKIP、Business Web 5 PASS、Web DB/画面 10 PASS、0 FAIL。ブラウザ（Run `45022192995`）4 PASS、境界契約（Run `45022193002`）7+9 PASS、0 FAIL。以後のHEADは最新CIで別途確認する。
- 共有Cloud SQL Canonicalでは、インスタンス共有・database/role/Secret/Migration台帳の分離が固定されており、**SECU:MIE WebのDB境界とMigration実行は別途承認条件**。本PRのDraft SQLを無承認で適用しない。適用前に所有者、DDL台帳、権限、復旧、実接続数、費用・実行者・明示承認を確認する。
- コンテナ候補の未解決CVE HIGH16/UNKNOWN14（例外承認0）は別Gateであり、**SECURITY_NO_GO、Draft、Production No-Goは変更なし**。CIの合格だけで公開判断を変えない。


## 2026-11-22 最小管理ページの独立組立

**この節を2026-11-22の最新実装状態とする。下記の過去の「PR #50だけが一覧APIを持つ」という記録は当時の履歴。**

- **PR #51単独で**既存UI `/admin/secumie-web.html`、既存WSC診断/PDF、スタッフ認証済み`GET /api/admin/secumie-web/v1/requests`、`PATCH /requests/:id/status`、署名付き`POST /api/internal/secumie-web/v1/temporary-intakes`を揃えた。実装はPR #50から必要な既存サービス・ルートだけを再利用。PR #50のOTP/PIRA RuntimeやCloud SQL全体をマージしない。
- 申込一覧はWeb専用DBを設定した場合のみ接続。未設定なら既存WSCの手動PDF診断を維持。受付と履歴は既存Web draft SQL・最小権限GRANT SQLに従い、暫定LPのデータは`information_sharing_enabled=false`に固定。
- 既存`www.atlib.jp/secumie-web/`は**メール受付を正本として維持**。`atlib-corporate-site` [Draft PR #75](https://github.com/yoshihisahagisaka/atlib-corporate-site/pull/75)から、TurnstileとSMTP成功後に署名付きでこの管理APIへ任意転記。転記失敗時も現行受付メールは維持。現行のメール申込をバックフィルしたとは扱わない。
- GitHub Actions `44984228711`：既存画面契約7件、合成PostgreSQL16による申込→一覧→ステータス・監査・非共有・最小権限を含め**8件PASS／0 FAIL／0 SKIP**。リリース境界CI `44984228743`もSUCCESS。企業データやCloud SQLへアクセスしていない。
- **Draft/Production No-Go継続**。Web専用Staging DB・roles・Migration適用は未承認/未実施。新イメージの脆弱性HIGH16/UNKNOWN14の判定も未解除。画面は未公開。公開前には承認済みStaging実機検証・最新イメージスキャンとCVE Gate・顧客情報の復旧導線を確認する。


2026-11-19 時点の公開受付と、スタッフの診断・レポート作成業務を接続するための実装仕様。

## 実機受入 Gate：自社テスト申込1件だけ（未完了）

**対象：いま稼働しているメール受付と本番WSC。PR #50／#51を新規デプロイして検証するのではない。**

1. 自社で受信できるテスト用メールアドレスから既存公開LP `https://www.atlib.jp/secumie-web/` に申し込み、対象会社・URLは自社のものだけにする（`https://www.atlib.jp/` など、会社が管理するHTTPS URL）。外部の実顧客を使わない。受付確認画面の文言を確認。
2. `contact@atlib.jp` 側の**着信**を確認する。会社名・HTTPS URL・連絡先・同意情報が申し込みと一致すること。未着や重複時はこのGateをFAILとし、既存メール受付導線の原因を調査する。
3. **本番で利用可能な既存管理画面** `https://sales.atlib.jp/admin/web-security-check.html` をGoogle Workspaceスタッフ認証で開く。出力先を選び、受付メールの会社名・URLを転記して、診断してPDF保存する。新しい `/admin/secumie-web.html` はDraft/未公開のため使用しない。
4. **PDFの目視点検**：会社名・対象URL・診断日時・見出し・判定根拠の表現・日本語・改ページを確認。WSC VS1 HTMLの`review-banner`は`@media print`で非表示指定だが、実際の**PDFに「内部デザインレビュー用｜対外配布不可」が載っていない**ことを必ず確認。載っていた場合は送付せずFAIL。
5. PDFを社内のテスト用宛先にのみ通常メールで送付し、**到着と添付ファイルの正常表示**を確認する。公開フォームや管理画面による自動送信ではない。
6. 受入記録には **申込受付 PASS/FAIL、受付メール PASS/FAIL、既存スタッフログイン PASS/FAIL、WSC PDF生成 PASS/FAIL、PDF対外向け表記 PASS/FAIL、テスト送付到着 PASS/FAIL** と事実だけ記録する。顧客PII・PDF本体・OTP・SecretをGitHubに保存しない。

**現状：未実施／完了宣言不可。** GitHub Actionsの契約テスト14 PASSは、この1件の運用E2Eやメール配送のPASSを意味しない。上記GateがPASSしても、別PRのWeb専用DB/OTP・新管理画面のProduction No-Goを自動解除しない。

## 2026-11-22 既存管理一覧の流用確認（再実装しない）

- `main`の既存管理一覧は `public/admin/it-management-diagnosis.html`（申込一覧/ステータス/ページング）、`public/admin/kaizen-diagnostic.html`（絞り込み/一覧）、`public/admin/business-web-consultation-leads.html`（申込と対応状況）、`public/admin/infravision-partner-leads.html`（受付一覧と状態更新）。認証は `src/server.ts` の共通スタッフゲート、表示基盤は `public/css/style.css`。
- 本PRの `public/admin/secumie-web.html`／`secumie-web.js` は**既存共通CSS、スタッフ認証、一覧取得・絞り込み・ステータス更新の既存パターンを既に使用**。新しい一覧共通コンポーネント、CRM、検索基盤を追加しない。
- PR #50に `src/routes/adminSecumieWeb.ts` と `src/secumieWeb/assemblyAdminService.ts` があり、画面が期待する `GET /api/admin/secumie-web/v1/requests`（`{items}`）、`PATCH /requests/:id/status` の契約は一致。管理レスポンスの`Cache-Control: no-store`もIT経営KAIZENの既存パターンに合わせて追加し、既存テストに一覧契約を1件追加（PR #50）。
- **実データ連携は未完了**。現行 `www.atlib.jp/secumie-web/` はメール受付であり、PR #50のWeb受付専用DBは未作成・未承認。Business Web/KAIZENの業務DBへSECU:MIEの申込を書き込んで流用したことにしない。DB/保存契約はWeb側固有、共通化するのはUIとAPIの実装パターンまで。
- PR #50は他のOTP/Cloud SQL準備を含む積み重ねDraft。**全体マージせず必要箇所のFit/Gapで扱う**。当面は既存のメール原本→本番WSC PDF→手動送付を止めない。将来の自動一覧化と送付履歴は、正式受付の保存先が決まってから既存APIに接続する。

## 2026-11-22 既存テスト再実行と公開範囲

- 既存CIのGitHub Actions Run `44967626473`、Job `137040127454`：**SUCCESS**。スタッフ画面の既存機能契約 `test/secumieWebAdmin.contract.test.cjs` **7 PASS/0 FAIL/0 SKIP**、認証・CVEリリース境界 `test/secumieWebAdmin.releaseBoundary.contract.test.cjs` **7 PASS/0 FAIL/0 SKIP**、画面JavaScript構文チェック PASS、PowerShell DryRun PASS。
- 追加変更は既存CIへの既存テスト呼出しのみ。WSC VS1、公開LP、メール送信、Cloud Run、DB、認証機構のコードは変更しない。
- 2026-11-18採用済みの外部受付方針：**受付URL単位**で団体選択の有無と結果提供方式（即時提供／当社提出）を独立設定する。**先行する団体向けは、組合選択・当社提出（画面即時結果なし）・同意必須・外部CSVなし**。モード設定・URL発行機能が今回の暫定版ですでに動いているとは扱わない。国連協向け先行版の仕様を勝手に一般向けへ変更しない。
- **運用の最終受入は未完了**：既存LPでの実申込→`contact@atlib.jp`着信→Google Workspaceの実スタッフログイン→既存WSCで診断・PDF保存→内容確認・別途メール提出を、テスト用の自社申込1件で確認する必要がある。
- PR #50（Web専用DB・OTP受付）とPR #51（追加スタッフUI）はDraft/Production No-Goのまま。実環境受入未完了・残存CVEがある限り、新イメージの公開やマイグレーションをしない。

## 2026-11-22 実環境Read-only照合と最短提供経路

Windows PowerShellから`gcloud.cmd run services describe`の`status.traffic`、`gcloud.cmd sql databases list`、DNSを参照した実測。変更操作なし。

- **本番100%の実トラフィック先**：`sales-tools-wsc-release`（タグ `wsc-release-850e1f0`）。`latestReadyRevisionName=sales-tools-bwc-cb-20261121072726`は最新Readyを示すだけで、100%配信先ではない。既存のスタッフ用WSC `/admin/web-security-check.html` を使い続ける。
- **Staging 100%**：`sales-tools-staging-p228`。無断切り替え禁止。
- 共有Cloud SQLは既に稼働している。Staging `secumie-sg-shared-staging-db` のdatabaseは`postgres`、`secumie_insight_staging`、`secure_guard_staging`。本番 `secumie-sg-shared-prod-db` は`postgres`、`secumie_insight`。**Web受付専用databaseは未作成**。インスタンスが存在することとWeb固有migration/roleが承認・適用済みであることは同義ではない。
- `web.atlib.jp` は現時点のDNS照会で名前がない。**新ドメインを先行作成しない**。公開済み `www.atlib.jp/secumie-web/` の既存受付導線を維持。
- **今回の最小運用**：公開LPの申込メールを原本とする → スタッフが現行WSCで会社名・HTTPS URLを入力してPDF生成 → PDFを目視確認して申込者へ送付。これだけで既存資産による後送レポート運用を継続できる。メールからの自動案件登録・自動診断・自動送信・永続的な提出履歴はこの時点では未実装であり、完了と表示しない。
- **PR #50**はWeb専用受付DB、組合向けOTPと申込一覧・状態APIのDraft。現状のメール受付を維持した最短提供にDB migration/独立Cloud Run/新DNSは不要。無断マージ、Web DB新設、共有DBでの代替テーブル作成は行わない。
- **PR #51**はスタッフ用の追加UIのDraftであり、新UIをリリースするために既存WSCの継続運用を止めない。管理画面をCRM化しない。
- 完成の残りは**外部企業からの申込と結果提供の実運用確認**、および自動化が既定仕様として必要な部分の最小接続だけ。新たな診断エンジン・独立管理基盤を作らない。

## 2026-11-20 管理画面の暫定運用／コンテナ安全性判定

**業務継続のための即時運用（新イメージの公開を待たない）**

- 既存のスタッフ認証付き WSC 管理画面 `/admin/web-security-check.html` を利用する。公開中 `sales-tools` の100% revision は検証時点で `sales-tools-wsc-release`。すでにある機能で対象企業名・HTTPS URLからPDFを生成できる（実顧客データのUAT完了とは区別）。
- 現行 `www.atlib.jp/secumie-web/` の受付メールを原本として担当者が企業名・URLを入力し、PDFを点検した後に送信する。**メール→申込一覧の自動転記、PDFの自動送信、対応履歴の自動記録はまだ存在しない**。
- 新UI `/admin/secumie-web.html` はDraft PR #51の実装であり、現在の本番サービスに存在するとは案内しない。PR #50の専用DBやMigrationもNo-Goのまま。

**コンテナ検証結果の記録**

- PR #51候補: Git `cf722c0e22b736c5147128ddadadccfd435be284`、Artifact Registry `sha256:8515c9eb747effb1e988cde5c4b1c43defd0f86de5746ad616351ff4eb801466`。
- TypeScript・回帰テスト・npm audit HIGH/CRITICALは合格。npmのMODERATE 6件は未解消として継続管理。
- コンテナオンデマンドスキャン：CRITICAL 0 / HIGH 17 / UNKNOWN 16（重要度その他230）。33件すべて`fixedVersion`が未提供。対象は `krb5`, `glibc`, `openssl`, `expat`, `cups`, `xorg-server`, `acl` 等のOSライブラリ／ブラウザ依存。
- `fixedVersion`未提供は「無害」も「修正不要」も意味しない。全重要度を混ぜてパッケージごとの件数を数えた過去の一覧は、HIGH件数の根拠として使わない。
- **判定：新イメージの本番昇格No-Go**。脆弱性が解消したと宣言しない。本番・StagingのCloud Runトラフィック、専用DB、公開受付サイトはこの作業で変更なし。
- 次の技術検証候補は、PDF描画に使う `chromium.launch({headless:true})` を維持したまま Playwright の `--only-shell` で不要なフルChromiumを省く最小構成。ただしOS依存すべてが消えるとは限らない。画像再ビルド前に依存差分を確認し、実PDF/UATとスキャン双方で判断する。

**重要な切り分け**：既存WSCによる暫定の申込処理と、PR #51の新UIリリース／基盤脆弱性是正は別工程として管理する。後者を理由に前者を止めない。

## 2026-11-20 ヘッドレス専用ブラウザの縮小候補（Draft）

- WSC `src/services/wscSalesService.ts` と既存レポート `src/services/freeDiagnosisDesignV2ReportPdf.ts` は、いずれも `chromium.launch({headless:true})` を使用し、`channel` を指定していない。この利用方法はPlaywrightのChromium headless shellと整合する。
- `Dockerfile` のRuntimeで、`playwright install --with-deps chromium` を **`playwright install --with-deps --only-shell chromium`** に限定した。Node／DB／アプリAPI／WSC評価ロジックは変更しない。
- `scripts/secumie-admin-image-gate.sh` は確定Git SHAからイメージをビルドし、最終Runtimeイメージをネットワークなし・非rootのまま起動して合成日本語HTMLからPDF（`%PDF-`）が生成できることをテストする。その後、同じ不変digestに対してオンデマンドの脆弱性スキャンを行う。
- **HEADLESS最小化だけでOS CVEが0になるとは保証しない。** HIGH/CRITICAL/UNKNOWN残存時は引き続き`SECURITY_NO_GO`。ブラウザ実機テスト、実サービスのスタッフ認証／既存WSC PDF UAT、および本番リリース判定は別Gate。
- 既存の `sales-tools` Production 100%、`sales-tools-staging` Staging 100%、SECU:MIE Webの専用DB／Migrationに変更を与えない。管理画面はDraft PR #51のまま。

## 2026-11-21 イメージ削減結果とブラウザ受入ゲート

- ヘッドレス専用候補イメージ：`sha256:810d3ddcf97cd009cdf73de77dfff008cd281d234ff49f9ae39a4dfdf86a384e`、Git `808e99e275b73fbd25fb795b26115df144c78e1e`。
- Cloud Build **PASS**、ネットワークなし・非rootコンテナでの合成日本語PDF生成 **`PDF_SMOKE_PASS`**。
- オンデマンドスキャン：CRITICAL 0、HIGH 17、UNKNOWN 16、OTHER 230。旧候補とHIGH/UNKNOWN件数は**変化なし**。本番リリースは **SECURITY_NO_GO**。
- PlaywrightのブラウザテストにあったフルChromiumの`executablePath()`強制指定を削除。ヘッドレスシェルの通常自動選択を利用。`REQUIRE_BROWSER=1`ではブラウザ起動失敗をSKIPせず失敗として扱う。
- 再ビルドせず、既存イメージに最新のテストファイルだけを読み取り専用でマウントして`bash scripts/secumie-admin-browser-acceptance.sh`を実行できるようにした。対象：デスクトップPDFダウンロード、モバイル表示、仮API一覧・操作、未送付時の提出確定防止。APIはすべてローカルモック、顧客PII・外部通信・DBなし。
- **2026-11-21 受入証跡：`bash scripts/secumie-admin-browser-acceptance.sh` 実施結果 `tests 4 / pass 4 / fail 0 / skipped 0`**。イメージ `sha256:810d3ddcf97cd009cdf73de77dfff008cd281d234ff49f9ae39a4dfdf86a384e` の非ネットワークコンテナに、最新のブラウザテストのみ読み取り専用マウント。デスクトップPDFダウンロード・モバイル表示・モック受付一覧/状態更新・提出済み取消確認の4件PASS。**ブラウザUI受入のみPASS**、本物の認証・実WSC診断API・DB接続のE2Eとは区別する。
- このブラウザテストがPASSしても、スタッフ認証と実WSC PDF出力のStaging E2E、脆弱性No-Goは解除されない。既存のWSC運用による手作業のPDF提出は継続可能。

## 2026-11-21 本番へ出さずに実HTTPとPDFを検証する追加Gate

- UIについては、実Chromium + モックAPIのブラウザ受入4件PASS／SKIP 0を確認済み。
- **HTTP Gate PASS（2026-11-21実測）**：`bash scripts/secumie-admin-offline-http-acceptance.sh`で **6 PASS / 0 FAIL / 0 SKIP**。既存の確定イメージ`sha256:810d3ddcf97cd009cdf73de77dfff008cd281d234ff49f9ae39a4dfdf86a384e`を使用。別途ビルド・脆弱性スキャン・Cloud Runデプロイは行わず、ローカルHTTPで実Express認証ミドルウェアと実PDF生成を確認。
- 6つの結合検証：無認証管理HTML/JSのリダイレクト、無認証WSC APIの401、合成スタッフJWTによる保護画面の取得、実WSC評価エンジンとChromiumによる実PDFのHTTP応答、HTTP対象URLの拒否、不正入力の拒否。
- 実PDFテストは外部ネットワークを切断し、合成済みのWeb/DNS証拠とテスト用DNS・ネットワークトランスポートのみを使用する。秘密情報・顧客PII・実DB・実SMTP・実Googleログインにはアクセスしない。
- これは**認証ミドルウェアおよびWSC HTTP経路のオフライン結合検証**であって、Google Workspace OAuthの本番ログイン試験ではない。公開Stagingへのデプロイや新コンテナの本番昇格を許可するものでもない。
- CRITICAL 0／HIGH 17／UNKNOWN 16の新イメージは引き続き **SECURITY_NO_GO**。既存WSC運用は継続する。

## 役割と設置先

- スタッフ側: Sales Tools の `/admin/secumie-web.html`。既存 `requireStaffAuth` とIPレート制限の内側にある `/admin` static 配信を再利用する。新しい公開APIや認証方式は追加しない。
- 診断・PDF: 既存 `POST /api/admin/web-security-check/diagnose`。既存 WSC VS1 診断、PDF生成、ネットワーク制限を再利用する。
- 公開受付側: `www.atlib.jp/secumie-web/`。**この変更では一切更新しない**。

## 今すぐ使える暫定運用

1. `contact@atlib.jp` の受付メールを原本として確認する。重複・対象URL・同意事項をスタッフが確認する。
2. この画面の「会社名・団体名」「診断対象URL」に手動転記する。受付メールにある担当者の連絡先は入力しない。
3. 「診断を実行してPDFを保存」を押す。HTTPS対象でのみ既存診断APIを実行し、PDFをブラウザでダウンロードする。
4. PDFをスタッフが点検し、原本メールの送付先宛てにメール送信する。**この画面は送信しない**。
5. 暫定期間中の受付済み・対応中・提出済みと送付日時は、既存の担当者間の管理記録で照合する。**この画面には永続的な状態保存機能はない**。

PDF生成は申込の完了、メール送付、提出済みへの自動変更を意味しない。

## 専用DB稼働後の接続契約（PR #50）

- `GET /api/admin/secumie-web/v1/requests?status=&companyName=&unionName=&limit=50&offset=0` から申込一覧を取得する。
- 返却項目: `intakeId`、`receiptId`、`receivedAt`、`unionName`、`companyName`、`websiteUrl`、`contactName`、`contactEmail`、`status` など。入力値は HTML として評価せずテキストとして表示。
- 行の「診断に反映」は会社名とURLだけを診断欄に設定する。PIIを診断APIへ送らない。
- `PATCH /api/admin/secumie-web/v1/requests/:id/status` は `RECEIVED`、`IN_PROGRESS`、`SUBMITTED`、`CANCELLED` を使用する。`SUBMITTED` 更新は、実送付をスタッフが確認した場合に限る。
- HTTP 404（現行mainにはAPI未搭載）時は未接続と明示し、PDF手動診断は独立して機能する。

## 本番移行の未完了条件

1. PR #50 と専用 Web DB マイグレーションは本番No-Go。Web/InsightのDB所有・権限・移行ゲートをクリアしない限り実施しない。
2. 現行コーポレートサイトのメール受付はDBへ直接記録していない。**既存メール受付分が管理一覧へ自動連携されることはない**。連携方式（メール原本の明示的移行、または新受付をDBへ切替）は別途設計・承認・検証が必要。
3. 作成PDFの恒久保管・監査証跡・自動メール送付・エラー再実行管理は未実装。個人情報とレポートの保存先、アクセス制御、保管期限を決めてから追加する。
4. 現時点ではこのPRをマージ・デプロイしていない。実運用URLとして案内する前に、既存Sales Toolsの認証・ビルド・診断PDF実行テストを通し、独立したデプロイ承認を得る。

## Staging着手前の現行確認

Cloud Shell（対象GCPプロジェクトを閲覧できる環境）から以下を実行する。

```bash
bash scripts/secumie-web-admin-preflight.sh
```

`sales-tools` と `sales-tools-staging` の現行100%トラフィック、実行SA、Ingress、Git main/候補HEADを読み取り、**何も変更しない**。チェック結果をもとに、正規の `main` と候補SHAを確認して独立したStaging検証計画を作成する。既存Stagingの100%トラフィックを無断で入れ替えない。

## 検証

```bash
node --check public/admin/secumie-web.js
node --test test/secumieWebAdmin.contract.test.cjs
node --test test/secumieWebAdmin.browser.test.cjs
npm ci --no-audit --no-fund
npm run build
node -r ts-node/register --test test/wscSalesService.test.ts
```

Browser suite はローカルの静的ファイルサーバーとAPIモックを使用する。実Cloud Run・本番DB・外部URLには通信しない。Chromium起動がOSに拒否される環境では4件を **SKIP** として明示し、PASSに算入しない。スタッフ認証と本物のPDF出力については別途Staging受入試験が必要。

Webhooksやメール本文、連絡先、PDFをブラウザの localStorage / sessionStorage / IndexedDB、ログ、Slackに保存しない。Slack通知については既存の秘匿済み設定のみ利用し、本画面から新規送信しない。
