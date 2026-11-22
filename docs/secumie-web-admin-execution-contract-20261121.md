# SECU:MIE Web｜PR #51 実装・検証契約（コードレベル／意図ずれ防止）

## 2026-11-22 現行実装に対する有効契約（下記2026-11-21の制限を更新）

この節を現行PR #51の**最新の実装範囲・公開判断**として優先する。以下に残す2026-11-21の「PR #51にはDB/API連携なし」「PR #50のみ管理APIを持つ」「許容変更はCVE調査のみ」等の記述は、当時の実装・検証フェーズの履歴であり、現行の変更禁止事項として引用しない。新たな仕様を承認するものではない。

- **目的・操作**：既存の公開LP `https://www.atlib.jp/secumie-web/` でメール受付 → スタッフが申込一覧を確認 → 「診断に反映」 → 既存WSC VS1でPDF作成 → メールを手動送付 → 送信確認後に「提出済み」へ更新。管理ページを開くと一覧を自動読込。受付メールが正本であり、過去・未転記受付を自動登録済みと表示しない。
- **PR #51にすでに含まれるもの**：`/admin/secumie-web.html`、既存Google Workspaceスタッフ認証下の `GET /api/admin/secumie-web/v1/requests` と `PATCH /requests/:id/status`、`POST /api/internal/secumie-web/v1/temporary-intakes` の署名付き任意転記。実装は既存PR #50の必要部分だけを流用し、PR #50のOTP/PIRA公開Runtime全体は導入しない。管理APIが404ならメール原本から既存WSCで手動診断できる。
- **データ・同意境界**：専用Web database `secumie_web_staging` と専用runtime/admin roleを前提とする。Insight・Secure Guard・業務KAIZENのDB・roleを流用しない。企業LPからの転記は、既存 `atlib-corporate-site` Draft PR #75によるSMTP成功後のオプション経路のみ。署名検証、冪等化、`information_sharing_enabled=false` を維持し、協会・組合への自動提供を行わない。データ／PDFのブラウザ永続保存・診断結果の自動送付・CRM新設はしない。
- **2026-11-22のCI実測**：PR #51 HEAD `81c551bdc76cc0d47b245deb4ee645c8143fbe74` 時点。GitHub Actions DB受入 Run `44989607033` は合成PostgreSQL16 + 画面契約 **10 PASS / 0 FAIL / 0 SKIP**、ブラウザ Run `44989607067` はChromium **4 PASS / 0 FAIL / 0 SKIP**、リリース境界 Run `44989607117` は既存契約系 **7 PASSと9 PASS（ともに FAIL / SKIP 0）**。実Cloud SQL、Google Workspace実ログイン、現行LPからの実転記、顧客への送付はこのCIでは検証していない。
- **セキュリティ**：既存候補image `sha256:87967dd7a73ebbd3e56c3a1c3b20dc6c6c06051af3041b5b6d6a790cba5412f0` のCVE台帳は HIGH16 / UNKNOWN14、未解決30件、例外承認0。現在HEADに対する新規イメージの安全性をこの過去のスキャンで保証しない。**SECURITY_NO_GO**を維持し、CVEの一括非該当処理・自動例外承認をしない。
- **次の境界**：既存共有Cloud SQL StagingのWeb専用DB・role・Draft SQL/GRANTの適用はまだ未承認・未実施。適用前にGit/Canonical/ADR/Decision Log/Production LedgerをFit/Gapし、SQL所有者、最小権限、Migration台帳、rollback、Secret/接続予算と実行承認を確認する。無断でCloud SQL・Cloud Run・Secret・DNS・Traffic・本番LP・PRを変更しない。実Staging接続後に、OAuth・申込ミラー・一覧→WSC PDF→送付記録の実ブラウザ受入を行う。
- **公開判断**：PR #51とコーポレート側PR #75はDraft維持。現行LPと本番配信中の既存WSCを止めず、新画面やDBのデプロイ・Merge・本番公開は別Go判断とする。


状態：2026-11-21。適用先：`yoshihisahagisaka/atlib-sales-tools` Draft PR #51、ブランチ `feat/secumie-web-admin-interim-20261119`。**本番No-Goのまま。**

## 1. 参照順位と変更原則

1. **現行Git実体を確認**：対象PR、HEAD、base、`src/server.ts`、既存WSC VS1とスタッフ認証、既存テスト、`docs/secumie-web-admin-interim.md`を読み、Canonical／ADR／Decision Log／Production Ledgerの該当部分とFit/Gapで照合する。
2. **既定を変更しない**：上記と衝突する内容を発見した場合は勝手に補正・再設計せず、差分と判断材料のみ記録してSTOP。PR #51以外の独立した設計判断を持ち込まない。
3. **判断責任**：仕様・リスク受容・マイグレーション・公開判断はこのスレッドで明示的に確定する。Codexは確定した変更の実装・テスト・Commit/Push/Draft PR記録を行う実行役であり、独自の仕様追加・CVEsの一括承認はしない。
4. **コード契約**：`node --test test/secumieWebAdmin.releaseBoundary.contract.test.cjs` が本工程の最短変更Gate。既存のブラウザ4/4、HTTP6/6、PDF Smoke PASSは証跡保持。変更がなければ高コストの再実行を要求しない。

