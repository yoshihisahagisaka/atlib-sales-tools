# SECU:MIE Insight Production Gate B5｜Owner承認設定の正本化とB5-2構築前Preflight

記録日: 2026-11-17 JST  
Repository: `yoshihisahagisaka/atlib-sales-tools`  
Release PR: Draft #47 / `release/secumie-insight-production`  
Read-only照合基準HEAD: `8f1eb64f59fde72b735a396140559c93e30748c4`  
Status: **B5 preparation only / Production No-Go / GENERAL disabled**  
本書の作成はCloud Run、Cloud SQL、IAM、Secret Manager、Artifact Registry、Load Balancer、DNS、Scheduler、Sales Tools Traffic、Retentionへの操作承認を意味しない。

## 1. 正本の範囲と優先関係

- B0–B4の本番DB構築・Migration・受入証跡は既存 `docs/secumie-production-gate-b0-approval-20261115.md` と `release/secumie-production-gate-b-manifest.json` に保持する。B4のAcceptance-only recoveryは `secumie-db-acceptance-prod-8xkzq`、SUCCEEDED 1/1、retry 0、ledger 037–041、保持preview、synthetic residue 0 を報告済み。B5ではDB Migration・Bootstrapを再実行しない。
- B5のURL、Identity、SMTP、Turnstile、JWT、runtime、監視、rollbackのOwner選択は本書を構築候補の正本とする。既存の `docs/secumie-gcp-production-deployment-design-20261104.md` とPhase 2B/2D/2Fに残る `pira.atlib.jp`、旧Cloud SQL再利用案、公開順序は当時の履歴であり、B5では採用しない。歴史的記録を遡及的に書き換えない。
- 既存コードの契約は `src/runtime/runtimeConfig.ts`、`src/db/secumieDbOperationsConfig.ts`、`src/db/secumieRetentionCli.ts`、`src/runtime/publicOtpRuntime.ts`、`src/runtime/piraPublicRuntime.ts` を参照する。仕様・診断8問・レポートv7は変更しない。
- `release/secumie-production-gate-b-manifest.json` の `network.ingress=internal` はB0–B4 DB Jobs用であり、B5のOTP/PIRA Cloud Run runtimeにそのまま適用しない。runtime候補は `internal-and-cloud-load-balancing`。
- 別レーンのIT経営KAIZEN/FACTACT、既存Sales Tools、Secure Send/PPAP、Secure Guard、`www.atlib.jp`、Stagingの変更は本書の対象外。

## 2. Owner承認済みDeployment Configuration（実設定は未確認）

| 項目 | B5候補の固定値と条件 |
| --- | --- |
| Production host | `https://insight.atlib.jp/`。Staging `pira-staging.atlib.jp` は不変更、内部initiative code `pira-union` は不変更 |
| Production project/region | `msp-zabbix` / `asia-northeast1` |
| Cloud SQL target | `msp-zabbix:asia-northeast1:secumie-sg-shared-prod-db` / `secumie_insight`（PostgreSQL 16、Private IPのみ） |
| Initiative | `code=pira-union`、`kind=UNION`、`display_name=国連協 情報セキュリティ診断`、`active=true`。まずread-only SELECT、未存在時のINSERTは別途許可、既存不一致はSTOP |
| Staff admin | `PIRA_ADMIN_EMAILS=yoshihisa.hagisaka@atlib.jp`、初期1名 |
| GENERAL | `PIRA_GENERAL_ENABLED=false` をOTP/PIRA/必要なSales Tools設定で維持。GENERAL UI・受付・OTPブランドを公開しない |
| OTP Runtime | `secumie-otp-prod` / SA `secumie-otp-prod@msp-zabbix.iam.gserviceaccount.com` |
| PIRA Runtime | `secumie-pira-prod` / SA `secumie-pira-prod@msp-zabbix.iam.gserviceaccount.com` |
| Runtime sizing | 各CPU 1、memory 512MiB、timeout 60s、concurrency 20、min instances 0、max instances 1、`DB_POOL_MAX=2` |
| Runtime connectivity | `internal-and-cloud-load-balancing`、Invoker IAMを維持、外部匿名Invocations禁止。Cloud SQL Auth Proxy v2.28.0 fixed image `gcr.io/cloud-sql-connectors/cloud-sql-proxy@sha256:e0cbea7b63455c1635d354ef456696d019dd02a5db47bf1994e849823e71ae89`、`--private-ip`、app `127.0.0.1:5432`。公開IP fallback禁止 |
| PIRA runtime env | `PIRA_UNION_HOST=insight.atlib.jp`、`PIRA_UNION_INITIATIVE_CODE=pira-union`、`OTP_JWT_ISSUER=https://insight.atlib.jp`、`OTP_JWKS_URL=https://insight.atlib.jp/.well-known/jwks.json`、`TURNSTILE_SITE_KEY` はProduction専用 |
| GENERAL inert env | コードはGENERAL無効でも `PIRA_GENERAL_HOST` と `PIRA_GENERAL_INITIATIVE_CODE` を必須とする。既存Phase 2B契約の `www.atlib.jp` と `pira-general` を指定し、`PIRA_GENERAL_ENABLED=false`を維持。URL経路は作らない |
| OTP runtime env | `PIRA_UNION_ORIGIN=https://insight.atlib.jp`、`OTP_JWT_ISSUER=https://insight.atlib.jp`、`OTP_JWT_ACTIVE_KID=insight-prod-202611-v1`、`OTP_JWT_KEYS_JSON` Secret、`TURNSTILE_SECRET` Secret、`OTP_HMAC_KEY`専用Secret |
| SMTP | Mailtrap Email Live Sending (Transactional)、`live.smtp.mailtrap.io:587`、`SMTP_USER=api`、`SMTP_PASSWORD`はSecret `secumie-prod-smtp-password`、`SMTP_FROM=SECU:MIE <no-reply@notify.atlib.jp>`。送信ドメイン検証必須。初期Free、公開時Basic移行 |
| Turnstile | Production widget `SECU:MIE Insight Production`、許可hostname `insight.atlib.jp` のみ、Managed、Pre-clearance disabled、server secret `secumie-prod-turnstile-secret` |
| JWT/JWKS | RS256、RSA 2048 bits以上、issuer `https://insight.atlib.jp`、JWKS path `/.well-known/jwks.json`、KID `insight-prod-202611-v1`。鍵JSON Secret `secumie-prod-otp-jwt-keys`、`OTP_JWT_KEYS_JSON`へ注入、鍵rotationは手動90日、新旧公開鍵の重複は最低1時間 |
| Retention | Job `secumie-insight-retention-prod`、Scheduler `secumie-insight-retention-prod-daily`、毎日 03:15 JST (`15 3 * * *` / `Asia/Tokyo`)、task1、retry0。初期 `RETENTION_EXECUTE` 非true（preview-only）。保守用DB role `secumie_maintenance_prod`、pool max1。削除実行は別承認 |
| Notifications | Slack `#pj-msp-運用関連`、channel ID `C0BMGHUQD70`。Secret、OTP、JWT、PIIを通知しない |
| Release/rollback owner | 萩坂。公開停止、rollback、再公開の最終判断・実行担当 |

