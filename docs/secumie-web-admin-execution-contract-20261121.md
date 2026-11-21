# SECU:MIE Web｜PR #51 実装・検証契約（コードレベル／意図ずれ防止）

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

## 5. リリースGate

| Gate | 判定 |
|---|---|
| A：Web管理画面・診断経路のオフライン受入 | **PASS**（ブラウザ4/4、HTTP6/6、日本語PDF Smoke） |
| B：Xvfb削減・スキャン | 機能PASS／**SECURITY_NO_GO**（HIGH16、UNKNOWN14） |
| C：30件CVEの実利用／成立条件／修正版／必要な緩和策・例外承認 | **未完了**。自動免除なし |
| D：実Google Workspace認証・実WSC診断のStaging受入 | **未実施**。C完了前の公開Staging導入はしない |
| E：Production release、PR #50 DB migration、受付切替 | **別承認**。このPRで扱わない |

## 6. Codexへの実装委任ルール

- **許可する差分**（現工程）：`security/secumie-web-admin-cve-ledger-20261121.json`、`docs/secumie-web-admin-*.md`、`scripts/secumie-admin-cve-*.ps1/.sh`、`cloudbuild/secumie-admin-readonly-cve-evidence.yaml`、`test/secumieWebAdmin.releaseBoundary.contract.test.cjs`。
- **禁止する差分**：`src/server.ts`、`src/routes/adminWebSecurityCheck.ts`、WSC VS1 vendor、`public/`、`Dockerfile`、`migrations/`、Secret／IAM／Cloud Run traffic、PR #50のソース、公開受付サイト。必要と思われたら作業せずFit/Gapとして報告。
- **停止条件**：HEADが想定と異なる、worktreeが汚れている、CVE IDや件数の不一致、テスト失敗、GCP認証不足、image digest違い、公開・書込操作が要求される、実行結果を確認できない。
- **報告形式**：固定HEAD、変更ファイル、Commit SHA、テスト名と実測PASS/FAIL/SKIP、未完了事項、Cloud Run／DB変更の有無。**未実行の検証をPASSと記載しない**。

次工程はCloud Buildのread-only証拠の取得と、30件の個別トリアージの更新に限定。新たな製品機能、DB接続方式、認証機能の変更には進まない。
