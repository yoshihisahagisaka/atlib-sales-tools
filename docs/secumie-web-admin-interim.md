# SECU:MIE WEB｜現行最小設計（2026-11-23）

## 2026-11-27 Isolated VM integration verification (fixed image)

- **Scope and source identity.** The existing `atlib-test/secumie-runtime` worktree (HEAD `1c32fa8`) was preserved unchanged because it is an Insight/PIRA fixture, not PR #51 source. A tracked-files-only archive was created from image source HEAD `458525768fbef1bdaea1cb49a8e122ecba8d85bf`, SHA-256 `e90fb2c67171bfd1fb5c73b8b45a5f9098d8b58a9598da89dff629dfc6e1b0eb`, transferred over existing IAP SCP, and expanded at `~/atlib-tests/secumie-web/source/458525768fbef1bdaea1cb49a8e122ecba8d85bf/`. It contains no `.env` or `node_modules`. PR HEAD `a806f9eb1c19b56e39ec00fbf59f7b82e0ec156f` differs from the image source only in this Canonical document.
- **Fixed runtime.** The locally cached image `asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/secumie-web-pr51@sha256:744b481602a6538883939824a6baeff7321d01a003df700efc4ed7942a91861f` was used with `--pull=never`; no Build, Pull, Scan, Cloud Run, Cloud SQL, Secret, IAM, or traffic operation was performed. Runtime inspection confirmed `USER node`, `node dist/server.js`, compiled `dist`, `pg`, `express`, `playwright`, and absent npm/npx.
- **Disposable PostgreSQL 16 and migration: PASS.** A run-owned internal Docker network and tmpfs-backed `postgres:16-alpine` were used with synthetic-only credentials and no published port. The existing runner applied `design/secumie-web/migrations/001_secumie_web_intake_staging.sql` once to the disposable `secumie_web_staging` database. Evidence: ledger exactly `001_secumie_web_intake_staging.sql`; tables exactly `assembly_intake` and `assembly_status_history`; both dedicated roles have no superuser/createdb/createrole/replication/bypassrls privilege; PUBLIC CONNECT is false and Web-admin CONNECT true. Log: `~/atlib-tests/secumie-web/logs/vm-migration-20261127T040112Z.log`, SHA-256 `d2621e737b96e3e218763cd09de927b50d28310159adfc7f19232980d41f2e12`.
- **DB and signed-mirror integration: PASS.** The fixed-image execution of `test/secumieWebAdminDb.acceptance.cjs` passed (one test). It covers the existing migration runner, role/ACL separation, signed intake 201, unsigned and stale signature 401, replay 200 with the same receipt, conflicting idempotency key 409, staff list, status history, and denied direct staff-table update/delete. Log: `~/atlib-tests/secumie-web/logs/vm-dbacceptance-20261127T035720Z.log`, SHA-256 `bcfae55574c7258fe99c3dc9cdfa1abbabd7e3eaae23a59cf1f504b6dc98ab1f`.
- **Fixed-image HTTP server: PASS.** The unchanged runtime CMD was launched non-root, read-only, resource-limited, and unexposed on the run-owned internal network using only synthetic configuration. Results: `/healthz` 200; anonymous Web-admin API 401; unsigned and stale signed mirror requests 401; valid signed intake 201; identical replay 200 with same receipt; changed payload with the same key 409; resulting disposable DB state was one `RECEIVED` intake and one `RECEIVED` audit record. This is an isolated synthetic test, not Google Workspace/OAuth or Cloud Run evidence.
- **Real WSC PDF: PASS.** The fixed image's unchanged `renderWscPdf` generated a real Chromium PDF from synthetic Japanese HTML under a non-root UID, internal network, read-only root filesystem, and resource limits. `%PDF-` header, mode 600, 69,331 bytes, SHA-256 `cd0a82ba0ee714ce58f1acbd3fa2da03aa9da2e1bdeb95f6c949248ac16a920b`; artifact: `~/atlib-tests/secumie-web/artifacts/vm-wsc-pdf-a806-20261127T035953Z.pdf`.
- **Contracts: PASS.** Fixed-image Node ran `secumieWebAdmin.contract.test.cjs` and `secumieWebAdmin.releaseBoundary.contract.test.cjs`: 18 pass, 0 fail. Log: `~/atlib-tests/secumie-web/logs/vm-contract-20261127T040448Z.log`, SHA-256 `0e81c628d3b20a7b3b82e224d5b0e54c7b30a3c6b28ca5944ae65b027d3ebecc`.
- **Blocked / not equivalent evidence.** Google Workspace successful staff authentication, an authenticated management-screen session, explicit staff `SUBMITTED` action/history, and corporate PR #75 SMTP integration were not run; no real cookie, account, email, or external service was used. The existing Playwright image has the browser but not a resolvable `playwright` Node module for the source browser test (`MODULE_NOT_FOUND`); adding dependencies is outside scope, so browser UI regression remains BLOCKED rather than treated as a pass.
- **Cleanup and invariant.** Only `smw-a806-app`, `smw-a806-pg`, and `smw-a806-net` were created and then removed. No Docker volume was created. Existing images, existing networks/volumes, the old runtime worktree, all GCP configuration, Production, and existing Staging remain unchanged. `SECURITY_NO_GO`, Production No-Go, CVE exception 0, and Draft PR status remain in force.