**Secret補足:** `OTP_HMAC_KEY` の専用Secret名/存在をGCP現物で確定し、OTPサービスにのみ注入する。新規Secret作成/IAM付与はB5-2の書込み差分として明示する。Secret値はGit、PR、ログ、CLI引数に記録しない。DB passwordの既存6 SecretはB0–B4を正本とし複製しない。

## 3. B5-2開始前のRead-only Evidence Gate（未取得項目）

B5-2は以下の現物を **read-only** で取得して差分を確定するまで実行しない。結果はリソース名、IAM member/role、version番号、revision/digest、設定値の有無のみ記録する。

1. **Protected traffic:** 現在100%配信中の `sales-tools` Revision名、image digest、service env/Secret参照、SA、ingress、Traffic、現在のrollback Revision。Git tag `wsc-release-850e1f0` を現物Revisionとみなさない。既存7 Cloud Run servicesのReadyとTrafficを採取する。
2. **Runtime resources/identities:** `secumie-otp-prod`、`secumie-pira-prod`、両SA、同名Job/NEG/endpointが既存かどうか、他用途との命名衝突がないかを確認する。
3. **SQL and initiative:** Prod instance/database、engine/Private IP/backup/PITR、5 DB role/最小権限、実接続数とconnection budget。initiative `pira-union` をRead-only SQLで取得。欠損時のINSERTはここでは実行しない。
4. **Secret boundary:** Prod DB 6 Secretのenabled versionとscoped IAM、B5 SMTP/Turnstile/JWT/HMAC Secretの存在・version・IAM。値の読み出し禁止。OTP鍵pairの内容や強度は生成時の非秘密メタデータ・ローカル検証証跡で確認する。
5. **SMTP/Turnstile:** Mailtrap Live Sendingの送信ドメイン認証、プランと月間上限、SMTP接続可否、Production Turnstile hostname/secret mappingを確認する。ログイン・鍵情報は出力しない。
6. **Network:** `insight.atlib.jp` の現在のDNS、専用静的IP/LB/URL map/Serverless NEG/証明書、既存の `www.atlib.jp` その他サービスへの非干渉を確認する。独立のPhase B LB/DNS/証明書承認までは変更しない。
7. **Private verification:** Cloud Run Invoker IAMを弱めず、かつ公開アクセスを許可せずに、OTP `/healthz` / JWKS と PIRA `/healthz` / GENERAL拒否を試せる認証付き経路を検証手順として具体化する。経路未成立はSTOP。
8. **Images:** OTP/PIRA runtime画像を現在のRelease承認SHAで個別ビルド・スキャンしCritical/High=0、source labelとlinux/amd64、immutable digestを照合する。B0–B4 DB Operations image digestをOTP/PIRAへ使い回さない。push・Job/service作成は別承認。
9. **Monitoring:** Cloud Logging/Monitoringの既存監視、通知機能とSlack接続、バックアップ時刻とRetention 03:15の競合有無をread-onlyで確認する。

この記録作成時点では、上記GCP現物read-backを本作業環境から再実施していない。既存B4実績をそのまま最新のB5現物証跡と扱わない。

## 4. 監視閾値は候補（Owner最終承認前）

通知先と停止責任者は決定済み。次の閾値は構築候補であり、**現時点で承認済みの数値設定としない**。

| Signal | Candidate |
| --- | --- |
| HTTP 5xx | 5分間3件、または20 requests以上で5%超 |
| p95 latency | 10分間で3秒超、かつ20 requests以上 |
| health/JWKS | 連続2回失敗 |
| DB connections | app budget 80%で警告、budget超過時STOP |
| SMTP | 連続3回の送信失敗、または月間上限80% |
| Turnstile | server validation error連続3回 |
| JWT/JWKS | 鍵/issuer/JWKS不整合を検知したら即STOP |
| Retention | Job失敗、予定実行欠落を通知 |
| GENERAL | `PIRA_GENERAL_ENABLED` が false以外なら即STOP |

## 5. 実施順序と独立したOwner承認

- **B5-2A — Offline/Read-only preparation:** 本書の正本化、GCP inventory採取、Sales Tools現行100% Revision確定、Secret/IAM差分表、No-Traffic candidateとrollback計画、監視閾値承認。実環境書込みなし。
- **B5-2B — Runtime/Secret/identity construction:** 対象リソース・差分・費用・実行順・復旧責任者を事前提示し、別Owner承認を得た後に限りOTP/PIRA runtime準備。min0/max1、PRIVATE Proxy、必要最小権限、匿名不許可をread-backする。既存Sales Toolsは変更しない。
- **Sales Tools candidate — separate approval:** 現行100% Revisionを保護し、明示承認後に限り新規candidateをTraffic 0で作成・検証。既存100%配信切替はしない。
- **Phase B — separate approval:** 専用LB、DNS、証明書、NEG、URL map。既存 `www.atlib.jp` やSales ToolsのURL mapを流用・変更しない。公開前にprivate verificationとTLS/host/pathのE2Eを完了する。
- **Phase C — separate public release approval:** 外部からの匿名アクセス許可と公開TrafficをOwnerが明示承認するまで禁止。公開後の停止・rollbackは萩坂が担当。
- **Retention execute — separate approval:** previewの実績、候補件数、backup/PITR、監視、初回実行時刻を確認し、`RETENTION_EXECUTE=true` は別承認後にのみ設定。保持期間・SQL/関数を変更しない。

