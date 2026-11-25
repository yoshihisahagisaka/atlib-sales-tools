# SECU:MIE WEB｜現行最小設計（2026-11-23）

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
- **残存リスク**：HIGH14（`openssl`3/`expat`2/`acl`2/`nodemailer`2/`zod`1等）、UNKNOWN5（`libxfont`2/`libzstd`1/`shadow`1/`libfontenc`1）。一部npmメジャー移行は互換性試験が必要。2026-11-25時点で**SECURITY_NO_GO／Production No-Go**、未承認例外0。危険なCVEの一括除外はしない。
- **未実施**：隔離0% Staging Revision、コーポレートLP→DB署名転記・スタッフ一覧→WSC PDF→ステータス更新の実環境E2E、本番公開。PR #51／コーポレートPR #75はDraft。既存本番Traffic・DNS・WSC・Insight/SG・DB Migrationは変更禁止。
- **次の最短工程**：Scan `sha256:45bfc...`を正とし、残存のnpm（`nodemailer`9系／`zod`3系）はアプリ全体の型・SMTP・フォーム回帰を分けて評価。OS側HIGH/UNKNOWNは個別CVEと実到達性／Debian公式修正状況を集約。修正済みと誤認せず、次候補image build/scanは意味のある差分が固まってから1回。なおCloud SQL既存資産保全期限は2026-12-04 10:12 JSTでありWeb追加分の長期保持承認と混同しない。

## 停止・復旧

対象DB/roleの既存検出、Git/SQL差分、未承認操作、CVE公開Gate、他サービスの性能悪化はSTOP。実DBへの自動再試行や自動DROPはしない。故障時も既存メール正本とWSCの手動PDF作成で業務を継続する。