## 2026-11-27 Remaining VM verification

- **Fixed-image browser regression: PASS.** The same fixed digest, with `NODE_PATH=/app/node_modules`, `REQUIRE_BROWSER=1`, and `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`, resolved Playwright `1.63.0` and the installed Chromium headless shell. The unchanged `test/secumieWebAdmin.browser.test.cjs` ran from the fixed source mounted read-only at `/verify`, under `--pull=never --network none --read-only`, non-root, `cap-drop ALL`, `no-new-privileges`, tmpfs and CPU/memory/PID limits: **4 pass / 0 fail / 0 skip**. This is a real-browser UI regression only; its API responses are test doubles and it is not OAuth or GCP integration. Log: `~/atlib-tests/secumie-web/logs/vm-browser-fixed-image-20261127T042255Z.log`, SHA-256 `1221620f3cdf932c73928f8c0da33d7046546462e7843da10ce3d905e9c7d6c1`.
- **AssemblyAdminService direct database verification: PASS.** A fresh run-owned, tmpfs-backed PostgreSQL 16 instance and internal network used the unchanged migration runner and `AssemblyAdminService`. Synthetic input verified list retrieval, `RECEIVED → IN_PROGRESS → SUBMITTED`, staff actor history, missing-ID return, database rejection of an invalid status, and denied direct update/delete under the Web-admin role. This is a direct-service/real-disposable-DB result, not a staff-authenticated HTTP or Google Workspace result. Log: `~/atlib-tests/secumie-web/logs/vm-service-direct-20261127T042443Z.log`, SHA-256 `3925180edc89ee1b0f22b0210603d435a324e86f41c1697d7886a22972f6d59d`.
- **Corporate PR #75 VM linkage: BLOCKED.** GitHub PR #75 HEAD `911a151333772bce3d3b0274f8518fb526b42c0f` statically confirms the SMTP-success-only, HMAC-signed mirror contract and its existing tests. The VM has no cached Corporate image, while the available local Corporate tree is unrelated `main` HEAD `eb9b229...` and lacks the PR source, `node_modules`, and `dist`. Creating the required source/dependency/build runtime would violate the no-clone/dependency-install/build scope, so no Corporate process, SMTP action, or fixed-API linkage was attempted. Existing PR #75 CI remains contract evidence only.
- **Cleanup.** The second run created and removed only `smw-a806b-pg` and `smw-a806b-net`; no volume was created. The old runtime worktree, existing Docker resources, Cloud Run, Cloud SQL, Secret Manager, IAM, Traffic, Production, and customer data remain unchanged. Google Workspace OAuth and GCP-specific service integration remain BLOCKED/separate.

**これを唯一の現行業務設計とする。** このブランチに過去存在した5テーブル、公開OTP/JWT、通知Outbox、組合マスター、3ロール、新しい受付基盤／CRMの構想は採用しない。旧案はGit履歴に留め、実装・Migration・運用の参照先としない。

## 目的・業務の流れ

1. 既存 `https://www.atlib.jp/secumie-web/` で申し込み。**受付メールが正本**。既存TurnstileとSMTPは変更しない。
2. SMTP成功後、コーポレート側Draft PR #75から署名付きで申込を**任意転記**。失敗してもメール受付は成功扱いのまま。未転記分は受付メールで確認。
3. 既存Google Workspaceスタッフ認証付き `/admin/secumie-web.html` で申込一覧を自動表示し、「診断に反映」で会社名・URLを既存WSCへ渡す。
4. 既存WSC VS1でPDFを作成し、スタッフがメール送付後に「提出済み」へ更新する。ダウンロードだけで提出済みにしない。

**追加しない**：公開OTP、JWT消費履歴、組合マスター、Slack通知Outbox、独立管理画面基盤、自動診断、自動PDF送付、外部CSV、営業CRM、共通KPI。

## DB：既存共有インスタンス内に最小構成

