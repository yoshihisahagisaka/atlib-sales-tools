# SECU:MIE Insight 公開前 Readiness Phase 1

- 確認日時: 2026-11-01 (JST)
- 調査基準: PR #27 `a5a47d3b1ff0db4862b2e31875c78bb9df98afbc`
- main: `850e1f0bc9c6a2d269b0d5f71d239c1c98df05ae`
- 範囲: Read-only 調査、ローカル build/回帰検証、本文書の保全

## 1. 結論

現時点の本番公開判定は **No-Go** である。工程E1〜E3のローカル機能は成立し、TypeScript buildと工程E3の実PostgreSQLテスト12件はPASSした。しかし、以下は本番公開前に解消が必要である。

1. Critical/Highの本番依存性警告。
2. OTP・公開受付API・E2画面の本番runtime/ルーティングが未配線。
3. Migration 037〜040に `public_auth` / `pira` schemaのruntime権限付与が含まれない。
4. GCPの現行service、revision、traffic、IAM、Cloud SQL、Secret、DNS/HTTPSを現物確認できていない。
5. GENERAL同意文言はDraftのままで、本番GENERAL受付を許可できない。

## 2. 機能完成状況

| 領域 | 状態 | 根拠/残件 |
| --- | --- | --- |
| OTP Contract/実装 | ローカル完了 | PR #22/#23。専用Cloud Run用の本番entry point・設定配線は未完了。 |
| PIRA受付API | ローカル完了 | PR #24/#25。`src/server.ts`に公開受付routerの本番mountがない。 |
| 診断画面接続 | ローカル完了 | PR #26。E2ページは `prototypes/` 配下で、本番配信対象に未接続。 |
| 管理・CSV/XLSX・監査 | ローカル完了 | PR #27。build PASS、実PostgreSQL 12/12 PASS。 |
| 回答/レポート非永続化 | 維持 | 受付/管理DBに回答、C方式結果、レポート、PDFは追加されていない。 |

ローカル検証:

- `npm run build`: PASS
- `node -r ts-node/register --test test/piraAdmin.postgres.test.ts`: PostgreSQL 16で12/12 PASS
- 最初のテスト実行は実行環境のlocalhost接続制限 (`EACCES 127.0.0.1:55437`) で失敗。同一コマンドをローカルDB接続許可下で再実行しPASS。製品不具合ではない。

## 3. 本番依存性のセキュリティ評価

`npm audit --omit=dev` は Critical 1件、High 5件、Moderate 14件を検出した。一括更新は行わない。

| 優先 | パッケージ | 導入版 / 影響範囲 | Advisory / 評価 | 最小対応 |
| --- | --- | --- | --- | --- |
| P0 | `proxy-addr` | 2.0.7、Express経由の間接依存 | GHSA-jqcg-44mw-7w3h。`trust proxy` とIP制限で到達可能。 | 2.0.8以上へパッチ更新。プロキシ越しIP判定とレート制限を回帰。 |
| P0 | `body-parser` | 1.20.8、Express経由の間接依存 | GHSA-27r3-jxmh-p828。JSON API全体に到達可能。 | 1.20.9以上へ互換パッチ。圧縮body・size limitを回帰。 |
| P0 | `nodemailer` | 9.1.1、直接依存 | High: GHSA-v53p-9fqp-m79j, GHSA-prgh-xp8r-p3m5。OTPメール経路で到達可能。 | 10.3.1以上への独立更新。メールadapter、SENT/FAILED/UNKNOWN分類を回帰。 |
| P1 | `zod` | 3.25.76、直接依存 | GHSA-mrhx-c7xc-m3w5。API schemaで到達可能。v4は互換性確認が必要。 | 4.6.7以上へ別PRで移行。更新までrouteごとのbody制限を確認。 |
| P1 | `@grpc/grpc-js` | 1.14.4、Secret Manager→google-gax経由 | GHSA-m9gg-hp2v-232j、GHSA-f596-whhp-79r4。Secret取得fallback時に到達可能。 | 1.14.5以上を取り込むgoogle-gax/Secret Manager更新または最小overrideを検証。 |
| P3 | `brace-expansion` | 1.1.18、`ts-node-dev` 開発経路 | GHSA-qhr7-859c-m2p7, GHSA-6j4f-fj2g-mc7p。本番runtime到達性なし。 | dev lock更新。本番ブロッカーとは分離。 |

