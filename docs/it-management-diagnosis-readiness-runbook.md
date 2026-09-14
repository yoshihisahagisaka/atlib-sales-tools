# 無料 IT経営診断 deployment / recovery runbook

2026-09-13。正本は git_KAIZEN docs/32。**本番で実行済みの手順ではない**。Gate判定とEvidenceは [readiness report](it-management-diagnosis-production-readiness.md)。本番変更は担当者が環境・対象・backup・承認を確認して実施する。Secret値、顧客本文、DB dumpをGitや作業ログへ記録しない。

## 1. 環境を特定する

既存 `運用手順書_デプロイ.md` の記録は project `msp-zabbix`、region `asia-northeast1`、service `sales-tools`、Cloud SQL `msp-customer-portal-db`、database `sales_tools`。現存設定の証明ではない。既存手順はGCE `msp-frontend-server` のcloud-sql-proxy経由でcheckout + npm install + `npm run migrate`。runtimeコンテナ内のmigration運用ではない。

担当: Platform/DB運用責任者（実名・連絡先・実行日を投入前に記入）。OAuth操作はWorkspace管理者。現在gcloudは再認証が必要。操作者の端末で `gcloud auth login` 後、次の**read-only**確認を行う。`gcloud ... describe`の無加工出力や環境変数の値を共有しない。

```sh
gcloud run services describe sales-tools --project=msp-zabbix --region=asia-northeast1 --format='json(spec.template.metadata.annotations,spec.template.spec.serviceAccountName,spec.template.spec.containerConcurrency,status.latestReadyRevisionName,status.url)'
gcloud sql instances describe msp-customer-portal-db --project=msp-zabbix --format='json(databaseVersion,settings.backupConfiguration,settings.ipConfiguration.ipv4Enabled)'
gcloud sql backups list --instance=msp-customer-portal-db --project=msp-zabbix --format='table(id,status,startTime,endTime)'
gcloud secrets list --project=msp-zabbix --format='value(name)'
```

Secretの存在だけでPASSにしない。Service AccountのSecret Accessor/Cloud SQL Client、使用version、接続成功を確認する。OAuth Consoleのredirect allowlistは実際に提供するHTTPS origin + `/auth/callback`と一致させる。既存docsのrun.app URLと `.env.example` のsales.atlib.jpは異なるので実環境で確認する。全atlib.jp Workspaceユーザーが同一権限という現仕様を運用責任者が認識する。

## 2. buildとmigration artifact

```sh
npm ci
npm run build
docker build --target runtime -t REGISTRY/sales-tools:REVIEWED_SHA .
docker build --target migration -t REGISTRY/sales-tools-migration:REVIEWED_SHA .
```

同じcheckout/lockfileの二つのimageをdigestで記録する。runtimeはprod dependency + dist + public、migration targetはprod dependency + dist + SQL。いずれもUID1000。runtimeにts-node/SQLはない。`npm run migrate:artifact` はcompiled JS用だがSQLディレクトリが必要であり、runtime内で実行しない。legacy `npm run migrate` は `.env` とdev dependencyを持つ既存運用端末向けに維持した。起動時自動migrationは追加していない。

専用deploy前Job/CIからmigration imageの既定command `node dist/db/migrateCli.js` を実行する。注入するのはDB_NAME/DB_USER/DB_PASSWORD（Secret参照）とDB_SOCKET_PATHまたはDB_HOST/DB_PORT。SMTP/OAuth/AIのSecretをmigrationへ渡す必要はない。Cloud SQL mount、Service Account、timeout、DB変更権限を設定する。Job作成自体は未実施。

runnerは一つのDB connectionでadvisory lockを取得し、全migrationを直列化する。各SQLとschema_migrations挿入は同一transaction。二重deployでも二重適用しない。同じlockを使わない旧runner/手作業DDLは並列実行禁止。Job全体のtimeoutを運用側で設定し、長時間lock待ちは原因を調べて中断する。SQL失敗はexit非0、後続deployを止める。先行migrationのCOMMITまで巻き戻るという意味ではない。

## 3. deploy前 / rollback / restore

