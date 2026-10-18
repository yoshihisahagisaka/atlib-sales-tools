# PIRA Phase 1：専用検証環境への適用前判定

日付：2026-10-18 JST。対象実装：`03679c544da26b0749efa5b81a9291c15e7dcc2a`。
**判定：現時点はNo-Go。実環境の事実確認と検証先の確定が不足している。コードレビュー/検証準備は実施可能。**
今回の変更は読取collector、検証用テスト、構成・権限・復旧計画、固定manifestのみ。Production、実DB、Docker resource、Secret、通知先設定の変更なし。通知実送信なし。

## 1. Canonicalと事業決定

| 対象 | fresh readの結果 |
| --- | --- |
| Sales main | `d35581cec3dbc7d4ca2938f2a9c664906ccc5316`、変更なし |
| Draft #13 | head `0d219617ecf23646633ca2764eb83e4420caaf48`、base main |
| Draft #14 | 調査開始時head `03679c544da26b0749efa5b81a9291c15e7dcc2a`、baseは#13のbranch |
| migration | mainの001〜036、filenameは38個（018/019各2個）。実適用ではなくGit上の事実 |
| Corporate #16/#27〜#41 | 既読の業務決定から更新なしを確認。#41の既存InfraVision UUID/code維持と機能非複製を継承 |
| Corporate #42 | 専門支援は共同購買3サービスに追加しない。紹介料はatLIB案件粗利益を基準、検討レンジは未確定。今回の申込/料金モデルへ追加しない |
| Corporate #43 | 組合自身への支援価値→所属企業への展開という提案ストーリー。診断/営業目的の分離を維持。今回の完了通知producerを作る根拠ではない |

#13→#14の履歴をそのまま使い、設計文書やDDLを二重cherry-pickしない。準備の追記は#14の子commit。main mergeはしない。Production Canonical文書、filename ledger/advisory lock方式、036のhistorical default ACL知見を維持する。

## 2. Production読取結果

| 項目 | 今回の実測／限界 |
| --- | --- |
| Cloud Run revision/traffic/image | `gcloud run services describe sales-tools`が既存logs/credentials.dbへPermission denied。未取得 |
| Production↔main SHA | digestが未取得のため未確認。mainをProduction SHAと推定しない |
| 実ledger/schema/index/role/ACL | read-only接続が未設定。collectorはSKIPし接続しなかった |
| company重複 | 未取得。企業名/法人番号/メール等の実データ出力なし |
| 管理/auth/通知の接続 | 指定SHAのコード構成は確認。実Cloud設定・IdP登録・Webhookの稼働先は未確認。Secret値は取得しない |
| Docker | contextはdesktop-linux。Engine pipe接続がPermission denied。version/image/container/volumeの一覧は未取得 |
| ホスト容量 | C:空き10,305,232,896 bytes（約9.60GiB）。image/volume増分は未見積り |
| 候補ポート | Get-NetTCPConnectionで55442/55443/18082の該当行なし。ただしDocker公開設定/起動直前の再確認が必要 |

認証情報のコピー、gcloud設定切替、Docker context切替、権限追加で回避していない。実環境確認はここで停止し、以下のユーザー端末読取へ引き継ぐ。

```powershell
# gcloud既存ログインが使用できるユーザー端末。認証/設定変更はしない。
.\scripts\pira\production-readonly.ps1

# Docker既存状態だけ。inspectのConfig.EnvやSecret内容は出力しない。
docker context show
docker version --format '{{.Server.Version}}'
docker image ls --format '{{.Repository}}:{{.Tag}} {{.ID}} {{.Size}}'
docker ps --format '{{.Names}} {{.Image}} {{.Ports}}'
docker volume ls --format '{{.Name}}'
```

ProductionのDBバージョンはread-only collectorのserver.versionで確認する。Cloud SQL instance名が既存構成記録で確定した場合のみ、ユーザー端末で以下を使える。インスタンスを推測して操作しない。

