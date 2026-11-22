# SECU:MIE Web｜専用Staging DB／Migration実行契約

状態：**DRAFT / EXECUTION NO-GO / Production NO-GO**。対象：atlib-sales-tools PR #51。管理ページや既存WSCの設計を変更しない。実Cloud SQL作成・DB SQL実行・Secret/IAM・Cloud Run変更は本パッケージでは**未承認**。

## 1. 固定する目的と責任境界

公開済みコーポレートLPのメール受付を正本とし、署名付き任意転記 → スタッフ一覧 → 既存WSC PDF → スタッフ送付後の提出済み記録だけを扱う。PR #50の公開OTP/PIRA runtime、CRM、外部CSV、自動PDF送信は取り込まない。

- 共用インスタンス：`msp-zabbix:asia-northeast1:secumie-sg-shared-staging-db`（既存・PG16、Private IPのみ）。
- 新規Web専用DB：`secumie_web_staging` **1個のみ**。Insight `secumie_insight_staging`、Secure Guard `secure_guard_staging` を変更しない。
- Web専用ログインrole：`secumie_web_migration_staging`（DB/schema/migration ledgerのowner）、`secumie_web_admin_staging`（管理API、署名付き転記）、`secumie_web_runtime_staging`（将来の正式公開受付用、PR #51管理画面では使用しない）。これらは他service roleを継承しない。SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLSなし。
- 一般ユーザーへの`CONNECT`/`TEMPORARY`許可はしない。Web staff/公開runtimeのテーブル操作は既存`staging-role-grants.draft.sql`相当の最小権限だけ。
- 既存`src/db/migrate.ts:runMigrations`を流用し、専用DB内`schema_migrations`台帳はWeb単独で管理する。通常Sales Toolsの`migrations/`をWeb DBに渡さない。

## 2. 候補Migrationファイルと固定hash

候補は**Web専用単一SQL**：
`design/secumie-web/migrations/001_secumie_web_intake_staging.sql`。

- SHA-256: `04d719efc3cdd5fc70e5df430144b55a749e9fcf94784bc66093aabfd2a7d1cf`
- 文字コードUTF-8（LF）、ファイルサイズ：`8102` bytes。CIの`sha256sum`/`wc -c`実測で固定。
- Manifest：`design/secumie-web/staging-migration-candidate.manifest.json`（`STAGING_CANDIDATE_EXECUTION_NO_GO`）。
- 既存`assembly-intake.draft.sql`と`staging-role-grants.draft.sql`のDDL/権限文を変更せず、外側のBEGIN/COMMITを削除して1本化。既存runnerがトランザクションとledgerを担う。SQL冒頭のguardはWeb専用DB・migration user・PG16・3 role存在と属性・schema不存在を要求し、誤接続ならDDL前にSTOPする。
- **現時点では候補であり正式な実施承認ではない**。このファイルを手動でCloud SQL Studioへ貼り付けない。適用承認の際はGit HEAD、Manifest、SHA、サイズ、SQL実体を再照合し、候補が変更されていたら既存のshaを使い回さず再審査する。

## 3. 実Stagingでの確定済みFit（2026-11-22ユーザー実測）

PG `16.15`、`max_connections=400`、superuser予約`3`、追加予約`0`、全体接続数`12`（スナップショット）。既存Web DBは0、Web roleは0。Insight DB／Secure Guard DBはともにPUBLIC CONNECT=false、接続可能ロール数はそれぞれ自己側5／3、他方0。既存DB ownerは2つとも`postgres`であり、Web用のownerは**その実体を踏襲して`postgres`へ変更するのではなく**、migration roleをowner候補として個別検証する。

Canonical PR #46 `docs/secumie-shared-staging-db-bootstrap-approval-20261106.md` §19.23は既存資産の保全を**2026-12-04 10:12:12 JST**まで延長した。新たなWeb DB/role/Secret/Job作成は承認範囲外、Web追加分の費用・保全期限・責任者の承認が別途必要。実Billing費用はUNKNOWN。

## 4. 適用前Gate（すべてPASSするまで書込み禁止）