## 6. STOPと切り戻しの原則

- 対象不一致、Sales Tools Revision/Traffic不明、予想外の既存resource、IAM過大、Secret越境、GCP接続・バックアップ不整合、Critical/High検出、画像digest不一致、private authenticated probe不能、GENERAL有効化、既存サービス影響はSTOP。
- No-Traffic candidate作成失敗は現行配信Revisionを保持してSTOP。公開後の障害は専用LB経路/Cloud Runの承認済み直前Revisionへ復旧し、PIRA未認証受付への迂回はしない。
- Production DB Migration 037–041を逆適用・自動再実行しない。DB障害は書込み停止と復旧判断を独立したDB運用Gateに委ねる。
- Slackには監視事象、サービス、環境、時刻、影響、対応者、証跡リンクのみ。Secret、メール本文、OTP/JWT、個人情報を含めない。
- 本書のGit更新自体は **Production No-Go、`PIRA_GENERAL_ENABLED=false`、Production Traffic不変更、Retention preview-only** を解除しない。

## 7. Sales Tools現行100% RevisionのRead-only現物照合（2026-11-17 JST）

OwnerがCloud Shellから `gcloud run services describe sales-tools` と `gcloud run revisions describe sales-tools-wsc-release` を実行し、出力のうち非Secret metadataのみを提示した。本節はその提出結果を記録する。独立した再照会・配備・Traffic変更・IAM変更は実施していない。

| 項目 | Live read-back |
| --- | --- |
| Project / region | `msp-zabbix` / `asia-northeast1` |
| Service | `sales-tools` |
| Service latestReadyRevision | `sales-tools-wsc-release` |
| Traffic | `sales-tools-wsc-release` が **100%** |
| Traffic tag | `wsc-release-850e1f0`（Revision名ではなくtag） |
| Revision Ready | `True` |
| Revision image and reported digest | `asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/sales-tools@sha256:e7142198b7346715167fb6e5742da6cae26a263c5f7beccf42f8c8d7a9300be7` |
| Revision service account | `sales-tools-sa@msp-zabbix.iam.gserviceaccount.com` |
| Existing service ingress | `all`（保護対象の現行値。B5専用runtimeへ転用しない） |
| Existing Secret references | `DB_PASSWORD→sales-tools-db-password:latest`、`SMTP_PASSWORD→portal-smtp-password:latest`、`ANTHROPIC_API_KEY→portal-anthropic-api-key:latest`、`GOOGLE_OAUTH_CLIENT_SECRET→sales-tools-google-oauth-client-secret:latest`、`STAFF_JWT_SECRET→sales-tools-staff-jwt-secret:latest` |

現行Revisionの環境変数名一覧には `PIRA_ADMIN_EMAILS` および `SECUMIE_DB_NAME`、`SECUMIE_DB_ADMIN_USER`、`SECUMIE_DB_ADMIN_PASSWORD`、`SECUMIE_DB_SOCKET_PATH` 等が存在しない。これは既存配信RevisionがB5の管理機能設定をまだ持たないという事実であり、既存サービスの欠陥とは判定しない。

現行Releaseコード `src/server.ts` は起動時に独立SECU:MIE管理poolを作成し、`src/config.ts` の `loadSecumieAdminDatabaseConfig()` が `SECUMIE_DB_NAME`、`SECUMIE_DB_ADMIN_USER`、`SECUMIE_DB_ADMIN_PASSWORD` を必須とする。管理poolは `max=2`。従って将来のSales Tools no-traffic candidateには専用DB接続設定・Secret参照・private connectivityを必ず揃え、既存業務DBの `DB_*` 設定および旧Secretを置換しない。

**判定:** 現行100%配信Revisionとimmutable image digestは特定済みであり、rollback先の識別子として固定できる。ただし、実際のrollback操作・正常性確認は未実施であり、rollbackの実証PASSとは扱わない。Sales Tools candidate revision作成とTraffic 0検証は引き続き独立したOwner承認を必要とする。現行100% Trafficは変更しない。

## 8. Sales Tools既存Secretの有効Version調査（2026-11-17 JST）

OwnerのCloud Shellで `gcloud secrets versions list` をRead-only実行し、`state=ENABLED` の最大Version番号と作成日時のみを提出。データ本体、Secret値、アクセスTokenは取得・表示していない。

| Existing Secret | 最大ENABLED Version | createTime (UTC) |
| --- | ---: | --- |
| `sales-tools-db-password` | 2 | 2026-08-23T01:26:52.526704Z |
| `portal-smtp-password` | 2 | 2026-07-05T04:09:56.208126Z |
| `portal-anthropic-api-key` | 5 | 2026-10-23T03:56:12.323099Z |
| `sales-tools-google-oauth-client-secret` | 1 | 2026-08-25T05:20:16.298533Z |
| `sales-tools-staff-jwt-secret` | 1 | 2026-08-25T05:20:21.827515Z |

**証跡の限界:** この結果は各Secretの最大ENABLED Versionを示すが、既存Revisionが参照する `latest` aliasの実参照番号を直接確認したものではない。aliasの実参照は `gcloud secrets versions describe latest --secret=...` というRead-onlyメタデータ操作で別途照合する。Cloud RunのSecret環境変数はInstance起動時に解決されるため、Revision名とImage digestのみでは完全なSecret状態の固定を保証しない。

**保護方針:** 既存5 Secretの値・Version状態・IAM・現在の `latest` 参照を変更しない。現行 `sales-tools-wsc-release` 100%配信を維持。将来のno-traffic candidateに限り、適切な独立Secretの番号指定と接続構成を別途レビューする。Production No-Goを維持する。