```powershell
gcloud.cmd sql instances describe <確認済みインスタンス名> --project=msp-zabbix --format='value(databaseVersion)'
```

DBは既存の承認済みread-only接続を安全にPIRA_READONLY_DB_URLへ設定し、PIRA_EXPECTED_DATABASEに接続先の期待DB名を設定する。URL/パスワードを出力しない。

```powershell
node scripts/pira/preflight.cjs
```

collectorはBEGIN READ ONLY＋15s timeout。実ledger、バージョン、列/制約/index/owner、role属性・所属、default ACLとruntime実効SELECT/INSERT/UPDATE/DELETE/TRUNCATEを取得する。companyは総件数・法人番号欠損・正規化法人番号重複グループ数・trim/lower企業名重複候補グループ数だけ。会社名一致を同一法人と認定しない。name/番号は集計内部で使用するだけで、出力しない。role metadataにパスワード/hashを含めない。
collectorへのメタデータ追加SQLは実PostgreSQLでは未実行。権限で見えない定義は「なし」と断定せず、owner側の限定read確認を追加する。認証情報の権限拡張をこの作業のために実施しない。

## 3. 検証環境の推奨構成

**PIRA専用のローカルDocker clusterを新設する計画**を推奨する。ただし今回の作成は不可。Secure SendやFACTACTのDB/volume/container/network/認証を流用しない。Production DBから顧客データを複製しない。

| 項目 | 検証用 | 復元確認用 |
| --- | --- | --- |
| compose project | pira-joint-purchase-validation | 同projectのrestore profile |
| container | pira-joint-purchase-validation-db | pira-joint-purchase-restore-db |
| DB | pira_joint_purchase_validation | pira_joint_purchase_restore |
| host port | 127.0.0.1:55442 | 127.0.0.1:55443 |
| volume | pira_joint_purchase_validation_pgdata_v1 | pira_joint_purchase_restore_pgdata_v1 |
| app候補 | localhost:18082、PIRA専用設定 | appを接続しない |
| memory/cpu上限案 | 768MiB / 1 CPU | 同左。復元時だけ起動 |

構成雛形：`docs/pira-validation-compose.draft.yaml`。imageは必須変数PIRA_POSTGRES_IMAGEを**official postgresのdigest固定**で指定する。latestや未固定tagで作成しない。既存の互換official imageがあれば新規downloadを避けられるが、一覧未取得なので再利用可否は未確定。Supabase固有image/初期化処理を、そのままPIRAの基盤として採用しない。

バージョン候補は**PostgreSQL 16.xを優先**（既存Salesの隔離リハーサル基準）。実Production majorが異なる場合は、そのmajorとの追加互換試験を条件とする。既存official 17.xを使う案も検証可能だが、16/17のどちらを適用対象にするか、patch/digest、使用領域はDocker/Productionの読取結果後に固定する。PG18以降へ無断変更しない。現在のテストは16/17のみを受け入れる。SQLの静的互換性と実環境PASSは区別する。

SecretファイルはGit外の承認済みローカル保管場所、検証/復元/各roleで別の値とする。パスの環境変数だけをcomposeへ渡し、値は保存/出力しない。今回Secretファイルを作成していない。

## 4. DB roleと分離

| role | 責務・許可 | 禁止 |
| --- | --- | --- |
| dedicated cluster admin（postgres） | 初期role/DB権限、backup/restore対象の確認 | runtime利用、既存clusterでのrole上書き |
| sales_tools_migration | 専用DBのschema作成・DDL所有、合成fixture投入 | SUPERUSER/CREATEDB/CREATEROLE/他DB接続、web利用 |
| sales_tools_app | app SQL、company参照/新規、確定見積参照、専用表の必要DML | schema CREATE、role変更、audit/order/termsの更新・削除・TRUNCATE |
| pira_validation_readonly | metadata/ledgerとcompanyの限定列集計 | DML/DDL、アプリ利用、パスワード参照 |