### ExcelJS系 Moderate

`exceljs` 4.4.0は `archiver` 5.3.2、`glob` 7.2.3、`minimatch` 5.1.9、`uuid` 8.3.2等の間接依存にModerate警告がある。現行XLSX出力は、固定ワークブックをメモリ上で作成し、10,000件に制限し、ユーザー入力のパス/globを扱わない。また数式注入対策はPR #27で実装済みである。このため実際の到達性は限定的だが、ZIP生成経路は使用する。`npm audit fix` が提案する非互換なダウングレードは行わず、upstream更新、最小override、代替ライブラリを別件で比較する。

## 4. Migration 038〜040とDB権限

### 適用順序と依存

Migration runnerはファイル名の辞書順で実行し、各Migrationをtransactionとadvisory lockで保護する。

1. `038_pira_intake.sql`: `pira` schema、initiative/submission/consumed_jti/export_auditを作成。
2. `039_pira_admin_export_audit.sql`: 038のaudit表を拡張し、追記専用trigger/indexを追加。
3. `040_pira_export_audit_retention.sql`: 039のtriggerを維持し、3年経過分だけを削除する `SECURITY DEFINER` 保守関数を追加。

依存順は正しい。ただし037〜040には本番runtime用のschema/table GRANTがない。既存のdefault privilegeは `public` schema用であり、`public_auth` / `pira` に継承されない。

### 必要な是正

適用済み037〜040は書き換えず、新しいMigrationで以下を実施する。

- OTP runtime、PIRA intake/admin runtime、migration role、audit maintenance roleの実名をDeployment Configurationで確定。
- 各runtimeに必要最小限のschema `USAGE` とtable/sequence権限を付与。
- runtimeにexport auditの `INSERT` だけを許可し、`UPDATE` / `DELETE` は不許可。
- maintenance roleに保守関数 `EXECUTE` だけを付与し、audit表への直接 `DELETE` は不許可。
- `SECURITY DEFINER` 関数のowner、固定 `search_path`、PUBLIC EXECUTE剥奪を検証。
- `has_schema_privilege`、`has_table_privilege`、`has_function_privilege` を用いたpost-deploy verifierを追加。

ローカルテストはruntime/maintenanceの期待境界を動的GRANTで検証しているが、Migrationだけで本番権限が完成することは証明していない。

OTP/challenge/sessionの24時間保持、安全ログの30日保持、PIRA受付の2年保持、出力監査の3年保持はロジック/候補抽出があるが、承認済み定期実行ジョブは未確定である。

## 5. 公開構成 Fit/Gap

### 確認できたリポジトリ上の状態

- 公開URL予定: UNION `https://pira.atlib.jp/`、GENERAL `https://www.atlib.jp/security-check/`。
- OTPは専用Cloud RunとするContractであり、Sales Toolsのスタッフ認証/営業データから分離する。
- `src/server.ts` はPIRA管理routerのみをmountし、OTP、JWKS、公開受付routerをmountしていない。
- OTP専用runtime entry point/Dockerfile、JWT issuer/audience/kid/鍵設定、ブランド/Origin設定、Turnstile設定の本番assemblyがない。
- E2 HTMLは `prototypes/` 配下で、現行production imageの `public/` 配信に接続されていない。
- cross-origin JSON POST用の明示的OPTIONS/preflight処理と本番CSP/CORSポリシーは未確定。same-origin reverse proxyとするか、固定allowlistのcross-originとするかをルーティングと一体で固定する必要がある。
- Workspace staff認証は再利用できる。PIRA管理allowlistはfail-closedだが、本番値と承認者が未確定。

### GCP現物確認

Read-onlyのCloud Run、Cloud SQL、Secret Manager、DNS、Load Balancer、証明書照会は、GCP CLIの非対話再認証エラーで実行できなかった。独断で再認証は行っていない。したがって、現行のservice/revision/traffic/ingress/IAM、Cloud SQL接続、Secret参照、DNS/HTTPS、backup/PITR、rollback revisionは未確認である。過去文書上の `sales-tools`、`asia-northeast1`、`msp-customer-portal-db`、`sales_tools`、`sales-tools-sa`等は参考情報であり、現在値として扱わない。

## 6. PR依存関係と統合計画

### 現状