## 9. Sales Tools既存Secretの `latest` 参照確定（2026-11-17 JST）

OwnerがCloud Shellから各Secretについて `gcloud secrets versions describe latest --secret=... --project=msp-zabbix --format=json` をread-only実行し、`resolvedVersion`、`state`、`createTime` を提出した。Secret payloadのaccess、取得、表示はしていない。

| Existing Secret | `latest` resolvedVersion | state | createTime (UTC) | §8最大ENABLEDと一致 |
| --- | ---: | --- | --- | --- |
| `sales-tools-db-password` | 2 | ENABLED | 2026-08-23T01:26:52.526704Z | YES |
| `portal-smtp-password` | 2 | ENABLED | 2026-07-05T04:09:56.208126Z | YES |
| `portal-anthropic-api-key` | 5 | ENABLED | 2026-10-23T03:56:12.323099Z | YES |
| `sales-tools-google-oauth-client-secret` | 1 | ENABLED | 2026-08-25T05:20:16.298533Z | YES |
| `sales-tools-staff-jwt-secret` | 1 | ENABLED | 2026-08-25T05:20:21.827515Z | YES |

**判定:** 調査時点で5件すべての`latest`参照先がENABLEDであり、§8の最大ENABLED版と一致。Sales Tools現行100%配信Revision、image digest、SAと合わせ、既存Secretの**現時点メタデータ基準**が確定した。ただしCloud Run Secret環境変数はInstance起動時に解決されるため、既に稼働中のInstance内の実際の値や将来の`latest`参照先を本メタデータだけで保証できない。rollback実施・正常復帰の実証は未実施。

**保護Gate:** 既存5 Secretのvalue・IAM・version・aliasに触れず、現行`sales-tools-wsc-release` 100% Trafficを維持する。次工程はB5-2Aの新設予定Service・Service Account・Secret・Jobの**存在照合だけ**を行う。独立承認前のリソース作成、既存Sales ToolsのCandidate作成・Traffic変更、DB変更、Production公開は行わない。


## 10. B5-2A新設候補リソースの存在確認（2026-11-17 JST）

OwnerがCloud Shellの単一read-onlyバッチから、`--project=msp-zabbix`、Cloud Runは`--region=asia-northeast1`を明示して4件のlistを取得・名称照合。途中の端末エコーに一部乱れがあるが、4セクションと最後の`B5-2A READ-ONLY CHECK COMPLETE`を含む結果が提出された。対象listコマンドは正常終了したものとして扱う。未照会の権限・状態・動作はPASSとしない。

| 調査先 | 対象 / 現物結果 | 存在Fit/Gap |
| --- | --- | --- |
| Cloud Run Services | `secumie-otp-prod`、`secumie-pira-prod`: 該当0件 `[]` | 2 Servicesとも未作成 |
| IAM Service Accounts | `secumie-otp-prod@msp-zabbix.iam.gserviceaccount.com`、`secumie-pira-prod@msp-zabbix.iam.gserviceaccount.com`: 該当0件 `[]` | 2 SAとも未作成 |
| Cloud Run Jobs | `secumie-insight-retention-prod`: 該当0件 `[]` | Retention Job未作成 |
| Secret Manager | `secumie-` prefixに一致する12件を確認（下記）。新規runtime用Secretは該当なし | DB credentialは既存流用候補、B5固有Secretは不足 |

**存在確認できた本番DB用6 Secret:**
- `secumie-prod-db-admin-password`
- `secumie-prod-db-bootstrap-password`
- `secumie-prod-db-maintenance-password`
- `secumie-prod-db-migration-password`
- `secumie-prod-db-otp-password`
- `secumie-prod-db-pira-password`

**併存するStaging用6 Secret（B5で変更・流用しない）:**
- `secumie-stg-db-admin-password`
- `secumie-stg-db-bootstrap-password`
- `secumie-stg-db-maintenance-password`
- `secumie-stg-db-migration-password`
- `secumie-stg-db-otp-password`
- `secumie-stg-db-pira-password`

**B5固有Secretの未存在:** `secumie-prod-smtp-password`、`secumie-prod-turnstile-secret`、`secumie-prod-otp-jwt-keys` は上記一覧に現れていない。専用`OTP_HMAC_KEY`用Secretは名前未確定であり、既存prefix内に想定該当なし。新規作成候補とし、Secret名・権限・versionをB5-2B構築前に確定する。

**判定:** 現時点で名前の重複は確認されず、OTP/PIRAのRuntime、各SA、Retention Job、B5固有SecretはB5-2B以降の**新規作成候補**。既存の本番DB credentialはB0–B4を正本とし値の複製を行わない。ただし本検査は名前の存在のみで、Secret version/IAM、DB host・Private IP・DB role、Cloud Run全既存ServiceのReady、NEG/LB/DNS/証明書衝突、Scheduler、監視の確認ではない。これらは未完了のread-only Gateに留める。

**保護条件:** `Production No-Go`、`PIRA_GENERAL_ENABLED=false`、既存Sales Toolsの`sales-tools-wsc-release` 100% Traffic、Retention preview-onlyを継続。リソース作成、権限付与、Secret参照変更、Migration、公開は本節では実施・承認しない。


## 11. Production Cloud SQL・6 DB Secret version/IAMのRead-only照合（2026-11-17 JST）

OwnerがCloud Shellから`gcloud sql instances describe`、`gcloud sql databases list`、各Secretの`versions describe latest`と`get-iam-policy`をread-only実行した。バッチは`B5 DB READ-ONLY CHECK COMPLETE`で正常終了。Secret payload、パスワード、DBレコードは取得していない。

### 11.1 Cloud SQL