1. 現行revision/image digest、schema_migrations、DB version、backup ID、時刻、担当者を記録。backupがSUCCESSでrestoreできることを別DBで実証する。Cloud SQL PITR有効/保存窓/復旧先容量/IAMを確認。
2. 顧客データを新たに共有せず、アクセス制限したproduction clone相当DBでmigrationをrehearsal。001–003の手作業適用履歴があるため、実schemaとledgerを照合する。欠落ledgerを無検証で埋めない。
3. migration Jobを一回実行し、exit0、ledger、legacy API、新Case読み取りを確認。失敗したら新revisionにtrafficを流さない。
4. stagingで両経路E2Eと通知を確認後に本番revisionを段階的に切替。今回のbranchはNO-GOのため実施しない。
5. app不具合時は直前revisionへtrafficを戻す。DDLがadditiveで旧app互換ならDBをそのまま保持できる。例: `gcloud run services update-traffic sales-tools --project=msp-zabbix --region=asia-northeast1 --to-revisions=VERIFIED_PREVIOUS_REVISION=100`。旧revisionの互換性を先に確認する。
6. DB破損時は書き込みを停止しbackup/PITRから**別instance/DB**へrestore。ledger、row count、FK、report/handoff trigger、synthetic smokeを確認して接続先を切替。復旧時点以降の差分は監査記録と照合し、再入力はHuman判断。新旧DBを混在して書き込まない。

down migration、既存SQLの書き換え、承認snapshotのSQL修正は行わない。Cloud SQL Console/現在のgcloud公式手順でbackup IDと復旧先を選び、破壊対象をDB責任者が確認する。最新docs/66〜70の内部目標はRPO ≤24h、RTO ≤24h、Backup保持30日。顧客向けSLAではなく、設定のみでPASSにしない。最新Fit/Gapは [closure status](controlled-pilot-policy-closure-status.md)。

### Controlled Pilot restore — 上記手順6のtraffic復帰前に必須

1. 平常時に `buildDeletionReconciliationManifest` の出力をDB/backup系統外へ永続化する。保管先、権限、完全性、更新頻度、最新削除までの網羅性をEvidenceで確認する。現在この外部保管jobは未実装であり、DB内tombstoneだけでは復元安全性を満たさない。
2. 隔離DBへrestoreし、reviewed revisionのmigrationを適用する。外部manifestの版・hash・出所・更新時点を照合する。hash一致だけでは出所や完全性の証明にならない。
3. `reconcileDeletionManifest` のVERIFYで対象を確認し、承認済み範囲をAPPLYする。VERIFYは対象存在確認であり「削除済み」の証明ではない。物理DELETE・未対応分類・不整合・再適用失敗があればtraffic復帰を止める。
4. 対象別にRaw削除/マスキング結果を検査し、再APPLYが冪等であること、Approved Report/Handoff/Decision/Auditの内容・参照・不変性が保たれることを確認する。対象フィールドのマスキングをCase全体の匿名化完了とは扱わない。
5. 復元DBに接続したアプリの認証・案件読取・合成smokeを確認する。停止開始、復元可能時点、復旧完了時点から実測RPO/RTOを記録し、30日保持設定と実backup履歴を確認する。
6. DB/Operations責任者がEvidenceを確認してからtraffic復帰を判断・記録する。実名owner、外部manifest保管、実Cloud SQL rehearsalが揃うまで本手順はBLOCKED_EXTERNAL。

ローカル再現（本番データ禁止、Docker Desktop起動済み）:

```sh
docker run -d --name diagnosis-readiness-pg --label purpose=diagnosis-readiness -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=readiness -p 127.0.0.1:55436:5432 postgres:16-alpine
docker build --target runtime -t diagnosis-readiness:runtime .
docker build --target migration -t diagnosis-readiness:migration .
docker run --rm --network container:diagnosis-readiness-pg -e DB_HOST=127.0.0.1 -e DB_NAME=readiness -e DB_USER=postgres -e DB_PASSWORD=disposable-readiness-only diagnosis-readiness:migration
node scripts/readiness/rehearse-docker.cjs
```

最後のscriptは固定名・purpose labelを検証し、synthetic markerをpg_dump/custom形式でbackup、`readiness_restore`を再作成してpg_restore、ledger12件/trigger/markerを照合、復元DBへruntime接続、health/auth/static/prod dependency/no AI keyを検証する。既存 `readiness_restore` はこの使い捨てcontainer内でのみ削除・再作成する。テスト専用containerは確認後に `docker rm -f diagnosis-readiness-pg` で片付ける。

## 4. Worker / capacity

現在4 pollerがWeb process内で約5秒ごとに実行する。request後もCPUを割り当てるinstance-based billing（CPU throttling無効）とmin instances>=1が必要。minだけ設定してもrequest外CPUの保証にはならない。scale-to-zero時にqueueだけではinstanceが起動せず滞留する可能性がある。設定変更を本書だけで実施済みとは扱わない。

確認例: revision annotation `run.googleapis.com/cpu-throttling` とmin/max instances、現行課金方式を運用者が照合。無requestでenqueue済みexecutionが処理されること、複数instanceで一回だけclaimされること、deployで中断後にleaseが回収されることをstagingで測定する。