- インスタンス：既存の `msp-zabbix:asia-northeast1:secumie-sg-shared-staging-db` を共用。**Webだけのdatabase `secumie_web_staging` はStagingに作成済み**（実DB作成・Migration適用は2026-11-24にユーザーがCloud SQL Studioで確認）。既存Insight／Secure Guard DBとは別。
- テーブルは2つだけ：`secumie_web.assembly_intake`（メール受付から転記する申込、状態、冪等性キー、同意記録）、`secumie_web.assembly_status_history`（受付・更新履歴）。
- ログインroleは2つだけ：`secumie_web_migration_staging`（専用DB内のschema/table/ledger DDLのみ）、`secumie_web_admin_staging`（アプリ一覧・受付転記・状態更新）。**Web DB自体のownerは既存と同じ `postgres`**。Migrationロールは専用DBのCONNECT/CREATEと`public`スキーマへのCREATEのみ。追加の`SET ROLE`昇格はしない。公開受付runtimeのroleは作らない。
- SQLは`design/secumie-web/migrations/001_secumie_web_intake_staging.sql` **1ファイルだけ**。既存`src/db/migrate.ts:runMigrations`の単一Migration/台帳契約に合わせる。実Stagingでは追加Jobを作らず、同一SQLを埋め込んだ`design/secumie-web/apply-once-staging.sql`をCloud SQL Studioで一括実行する方法も用意。両者を二重実行しない。実行先DB/role/PG16/最小権限チェックとPUBLIC CONNECT禁止を守る。
- Insight／Secure Guardの既存DB・role・ACL・所有者・通常Migrationへは一切変更しない。Web専用DB/roleには他サービス権限を付与せず、管理APIのリクエストでもスタッフ認証を必須とする。
- コーポレートの既存同意文言を維持し、**組合・協会への自動提供をしない**。SQLでは`information_sharing_enabled=false`を強制する。

## 最新の実測と公開条件（2026-11-25更新）

- **Staging DB構築済み**：Migration台帳 `001_secumie_web_intake_staging.sql` 1件、`secumie_web` 2テーブル。2 login role `secumie_web_migration_staging`／`secumie_web_admin_staging` は最小権限で構築済み。作成・Migrationを再実行しない。
- **Secret3件**：旧version 1 disabled、新version 2 enabled。Staging SA `sales-tools-staging-sa`にadmin DB passwordと署名ミラーSecretのAccessorが既設定。値はGit／ログに出さない。
- **現行本番の既存WSC稼働確認済み**：ユーザーがGoogle Workspaceログイン、自社URL診断、PDF生成を実ブラウザでPASS。ただし本番100% Revision（当時 `sales-tools-bks-20261122040419`）は旧mainの単純再ビルドでは完全に再現できないため、本番置換は不可。
- **PR #51の最小構成の実スキャン**：Build `7e998815-2694-4d2c-a146-594616293200`／digest `sha256:45bfc4bf8f23f734e2a373743bf99fbd219c4b1930357ccb8d31d008ac4a975c`（HEAD `87b68f1abb07a7b7e5f8ac82a3f9555eb7b5a442`）。合計254件、CRITICAL 0／HIGH 14／UNKNOWN 5。前段のDebian13切替後にCRITICALは0。npm/npx除去で前候補HIGH20→14、`undici`・`brace-expansion`は検出から消えた。
- **PDF試験**：既存`renderWscPdf`に合成日本語HTMLを渡した実Chromium PDFは`%PDF-`、11,802 bytesで成功。ただし**最終image digest内部の実行・0%隔離Staging Revision・実認証DB結合テストは未実施**。モックPDF APIのブラウザ4件PASSと区別する。
- **最新のNodemailer候補Scan**：Source Git `bbd863bcc4d32bbe2ddef3fdd2846cf674e971f7`／Build `0bc923e5-a6e4-4ed4-b96e-d3c38ac897d8`／digest `sha256:dd60791ab0f327231b7ef53e378df947cbd32d2cf420732c6c03d2da9ddeacfa`。実測242件、**CRITICAL0/HIGH12/UNKNOWN5**。Nodemailer 9.1.1→10.6.1、`@types/nodemailer`削除、Mailer全10経路モック回帰。GitHub PR HEADも上記SHAへ通常Push済みで受入CI3件SUCCESS。ひとつ前の254件（HIGH14）の数値は履歴。
- **残存リスク**：HIGH12はDebian13 OS／Chromium依存（`openssl`3/`expat`2/`acl`2/`cups`/`xorg-server`/`attr`/`perl`等）および`zod`3.25.76 1件。UNKNOWN5（`libxfont`2/`libzstd`1/`shadow`1/`libfontenc`1）。`libzstd`はScanned package 1.5.7+dfsg-1、fixed候補1.5.7+dfsg-1+deb13u1（スキャン結果での提示）であり導入・解消は未確認。
- **Zod Advisory不一致（2026-11-25確認）**：`CVE-2023-54404`はCVE/NVD側で2026-10-28に**REJECTED**（JSON.parseが保持した入力サイズに比例し、HTTP入力制限がない場合の問題である旨）。GitHub Reviewed Advisory `GHSA-mrhx-c7xc-m3w5`は**HIGH / <4.6.6**のまま、GitLab側は取り下げ済み。この不一致をもって無断の例外承認やScan結果からの除外をしない。根拠URL：`https://nvd.nist.gov/vuln/detail/CVE-2023-54404`／`https://github.com/advisories/GHSA-mrhx-c7xc-m3w5`／`https://advisories.gitlab.com/npm/zod/CVE-2023-54404/`。
- **Zod入力経路の実コード**：`src/server.ts`の通常`express.json()`はExpress既定の100KB制限、署名ミラーは`express.raw({limit:'8kb'})`、スタッフの見積AIは15MB／KAIZEN AssessmentとWSCはそれぞれ2MBの個別制限。これら3つの大容量parserは、`cookieParser()`、既存IP制限、`requireStaffAuth()`の後にだけ実行する。未認証の大容量JSONはparser前に401、不正Cookieは401、認証済みでは15MB／2MB境界を維持するHTTP回帰で確認済み。サイズ上限の存在を「到達不可」や「全リスク解消」と誤認しない。
- **Zod移行判断**：v3→v4は`.shape`/`.element`やAI JSON Schemaの連動、KAIZEN/診断APIに影響するため一括更新しない。公開/スタッフの大容量入力と配列を扱う各ルートの到達性・デフォルト入力制限・認証済み大容量JSONの境界を小さな回帰テストで検証する。恒久対応とGate判定は別途審査し、未承認例外は0のまま。2026-11-25時点で**SECURITY_NO_GO／Production No-Go**を維持。
- **未実施**：隔離0% Staging Revision、コーポレートLP→DB署名転記・スタッフ一覧→WSC PDF→ステータス更新の実環境E2E、本番公開。PR #51／コーポレートPR #75はDraft。既存本番Traffic・DNS・WSC・Insight/SG・DB Migrationは変更禁止。
- **次の最短工程**：最新スキャンは`sha256:dd60791...`を正とし、Zod Advisoryの不一致・アプリの入力制限と到達性を先に検証。OS側HIGH/UNKNOWNは最新ScanのCVE ID・fixedVersion・実行時の依存経路を照合し、修正可能な`libzstd`等を個別に検討。新Build/Scanは意味のある修正をまとめてから1回。Cloud SQL既存資産保全期限（2026-12-04 10:12 JST）とWeb追加分の長期保持承認を混同しない。