| Field | Live read-back | Canonical Fit |
| --- | --- | --- |
| Instance | `secumie-sg-shared-prod-db` / `RUNNABLE` | MATCH |
| Region / Engine | `asia-northeast1` / `POSTGRES_16` | MATCH |
| Tier / HA | `db-custom-2-7680` / `REGIONAL` | MATCH |
| IP | `ipv4Enabled=false` / `ipTypes=[PRIVATE]` | MATCH |
| Backup / PITR | `backupEnabled=true` / `pitrEnabled=true` | ENABLED; 最新バックアップSUCCESSと保持7日実績は別確認 |
| Deletion protection | `true` | MATCH |
| Database | `secumie_insight` / `UTF8` / `en_US.UTF8` | MATCH |

B0承認package §4とProduction manifest（`release/secumie-production-gate-b-manifest.json`）に照合し、上記主要構成は一致。B4 Acceptance-only回復実行`secumie-db-acceptance-prod-8xkzq`のM400 / R80 / available320 / required78 PASSは既存証跡であり、本read-backで接続数やDB role/ledger/backup成功を**再測定したものではない**。

### 11.2 Secret versionと直接IAM

6件すべて`latestVersion=1` / `state=ENABLED`。Service Account名は以下の略号に対応：
- BOOT = `secumie-db-bootstrap-prod@msp-zabbix.iam.gserviceaccount.com`
- MIG = `secumie-db-migration-prod@msp-zabbix.iam.gserviceaccount.com`

| Secret | latest | Enabled | direct `roles/secretmanager.secretAccessor` members |
| --- | ---: | --- | --- |
| `secumie-prod-db-admin-password` | 1 | YES | BOOT |
| `secumie-prod-db-bootstrap-password` | 1 | YES | BOOT |
| `secumie-prod-db-maintenance-password` | 1 | YES | BOOT |
| `secumie-prod-db-migration-password` | 1 | YES | BOOT, MIG |
| `secumie-prod-db-otp-password` | 1 | YES | BOOT |
| `secumie-prod-db-pira-password` | 1 | YES | BOOT |

`createTime` (UTC): admin 2026-11-16T02:52:38.838833Z、bootstrap 02:52:17.083723Z、maintenance 02:52:59.581520Z、migration 02:53:16.664688Z、otp 02:53:37.545998Z、pira 02:53:57.198213Z。

**検出したIAM Gap:**
1. B0承認package §4はBootstrap/Acceptance証跡保全後にtemporary Bootstrap SecretAccessor権限を削除する契約。B4 Acceptance回復PASS後の現時点で、BOOTのSecretAccessor直接付与が6件すべて残存。これは**承認済み事後cleanupの未了候補**であり、B5-2B前の権限レビュー対象。独立承認・Job依存関係確認前に削除しない。
2. B5新設OTP/PIRA SAは未存在（§10）。現在OTP/PIRA DB Secretの直接AccessorはBOOTのみ。将来のRuntime作成時には`secumie-prod-db-otp-password`をOTP SAだけ、`secumie-prod-db-pira-password`をPIRA SAだけへ追加するscoped IAMの差分が必要。Admin利用のSales Tools candidateは別承認・別権限検証とし、既存Sales Tools SAへの広域アクセスを付与しない。
3. `get-iam-policy`は各Secretの直接bindingのみを示す。Project/Folder/Organizationからの継承権限、IAM Conditions、effective permissionsの全体確認を本検査で実施したとは扱わない。

**判定:** DB instance・database基本構成とSecret versionはB5要件へのFit。Runtime用ID/Secret Accessorはまだ未構築、BOOT temporary権限の残存はGap。Production No-Go、GENERAL disabled、既存サービス/DB/Secret/IAMへの書込み禁止を維持。


## 12. B0一時権限cleanupとB5 runtime最小権限のコード契約Fit/Gap（2026-11-17 JST）

調査基準：Draft PR #47のRelease HEAD `6125b540778dd6debe04bc66322f0e4daa29498d`。B0承認Package §3–4・§14–15、B4 Acceptance-only回復証跡、Production manifest、`src/runtime/runtimeConfig.ts`、`src/config.ts`、`src/db/secumieDbOperationsConfig.ts`、`src/db/secumieRetentionCli.ts`、`src/runtime/publicOtpRuntime.ts`、`src/runtime/piraPublicRuntime.ts`をread-only照合。既存実装とOwner選択を照合した設計レビューであり、コード・GCPへの書込みはしていない。

### 12.1 B0 cleanup対象の区分

| 既存IAM | Live evidence | Canonicalでの扱い | 次の操作 |
| --- | --- | --- | --- |
| BOOT SA → 本番DB用Secret 6件の個別`secretAccessor` | §11で6件残存 | B0 §4: Bootstrap/Acceptance証跡保全後のtemporary解除対象 | 各Secretの**BOOT memberだけ**を削除する候補。MIGや他member、Secret versionを変更しない。実行前にOwner承認 |
| BOOT SA → Production instance限定のconditional`roles/cloudsql.client` | B2 §14–15では付与済み。今回のGCP read-backは未取得 | B0 `temporaryAccessCleanup.removeTemporaryIamBindings=true`の対象候補 | 現物のcondition式、binding、Job依存を再確認してから解除対象を確定。**現時点で削除対象と断定しない** |
| MIG SA → Migration Secretの個別`secretAccessor` | §11で残存 | B0 §3–4のMigration専用権限。B5以降もMigration秘密情報は保持 | 保持候補。Runtime向けへ拡張しない |
| MIG SA → conditional`roles/cloudsql.client` | B2で付与済み。今回の現物read-backは未取得 | Migration専用接続 | 保持候補。先に現物と承認仕様を再照合 |

BOOTは既存のBootstrap/Acceptance Jobで利用した管理用identity。B4後の自動再実行は禁止されており、権限を削除すれば旧Jobの即時再実行能力は失われる（正常な最小権限化の結果）。万一再検証が必要になった場合も、Job仕様・実行・一時権限復旧はそれぞれ新たな承認の対象。Service Account、Job、Secret、Databaseの削除は提案しない。

### 12.2 Code-confirmed runtime Secret/role matrix