同名のcanonical roleを使うのは**専用cluster内の別資格情報**であり、Productionのroleを共有する意味ではない。全roleを非SUPERUSER・非BYPASSRLS・非CREATEDB/CREATEROLE・NOINHERIT、PUBLICのschema CREATE/DB CONNECTを除き必要な接続だけ許可。実role membership/ownerも検査する。readonlyはdefault_transaction_read_onlyだけに頼らずACLで書込を拒否する。

雛形は `docs/pira-validation-roles.draft.sql` と `docs/pira-validation-post-acl.draft.sql`。初期role名が既にある場合は上書きせず停止。passwordは別承認後のpsql `\password`等の非表示入力で設定する。SQLに値を埋め込まない。

PIRAの組合/企業認可は**アプリの現在membership照合＋scope付FK**による。RLSは実装していない。各組合/企業にDB role/接続を配布しない。runtime DB roleはサービスの信頼境界内であり、DB単体がcallerの組合を自動認識する仕組みではない。

## 5. 最終DDLと依存の固定

**今回、実装DDLのbyteは変更しない。** 最終レビュー対象は#14の `docs/pira-phase1-schema.draft.sql`。hash/byte数と依存・補助SQLは `docs/pira-phase1-validation-manifest-20261018.json` に固定し、以下で照合する。

```powershell
node scripts/pira/verifyValidationPackage.cjs
(Get-FileHash docs/pira-phase1-schema.draft.sql -Algorithm SHA256).Hash
```

manifestのddlSha256を承認記録へ添える。採番は**未確定のまま**。037以降の他レーン予約/適用状況を実ledgerで確認するまで番号を割り当てない。

固定DDL：7430 bytes、SHA-256 `b3ef7ec8eeae8da9afefe8e40ac0c58fc1d27edb3b167b6701684f2757393df9`。

| 観点 | 静的確認と実DBで残る確認 |
| --- | --- |
| 既存object衝突 | mainの番号付きSQLにpira_*定義なし。実DBでの手動作成/他branch由来は未確認 |
| company FK | 既存company.id UUIDへ参照、新規DDLから既存行の書換/統合/DELETEなし。既存会社名・メールによるbackfillなし |
| 所属/越境 | affiliationの組合+company一意、application→affiliation、order→applicationの複合FK。scope認可はservice層で再確認 |
| 二重発注 | application_id UNIQUE、番号UNIQUE、transaction advisory lock、request/version照合 |
| snapshot | terms/order/auditはUPDATE/DELETE trigger拒否。runtimeからUPDATE/DELETE/TRUNCATEを明示REVOKE。payloadの料金/数量はserver承認条件から構築 |
| audit/outbox | 同一connection/transactionで発注・申込状態・監査・outboxをcommit。DBが自動でauditを生成する方式ではない |
| lock/rollback | 業務はlock_timeout 5s、statement_timeout 15s、全体transaction rollback。pool.releaseはfinally。Migrationと業務lockは別key |
| 既存table影響 | 11新規表/index/function/trigger/ACLのみ。FK追加時の既存company/estimates参照lockは実PGで測定。既存SQL改変なし |

CHECKのJSON値域や一部必須項目はAPI strict validationと併用する。SQLへ直接不正payloadを書ける権限を外部に与えない。実DB検証では複合FK、UNIQUE、immutable trigger、実効ACLを個別に確認する。

適用profileを混同しない：

1. **PIRA最小結合profile**：空の専用検証DBに、hash固定の既存002（見積）→027（company/contact等）→PIRA DDL。既存SQLを改変せず依存を再現する。Production clone/全Sales再現を意味しない。専用fixture適用履歴は別証跡とし、Productionのledgerを捏造しない。
2. **Sales全体回帰profile**：mainの全38ファイルと既存release allowlist/歴史的ACLを別途レビューして同じ専用環境の別リハーサルで再現。元のSQLを無条件にまとめて実行しない。PIRA最小profileに続けて同じ既存SQLを二重適用しない。必要なら検証DBを再初期化する別承認計画に切り替える。

