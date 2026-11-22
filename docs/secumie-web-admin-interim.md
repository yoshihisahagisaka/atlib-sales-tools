# SECU:MIE Web｜管理画面（暫定運用・DB接続待ち）

2026-11-19 時点の公開受付と、スタッフの診断・レポート作成業務を接続するための実装仕様。

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