| Identity / phase | DB role / explicit env | 使用すべきSecret（専用Secret単位のAccessor候補） | 不要なSecret access |
| --- | --- | --- | --- |
| **OTP runtime SA** `secumie-otp-prod@...`（未作成） | `DB_USER=secumie_otp_prod`、`DB_NAME=secumie_insight`、`DB_PASSWORD`、`DB_POOL_MAX=2` | `secumie-prod-db-otp-password`→`DB_PASSWORD`、`secumie-prod-smtp-password`→`SMTP_PASSWORD`、`secumie-prod-turnstile-secret`→`TURNSTILE_SECRET`、`secumie-prod-otp-jwt-keys`→`OTP_JWT_KEYS_JSON`、専用HMAC Secret→`OTP_HMAC_KEY` | PIRA/Admin/Migration/Maintenance DB password、既存Sales Tools secrets |
| **PIRA runtime SA** `secumie-pira-prod@...`（未作成） | `DB_USER=secumie_pira_prod`、`DB_NAME=secumie_insight`、`DB_PASSWORD`、`DB_POOL_MAX=2` | `secumie-prod-db-pira-password`→`DB_PASSWORD` | OTPのSMTP、Turnstile server secret、JWT private keys、HMAC key、Admin/Migration/Maintenance password、既存Sales Tools secrets |
| **Sales Tools no-traffic candidate**（別承認） | 既存`DB_*`とは独立して`SECUMIE_DB_NAME`、`SECUMIE_DB_ADMIN_USER=secumie_admin_prod`、`SECUMIE_DB_ADMIN_PASSWORD`、専用pool max2 | `secumie-prod-db-admin-password`→`SECUMIE_DB_ADMIN_PASSWORD`のみを既存`sales-tools-sa`へ追加する候補 | OTP/PIRA/Migration/Maintenance password、OTP private JWT/SMTP/Turnstile/HMAC |
| **Retention Job**（別承認） | `DB_MAINTENANCE_USER=secumie_maintenance_prod`、`DB_MAINTENANCE_PASSWORD`、pool max1 | `secumie-prod-db-maintenance-password`のみ | 全OTP/PIRA/Admin/Migration password、外部認証Secrets |

PIRA runtimeの`TURNSTILE_SITE_KEY`は公開Widgetのsite keyでありSecretAccessorを要しない。`OTP_JWKS_URL`は公開鍵取得先でありPIRAにJWT private signing keyを渡さない。Retention専用SA名はCanonicalで未確定のため、構築承認時に明示する。各接続SAのCloud SQL ClientはProduction instance限定の条件付き権限・ネットワーク疎通・最小権限を改めて検証し、project-wide Secret Accessorは禁止する。

### 12.3 新規検出：共有configのruntime DB password fallback

`src/runtime/runtimeConfig.ts`の`databaseRuntime()`は`loadDatabaseConfig('runtime')`を呼び、`src/config.ts`の`loadDatabaseConfig()`は`DB_PASSWORD`環境変数が空のとき、既存Sales Tools用`sales-tools-db-password`をSecret Managerから取得しようとするfallbackを持つ。これは既存Sales Toolsの歴史的動作であるが、**新設専用OTP/PIRAに旧Sales Tools DB secretへの依存を許容する契約ではない**。

B5構築Gateでは：
1. OTP/PIRA両Serviceの`DB_PASSWORD`がそれぞれ専用Prod DB Secretの明示的なSecret環境変数参照であることをcandidate specとrevision read-backで証明する。
2. OTP/PIRA SAが旧`sales-tools-db-password`へSecret Accessorを持たず、誤設定時はSecret取得やDB接続が失敗することを確認する。
3. **コード側の境界強化候補:** OTP/PIRA専用entrypointでは`DB_PASSWORD`未設定を直ちにfail-closedとし、旧Sales Tools Secret fallbackへ進まないことを最小変更で実装・テストする。これは本レビューでは未実装であり、別途実装レビュー・承認が必要。
4. 既存Sales Toolsの`loadDatabaseConfig('runtime')`のfallback挙動を無断変更しない。

### 12.4 未完了の外部read-only証跡と承認Gate

- BOOT/MIGの実際のconditional Cloud SQL Client IAM bindingとjob serviceAccount、SecretAccessorの継承権限、権限削除後の運用手順。
- 現行Production Jobの完了状態と復旧/再実行依存のread-back（B4既存証跡を参照し、実行しない）。
- 最新バックアップ成功、PITR retention、network/DNS/NEG/LB/TLS衝突、保護対象ServiceのReady状態。
- B5新規OTP/PIRA Service/SA、Prod runtime Secret、Retention専用SA、Image digest、SMTP/Turnstile、private verification、監視閾値の承認。

**結論:** DB・6 Secretの存在/versionはFit。BOOT temporary IAMの残存、Runtime用scoped IAM未作成、旧Sales Tools Secret fallback境界、Retention SA名未確定はGap。前者は正確な削除差分をOwnerに提示してから実行し、後者はB5-2B作成承認の前提条件として扱う。Production No-Go/GENERAL disabled/現行Sales Tools 100% Traffic/Retention preview-only維持。


## 13. B5 IAM条件・Job Identity・Backup保持のRead-only照合（2026-11-17 JST）

OwnerがCloud Shellの単一Read-onlyバッチで、Project IAM Policy、Production DB Cloud Run JobsのserviceAccount、直近のCloud SQL Backup実績と保持設定を取得。出力には4セクションと最終 `B5 IAM READ-ONLY CHECK COMPLETE` が含まれ、書込み・Job実行・Secret payloadの取得はない。端末エコーの中途に乱れはあるが、結果セクションは揃っている。以下はOwner提出時点の現物証跡であり、実際のcleanup操作は未実施。

### 13.1 条件付きCloud SQL Client IAM（§12の未確認項目）

Project `msp-zabbix` の `gcloud projects get-iam-policy` による、BOOT/MIGの該当bindingは1件：