- 診断系: PR #16 → #20 → #21。古いdocsブランチを起点とし、main直結ではない。
- 認証/受付/管理系: PR #22 → #23 → #25 → #26 → #27。PR #24はmain起点の文書PR。
- PR #26はPR #21の診断資産を限定取り込み済み。#16〜#21と#26にはprototype、SVG、資料、data/diagnosis/v7ファイルの重複がある。
- GitHub上で各PRが自身のbaseに対しmergeableであっても、最新mainへの一括統合の安全性を示さない。

### 推奨順序

1. 最新mainから使い捨てのrelease-integrationブランチを作成し、既存PRのbase/headは変更しない。
2. Contract文書 #22、#24を正本SHA単位で取り込む。
3. OTP #23を取り込み、依存性是正、専用runtime、本番config検証を追加する。
4. 受付 #25、統合UI #26、管理 #27を順に取り込む。
5. #16〜#21は丸ごと追加mergeせず、#26に取込済みのファイルmanifestとblob SHAを照合する。不足するCanonical、固定文、license記録、必須test/資料だけを正本SHAから追加する。大量のPDF/比較画像/検証出力はproduction artifactから除外する。
6. 権限補正Migration、保持ジョブ、post-deploy verifierを追加する。
7. 全自動テスト、実PostgreSQL、ブラウザE2E、印刷、資料ダウンロード、dependency auditをrelease-integration上で再実行する。
8. GCP現物を確認し、backup/PITR、ロールバックrevisionを記録してからMigration、新revision、routingの順で承認実行する。

## 7. 是正計画

### P0: 公開前ブロッカー

- `proxy-addr`、`body-parser`、`nodemailer`の個別更新と回帰。
- OTP専用Cloud Runのentry point、health check、Docker/配信設定を実装。
- UNION/GENERALのroute、OTP/JWKS/intake APIのproxy境界、CORS preflight、CSPを固定。
- JWT issuer/audience/kid/鍵ローテーション、Turnstile、SMTP、DB、Origin/brandをDeployment Configuration化。
- `public_auth` / `pira` 用の最小権限Migrationと権限verifierを追加。
- GCPのRead-onlyインベントリを有効な認証セッションで再実行。
- GENERAL同意文言を最終承認。未承認の場合はGENERALを本番無効化。

### P1: 運用安全性

- Zod v4移行、grpc-js/Secret Manager依存更新。
- OTP/PIRA/監査の保持ジョブ、実行ロール、監視、失敗時再実行手順を承認。
- Cloud Runの最小権限service account、ingress、unauthenticated範囲、server-to-server認証を確定。
- ログのPII/秘密マスク、alert、backup/PITR、revision rollbackのドリルを実施。

### P2: 中期是正

- ExcelJS/archiver系Moderateをupstream状況と実到達性に基づき個別是正。
- dev依存の `brace-expansion` を更新。

## 8. Go / No-Go条件

### Goの必要条件

- P0依存性是正後の `npm audit --omit=dev` で、到達可能なCritical/Highが0件。
- release-integrationでbuild、単体、実PostgreSQL、OTP→受付→診断→完了のブラウザE2E、管理、CSV/XLSX、監査、印刷が全PASS。
- 037〜040の使い捨てDBへの新規適用と権限verifierがPASS。runtimeが監査UPDATE/DELETEできず、maintenance roleのみ3年経過分を関数経由で削除可能。
- GCP現物のservice/revision/traffic/IAM/Cloud SQL/Secret/DNS/HTTPS/backup/PITRを確認し、対象revisionと切り戻し手順を記録。
- UNIONとGENERALのURL、brand、audience、cookie非共有、CORS/CSP、同意、営業利用境界が本番設定で分離される。
- GENERAL同意が未承認ならGENERAL routeを公開しない。
- 本番Migration、deploy、traffic変更の明示的な承認者と実行者が確定。

上記のいずれかが満たされない場合はNo-Goを維持する。

## 9. 未確認事項

- GCP再認証後の現行リソース一覧とロール実名。
- OTP専用service名、リージョン、service account、ingress、min/max instance、Cloud SQL connector。
- `pira.atlib.jp` と `/security-check/` の実DNS/LB/Apache経路、証明書、health check。
- Secret名、アクセスロール、SMTP送信上限、Turnstile site/secretの分離。値自体は取得対象外。
- 本番DBのowner/runtime/migration/maintenance role、backup/PITR、保持ジョブ。
- GENERAL同意文言の最終承認。