この段階の固定hashは最小結合profileの依存002/027とPIRA DDL、権限/構成/テストの準備ファイル。全体回帰profileの全migration適用承認はまだ含まない。

最小profileの順序：専用container/DB確認→role雛形とpassword設定→migratorで002→027→適用前backup→migratorでPIRA DDLを1 transaction→post ACL→owner/制約/index/実効ACL検証→合成bootstrap/fixture→realPGテスト。前提欠落・lock timeout・途中失敗ではrollbackし、成功したfile/hash/時刻だけを記録する。PIRA DDLとledger記録を別commitへ分離しない方式は番号付きartifact確定後に既存runnerへ統合する。

## 6. 結合テストの準備

`test/piraPhase1.realpg.test.cjs`を用意した。**DDLやcontainer作成を含まない**。承認済みの適用済み専用DBだけに合成DMLを行い、履歴は削除せず検査用に残す。一般のDATABASE_URL/.envを読まず、3接続とも127.0.0.1/localhost・55442・DB名pira_joint_purchase_validation・指定roleを強制。Production、FACTACT54322、復元DB55443、Send DB、URL queryによる接続先overrideは拒否する。

現時点の実行はSKIP。別工程で次の条件が揃って初めて接続可能：

```powershell
# 別承認後のみ。各URLは安全なセッション設定を用い、表示/履歴へ値を残さない。
# PIRA_VALIDATION_RUNTIME_DB_URL / FIXTURE_DB_URL / READONLY_DB_URL
$env:PIRA_VALIDATION_DML_APPROVED='pira-local-dml-approved'
npm.cmd run build
node --test --test-reporter=tap test/piraPhase1.realpg.test.cjs
```

| ID | 項目 | 準備済み手段／受入結果 |
| --- | --- | --- |
| PG01 | 申込/所属/差戻し/修正/取消 | 合成2組合・企業、履歴と版を確認。現コードのrealPG suiteで実行予定 |
| PG02 | 正式発注20並列・再送 | runtime pool24接続。全結果同じorder、DB件数1、snapshot一致 |
| PG03 | 競合・権限 | 他組合/委任なし担当者拒否、membership停止後session拒否、transaction途中abortでoutbox行が残らない |
| PG04 | DB防御 | runtimeが固定orderをUPDATE/DELETEできず、audit DELETE/terms TRUNCATE/schema CREATE権限がない。復元後にも同じ検査 |
| PG05 | 発注/監査/outbox整合 | order_confirmed audit1件、対応outbox1件。未設定配送はunconfiguredで業務保持 |
| PG06 | lock timeout競合 | 追加の手動/分離テストで一方が同advisory lockを保持→他方を5s timeout→新規申込/発注/監査/outboxの部分行なし。lock解放後同key再試行。今回まだ実行していない |
| PG07 | 別key同一申込・料金版/見積版変更 | 既存in-memory testと同じ期待を実PGへ展開し、UNIQUE/古い版拒否を検査。実環境PASSは未取得 |
| AUTH01 | 4roleと越境 | 社内・組合admin・担当・企業adminそれぞれ現在membership。外部cookieで/api/adminに入れない |
| AUTH02 | Google OAuth/PKCE | localhost固定callback、state/nonce/PKCE、事前登録以外拒否、sub再binding拒否、session cookie/CSRFを実browserで確認 |
| AUTH03 | 停止/変更 | sessionを保持したままmembershipを停止/発注委任を外し、次request拒否。Google側停止だけで即時失効すると推定しない |
| N01 | Slack/メール | まず注入deliveryの失敗/再試行/lease/重複を実PGで確認。その後に限り別承認した専用Webhook/受信先へ実配送 |
| N02 | 通知監査 | 業務transactionと配送結果を分離、eventId同一、失敗時pending/8回dead、配送監査。受理直後timeoutはat-least-once重複可能 |