| Item | Live read-back | 判定 |
| --- | --- | --- |
| IAM role | `roles/cloudsql.client` | B0/B2契約と一致 |
| Members（同一binding） | `secumie-db-bootstrap-prod@msp-zabbix.iam.gserviceaccount.com`、`secumie-db-migration-prod@msp-zabbix.iam.gserviceaccount.com` | 両SAの接続権限を確認 |
| Condition title | `secumie-prod-cloudsql-instance-only` | B2承認名と一致 |
| Condition description | `Restrict to SECU MIE production Cloud SQL instance` | B2承認記録と一致 |
| Condition CEL | `resource.type == "sqladmin.googleapis.com/Instance" && resource.name == "projects/msp-zabbix/instances/secumie-sg-shared-prod-db"` | 対象の本番Instanceだけに限定 |

Project IAM出力ではBOOT/MIGに一致するbindingはこの条件付きCloud SQL Client 1件のみであり、**Project-levelの無条件`cloudsql.client`やProject-wide `secretmanager.secretAccessor`は検出されなかった**。Folder/Organization継承・effective permission全体は今回照会していないため、その不存在を証明したものではない。

**B0一時権限cleanupの正確な差分（実行前提ではない）：**
1. `secumie-prod-db-admin-password`、`secumie-prod-db-bootstrap-password`、`secumie-prod-db-maintenance-password`、`secumie-prod-db-migration-password`、`secumie-prod-db-otp-password`、`secumie-prod-db-pira-password`の**6 Secretそれぞれの直接`secretAccessor` bindingからBOOT memberだけ**を外す候補。MIG member（Migration Secret）その他のSecret設定・versionは保持。
2. 上記の**同一conditional Cloud SQL Client bindingからBOOT memberだけ**を外す候補。`roles/cloudsql.client`、Condition title/description/CEL、およびMIG memberを保持する。Binding全体の削除・条件式の変更は禁止。
3. BOOT SA、Migration SA、既存3 Job、6 Secret、DB/role/ledgerは削除しない。反映後にIAMと既存の保護資産をread-backすることを次の承認済みcleanup作業のGateとする。

ただし、これはB0 §4の一時権限を対象とした**差分の確定であり実行承認ではない**。Bootstrap/Acceptanceをそのまま再実行できなくなる影響、既存Job再実行のSTOP、将来の承認付きrecovery手順をOwnerへ明示したうえで、IAM変更について別途明示承認を得る。

### 13.2 既存Production DB Jobsのidentity

| Job | Live serviceAccount | B0/B4契約 |
| --- | --- | --- |
| `secumie-db-acceptance-prod` | `secumie-db-bootstrap-prod@msp-zabbix.iam.gserviceaccount.com` | MATCH：AcceptanceはBOOT SAを再利用 |
| `secumie-db-bootstrap-prod` | `secumie-db-bootstrap-prod@msp-zabbix.iam.gserviceaccount.com` | MATCH |
| `secumie-db-migrate-prod` | `secumie-db-migration-prod@msp-zabbix.iam.gserviceaccount.com` | MATCH |

B4回復時の成功実行 `secumie-db-acceptance-prod-8xkzq` は既存証跡。今回確認したのはJob identityであり、Job image・環境変数・過去Execution結果を再検査していない。権限cleanup後はBootstrap/Acceptance Jobが必要Secret/DBに接続できなくなる可能性があるが、B0契約に沿う制限であり、Job削除や変更は不要。再実行は独立承認・必要な一時権限復旧が前提。

### 13.3 Cloud SQL Backup/PITRの実績

対象：`secumie-sg-shared-prod-db`、`msp-zabbix`。

| status | type | startTime (UTC) | endTime (UTC) |
| --- | --- | --- | --- |
| SUCCESSFUL | AUTOMATED | 2026-11-16T20:51:48.744Z | 2026-11-16T20:53:19.942Z |
| SUCCESSFUL | AUTOMATED | 2026-11-15T19:13:56.775Z | 2026-11-15T19:15:27.947Z |
| SUCCESSFUL | AUTOMATED | 2026-11-15T13:02:53.167Z | 2026-11-15T13:03:07.944Z |

最も新しい成功Backupの開始は2026-11-17 05:51 JST、終了05:53 JST。3件とも`SUCCESSFUL`であり、§11の「Backup/PITRが有効だが実成功未確認」というGapのうち**Backup成功は確認済み**。

- `transactionLogRetentionDays=7`：PITR transaction logの設定上の保持期間は**7日**。
- `backupRetentionSettings={retainedBackups:7, retentionUnit:"COUNT"}`：自動Backupの保持は**7件（COUNT）**。これを「Backupの保持が7日」と読み替えない。
- PITR実Restore、7日分の実復旧可能な時点、Backupからの復元試験は未実施。Backup成功・設定Read-backとrestore実証PASSは区別する。

### 13.4 Fit/Gapと次工程

**Fit:** B2の条件付きCloud SQL Clientが本番instance限定で現存、BOOT/MIG Job identityが承認設計通り、最新3件のBackupがSUCCESSFUL、PITR log7日・Backup 7件が設定済み。

**Gap / Pending:** B0 §4のBOOT直接SecretAccessor 6件とconditional Cloud SQL ClientのBOOT memberは**未cleanup**。Folder/Org inherited IAMと実効権限、Restore手順/試験、B5固有Runtime/SA/Secrets、専用HMAC Secret名、private network/NEG/LB/DNS/TLS衝突のread-only Gate、SMTP/Turnstile商用設定、監視、Codeの専用Runtime fail-closed境界が未完了。

**判定:** B0 Cleanup候補を具体的なmember単位で確定できたが、独立したOwner IAM変更承認までは現状維持。B5-2B作成、Sales Tools Candidate、Phase B/C公開、Retention Execute、Production全体Go判定を許可するものではない。`Production No-Go`、`PIRA_GENERAL_ENABLED=false`、Sales Tools現行100% Traffic、Retention preview-onlyを維持する。


## 14. B0 Bootstrap一時IAM cleanup Owner承認（2026-11-18 JST、実行前）

Ownerは§13の確認結果を受け、**「承認します」**と回答。承認の対象はB0 §4で規定されたTemporary Bootstrap IAM cleanupのみであり、具体的には次の**7つのmember除去**：