## 2026-11-26 実測Scanと最小パッチ（最新版）

- **評価済みの固定ソース／イメージ**：PR #51 HEAD `f38401756d6a1a0d297796795551714c9f90bb03`、Cloud Build `01a81995-7efd-45e5-b6c3-3a06b5a17508` SUCCESS、digest `sha256:210f56cc71de4db2bb4ef2619840d0f11760c9f27c67d125b680a15d62d3e656`、Cloud Shell remote Scan `projects/msp-zabbix/locations/asia/scans/d15fc2b0-620e-43aa-97b4-8252d0333949`。
- **スキャン結果**：242件（CRITICAL 0、HIGH 12、MEDIUM 27、LOW 102、MINIMAL 96、UNKNOWN 5）。HIGHは`openssl`3、`acl`2、`expat`2、`attr`／`cups`／`perl`／`xorg-server`／`zod`各1。UNKNOWNは`libxfont`2、`libfontenc`／`libzstd`／`shadow`各1。**この評価は上記digest専用であり、その後のDockerfile修正を評価済みとはしない**。
- Debian公式 `DSA-6657-1`／`CVE-2026-124851`：Debian 13 `libzstd` の修正版`1.5.7+dfsg-1+deb13u1`提供済み（`https://security-tracker.debian.org/tracker/DSA-6657-1`）。既存Dockerfileの**runtimeのみ**で`apt-get install --only-upgrade libzstd1`し、`dpkg --compare-versions`で修正版以上を要求する最小パッチを追加。新HEADのCloud Buildと新digestのScanがPASSするまで`libzstd`解消とは判定しない。
- `shadow`：Scannerは`1:4.17.4-2+deb13u1`を修正版として提示するが、Debian公式 `https://security-tracker.debian.org/tracker/source-package/shadow` のTrixie sourceバージョンは現在`1:4.17.4-2`で、CVE-2026-135901はTrixie vulnerable。**情報不一致につきshadowの変更は保留**。未確認パッケージの追加やunstable版の強制導入はしない。
- Zod `CVE-2023-54404`：GitHub Advisory HIGHとNVD REJECTEDの不一致、v3→v4の大規模スキーマ影響、リクエスト入力上限、認証前JSON解析是正の合意を維持。独断で除外せず`SECURITY_NO_GO`を維持する。
- **環境境界**：PR #51 Draft、Production No-Go、隔離0% Staging Revision未作成。Staging Web専用DB／2ロール／Migration1件／2テーブル／Secret/IAMは構築済みで再実施禁止。実行用イメージ更新は新Cloud Build＋digest固定Scan＋実Chromium PDFの確認後に評価する。本番Traffic／DNS／Insight／Secure Guard／WSC既存公開は変更しない。