realPG suite中のGoogle bindingは合成値を直接serviceへ与えるfixtureであり、Google実認証のテストではない。通知はunconfiguredまたは注入doubleまでで、suiteから実Slack/SMTPへ送信しない。

Googleは既存installed OAuth2Client/PKCEを使う。**社内用OAuth clientが外部利用者を許可するかは未確認**。既存clientを外部へ変更せず、localhost callbackの追加可否/consent screen/対象テストアカウントを確認する。別clientが必要なら別承認。検証用Googleアカウントは企業実顧客でなく、承認済みテスト用とする。

ローカルでできる範囲：SQL/排他/ACL/rollback、fixture認可、UI/CSRF、配送double、backup/restore。Google/Slack/SMTP実サービス検証は外部接続と登録設定が必要だが、appをCloudへ新規deployすることは必須ではない。IAP/Cloud Run/Secret Managerによる構成同等性はさらに後の隔離Cloud検証で扱い、既存sales-toolsへ検証版を反映しない。

Slack実接続が必要になった時の手順は既存Phase 1 Runbookを継承：ユーザーがC0C9YB6F49H向け専用Incoming Webhookを確認/作成→Secret経路で注入→投稿内容/時刻を承認→初回テスト。URLをチャット/Gitへ貼らない。メールも承認済みテスト受信先のみにし、送信前に組合連絡先が全て合成値か確認する。診断完了producerは未実装のまま。

## 7. 既存機能の回帰

前回証跡 `docs/evidence/pira-phase1-20261018/` は上書きしない。全build PASS、追加12PASS/4SKIP、模擬API browser4PASS、既存78PASS/2FAIL/1SKIPを維持する。旧Current Design v1の2失敗はmain由来のdomain/testを別取得して再現済み。この2件を新規回帰へ数えず、期待値を修正して隠さない。

| 対象 | 適用承認後の確認 |
| --- | --- |
| IT経営KAIZEN | 既存golden＋freeDiagnosisRuleBasedV1VerticalSlice/DesignV2 integration、ログイン/一覧/本人回答/代理入力の既存API。旧2失敗との集合差を確認 |
| 業務KAIZEN | businessWebConsultation.golden/api、通知double、既存管理UI。新機能は追加しない |
| InfraVision Partner | partnerLeadHttpIntegrationのpublic/admin/CORS、通知double、status更新 |
| Web Development Partner | 同HTTP回帰＋webDevelopmentPartnerLeadRepoのconsultation_type維持 |
| 見積 | 既存estimates APIの認証/一覧/確定/不正status、見積版変更時InfraVision発注保留 |
| 社内認証 | productionReadiness.securityのJWT purpose/期限/改ざん、OAuth state/returnTo、既存gate、外部cookie拒否 |

実API/browserの回帰はPIRA最小profileだけで実行可能とは言わない。fullbaselineと合成データ・専用設定が必要。既存server起動時の自動workersがProduction/実SMTP/AIへ接続しないことを先に確認し、mainのloadConfigを未設定のまま起動してSecret Managerへfallbackさせない。必要な環境変数/SMTP double/worker運用を隔離環境用に固定する。

## 8. backup・restore・切戻し

対象はPIRA専用の合成データのみ。backup先をGit外の承認済みフォルダーへ固定し、権限・空き容量・hashを確認する。下記は**別承認後のみ**のコマンド例で、今回未実行。

```powershell
if($env:PIRA_VALIDATION_RESOURCE_APPROVED -ne 'pira-local-resource-approved'){throw 'Separate approval required'}
docker compose -f docs/pira-validation-compose.draft.yaml up -d postgres
```

