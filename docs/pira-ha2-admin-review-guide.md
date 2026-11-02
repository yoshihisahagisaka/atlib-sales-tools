# SECU Insight HA-2 管理画面レビュー

## 起動・停止

PowerShellでリポジトリ直下から起動する。

```powershell
$env:PIRA_HA2_DB_PASSWORD = Read-Host 'HA-2 local PostgreSQL password'
.\Start-PiraHa2Review.ps1
```

DBパスワードは環境変数からのみ受け取り、Git管理ファイルやレビュー用ログには保存しない。

- URL: `http://127.0.0.1:4174/admin/pira/`
- 起動時は管理者として開く。
- 画面上部の「管理者へ切替」「閲覧者へ切替」でローカル権限を切り替える。

停止:

```powershell
.\Stop-PiraHa2Review.ps1
```

HA-2専用PIDとコマンド行を照合し、HA-2サーバーだけを停止する。HA-1の4173番ポートには干渉しない。

## レビュー項目

1. 管理者で架空の受付6件が表示されることを確認する。
2. 施策、UNION/GENERAL、状態、企業名、期間を組み合わせて検索する。
3. 一覧行を押し、詳細の同意版・同意日時・営業利用可否を確認する。
4. CSV/XLSXをダウンロードし、日本語と固定11列を確認する。
5. 閲覧者へ切り替え、一覧・詳細は表示でき、CSV/XLSX出力は `PIRA_ADMIN_REQUIRED` で拒否されることを確認する。

## データと認証の境界

- 実装済みの `PiraAdminRepo`、`/api/admin/pira/v1/`、スタッフセッション検証、管理者allowlist、CSV/XLSX、出力監査を使用する。
- PostgreSQL 16の専用DB `pira_ha2_review` にMigration 038〜040を適用する。起動ごとにこのDBの `pira` schemaだけを再初期化する。
- 投入するのはUNION 3件、GENERAL 3件の架空データだけである。RECEIVED/ANSWERING/COMPLETED、異なる日付、空の任意項目を含む。
- 本番Google Workspaceへは接続せず、HA-2専用ログインrouteが既存 `StaffAuthService` のHttpOnlyセッションを発行する。
- 本番Cloud SQL、Cloud Run、Secret、DNS、実顧客データには接続しない。