## 2026-11-27 最新・最終runtime実測（セキュリティ評価継続）

- **評価した不変イメージ**：PR #51ソース `458525768fbef1bdaea1cb49a8e122ecba8d85bf`／Cloud Build `42a8a1a0-8479-4eaf-aca3-0661717c5ee7` SUCCESS／digest `sha256:744b481602a6538883939824a6baeff7321d01a003df700efc4ed7942a91861f`。Cloud Shell On-Demand Scan `projects/msp-zabbix/locations/asia/scans/1d683242-5254-4876-a7ec-2c34c6b38feb` のresourceUriが同一digestと一致：**SCAN_IMAGE_MATCH=PASS**。この記録だけの更新はimageを変更しない。
- **最終スキャン**：全**248件**、CRITICAL **0**／HIGH **12**／MEDIUM **34**／LOW **103**／MINIMAL **96**／UNKNOWN **3**。前回241件、CRITICAL0/HIGH12/UNKNOWN4から、影響度の高いUNKNOWNは4→3に減少。総数はMEDIUM+7/LOW+1/UNKNOWN-1で+7。Scan結果を前digestや別ソースへ流用しない。
- **残存HIGH12件**：Debian OS11（`openssl`3、`acl`2、`expat`2、`xorg-server`／`cups`／`attr`／`perl`各1）とnpm `zod`3.25.76のCVE-2023-54404（1）。今回のScanではOS側の具体的なfixedVersionは未提示。NVD REJECTEDとGitHub Advisory HIGHの相違を維持し、Zod v4への無条件移行・例外・除外をしない。
- **残存UNKNOWN3件**：`libxfont`2（CVE-2026-109909／109920、1:2.0.6-1+deb13u1）、`libfontenc`1（CVE-2026-109908、1:1.1.8-1）。いずれもScan時にfixedVersion未提示。`shadow`のCVE-2026-135901は今回検出されなくなった。`libzstd`も前回までに検出解消。
- **VMでの同digest実測**：既存`atlib-test-runner`の案件専用Docker network／一時bind mount、顧客情報なし。Artifact Registry短期トークン認証とdigest一致PASS。runtimeの`libzstd1=1.5.7+dfsg-1+deb13u1`、`passwd=1:4.17.4-2+deb13u1`、`login.defs=1:4.17.4-2+deb13u1`を確認。既存WSC`renderWscPdf`による合成日本語HTMLの**実Chromium PDF生成・ファイル回収・ハッシュ一致すべてPASS**（66,870 bytes、SHA-256 `e428bcfee329a324e67f386533fd97672b147f568f4641ea67820795ebe52407`）。成果物 `~/atlib-tests/secumie-web/artifacts/wsc-pdf-smoke-20261127T010228Z.pdf`。
- **リリース判定は不変**：セキュリティ上の未解決15件（HIGH12/UNKNOWN3）は未承認例外0。**SECURITY_NO_GO／Production No-Go／Draft維持**。隔離0% Staging Revision未作成、コーポレート署名ミラー→Web専用Staging DB→管理一覧→診断→提出状態の実環境E2E未実施。既存DB／Migration／Secrets／IAM／Traffic／Production変更なし。
- **次工程**：新イメージの再Build・再Scanは不要。残存OS CVEと実ランタイムの`Xvfb`・`cupsd`・`perl`等の**実際の起動・到達経路を読み取り専用で確認**し、修正版提供を追跡する。未承認のパッケージ削除・unstable導入・CVE除外はしない。技術的に解消できない項目について、根拠と暫定防御・運用上の扱いを整理した後に独立したセキュリティ承認を求める。承認なしに隔離Revisionへ進まない。

## 2026-11-27 残存リスクの実行経路評価Gate

**目的**：最終固定image `sha256:744b481602a6538883939824a6baeff7321d01a003df700efc4ed7942a91861f` の**HIGH12／UNKNOWN3**を、実際の実行条件に即して判断する。検出件数だけで「実行可能」「影響なし」「例外承認」と判定しない。現時点では例外承認0、**SECURITY_NO_GO／Production No-Go／Draft**。

