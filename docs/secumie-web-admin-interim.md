# SECU:MIE WEB｜現行最小設計（2026-11-23）

**これを唯一の現行業務設計とする。** このブランチに過去存在した5テーブル、公開OTP/JWT、通知Outbox、組合マスター、3ロール、新しい受付基盤／CRMの構想は採用しない。旧案はGit履歴に留め、実装・Migration・運用の参照先としない。

## 目的・業務の流れ

1. 既存 `https://www.atlib.jp/secumie-web/` で申し込み。**受付メールが正本**。既存TurnstileとSMTPは変更しない。
2. SMTP成功後、コーポレート側Draft PR #75から署名付きで申込を**任意転記**。失敗してもメール受付は成功扱いのまま。未転記分は受付メールで確認。
3. 既存Google Workspaceスタッフ認証付き `/admin/secumie-web.html` で申込一覧を自動表示し、「診断に反映」で会社名・URLを既存WSCへ渡す。
4. 既存WSC VS1でPDFを作成し、スタッフがメール送付後に「提出済み」へ更新する。ダウンロードだけで提出済みにしない。

**追加しない**：公開OTP、JWT消費履歴、組合マスター、Slack通知Outbox、独立管理画面基盤、自動診断、自動PDF送付、外部CSV、営業CRM、共通KPI。

## DB：既存共有インスタンス内に最小構成

- インスタンス：`msp-zabbix:asia-northeast1:secumie-sg-shared-staging-db` を共用。**Webだけのdatabase** `secumie_web_staging` を作成する計画で、現時点では未作成。
- テーブルは2つだけ：`secumie_web.assembly_intake`（メール受付から転記する申込、状態、冪等性キー、同意記録）、`secumie_web.assembly_status_history`（受付・更新履歴）。
- ログインroleは2つだけ：`secumie_web_migration_staging`（専用DB内のschema/table/ledger DDLのみ）、`secumie_web_admin_staging`（アプリ一覧・受付転記・状態更新）。**Web DB自体のownerは既存と同じ `postgres`**。Migrationロールは専用DBのCONNECT/CREATEと`public`スキーマへのCREATEのみ。追加の`SET ROLE`昇格はしない。公開受付runtimeのroleは作らない。
- SQLは`design/secumie-web/migrations/001_secumie_web_intake_staging.sql` **1ファイルだけ**。既存`src/db/migrate.ts:runMigrations`の単一Migration/台帳契約に合わせる。実Stagingでは追加Jobを作らず、同一SQLを埋め込んだ`design/secumie-web/apply-once-staging.sql`をCloud SQL Studioで一括実行する方法も用意。両者を二重実行しない。実行先DB/role/PG16/最小権限チェックとPUBLIC CONNECT禁止を守る。
- Insight／Secure Guardの既存DB・role・ACL・所有者・通常Migrationへは一切変更しない。Web専用DB/roleには他サービス権限を付与せず、管理APIのリクエストでもスタッフ認証を必須とする。
- コーポレートの既存同意文言を維持し、**組合・協会への自動提供をしない**。SQLでは`information_sharing_enabled=false`を強制する。

## 現在の実測と公開条件

- 2026-11-22 Cloud SQL実測：PG16.15、最大接続400／一時点の接続12、Web専用DB・候補roleなし、InsightとSecure Guardの相互CONNECTなし。接続12はピークの保証ではない。
- 本番100% Revisionは`sales-tools-bks-20261122040419`。現行WSC管理画面でログイン・自社URL診断・PDF作成はスタッフ実運用受入PASS。旧`main`からの無条件再ビルドで本番を置き換えない。
- **作成・Migrationは未実施・未承認**。Web専用2ロールとDB、Secretの最小権限・費用/保全期限、接続容量、復旧を確認してから個別承認する。既存共有DBの2026-12-04までの保全延長は新Web DB作成承認を含まない。
- PR #51／コーポレートPR #75はDraft。実Staging接続、署名ミラー、申込一覧・履歴・ブラウザ受入、現行本番との整合確認が完了するまでProduction No-Go。
- 過去の候補イメージはHIGH16／UNKNOWN14・承認例外0（旧PR履歴のスキャン証跡）。**この結果を現在の最小構成イメージのスキャン結果とは扱わない**。最小構成の新候補は未ビルド・未スキャンのため、**SECURITY_NO_GO**。機能簡素化を理由に例外承認しない。

## 停止・復旧

対象DB/roleの既存検出、Git/SQL差分、未承認操作、CVE公開Gate、他サービスの性能悪化はSTOP。実DBへの自動再試行や自動DROPはしない。故障時も既存メール正本とWSCの手動PDF作成で業務を継続する。