1. Production DB用Secret 6件（§13.1に列挙）のそれぞれの直接・無条件 `roles/secretmanager.secretAccessor` bindingから、`serviceAccount:secumie-db-bootstrap-prod@msp-zabbix.iam.gserviceaccount.com` のmemberだけを除去。
2. Project `msp-zabbix` にあるInstance限定の `roles/cloudsql.client` conditional bindingから、同じBOOT memberだけを除去。title `secumie-prod-cloudsql-instance-only`、description `Restrict to SECU MIE production Cloud SQL instance`、CEL `resource.type == "sqladmin.googleapis.com/Instance" && resource.name == "projects/msp-zabbix/instances/secumie-sg-shared-prod-db"` を変えない。

**保持するもの:** `serviceAccount:secumie-db-migration-prod@msp-zabbix.iam.gserviceaccount.com` のMigration SecretへのAccessorと同conditional Cloud SQL Client member、Secret自体/values/version、SA、Cloud Run Jobs、DB/roles/ledger、全既存Traffic。StagingやSecure Guardへ変更を加えない。

**実行条件:** Cloud Shellの1バッチで、7対象の直接Policyおよび共有条件式・Job identityをread-onlyで再取得し、完全一致しなければ書込み前にSTOPする。変更は対象bindingのBOOT member除去のみとし、`--all`、全体Policy置換、IAM privilege追加、Job再実行、DB変更をしない。各除去のエラーで即STOP（変更済み項目を自動回復・再付与しない）。最後に6 SecretとProject IAMを再照会し、BOOT残存なし、MIG memberとconditionの維持を証明する。部分実行時はOwnerに実施済み範囲を報告してSTOPする。

**重要:** 上記は権限除去のOwner承認と実行契約の記録。**本Git更新時点ではCloud Shell実行結果が未提出のためIAM cleanup完了扱いにしない。** `Production No-Go`、`PIRA_GENERAL_ENABLED=false`、Sales Tools現行100% Traffic、Retention preview-onlyを継続。B5 runtime構築、Sales Tools candidate作成、公開、Retention実行の承認ではない。


## 15. B0 Bootstrap一時IAM cleanup実行結果（2026-11-18 JST）

§14でOwner承認したCloud Shell `B0_IAM_CLEANUP` 1バッチの実行出力をOwnerが提出。端末への貼付エコー中に断片の乱れはあるが、バッチ本体の `1. PREFLIGHT`、`2. APPROVED CLEANUP`、`3. POST-CHECK` の全セクション、各対象操作のAPI成功メッセージと終端 `B0 IAM CLEANUP SUCCESS` が確認でき、同出力では `STOP` / エラーは報告されていない。以下のPASSは、このOwner提出実行出力を証跡とする。

### 15.1 PreflightとIAM変更

- Conditional Cloud SQL IAM：`[PASS]`。Project `msp-zabbix` の条件付き `roles/cloudsql.client` bindingは対象Instance `secumie-sg-shared-prod-db` に限定され、BOOT/MIG両memberと承認済みtitle/description/CELが一致。
- 既存Job identities：`[PASS]`。Bootstrap/AcceptanceはBOOT SA、MigrationはMIG SA。
- Production DB用Secret 6件：すべて `[PASS]`。対象Secretの直接 `roles/secretmanager.secretAccessor` のメンバーが承認済み一覧に完全一致。
- Secret 6件について `gcloud secrets remove-iam-policy-binding` によりBOOT memberだけの除去を実行。**6件すべて `Updated IAM policy for secret [...]`** が出力された。
- 共有conditional Cloud SQL Client bindingについて `gcloud projects remove-iam-policy-binding` によりBOOT memberだけの除去を実行。**`Updated IAM policy for project [msp-zabbix].`** が出力された。

### 15.2 Post-check

| Verify | Owner提出出力 | 判定 |
| --- | --- | --- |
| `secumie-prod-db-admin-password` | `[PASS]` | BOOT Accessor解除 |
| `secumie-prod-db-bootstrap-password` | `[PASS]` | BOOT Accessor解除 |
| `secumie-prod-db-maintenance-password` | `[PASS]` | BOOT Accessor解除 |
| `secumie-prod-db-migration-password` | `[PASS]` | BOOT Accessor解除・MIG Accessor保持 |
| `secumie-prod-db-otp-password` | `[PASS]` | BOOT Accessor解除 |
| `secumie-prod-db-pira-password` | `[PASS]` | BOOT Accessor解除 |
| Conditional Cloud SQL Client | `[PASS] Migration IAM retained`、`[PASS] Bootstrap Cloud SQL IAM removed` | BOOT解除、同条件のMIG保持 |
| Existing Job identities | `[PASS] Existing Job identities unchanged` | Job identity維持 |
| 終端 | `B0 IAM CLEANUP SUCCESS` | 完了 |

**確定判定:** B0 §4で承認された**Bootstrap一時IAM cleanup（6 Secret + 1 Project conditional bindingのBOOT member削除）完了：PASS**。既存Migration専用IAMは承認範囲のread-backで維持されている。Bootstrap/Acceptance Jobは今後そのまま再実行できる状態と見なさず、必要時は別Owner承認・一時権限復旧・Preflightを要する。SA/Job/Secret/DB/roles/ledgerの削除やMigration再実行は行っていない。

**証跡範囲の注意:** Policyの逐語JSON全文、Folder/Organizationの継承権限、effective permissions、実際のJob再実行はこの出力では再計測しない。上記はバッチ内部の `jq` 厳密照合とGCP更新成功メッセージに基づく完了判定であり、Production全体Goの根拠にはしない。

**残Gate:** B5 OTP/PIRA専用runtime/SA/Secret作成、専用HMAC Secret名確定、runtime DB fallback fail-closed、private networkとLB/NEG/DNS/TLS衝突、Mailtrap Live・Turnstile本番設定、Sales Tools no-traffic candidate（独立承認）、Retention専用SA/previewと監視が未完了。**`Production No-Go`、`PIRA_GENERAL_ENABLED=false`、既存Sales Tools `sales-tools-wsc-release` 100% Traffic、Retention preview-onlyを維持。** B5-2Bリソース作成と公開は未承認。