- **確認できた静的事実**：runtime `Dockerfile`は`node:24-trixie-slim`、`USER node`、`CMD ["node","dist/server.js"]`。WSC `src/services/wscSalesService.ts`はPlaywright `chromium.launch({ headless: true })`を使用し、`Xvfb`や`cupsd`を明示起動しない。ただし依存ライブラリとしてインストールされていることは別であり、プロセスの有無・実到達性の確認が必要。
- **OS HIGH11の検証区分**：`xorg-server` CVE-2023-5574はXvfbの特殊なZaphod複数スクリーン条件、`cups` CVE-2026-34980は公開`cupsd`と共有PostScriptキューが前提（Debian公式：`https://security-tracker.debian.org/tracker/CVE-2023-5574`、`https://security-tracker.debian.org/tracker/CVE-2026-34980`）。`acl`2／`attr`1は特権プロセスと攻撃者制御path成分、`expat`2は攻撃者制御XML入力、`openssl`3はCVE別の処理、`perl`1は特定アーカイブ処理に関わる。これらの実行条件を**確認できた／確認できない／非該当の証拠あり**に区別し、修正済みとは扱わない。
- **NPM HIGH1の評価**：`zod@3.25.76` `CVE-2023-54404`はNVD REJECTED（`https://nvd.nist.gov/vuln/detail/CVE-2023-54404`）、GitHub Advisory HIGH（`https://github.com/advisories/GHSA-mrhx-c7xc-m3w5`）。JSON容量制限、スタッフCookie認証前の大容量解析禁止とHTTP 401/413回帰は既存実装でPASS。**CVEの情報不一致は無断の除外承認ではない**。Zod v4一括導入は現行KAIZEN／診断のスキーマ互換リスクにより保留。
- **UNKNOWN3**：`libxfont`2／`libfontenc`1、Scan時の具体的な修正版未提供。Chromiumで要求される依存を安全性未確認のまま削除しない。
- **次のread-only監査**：既存VM `atlib-test-runner`、案件専用 `~/atlib-tests/secumie-web/`、既存Docker daemonの**完全一致digestのローカルimage**を使用。VMを停止しない。追加トークン・Pull・Build・Scan・VM/DB/Secret/IAM設定変更なし。ネットワーク無効／read-only／cap-drop／非root／リソース制限付き一時コンテナでインストール済みpackages、Xvfb・cupsd・Perlバイナリ、WSC Chromium起動コード、Node権限を読み取り、案件専用`artifacts/runtime-risk-audit-*.json`へ保管。**監査コンテナは本番アプリの常駐プロセスではないため、プロセス不在だけで影響ゼロとは判定しない**。
- 監査出力・既存PDF/ScanとDebian trackerを照合した**個別リスク判定表**を完成してから、残存リスクと隔離Staging検証可否の**明示的なセキュリティ判断**を行う。それまでは0%隔離Revisionを作成しない。既存Staging DB・Migration・Secret／IAM／Traffic／本番環境は不変。自動的なCVEの除外やパッケージ削除は禁止。

## 2026-11-27 残存CVE個別リスク評価・runtime監査証跡

- **評価対象の固定**：アプリソースは`458525768fbef1bdaea1cb49a8e122ecba8d85bf`、評価記録HEADは`755e236683e4bb08ccf7d6a24d1403401c047551`、imageは`sha256:744b481602a6538883939824a6baeff7321d01a003df700efc4ed7942a91861f`、Scanは`1d683242-5254-4876-a7ec-2c34c6b38feb`（CRITICAL0/HIGH12/UNKNOWN3）。異なるdigest又は後続ソースへこの評価を流用しない。
- **既存read-only監査の結果**：`secumie_runtime_risk_audit_v1.sh`のWindows SHA-256 `19cc1add3b8e355e13717796a7feee625ab185552f7ad213b1cbf4276442d4cc`とVM転送後の値は一致（`SCRIPT_HASH_MATCH=PASS`）。`DIGEST_MATCH=PASS`、`RUNTIME_AUDIT_PASS=PASS`。成果物`~/atlib-tests/secumie-web/artifacts/runtime-risk-audit-20261127T030040Z.json`のSHA-256は`aef77d17b451e667de68069a94b2c5c62b46b250e071d44e10e01eed8dbaa08b`。監査一時コンテナはUID/GID 1000、`CapEff=0000000000000000`、`NoNewPrivs=1`で、既存`sudo -n docker`のみを利用し、`--pull never --network none --read-only --cap-drop ALL --pids-limit 96 --memory 512m --cpus 1`を適用した。これは監査コンテナの条件であり、本番常駐プロセスの実測ではない。
- **接続ナレッジ**：IAP/OS Loginの障害と`plink` return codeだけを同一視しない。PowerShellがリモート用`$HOME`を展開すると、リモートpath判定失敗が`plink` return code 1として返る。リモートコマンドは単一引用符で保護するか、確認済み絶対path `/home/yoshihisa_hagisaka_atlib_jp/atlib-tests/secumie-web/`を使用する。今回の既存OS Loginユーザーは`yoshihisa_hagisaka_atlib_jp`であり、鍵・IAM・VM設定は変更していない。