1. GitHubのPR #51と依存PR #75、Canonical/Decision Log/Production Ledgerを再確認。現在の本番100% Revision `sales-tools-bks-20261122040419` の機能を保護。PR #51を旧main由来のイメージにそのまま置換しない。
2. Cloud SQLインスタンス・Private IP・バックアップ/PITR/deletion protection、アクティブJob・障害状況、費用・期限を再測定。Insight/SGの接続ピークと追加のWeb pool max2（旧新revision並走も含む）を予算に反映する。`max_connections=400`の一時点スナップショットのみで容量Gateを閉じない。
3. `postgres`接続のread-onlyカタログからWeb DB/3 roleが不存在であることを再確認。存在すれば**自動上書きせずSTOP**。Cloud SQL管理アカウントで`CREATE DATABASE ... OWNER secumie_web_migration_staging`が可能か、既存role設定やACLを破壊せず事前確認する。失敗したらownerを`postgres`等へ黙って変更しない。
4. 既定のWeb専用ユーザーのパスワードと署名ミラーSecretは、承認済み手順で独立生成・Secret Managerに保存する。値をGit、コマンド引数、チャット、ログへ出さない。Runtime SAのCloud SQL/Secretアクセスは必要範囲のみ。既存サービスのSecret/IAMは変更しない。
5. Web専用DB/roles/Secretの**作成承認**、必要なCloud Run Job/実行環境の**作成承認**、**Migration 1回実行承認**、cleanup/rollback承認を分ける。単なる「進めて」をこれらの承認に代用しない。
6. 1本のみのSQLをimmutable digest/manifestで照合、0件対象や不一致を正常終了として扱わない。専用DB/roleに対してのみ既存`runMigrations`を動かし、1件適用・`schema_migrations`の完全一致を確認する。通常`migrations/`（Sales Tools/Insight等）を含むディレクトリは対象外。

## 5. 承認後だけの順序（実行コマンドではない）

A. Web専用の3 login roleとpassword/Secret参照の確保（事前の権限・費用・作成承認必須）。
B. Web専用DBを指定migration role ownerで作成し、`PUBLIC CONNECT/TEMPORARY`を直ちにREVOKE。OWNER変更可否・他DB/role不変・ACLを確認。DB作成とPUBLIC REVOKEの間はPostgreSQL上の非transactionalな短い窓があるため、承認済みプライベートネットワーク境界と操作順を厳守する。
C. DB/schema/role/PG16 guardを再照合した上で、immutable SQL1件だけを既存runnerでmigration roleから適用する。1つのmigration transactionでDDL＋GRANT＋ledger記録。再実行や修復を自動化しない。
D. Read-onlyで`schema_migrations`1件、schema/table/ownership、PUBLIC CONNECT=false、runtime/adminの最小権限、Insight/SGロールとの相互CONNECT禁止を確認。合成データで署名付きLP転記→一覧→状態・監査のE2Eを実施する（実顧客データは使用しない）。
E. 別途コンテナCVE評価、Google Workspaceの実ブラウザ受入、旧本番との差分受入が完了してからタグ付き0%-traffic候補で試験。本番公開・DNS・Traffic・PR mergeはさらに別Go判断。

## 6. 異常時STOPと復旧

- 1つでもrole/DB既存、owner不整合、権限逸脱、SHA不一致、接続逼迫、費用上限不明、予期しないSecrets/PII出力、他サービス劣化、CVE未解決があればそこで停止。権限追加や無断再試行を行わない。
- MigrationのSQL部分は既存runnerの1トランザクションに閉じる。エラー時はSQL変更部分がROLLBACKされるが、runnerが先行して作成した`schema_migrations`やbootstrap済みWeb database/role/Secretは残り得る。**成功前の状態に自動復元されたと主張しない**。
- 部分状態発生時は対象Web DBと台帳のmetadata・Job実行IDのみ取得し、既存Insight/SGに影響を及ぼさない。新規Web DB／role／Secretの削除、deletion protection解除、Cloud SQLインスタンス削除は**自動実行しない**。別途承認した逆順cleanupと、監査・保持期間を守る。
- 署名ミラー接続に問題があれば、既存コーポレートLPのメール原本受付を維持し、ミラーは無効化して受付を失わない。DB接続失敗時も既存WSCでPDFを手動作成する。
- 本番・Stagingの既存100% Traffic、既存DB・IAM・Secrets・Cloud SQL設定に変更なし。**新候補コンテナCVEのHIGH16 / UNKNOWN14、例外承認0件、SECURITY_NO_GOを維持**。

## 7. この段階の判定

番号・DDL/GRANTの実装・単一SQL合成DB受入・SHA固定：**候補パッケージとして完了**。
実Cloud SQLのWeb専用資産作成：**未実施／未承認**。
Migration本番／Staging適用：**未実施／未承認**。
セキュリティおよび外部公開：**NO-GO**。