## 2026-11-21 実行証跡：GitHub Actionsコード契約Gate

- ワークフロー：`.github/workflows/secumie-web-admin-contract.yml`。GitHub Actions Run ID `44909019875`、Job ID `136860645903`。
- 対象はPR #51 merge ref（GitHub上でcheckout）、Node.js 24。**`node --test test/secumieWebAdmin.releaseBoundary.contract.test.cjs`：6 PASS / 0 FAIL / 0 SKIP**（ログ取得確認）。
- 新たなCloud Shell・Cloud Build実行、イメージ作成、脆弱性再スキャン、実サービスへのデプロイは行っていない。
- 当該ワークフローは**コードと設定の静的契約**のみ。実Google OAuth、実ネットワーク診断、既存コンテナの重大脆弱性の免除、Production公開の許可にはならない。
- 新しいCVEの実体証拠は依然未取得。CVE台帳30件はすべて未解決、`SECURITY_NO_GO` 維持。

## 2. システム境界と不変条件

| 対象 | 現行実装の基点 | 変更禁止／受入条件 |
|---|---|---|
| スタッフ認証 | `src/server.ts` の `adminAuthGate`、`src/middleware/staffAuth.ts` | `/admin`と`/api/admin/web-security-check` はレート制限＋`requireStaffAuth`配下。Google Workspace既存方式再利用、新認証方式・新公開APIなし |
| 管理画面 | `public/admin/secumie-web.html` と `.js` | 当面は受付メール原本の会社名・HTTPS URLだけ手動転記。ブラウザ永続保存・自動メール送付・自動受付履歴登録なし |
| 診断・PDF | `src/routes/adminWebSecurityCheck.ts` → `src/services/wscSalesService.ts` | POST `/api/admin/web-security-check/diagnose` の `{name,url}` を維持し、WSC VS1とrestricted network probeと既存Chromium PDFを再利用。仕様変更なし |
| 将来DB | PR #50に別管理、`/api/admin/secumie-web/v1/requests` | PR #51ではDB／Migration／テナント認証連携なし。404時は未接続と明示、手動PDF利用は独立して継続。`SUBMITTED`は送付をスタッフが確認した場合のみ |
| 公開サイト | `www.atlib.jp/secumie-web/` | メール受付を変えない。既存の受付メールがDBへ自動転記されるとは説明しない |
| Cloud Run | `sales-tools`／`sales-tools-staging` | 新イメージは未デプロイ。既存の100%トラフィック、IAM、Ingress、Secret、DBを変更しない |
| コンテナ | `Dockerfile`、確定image digest | `node`非root実行、Playwrightのheadless shell、日本語PDF。重大な未解決CVEは無断で許容・除外・無視しない |

## 3. CVEの機械可読な証跡

**唯一の本工程用CVEインベントリ**：`security/secumie-web-admin-cve-ledger-20261121.json`。2026-11-21の確定image `sha256:87967dd7a73ebbd3e56c3a1c3b20dc6c6c06051af3041b5b6d6a790cba5412f0` に対して、HIGH16／UNKNOWN14の30件をCVE IDごとに管理する。

- スキャン結果との突合せ：`projects/msp-zabbix/locations/asia/scans/47c0fb7d-2fc9-44fb-8361-3509d194291c`。元データの重大度・導入ソースパッケージと正確に一致させる。
- 各CVEの初期状態は `UNRESOLVED`、`UNDETERMINED`、`approvedException=false`。承認された例外は**0件**。
- 調査資料：`docs/secumie-web-admin-cve-review-20261121.md`。サーバー実行ファイルの不存在、ELFの静的リンク情報、サービス未起動という観察を、CVEの「非該当」証明へすり替えない。
- CVEの削除・分類変更は、候補digestとスキャンID、根拠の変更を伴うときだけ。影響評価と承認記録がないのに `SECURITY_NO_GO` を解除しない。
- ベンダー修正版の有無と実際の成立条件を個別記録。`fixedVersion=null`は「無害」でも「承認済み」でもない。

## 4. Cloud Shellなしでの安全な追加証拠収集