|CVE / Scan|source・監査導入版|成立条件と既存到達性の証拠|修正版・未確認事項|評価区分案|
|---|---|---|---|---|
|CVE-2023-5574 / HIGH|xorg-server、`xvfb=2:21.1.16-1.3+deb13u4`|Debianの条件はXvfbのZaphod複数screen構成。監査では`/usr/bin/Xvfb`あり、`Xorg`なし。WSCは`chromium.launch({headless:true})`でありXvfbを明示起動しない（`src/services/wscSalesService.ts:36-40`）。|Chromium内部／起動引数の完全実測とDebian13修正版は未確認。Tracker: `https://security-tracker.debian.org/tracker/CVE-2023-5574`。|UNDETERMINED（直接起動の証拠なし、除外不可）|
|CVE-2026-34980 / HIGH|cups、`libcups2t64=2.4.10-3+deb13u2`|公開`cupsd`と共有PostScriptキューが成立条件。監査で`cupsd`/`lpadmin`は不存在、WSCコードにcupsd参照なし。|印刷ライブラリ経由の完全なChromium到達性とDebian13修正版は未確認。`https://security-tracker.debian.org/tracker/CVE-2026-34980`。|UNDETERMINED|
|CVE-2026-54369, CVE-2026-54370 / HIGH|acl、`libacl1=2.3.2-2+b1`|特権callerが攻撃者制御path成分に対し`acl_*_file()`を使いsymlink置換されることが条件。既存TS/JSにacl API、setfacl、直接の特権処理参照は確認できない。|監査のCapEff=0は本番の根拠にできない。Trixieはvulnerable、2.4.0はunstable。`https://security-tracker.debian.org/tracker/CVE-2026-54369`。|PATCH_PENDING / UNDETERMINED|
|CVE-2026-54371 / HIGH|attr、`libattr1=1:2.5.2-3`|特権caller・攻撃者制御path・拡張属性操作が前提。既存TS/JSにxattr/setxattr/lsetxattrの直接参照は確認できない。|native/Chromium間接経路とTrixie修正版提供は未確認。|PATCH_PENDING / UNDETERMINED|
|CVE-2026-9538 / HIGH|perl、`perl-base=5.40.1-6+deb13u1`、`/usr/bin/perl`あり|Archive::Tar 3.10未満で攻撃者制御tar entry sizeを読み込むとメモリ枯渇が成立。アプリTS/JSにPerl又はArchive::Tar呼出しは確認できない。|モジュール実在・OS/Chromium保守経路・Trixie修正版は未確認。`https://security-tracker.debian.org/tracker/CVE-2026-9538`。|PATCH_PENDING / UNDETERMINED|
|CVE-2026-117610, CVE-2026-118370 / HIGH|expat、`libexpat1=2.9.0-1~deb13u1`|攻撃者制御XMLが対象parserへ到達することが前提。アプリが直接XMLを扱う証拠はないが、Chromium headless-shellは実在しPDF作成で使用する。|Chromium/間接依存のXML到達性とTrixie修正版は未確認。`https://security-tracker.debian.org/tracker/CVE-2026-117610`。|PATCH_PENDING / UNDETERMINED|
|CVE-2026-107496 / HIGH|openssl、`libssl3t64=3.5.9-1~deb13u1`|CMS_encrypt*へ攻撃者制御のEC受領者証明書を渡すことが条件。TLS/QUICは当該pathを使わない。WSCはHTTPS URLのみ許可（`src/services/wscSalesService.ts:64-66`）、SMTPはSTARTTLS（`src/services/mailer.ts:27-31`）だがCMS呼出しは確認できない。|Node組込OpenSSLとOS libsslは別。Trixieはvulnerable。`https://security-tracker.debian.org/tracker/CVE-2026-107496`。|PATCH_PENDING / UNDETERMINED|
|CVE-2026-107493 / HIGH|openssl、`libssl3t64=3.5.9-1~deb13u1`|既存stackを渡した`PEM_X509_INFO_read_bio_ex()`が失敗後も再利用されることが条件。既存TS/JSにOpenSSL PEM API直接呼出しは確認できない。|Node/Chromium/SMTPネイティブ実装の個別到達性とTrixie修正版は未確認。`https://security-tracker.debian.org/tracker/CVE-2026-107493`。|PATCH_PENDING / UNDETERMINED|
|CVE-2026-84786 / HIGH|openssl、`libssl3t64=3.5.9-1~deb13u1`|Scanner検出のみ。TLS利用一般だけで成立条件は断定しない。WSC HTTPS、SMTP STARTTLS、DB/TLS設定は別経路として扱う。|CVE固有条件と各native consumerの到達性、Trixie修正版は未確認。`https://security-tracker.debian.org/tracker/CVE-2026-84786`。|PATCH_PENDING / UNDETERMINED|
|CVE-2023-54404 / HIGH|zod、`zod=3.25.76`|GitHub AdvisoryはHIGH/<4.6.6、NVDはREJECTED。`src/server.ts:157-184`でCookie→IP制限→staff認証→15MB/2MB parser、通常JSONは既定上限。HTTP 401/413回帰あり。|容量上限だけで解消とはしない。配列schemaはKAIZEN/診断に存在し、v4一括更新は未確認の互換リスク。`https://nvd.nist.gov/vuln/detail/CVE-2023-54404`、`https://github.com/advisories/GHSA-mrhx-c7xc-m3w5`。|UNDETERMINED（緩和策あり、例外なし）|
|CVE-2026-109909, CVE-2026-109920 / UNKNOWN|libxfont、`libxfont2=1:2.0.6-1+deb13u1`|Xvfbは存在するがXorgは不存在。WSCはheadless Chromiumで、Xvfb直接起動は確認できない。|依存元・当該font処理到達性・修正版はいずれも未確認。|UNDETERMINED|
|CVE-2026-109908 / UNKNOWN|libfontenc、`libfontenc1=1:1.1.8-1+b2`|font関連依存として存在する事実のみ。Chromium/PDF経路との個別リンクは未確認。|Scannerが具体的fixedVersionを提示しない。|UNDETERMINED|

