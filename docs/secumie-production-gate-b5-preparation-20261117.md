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