role/依存SQL/DDLはmanifest照合後、専用targetを目視確認して、承認した1fileずつ `psql -X -v ON_ERROR_STOP=1 --single-transaction -f <承認ファイル>`。migration SQLのshell自動連結/Production接続URLの使い回しはしない。今回は適用コマンドを実行するscriptを提供しない。

backup/restore例（ユーザーがbackupディレクトリと実対象を確認後）：

```powershell
docker exec pira-joint-purchase-validation-db pg_dump -U sales_tools_migration -d pira_joint_purchase_validation --format=custom --file=/tmp/pira-before.dump
docker cp pira-joint-purchase-validation-db:/tmp/pira-before.dump "$PiraBackupDirectory/pira-before.dump"
Get-FileHash "$PiraBackupDirectory/pira-before.dump" -Algorithm SHA256
docker compose -f docs/pira-validation-compose.draft.yaml --profile restore up -d restore
docker cp "$PiraBackupDirectory/pira-before.dump" pira-joint-purchase-restore-db:/tmp/pira-before.dump
# restore側の空DBと対応roleを、別承認の専用bootstrapで準備した後のみ
docker exec pira-joint-purchase-restore-db pg_restore -U postgres -d pira_joint_purchase_restore --exit-on-error --single-transaction /tmp/pira-before.dump
```

pg_dumpはcluster roleを含まないため、restore側にも同名role（別cluster/別password）を事前準備する。`docs/pira-restore-roles.draft.sql`が専用restore bootstrap。validation側のDB名guardを手作業で解除しない。owner/ACLを保持してrestoreし、table/constraint/index/trigger/role権限と合成行件数・固定snapshot/outboxを照合する。空DBなので`--clean`やDROPを使わない。dumpがあるだけではrestore PASSにしない。

停止は対象container名を確認して専用composeのstop。`down -v`、volume削除、image prune、FACTACT/Sendのstop、DBのDROP/再初期化は本計画に含まない。切戻しは検証app/worker停止→合成データ/監査保全→新規PIRA機能OFF→前進修正または承認済みrestore先への切替。既存Productionには戻すべき変更がない。

## 9. Go条件と残るNo-Go

| Gate | 現在 | Goに必要な証拠 |
| --- | --- | --- |
| G1 Production provenance | 未取得 | traffic対象revision/image digest↔Git/build記録 |
| G2 Production schema | 未取得 | 実ledger/owner/ACL/index/company集計、番号予約衝突なし |
| G3 local target | 未確定 | Docker image/version/digest・専用resource名・ポート・容量予算の確認 |
| G4 immutable package | 準備済み | manifest/hash一致、profileと対象DBの承認 |
| G5 roles/backup | 設計済み・未実証 | role/資格情報投入担当、backup保存先、restore bootstrapと実証手順のレビュー |
| G6 external integration | 未接続 | Google外部テスト利用可否、専用Webhook/メール宛先の別承認 |
| G7 actual application | 未承認 | 実DB適用とresource作成の明示的な別承認 |

現時点でG1/G2/G3/G5/G7が揃わないため、**検証環境作成・DDL適用はNo-Go**。G6はローカルSQL検証とは切り分け、実通知/実OAuthへ進む段階で必要。認証/通知を接続しないままローカルDBを作ってよい、という承認も今回与えられていない。

統括への次の提出物はユーザー端末のread-only結果と対象image/DB/backup先の確定案。その後、固定manifestを添えて専用環境作成・最小profile適用の承認を別途判断する。本作業はこの資料・検証準備の提出で停止する。

## 公式仕様の補足参照

- [PostgreSQL 16 pg_dump](https://www.postgresql.org/docs/16/app-pgdump.html)：単一DBのdumpとcluster共通roleの扱い。
- [PostgreSQL 16 pg_restore](https://www.postgresql.org/docs/16/app-pgrestore.html)：custom archive、単一transactionでの復元。
- [Docker Official postgres image](https://hub.docker.com/_/postgres)：password fileと16/17系data directory。実image/digest確認は別途必要。