- **結論の境界**：上表はCVE例外承認、スキャン除外、または公開可否の決定ではない。HIGH12／UNKNOWN3を維持し、修正版提供・ネイティブ依存の実行条件・Cloud Run常駐時の構成は統括側で別途判断する。既存WSC/PDF、DB、Migration、Secret、IAM、Traffic、Cloud Run Revision、本番は変更していない。

## 2026-11-27 隔離Staging限定承認・Preflight STOP

- **承認境界**：統括の`STAGING_E2E=CONDITIONAL_GO`は固定image `sha256:744b481602a6538883939824a6baeff7321d01a003df700efc4ed7942a91861f`を使う隔離Staging検証だけを対象とする。`SECURITY_NO_GO`、Production No-Go、Draft、未承認CVE例外0を維持し、公開Ingress／allUsers権限／本番Trafficを承認しない。
- **read-only Preflight実測**：既存`atlib-test-runner`等とは別に、Cloud Run `sales-tools-staging`を確認した。100% Revisionは`sales-tools-staging-p228`、SAは`sales-tools-staging-sa@msp-zabbix.iam.gserviceaccount.com`、minScale=0/maxScale=2、既存参照Cloud SQLは`msp-zabbix:asia-northeast1:sales-tools-staging-db`である。Web専用DB `secumie_web_staging` は別の`secumie-sg-shared-staging-db`に存在する。アプリのWeb専用poolは`src/server.ts:91-94`でmax=2、共通poolの上限は`src/db/pool.ts:9-20`でmax=5までだが、共有DB接続余力の継続監視は今回未確認。
- **STOP根拠**：既存serviceのIngress annotationは`all`で、匿名HEAD実測はベースURLと既存tag URLの両方がHTTP **200**だった。一般利用者からの遮断というPreflight必須条件を満たさない。加えて、既存100% RevisionはWeb専用DB/role用のCloud SQL/Secret参照ではない。この差異を埋めるにはservice全体に影響するIngress/IAM又は既存接続設定の変更可否を新たに判断する必要があり、今回の承認範囲外である。
- **未実施**：候補Revision・tag・Traffic変更、固定imageの新規デプロイ、E01〜E14、PDF生成、DB書込み、コーポレートPR #75検証、候補アクセス停止はすべて未実施。E15はPreflight前後で本番`sales-tools`と既存Staging Trafficを変更していない。DB、Migration、role、Secret、IAM、Cloud Run設定、Build、Scan、Traffic、Productionへの書込みはない。

## 停止・復旧

対象DB/roleの既存検出、Git/SQL差分、未承認操作、CVE公開Gate、他サービスの性能悪化はSTOP。実DBへの自動再試行や自動DROPはしない。故障時も既存メール正本とWSCの手動PDF作成で業務を継続する。
