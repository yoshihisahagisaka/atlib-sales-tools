# Phase 1 適用前準備：今回の検証結果

対象実装SHA：03679c544da26b0749efa5b81a9291c15e7dcc2a。新規アプリ機能・実装DDLの変更なし。

- 準備テスト：**4 PASS / 0 FAIL / 1 SKIP**。
- hash manifest検証：11ファイル、DDL7430bytes、28個の作成object、番号付きmigration追加なし。
- 専用DB接続guard：明示承認なしでは未接続、Production host/FACTACT port/復元port/Send DB/wrong role/query overrideを拒否。
- read-only collector：PGliteの合成カタログで全metadata SQLを実行し、重複件数の集計と企業名/番号の非出力を確認。実PostgreSQL/ProductionでのSQL・可視ACLの確認ではない。
- 実PG suite：未承認・専用接続なしでSKIPし、実DBにアクセスしなかった。
- Docker Compose 5.5.0：`config --no-interpolate --quiet` PASS。client側の構文検証のみでEngine/コンテナ/イメージ検証ではない。
- PowerShell read-only collector：Parser構文チェックPASS。gcloud実呼出しは既存認証ファイルPermission denied。
- Docker Engine：desktop-linux context名のみ取得。pipe接続Permission denied。image/container/volume情報は未取得。
- DB preflightの実行：接続未設定でSKIP。実ledger/ACL/index/company重複数は未取得。

DDL SHA-256：`b3ef7ec8eeae8da9afefe8e40ac0c58fc1d27edb3b167b6701684f2757393df9`。
002/027の依存SQLはmainから取得したbyteと一致する形でmanifestへ固定。ローカル取得時の末尾空行をcanonicalに合わせただけで、GitHubの既存migrationは変更しない。

前回の実装テスト12PASS/4SKIP・browser4ケースPASSと、既存Current Design v1のmain再現済み2失敗は元の証跡を保持し、再実施/上書きしていない。今回追加した準備テストの結果と混算しない。

再現：通常の依存インストール済み開発環境で、以下は実DBへの承認フラグを設定しなければ接続しない。

```powershell
node scripts/pira/verifyValidationPackage.cjs
node --test --test-reporter=tap test/piraValidationPreparation.test.cjs test/piraPhase1.realpg.test.cjs
docker compose -f docs/pira-validation-compose.draft.yaml config --no-interpolate --quiet
```

**Go／No-Go：No-Go（実環境適用）。** Production metadata/実ledger、image digestと専用target、backup/restore先、実適用の別承認が不足。準備資料は `docs/pira-phase1-validation-readiness-20261018.md`、固定値はmanifestを参照。今回Docker作成/pull/volume操作、実DB DDL/DML、Secret変更、実Google/Slack/SMTP接続、main merge、Production変更は行っていない。