1. **Windows PowerShell＋gcloud** または権限のあるCodex実行環境から、`scripts/secumie-admin-cve-remote-readonly.ps1 -DryRun` を実行し、対象Project・地域・digest・操作が想定と一致しているか確認。
2. 実行には `cloudbuild/secumie-admin-readonly-cve-evidence.yaml` のみを使用。Cloud Build `--no-source`で既存image digestを取得し、ネストした検証コンテナは`--network=none --read-only --cap-drop=ALL --security-opt=no-new-privileges`で起動する。イメージの新規ビルド／push／再スキャンやCloud Run、DBへの操作をしない。
3. 結果はCloud Buildの標準ログから確認。`id`、実行ファイル、パッケージ状態、Perlの`Archive::Tar`、Node／ChromiumのELFリンクをCVE一次評価へ追記する。**ログ未取得なら検証未実施**。
4. 実行前テスト：`node --test test/secumieWebAdmin.releaseBoundary.contract.test.cjs`。変更時はこのテストを追加・修正し、実装契約との不一致を検出する。
5. 結果が出ても公開Gateは変えない。Cloud Buildの一般的な実行料金が発生する場合がある。

## 2026-11-22 CVE実体証拠契約のGitHub Actions検証

- GitHub Actions Run `44956753943`、Job `137006457764`：**SUCCESS**。実測 `tests 7 / pass 7 / fail 0 / skipped 0`。
- 追加テスト：イメージdigestと実調査Build IDの一致、uid1000、Xvfb/印刷/認証サーバー実行ファイル不在、Perlモジュール、実Chromium→Expat依存、未承認CVE30件、`SECURITY_NO_GO`の整合性。
- PowerShell DryRun：**PASS**。今回の自動契約テストは実GCPへの再実行を伴わず、実体調査は前回Cloud Build `eb944607-e2df-408a-a4b1-01d56b37d006` の既存証拠を使用。

## 2026-11-22 読み取り専用GCP実体調査：SUCCESS

- Windows PowerShellからのCloud Buildジョブ `eb944607-e2df-408a-a4b1-01d56b37d006`、既存候補イメージdigest一致、実行25秒、**SUCCESS**。
- 実行証拠：`security/secumie-web-admin-runtime-evidence-20261122.json`、CVE正本 `security/secumie-web-admin-cve-ledger-20261121.json` の `runtimeEvidenceRef` から参照。
- 非root uid1000、Xvfb/`cupsd`/Kerberosサーバーバイナリなし、Perl `Archive::Tar` IMPORT不可。Chromiumヘッドレスシェルが`libexpat.so.1`をリンクしていることを確認。
- **CVEの非該当承認ではない。** OpenSSL/Expat/Kerberos等の利用経路・悪用条件はCVEごとの評価が必要。HIGH16／UNKNOWN14、例外0、`SECURITY_NO_GO`変わらず。
- 変更時は本証拠と台帳のdigest・スキャン概要・非承認状態を契約テストで照合する。

## 5. リリースGate

| Gate | 判定 |
|---|---|
| A：Web管理画面・診断経路のオフライン受入 | **PASS**（ブラウザ4/4、HTTP6/6、日本語PDF Smoke） |
| B：Xvfb削減・スキャン | 機能PASS／**SECURITY_NO_GO**（HIGH16、UNKNOWN14） |
| C：30件CVEの実利用／成立条件／修正版／必要な緩和策・例外承認 | **実体調査PASS／個別CVE評価は未完了**。自動免除なし |
| D：実Google Workspace認証・実WSC診断のStaging受入 | **未実施**。C完了前の公開Staging導入はしない |
| E：Production release、PR #50 DB migration、受付切替 | **別承認**。このPRで扱わない |

## 6. Codexへの実装委任ルール

- **許可する差分**（現工程）：`security/secumie-web-admin-cve-ledger-20261121.json`、`docs/secumie-web-admin-*.md`、`scripts/secumie-admin-cve-*.ps1/.sh`、`cloudbuild/secumie-admin-readonly-cve-evidence.yaml`、`test/secumieWebAdmin.releaseBoundary.contract.test.cjs`。
- **禁止する差分**：`src/server.ts`、`src/routes/adminWebSecurityCheck.ts`、WSC VS1 vendor、`public/`、`Dockerfile`、`migrations/`、Secret／IAM／Cloud Run traffic、PR #50のソース、公開受付サイト。必要と思われたら作業せずFit/Gapとして報告。
- **停止条件**：HEADが想定と異なる、worktreeが汚れている、CVE IDや件数の不一致、テスト失敗、GCP認証不足、image digest違い、公開・書込操作が要求される、実行結果を確認できない。
- **報告形式**：固定HEAD、変更ファイル、Commit SHA、テスト名と実測PASS/FAIL/SKIP、未完了事項、Cloud Run／DB変更の有無。**未実行の検証をPASSと記載しない**。

次工程は**取得済みCloud Build read-only証拠に基づく30件の個別トリアージ**に限定。新たな製品機能、DB接続方式、認証機能の変更には進まない。