参考: [Cloud Run billing settings](https://docs.cloud.google.com/run/docs/configuring/billing-settings)、[minimum instances](https://docs.cloud.google.com/run/docs/configuring/min-instances)、[container contract](https://docs.cloud.google.com/run/docs/container-contract)。

DB poolはprocessあたりmax5、接続待ち10秒。必要接続枠は少なくとも `5 × 同時稼働instance数（旧新revisionを含む） + migration/運用/他app`。Cloud SQL max_connectionsと余裕枠に収める。HTTP concurrencyの値をそのままDB接続数と考えない。実Cloud Runの上限・接続枠は未検証。

provider timeout60秒、worker timeout65秒、lease2分。中断は次回同process pollで `AI_WORKER_INTERRUPTED` にFAILED化する。自動再実行ではない。担当者が新executionを要求するかHuman-onlyで続行する。FAILEDをSUCCEEDEDへ書換えたり、AI成功のためにCase状態を戻したりしない。request外CPUなし/DB障害ならこの回収も動かない。

## 5. 監視 / incident

`scripts/readiness/observe.sql` はREAD ONLYでledger、Case状態件数、queue滞留、FAILED reason、lease失効、audit command件数、DB接続数のみ取得する。本文/連絡先/token/AI outputを監視へ出さない。`/healthz`はlivenessでありDB/AI正常の証明ではない。

| Signal | 検出と初動 | 責任者 |
|---|---|---|
| service停止/5xx増加 | uptime/Cloud Run revision logs、safe `fatal_startup_error`、直前revisionとの比較 | Platform |
| DB障害/timeout | `database_pool_error`、`it_management_diagnosis_command_failed`、接続枠・Cloud SQL状態、無断migrationしない | DB/Platform |
| AI失敗/滞留 | read-only SQLでprocess/status/error_code/age確認、Workerログ、lease回収後Human-onlyまたは新execution | Platform + 診断担当 |
| 通知失敗 | `it_management_diagnosis_notification_failed` / `slack_notification_failed` / `Slack notification failed: HTTP ...`、SMTP/Slack delivery確認。Case一覧で完了を確認し手動連絡 | 診断担当 |
| OAuth異常 | `/auth/*` 400/403頻度、`staff_oauth_token_exchange_failed`、`staff_id_token_verification_failed`。client/redirect/Workspace状態を確認、認証bypassしない | Workspace管理者 |
| migration失敗 | `migration_failed` / `migration_run_failed`、filenameとledgerを照合、deploy停止 | DB |
| 誤Report/Handoff | ReportはHuman Review/新version/再承認。Handoffは新versionで再生成・再transfer。配布先へHumanが訂正連絡。旧snapshotは保持 | 診断責任者 |
| Secret/PII漏洩疑い | 公開/書込を止め、閲覧を制限して証跡保全、責任者へ連絡、鍵失効/rotation、影響Case特定。顧客通知等は責任者判断 | Security + Product Owner |

Cloud Monitoring uptime/log metric/alert routingは未作成・未確認。notificationはbest effortでdurable queue/retryはない。無request CPUも含めて受信テストが必要。alert閾値、一次/二次対応者、通知先、当番、RPO/RTOを投入前に確定し、実際にtest alertを受信する。

このhardeningでJWTにpurpose検証を追加したため、旧スタッフsession/stateは再ログインが必要。鍵rotation時も全session失効する。顧客Case tokenのrevokeはスタッフの既存操作を使用する。

## 6. 残る外部検証を閉じる

1. Platform管理者がGCP再認証と必要なread権限を準備し、設定Evidenceを値の秘匿付きで記録する。
2. 安全なstagingとsynthetic会社を用意。実Workspace許可/非許可accountでOAuthを検証する。cookie/tokenを保存資料へ含めない。
3. Secret Managerから実Anthropicキーをstagingへ注入しAI-01〜04を各1回成功させる。実顧客データは使わない。ローカル実PG suiteは `RUN_READINESS_PG=1`、実AI追加は `RUN_READINESS_AI_LIVE=1` とキーが必要。未設定時は実AI成功と記録しない。
4. docs/32 Gate KのWEBとSALES_VISITを実UI/実Worker/実通知でCLOSEDまで完走。EvidenceにはCase/execution ID、model/prompt version、state、Human Gate、通知受信時刻、snapshot hashを記録し、Raw本文やSecretは含めない。
5. retention/削除/Transcript/復旧目標のBusiness判断とsecurity残課題を解決し、matrixを再判定する。
