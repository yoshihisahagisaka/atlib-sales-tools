# PIRA工程E3 管理・出力 Fit/Gap

## 再利用

- Google Workspaceスタッフ認証、HttpOnly `staff_session`、`/admin` と `/api/admin` の認証ゲートを再利用する。
- PostgreSQL Pool、Migration runner、Zod strict schema、既存の管理画面静的配信方式を再利用する。
- PIRA受付Schemaだけを参照し、Sales Toolsの営業案件・Case・顧客マスタへ結合しない。

## 追加した最小差分

- `/admin/pira/` と `/api/admin/pira/v1/` を独立追加。
- `PIRA_ADMIN_EMAILS` allowlistに含まれるスタッフだけが施策変更・CSV/XLSX出力・保持期限候補確認を行える。空または未設定はfail closedで、他のWorkspace認証済みスタッフは閲覧のみ。
- Migration 039で出力件数、成否、失敗コード、施策集合を監査へ追加し、UPDATE/DELETE禁止triggerと検索・保持期限索引を追加。
- CSVはUTF-8 BOM、XLSXは1シート・固定11列。営業利用可否は画面だけに表示しファイルへ含めない。
- 出力上限は10,000件。監査書込みが失敗した場合はファイルを返さない。
- 受付2年・出力監査3年の削除候補を抽出するが、削除ジョブは実行しない。

## 公開前STOP

1. `PIRA_ADMIN_EMAILS`の承認済み本番値と変更手順。
2. Migration 039の本番適用、runtime roleの最小権限、切り戻し手順。
3. 2年・3年保持の削除ジョブ、バックアップとの整合、実行承認。
4. GENERAL同意文言の最終承認。
5. `npm audit --omit=dev`で確認された既存依存とExcelJS圧縮依存の警告評価。今回、依存の一括更新や本番変更は行わない。
