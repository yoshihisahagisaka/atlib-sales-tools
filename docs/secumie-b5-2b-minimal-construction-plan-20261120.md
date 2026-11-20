# SECU:MIE Insight B5-2B｜最小構築・実施承認前パッケージ

- 作成日: 2026-11-20 JST
- 対象: `yoshihisahagisaka/atlib-sales-tools` / Draft PR #47 (`release/secumie-insight-production`)
- 基準SHA: `2e2c96364a84d1d48462e1ea5e3e00c3146c2e66`
- 正本: `docs/secumie-production-gate-b5-preparation-20261117.md` §1–20、B0承認Package、Production manifest
- **本書はB5-2Bの実行計画。GCP／DNS／DB／Secret／IAMの作成・変更・本番公開を許可しない。Production No-Go、GENERAL無効を維持。**

## 1. 既に完了した事項（繰り返さない）

- B0–B4: Production Cloud SQL `secumie-sg-shared-prod-db` / DB `secumie_insight` / 5 DB roles / Migration 037–041 / Acceptance PASS。Migration再実行・Bootstrap再実行は禁止。
- B0後処理: Bootstrap SAからProd DB Secret 6件のAccessorと条件付きCloud SQL Client memberを除去済み。Migration SAの対応権限は維持。
- B5-2A: `insight.atlib.jp` DNS未登録、専用Global LB/NEG/証明書の既存衝突未検出。Certificate Manager API無効の理由確定。Phase Bでは既存方式と同じCompute Google-managed SSLを候補とし、API有効化を前提にしない。
- B5-2A: 既存Cloud Run 7 ServiceがReady=True、Sales Tools `sales-tools-wsc-release` が100%維持（Owner read-only snapshot）。
- B5-2A: OTP/PIRAの専用`databaseRuntime()`は、`DB_PASSWORD`欠落・空白を旧Sales Tools Secret fallback前にfail-closedする最小修正をPR #47に記録。ローカルbuildと対象テストPASS、PostgreSQL実接続は未試験。
- B5-2A: Prod DB Secret 6件は存在。OTP/PIRA DB Secretの**直接** IAM bindingsは空。Runtime SA 2件、Runtime追加Secretは未存在。上位継承IAMは未検証。
- **既存WEB実装:** Draft PR #50はWeb専用受付Runtime/受付API/OTPブランド連携を既存`PublicOtpRuntime`の `SECUMIE_WEB_ENABLED=true` 条件分岐で実装、Web専用DB DDLはDraft・未適用。Draft PR #51はスタッフ管理画面/既存WSC PDF呼出を実装。WEBの受付・状態管理・DB・管理画面をInsightで再実装しない。WEBの暫定受付と正式受付の公開GateをInsight B5に混同しない。

## 2. シンプル構成の採用（今回の作業範囲）

- **新設するサービスは既定の2つだけ:** `secumie-otp-prod`、`secumie-pira-prod`。それぞれ固有Service Account、既定の専用DB role・pool max2、max instances1、min0、concurrency20、CPU1 / memory512MiB、timeout60s。既存Cloud SQLインスタンス／データベース／Migrationを新設・複製しない。
- **専用Secretを必要なサービスだけに付与する。** 既存DB Secret2件はVersion1を再利用。新規追加SecretはSMTP、Turnstile、JWT鍵、OTP HMACの4つだけ。OTP HMAC名は `secumie-prod-otp-hmac-key` を**承認候補**とする。
- **WEBを取り込まない:** WEB PR #50とInsight PR #47は現Gitで別ブランチ（共通main起点）として分岐しており、そのまま相互マージしない。WEB側が追加した `SECUMIE_WEB_ENABLED` 分岐をInsightの本番起動時に勝手にONにしない。将来WEB側がOTPを本番利用する場合は、PR比較と独立承認を経て**既存OTPを拡張**し、同等のOTPサーバーをもう1台作らない。
- **追加プラットフォームなし:** 汎用テナントエンジン、独自Secrets API、独自監視サーバー、別請求システム、専用新Cloud SQLは作らない。既存GCP標準・事前承認済みPrivate Cloud SQL Auth Proxy方式を利用する。
- Phase Bの専用LB/TLS/DNS、Sales Tools候補Traffic0、Retention Job、Initiative `pira-union` の条件付き登録は**本B5-2Bの実施対象外／別承認**。

## 3. 正確な新規リソース・IAM差分（構築承認前）

| 対象 | 既存／新規 | 必要最小限の変更候補 |
| --- | --- | --- |
| `secumie-otp-prod@...` | 新規SA | OTP Runtime専用。Production instance限定のconditional `roles/cloudsql.client` |
| `secumie-pira-prod@...` | 新規SA | PIRA Runtime専用。同条件付きCloud SQL Client |
| `secumie-prod-db-otp-password:1` | 既存 | OTP SAだけに当該Secretの直接 `roles/secretmanager.secretAccessor` |
| `secumie-prod-db-pira-password:1` | 既存 | PIRA SAだけに当該Secretの直接 `roles/secretmanager.secretAccessor` |
| `secumie-prod-smtp-password` | 新規Secret | Version1登録・OTP SAだけAccessor、環境変数`SMTP_PASSWORD` |
| `secumie-prod-turnstile-secret` | 新規Secret | Version1登録・OTP SAだけAccessor、環境変数`TURNSTILE_SECRET` |
| `secumie-prod-otp-jwt-keys` | 新規Secret | Version1登録・OTP SAだけAccessor、環境変数`OTP_JWT_KEYS_JSON` |
| `secumie-prod-otp-hmac-key` | 新規Secret（名称承認候補） | Version1登録・OTP SAだけAccessor、環境変数`OTP_HMAC_KEY` |
| `secumie-otp-prod`、`secumie-pira-prod` | 新規Cloud Run Services | 各独立Revision、Ingress `internal-and-cloud-load-balancing`、**Invoker IAMを維持・allUsers禁止**、設定固定・画像digest固定 |

- **明示禁止:** project-wide SecretAccessor、既存Sales Tools Secretの参照、OTP SAとPIRA SAの秘密情報共有、BOOT/MIG SA流用、既存DBパスワード再生成、全既存Cloud Runサービスの設定/Traffic操作。
- 既存のconditional Cloud SQL Client CEL: `resource.type == "sqladmin.googleapis.com/Instance" && resource.name == "projects/msp-zabbix/instances/secumie-sg-shared-prod-db"`。既存Migration member/条件式は変更しない。
- 現状の `bindings:[]` はOTP/PIRA Secretの直接IAMのみ。上位階層の継承権限やeffective accessが空であるとは見なさない。

## 4. 配備設定・安全性

- プロジェクト `msp-zabbix`、リージョン `asia-northeast1`。DB `secumie_insight`。OTP DB role `secumie_otp_prod`、PIRA DB role `secumie_pira_prod`、pool各2。
- Private IPのみ。既定のDirect VPC + `gcr.io/cloud-sql-connectors/cloud-sql-proxy@sha256:e0cbea7b63455c1635d354ef456696d019dd02a5db47bf1994e849823e71ae89`、app `127.0.0.1:5432`。Proxy sidecarをTCP startup probeで確認してからappを起動。Public IP fallback禁止。
- `PIRA_GENERAL_ENABLED=false`。OTP issuer `https://insight.atlib.jp`、active kid `insight-prod-202611-v1`。PIRA側のJWKS URL `https://insight.atlib.jp/.well-known/jwks.json` はPhase B未公開のため、本格E2E前に**承認済みの非公開到達経路**が必要。PIRAにはJWT署名秘密鍵を付与しない。
- SMTP候補の既決定値: `live.smtp.mailtrap.io:587`、`SMTP_USER=api`、`SMTP_FROM=SECU:MIE <no-reply@notify.atlib.jp>`。**メール送信ドメイン確認と認証情報は未確認で、値を推測しない。**
- Turnstile: `insight.atlib.jp`のみ許可するProduction widget。site keyはPIRAの公開設定、server secretはOTPのみ。実Widget/Secretは未確認。
- JWT keys: RS256 / RSA2048以上、Key JSONの実フォーマット・新規生成・公開JWKS一致・rotation運用の秘密情報はGit/PR/CLI引数/ログに記録しない。Secret登録は別途認可された安全な手順による。
- Image: PR #47の最終承認SHAから `Dockerfile.secumie` の既存 `otp-runtime`、`pira-runtime` targetをビルド。linux/amd64 / nonroot / Critical0 High0 / OCI revision label / immutable remote index digest必須。WEB固有 `secumie-web-runtime` をビルドしない。
- Public/Private認証境界: B5-2Bでは匿名Invocations付与なし、Phase Bは別承認。認証付きhealth/JWKS/GENERAL拒否の検証経路が構成できない場合はSTOP。Cloud Run `Ready=True`だけではE2E PASSとしない。

## 5. 最小の実施順（GCP書込みは未承認）

1. **Read-only残Gate:** Secret継承IAM/Project条件を点検、専用Runtimeサービス名とDocker image tag衝突なし、Cloud SQL Private接続/接続上限、SMTP送信元認証・Turnstile widgetの存在・監視/通知先を確認。既存7サービスTrafficを最後に再確認。
2. **Owner別承認・Secret準備:** OTP/PIRA SA新規2件と新規Secret4件を作成。値は安全な経路から登録し、Secret Version1 ENABLEDを確認。各SAへ個別Secret accessorとProduction instance限定Cloud SQL Clientを付与。
3. **Owner別承認・画像/Runtime:** 2つのImageを最終HEADでbuild/scan/push、remote digestを固定。2つのCloud Run専用サービスを非公開・min0/max1で作成。個別Service env/Secret refs/SA/IAM/Private VPC/Proxy/GENERAL無効をRead-back。
4. **Private検証:** 認可された非公開経路でhealth/JWKS/Host/GENERAL拒否、専用DB接続、OTP・PIRAの各権限、SMTP/Turnstileの設定境界を検証。Sales Tools本番100%とPPAP等既存サービスに変更がないことをread-back。
5. **B5-2B完了判定:** 上記全てPASSで構築完了。「公開可」ではない。独立したSales Tools Traffic0、Phase B LB/TLS/DNS、Inititative登録、Retention preview、監視、最終Production Goは別Gate。

## 6. 費用・復旧・STOP（承認パッケージ）

- 今回の追加費用要因: 2 Runtimeのリクエスト/起動/メモリ・CPU、Proxy sidecarを含む稼働リソース、Image Registry、Secret ManagerのVersion/アクセス、Privateネットワーク通信、Logging。既存Production Cloud SQLは別途構築済みで**新インスタンス固定費を発生させない**。
- `min instances=0`かつrequest-based billing（配備時再確認）で常時稼働インスタンスを置かず、低負荷時の追加計算費を抑える。ただし無料・月額0円を保証しない。Runtime CPU/メモリ + Proxy sidecar実設定、推定アクセス量、既存請求アカウントfree tierの残額をもとに実額見積を確定させる。Phase B独立LB/固定IP/証明書等は**今回の費用範囲外**。
- 構築前の復旧点: 7つの既存Cloud Run Serviceおよび `sales-tools-wsc-release` 100% trafficをそのまま保護。今回新設の2 Runtimeに問題があれば、そのサービスへのアクセスを停止し隔離し、追加したIAMを差分単位で戻す。**DB schema rollback／Migration再実行／既存配信切替なし**。
- STOP: OCI image digest・scan不一致、管理対象以外のリソース検出、Secret漏えい/越境、project-wide IAM、Private DB不成立、認証付き非公開probe不可、GENERAL有効化、他サービスTraffic変化、想定外コスト。部分成功は記録して停止し、無断の自動リトライ/復旧をしない。

## 7. 独立承認に必要な未確定情報

- OTP HMAC Secretの正式名称（候補 `secumie-prod-otp-hmac-key`）。
- Mailtrap Live Sendingの送信ドメイン認証・本番Credentialの登録可否、Cloudflare Turnstile本番widgetのsite key・secretの登録可否。
- JWT鍵の生成・登録手段とローテーション証跡、非公開probeの実行経路、Project/Folder/Org SecretAccessor継承のRead-only証跡。
- 完成Imageの脆弱性スキャン・digestとRuntime+sidecarのリソース予算、監視/通知閾値。
- **B5-2BのGCP実環境変更承認。** 本ドキュメントとGitHubコメントは承認ではない。

参照: [B5準備正本](./secumie-production-gate-b5-preparation-20261117.md)、[Google Cloud Run multi-container](https://docs.cloud.google.com/run/docs/configuring/services/containers)、[Cloud Run pricing](https://cloud.google.com/run/pricing)。


## 8. Owner承認：B5-2B/1の空リソース準備（2026-11-20 JST）

Ownerから「承認します」と回答があった。直前に提示した次のGCP書込み工程を**B5-2B/1**として明確に分離し、以下の6つの新規リソースの**作成のみ**を許可する。

- Runtime専用Service Account **2件**：`secumie-otp-prod@msp-zabbix.iam.gserviceaccount.com`、`secumie-pira-prod@msp-zabbix.iam.gserviceaccount.com`。
- Secret Manager空Secret **4件**：`secumie-prod-smtp-password`、`secumie-prod-turnstile-secret`、`secumie-prod-otp-jwt-keys`、`secumie-prod-otp-hmac-key`。最後のHMAC Secret名は今回の作成対象名として明示する。既存B0–B4のProd DB Secretと同じautomatic replicationを用いる。

**この承認に含まれない:** Secret Version／実値登録、`roles/secretmanager.secretAccessor`付与、`roles/cloudsql.client`付与、Cloud Run・Artifact build/push/deploy、既存Secret・SA・DB・Jobs・7 Servicesへの変更、`PIRA_GENERAL_ENABLED`変更、WEB PR #50/#51の実行、SMTP/Turnstile設定、DNS/LB/TLS、公開、Retention。次の各Gateで個別に承認する。

**実行条件:** GCP Project `msp-zabbix`、有効なOwnerアカウント、既存7 Cloud Run ServiceがReadyでSales Tools `sales-tools-wsc-release` 100%配信中、新6件が全て不存在、既存Prod DB Secret 6件が維持されていることを**書込み前read-onlyで完全確認**。不一致はSTOP。SA2件→空Secret4件の順に作成し、部分失敗時は無断再試行／削除／回復をしない。作成後はService Account有効、Secretメタデータ存在、各Secret **Version0件・直接IAM Binding0件**、Sales Tools100%配信・既存7Service Readyをread-backする。CLIログへ秘密情報は一切入力しない。作成を実行するCloud Shell出力が提出されるまでは**未実行**と扱う。

**現在の状態:** 本記録時点ではGitHub文書の更新のみ。GCP書込み0件。Production No-Go・GENERAL disabled、既存Sales Tools100%・Retention preview-onlyを継続。


## 9. B5-2B/1 実環境実行結果（2026-11-20 JST）

Ownerが承認済みCloud Shellバッチ `B5_2B_PHASE1` の実行出力を提出。端末へ貼り付けた文字列のエコーに一部乱れがあるが、**PREFLIGHT、APPROVED CREATE、POST-CHECKの全セクション、6件のCreate成功出力、各Post-check PASS、終端`B5-2B PHASE1 SUCCESS`** を確認できた。GCPの実環境への直接再照会は本記録作成時には実施しておらず、以下はOwner提出ログに基づく証跡である。

### 9.1 Preflight

- `[PASS] Existing inventory and protected traffic`：作成前の既存Identity/Secretの名称、7 Cloud Run ServiceのReady/Traffic、Sales Tools `sales-tools-wsc-release` 100%をバッチ内で照合。
- 名称競合の事前検出なし。既存DB Secret 6件、既存Service Account 4件の構成に変更指示なし。

### 9.2 新規作成の実績（承認された6件のみ）

| Resource | GCP実行結果 | 事後照合 |
| --- | --- | --- |
| `secumie-otp-prod@msp-zabbix.iam.gserviceaccount.com` | `Created service account [secumie-otp-prod]` | `[PASS] SA active` |
| `secumie-pira-prod@msp-zabbix.iam.gserviceaccount.com` | `Created service account [secumie-pira-prod]` | `[PASS] SA active` |
| `secumie-prod-smtp-password` | `Created secret` | `[PASS] Empty Secret / 0 versions / 0 IAM` |
| `secumie-prod-turnstile-secret` | `Created secret` | 同上 |
| `secumie-prod-otp-jwt-keys` | `Created secret` | 同上 |
| `secumie-prod-otp-hmac-key` | `Created secret` | 同上 |

- 新規Secret4件は自動複製設定を検証。各SecretのVersionは0、Secret単位の直接IAM bindingsは0。**値/Versionの作成と権限付与は未実行**。
- `[PASS] Protected Cloud Run snapshot unchanged`：既存7 Cloud Run ServicesのReady/Trafficの書込み前後スナップショット一致を確認。個別サービスの機能E2Eや上位階層のIAMまで検証したものではない。
- `B5-2B PHASE1 SUCCESS` を確認。STOP/失敗はOwner提出出力に見当たらない。

### 9.3 確定判定と次Gate

**B5-2B/1（専用SA2件 + 空Secret4件の作成）はPASS / 完了。** B5-2B全体、Production Go、公開を意味しない。Cloud Run新サービス、IAM、Secret Version/値、DB接続設定、SMTP/Turnstile/JWT本番実設定、アプリ画像build/push、LB、DNS、Retention、WEB PR #50/#51の変更・実行はいずれも本バッチに含まれない。

**次は独立したB5-2B/2承認Gate:** Mailtrap Live送信ドメインと本番Credential、Cloudflare Turnstile Production widget/secret、JWT秘密鍵の安全な作成・登録方式、OTP HMACの安全な生成・登録方式、Secret4件Version1登録と既存DB Secret2件の個別IAM、2 SAへのProduction instance限定Cloud SQL Client付与、Cloud Run非公開検証経路・料金影響・rollbackの具体化。秘密値をチャット／GitHub／CLI引数・ログへ書かない。サービス公開前の`PIRA_GENERAL_ENABLED=false`および既存Sales Tools100% Trafficを保持する。

**現在維持:** `Production No-Go`、GENERAL無効、Retention preview-only、Sales Tools `sales-tools-wsc-release` 100%、Secure Guard/Send/WEB・他既存サービスへの無変更。


## 10. B5-2B/2 設定事前確認・Secret登録前Gate（2026-11-20 JST）

### 10.1 現在の対象範囲

B5-2B/1で作成済みの2 SAと空Secret4件を**再作成しない**。既存DB Secret `secumie-prod-db-otp-password:1` / `secumie-prod-db-pira-password:1` の値やVersionは変更しない。WEB PR #50/#51、既存Sales Tools、Secure Guard/Send、Production DBのMigrationには触れない。

既存コード契約を再照合した結果、専用OTP/PIRA Runtimeの追加コード変更は現段階で不要。特に `src/publicAuth/publicOtpApiService.ts` の `JwtKey` は `{kid:string,privateKey:string,publicKey:string}`、`src/runtime/runtimeConfig.ts` の `OTP_JWT_KEYS_JSON` はその**配列**、`OTP_JWT_ACTIVE_KID` は配列中の既存 `kid` を参照する。署名はRS256、JWKSは `publicKey` から生成。鍵の中身をGitHubやチャットで扱わない。

### 10.2 本番外部サービスの準備状況

| 対象 | 合意済み設定 / コード要件 | 実証状態 | 実行前のチェック |
| --- | --- | --- | --- |
| Mailtrap | `notify.atlib.jp` のTransactional SMTP、`live.smtp.mailtrap.io:587`、user `api`、From `SECU:MIE <no-reply@notify.atlib.jp>` | ドメイン検証・Compliance・SMTP Credential未確認 | Mailtrap Sending Domainsで**Verified/送信可能**・Transactional Integrationを管理画面で確認。SMTP Password/tokenは返信・ログへ出さずOTP SecretにだけVersion1を登録 |
| Turnstile | hostname `insight.atlib.jp`だけ、Managed、Pre-clearance無効 | Production Widget/sitekey/secret未確認 | Cloudflareで許可hostnameとsitekey/secretの対応を確認。公開sitekeyはPIRA Runtimeの非秘密設定、server secretはOTP SecretにだけVersion1 |
| JWT | RS256、RSA 2048 bits以上、`kid=insight-prod-202611-v1`、issuer `https://insight.atlib.jp` | 本番鍵未確認 | 既存コード契約の配列JSONを使用。新規秘密鍵の生成・JSON整合・公開鍵検証は秘密情報を出力しない手順で別途実施。OTPのみ秘密鍵参照 |
| OTP HMAC | 独立した32文字以上の暗号学的乱数、`secumie-prod-otp-hmac-key` | Secretの空リソースだけ作成済み | JWT鍵ともDB passwordとも独立した値を非ログ生成しVersion1登録。PIRA SAへ配らない |

Mailtrap / CloudflareのDashboardの真の状態はこのGitのread-onlyレビューから判断できない。DNSレコードがあってもMailtrap Verified/Compliance PASSを代替しない。

### 10.3 GCP Read-only Gate（B5-2B/2書込み前）

次のCloud Shellで**参照だけ**を実施し、資格情報・Secret payloadを表示しないこと。

1. OTP/PIRA SAは作成済みでenabled、追加Secret4件はVersion0・直接IAM0、既存OTP/PIRA DB SecretはVersion1 ENABLED。違えばSTOP。
2. Project IAMでOTP/PIRA SAの `roles/cloudsql.client` / project-wide `secretmanager.secretAccessor` 等の現在のbindingsを取得。現時点の**直接Project Policy**であり、Folder/Organization継承・実効権限の不存在証明ではない。
3. 既存7 Cloud Run ServicesのReadyと配信先を再照合し、Sales Tools `sales-tools-wsc-release` 100%を保護。
4. `notify.atlib.jp` の公開DNSを参考情報として照会。ただしMailtrap認証ステータスと混同しない。
5. 全照会結果をB5 CanonicalへOwner提出証跡として記録。**ここで書込み・IAM付与を行わない。**

### 10.4 未承認の次の変更単位

- **B5-2B/2a: Secret Version登録**（SMTP/Turnstile/JWT/HMACの4件、各Version1のみ）。Google Cloud Consoleの「新しいバージョンを追加」等の非ログ操作。外部サービスの本番値準備とOwner明示承認が条件。秘密値をチャット・Git・CLI引数・ログへ貼らない。DB password2件は触れない。
- **B5-2B/2b: 最小IAM**（既存OTP/PIRA DB Secretを各SA1対1に、追加4 SecretをOTP SAにのみ）。`roles/cloudsql.client`は既存Production Instance限定の条件付きbindingで**新2 SAだけ**を追加、既存Migration member/条件式を保持。Project-wide SecretAccessor禁止。実行前に差分・条件を検証し、Owner別承認。設定後、SecretごとにIAM/Version状態とProject条件をread-back。
- **B5-2B/3: Image・Cloud Run** はさらに別承認。Source SHA固定、各Image Critical/High0、immutable digest、Private IP Proxy、非公開・認証付きprobeの経路が成立することが前提。**新しいWEB受付/OTP基盤は作らない。**

**Gate:** 2b/2aのいずれも未承認・未実施。Production No-Go、`PIRA_GENERAL_ENABLED=false`、Sales Tools100%、Retention preview-onlyを維持。

参考： [Secret Version追加（Google Cloud）](https://docs.cloud.google.com/secret-manager/docs/add-secret-version)、[Mailtrap SMTP連携](https://docs.mailtrap.io/email-api-smtp/setup/smtp-integration)、[Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/get-started/)。


## 11. B5-2B/2 GCP Read-only Gate実行結果（2026-11-20 JST）

Ownerは Cloud Shell `B5_2B_PHASE2_PREFLIGHT` の実行ログを提出した。貼付時のコマンドエコーに一部乱れがあるが、5セクションすべて、各PASS、`B5-2B PHASE2 PREFLIGHT COMPLETE`の終端を確認できる。今回のGit記録はOwner提出ログの評価であり、別セッションでのGCP再計測ではない。

### 11.1 確認できた事実

| 対象 | 実測 | 判定 |
| --- | --- | --- |
| `secumie-otp-prod@...` | SA存在・Enabled | PASS |
| `secumie-pira-prod@...` | SA存在・Enabled | PASS |
| `secumie-prod-smtp-password` | automatic replication、Version0、直接IAM0 | PASS |
| `secumie-prod-turnstile-secret` | automatic replication、Version0、直接IAM0 | PASS |
| `secumie-prod-otp-jwt-keys` | automatic replication、Version0、直接IAM0 | PASS |
| `secumie-prod-otp-hmac-key` | automatic replication、Version0、直接IAM0 | PASS |
| `secumie-prod-db-otp-password` | Version1 ENABLED、直接IAM `[]` | PASS |
| `secumie-prod-db-pira-password` | Version1 ENABLED、直接IAM `[]` | PASS |
| Project IAM（新2 SA member） | 条件付き／無条件を含む直接Project policy該当 `[]` | PASS（Project直下のみ） |
| 既存Cloud Run 7サービス | 全Ready True、前回と同一のactive 100%配信先 | PASS |
| Sales Tools | `sales-tools-wsc-release` 100% | PASS |

**IAM解釈上の留保:** Secretレベルの直接 `bindings: []`、Project IAM該当 `[]` は、上位Folder/Organization権限やeffective permissionsまで不存在と証明するものではない。Secret payload・Versionデータを表示・取得した実績はない。

### 11.2 次のFit/Gap

- **PASS:** B5-2B/1で作成済みの新SA2件・空Secret4件と既存DB Secret2件のpreflightは想定一致。GCP側で追加作成・IAM付与を再実行する必要なし。
- **未確認:** Mailtrap `notify.atlib.jp` のTransactional Sending Domain Verified / live SMTP Credential、Cloudflare `insight.atlib.jp` のProduction Widget Managed / secret key、JWT RS256の独立鍵ペアと秘密JSON配列、OTP HMACの独立鍵、Org/Folder IAM継承、非公開E2E経路。
- **未実施／別Owner承認:** B5-2B/2a Secret Version1登録、B5-2B/2b IAM追加、B5-2B/3 Image build/pushとCloud Run作成、Phase B/C公開、WEB PR #50/#51への実装・デプロイ。

### 11.3 次操作の最小化

新規アプリ・汎用Secret管理基盤は作らない。Mailtrap/Cloudflare Dashboardの**設定状態だけ**をOwnerが確認し、秘密値はチャット/Git/CLI引数/ログへ貼らない。外部サービスの準備が整った段階で、B5-2B/2aの**既存4 SecretへのVersion1だけ**をCloud Consoleで追加する実行手順を提示して独立承認を得る。Version登録前に期待値と送信元認証の根拠を確認。DB SecretのVersionを触らない。B5-2B/2bのSecret単位IAMとCloud SQL Client条件付与は2aと混在させず別の承認・実行バッチで扱う。

**結論:** B5-2B/2 GCP read-only preflightは**PASS（対象範囲に限定）**。Secret Version／IAM／Cloud Run／DNS／Trafficへの書込みはゼロ。引き続き `Production No-Go`、`PIRA_GENERAL_ENABLED=false`、Sales Tools現行100%、Retention preview-only、既存SECU:MIE WEB非変更を維持。


## 12. B5-2B/2a1 JWT/HMAC登録の独立した最小手順（2026-11-20 JST、実行前）

**範囲限定:** B5-2B/2aをさらに分割し、外部サービスの認証情報に依存しない**OTP JWT鍵とOTP HMAC鍵の2 Secretだけ**について、Version1登録の安全な実行契約を定義する。対象は既に作成済みの `secumie-prod-otp-jwt-keys` と `secumie-prod-otp-hmac-key`。既存DBパスワード・SMTP/Turnstileは触れず、SA/IAM、Artifact、Cloud Run、DB/Jobs、WEB PR #50/#51、DNS/LB/TLS、Traffic、Retentionへの操作禁止を維持。

### 12.1 現行コードへのFit

- `src/publicAuth/publicOtpApiService.ts`：`JwtKey={kid:string,privateKey:string,publicKey:string}`、署名 `RS256`、JWKSは`publicKey`由来。
- `src/runtime/runtimeConfig.ts`：`OTP_JWT_KEYS_JSON`は上記オブジェクトの**配列JSON**、`OTP_JWT_ACTIVE_KID=insight-prod-202611-v1`と一致する要素を要求。HMACは`OTP_HMAC_KEY` 32文字以上。
- 鍵は本番専用に暗号学的安全乱数で生成する。RSA 2048 bits以上、PEM private PKCS8 / public SPKI。文字列配列と署名検証に関するSynthetic Node.js試験で PASS（公開鍵／秘密鍵・Secretは一切出力していない）。これは実GCP登録試験ではない。

### 12.2 実行方式と安全境界

- Cloud Shellで、Secretの**存在・Version0・直接IAM空**、OTP/PIRA SA enabled、既存Sales Tools `sales-tools-wsc-release`100%と保護対象のReadyを事前read-only照合する。不一致は書込み前STOP。
- `node:crypto.generateKeyPairSync`（RSA2048）で `{kid,privateKey,publicKey}[]` を生成し、RS256署名/検証をメモリ内だけでPASSした後、**標準出力パイプを`gcloud secrets versions add secumie-prod-otp-jwt-keys --data-file=-`へ直接接続**する。公開端末やShell変数・履歴・一時ファイルに鍵を展開しない。
- `node:crypto.randomBytes(48).toString('base64url')`で独立したHMAC鍵を生成し、同様に `secumie-prod-otp-hmac-key` へ標準入力から直接渡す。DB password、JWT鍵とは独立生成。
- `set -euo pipefail`、初回失敗でSTOP。途中で1件だけ登録された場合も**スクリプト全体を再実行しない**。Secret Payloadの読み戻し、ハッシュ出力、`--data-file`に書いた一時ディスクファイルの利用を禁止。
- 登録後、各Secret Version1の`state=ENABLED`、Version数1、直接IAM bindings0、Sales Tools既存配信不変を**メタデータのみ**確認。Secret本体のbyte照合ではないことを明示する。
- この2件を登録してもSMTP/Turnstile未準備、個別IAM未付与、Runtime未作成のためProduction No-Goを維持。メール送信やユーザー受付はできない。

**実行承認境界:** 本節は実施可能な最小手順と影響範囲の提示であり、ここでGCPへの書込みはしていない。Ownerが限定スクリプトを明示的に実行した結果を受領するまではVersion登録を実行済みと記録しない。Mailtrap/TurnstileのVersion登録とIAM付与は別工程として停止。

### 12.3 登録後の残Gate

- Mailtrapの`notify.atlib.jp` Verified / 本番Transactional SMTP Credential、Cloudflare Production Turnstile Widget `insight.atlib.jp`（Managed・Pre-clearance OFF）のConsole確認、各SecretへのVersion1登録（Owner個別承認）。
- OTP SAへOTP DB/SMTP/Turnstile/JWT/HMAC各Secretの個別Accessor、PIRA SAへPIRA DB SecretだけのAccessor。本番Cloud SQL instance限定の条件付きCloud SQL Client。別承認のRead-back。
- WEBは既存OTP利用案を保持し、WEB PR #50/#51を本Gateに混入させない。

`Production No-Go`、`PIRA_GENERAL_ENABLED=false`、Sales Tools現行100%、Retention preview-onlyを維持。


## 13. B5-2B/2a1 JWT/HMAC Secret Version 1実行結果（2026-11-20 JST）

Ownerが承認済みのCloud Shell `B5_JWT_HMAC_V1` バッチの実行ログを提出。貼り付け時のコマンドエコーには一部乱れがあるが、`1. PREFLIGHT`、`2. JWT SECRET VERSION 1`、`3. HMAC SECRET VERSION 1`、`4. POST-CHECK` の全セクション、および終端 `B5 JWT HMAC V1 SUCCESS` が確認できる。以下は**Owner提出ログに基づく証跡**であり、GitHub更新時に直接GCPを再照会した結果ではない。

| 検証 | Owner出力 | 判定 |
| --- | --- | --- |
| JWT Secretの作成前状態 | `[PASS] Empty Secret: secumie-prod-otp-jwt-keys` | PASS |
| HMAC Secretの作成前状態 | `[PASS] Empty Secret: secumie-prod-otp-hmac-key` | PASS |
| 保護対象Cloud Run事前照合 | `[PASS] Protected Services` | PASS |
| `secumie-prod-otp-jwt-keys` Version 1登録 | `Created version [1]` | PASS |
| `secumie-prod-otp-hmac-key` Version 1登録 | `Created version [1]` | PASS |
| JWT登録後メタデータ | `Version 1 ENABLED / IAM 0` | PASS |
| HMAC登録後メタデータ | `Version 1 ENABLED / IAM 0` | PASS |
| 保護対象Cloud Run事後照合 | `[PASS] Protected Cloud Run unchanged` | PASS |
| 最終結果 | `B5 JWT HMAC V1 SUCCESS` | PASS |

**確定判定:** B5-2B/2a1の**JWT/HMAC各SecretへのVersion 1登録完了：PASS**。配備前のJWT署名鍵JSONはNode.jsでRSA 2048ビットの鍵ペアを生成し、プロセス内でRSA-SHA256署名検証を行ったうえで `gcloud secrets versions add --data-file=-` にパイプ送信。HMACは独立した48-byte CSPRNG乱数をbase64url化して同様に登録。秘密情報の本体・値・ハッシュ・鍵ファイルは本チャット、GitHub、出力ログには含まれず、値の読戻しも実施していない。

**証跡の限界:** `Version 1 ENABLED` と作成メッセージは登録成功とメタデータの整合を示すが、登録されたpayloadの内容をGCPから再読出し・比較したことを意味しない。署名鍵が公開JWT/JWKS/E2E経路で正常に動くことはRuntime配備後の別Gate。Secretに対する直接IAMは現時点で0件であり、OTP/PIRA SAのアクセス権限は未付与。Project/Folder/Org継承権限の不存在は未証明。

**次工程:** 残る `secumie-prod-smtp-password` と `secumie-prod-turnstile-secret` は依然として空Version0であり、Mailtrap `notify.atlib.jp` の送信ドメインVerified / live SMTP Credential とCloudflare `insight.atlib.jp` の本番Widget hostname/secretの証跡を先に得る。秘密値をチャットへ提出させず、承認後に2 SecretのVersion1のみ登録。OTP SAへの個別SecretAccessor、PIRA SAへの専用DB SecretAccessor、Production instance限定Cloud SQL Clientの追加は**別の実行承認**とし、本段階では付与しない。

**不変:** `Production No-Go`、`PIRA_GENERAL_ENABLED=false`、既存Sales Tools `sales-tools-wsc-release` 100% Traffic、Retention preview-only、WEB PR #50/#51・Secure Guard/Send・既存7 Cloud Run Services不変更。


## 14. B5-2B/2 SMTP・Turnstile方針：既存SECU:MIE WEB構成の再利用（2026-11-20 JST）

### 14.1 Owner指示と現行Fit/Gap

OwnerはStagingでのMailtrap Sandbox再構築を行わず、**SECU:MIE WEBの既存構成を流用してInsight本番環境で確認する**方針を明示。これを受け、B5 §2の「Mailtrap Live Sending / `notify.atlib.jp`」は**本番送信基盤の採用未確定候補として保留**し、既存コーポレートサイトのSMTPリレーの利用可否を先にread-onlyで評価する。**MailtrapのStart Sending/API Token/新規DNS認証の作業をここで進めない。** 既存Canonicalの歴史的判断・Secret名を遡及変更しない。

現行Gitの証拠：
- `yoshihisahagisaka/atlib-corporate-site` Draft PR #66：暫定SECU:MIE WEBは `www.atlib.jp/secumie-web/` → 既存 `/api/contact` → **コーポレート既存SMTP通知**（`contact@atlib.jp`）とCloudflare Turnstileを使用。**メールOTPはない。**
- 同repo PR #64：コーポレート既存SMTP構成はGoogle Workspace `smtp-relay.gmail.com:587`、SMTP認証・TLS必須、IP指定制限なし（当時の設定照合）。実際の**現在100%配信Revisionの環境変数・認証情報の有効性・送信元アドレスを今回再測定したものではない**。
- `src/services/mailer.ts`（コーポレート）と `atlib-sales-tools/src/services/mailer.ts`（Insight OTP）はともにNodeMailer `createTransport({host,port,secure:false,auth:{user,pass}})`、587/STARTTLS契約。**既存Insightコードを改修せずに既存Workspace SMTPリレー方式を使用できる見込み**。ただし送信者許可・同GCPプロジェクト外からの認証/疎通と実配送は別の本番Synthetic検証対象。
- コーポレートのTurnstileは `SITE_CONTACT_TURNSTILE_HOSTNAMES` を検証し、Siteverify応答の `action=contact` とhostnameをサーバ側で照合。Insight OTPの既存 `CloudflareTurnstileVerifier` は `success=true` を確認し、同じhostname/actionの検証をしていない。従って**コーポレートのsitekey/secretを無条件にInsightへコピーしてはいけない**。Cloudflareの**同じ既存サービス**上で `insight.atlib.jp`だけを許可する専用本番Widgetを再利用/作成し、その専用secretを既設の空 `secumie-prod-turnstile-secret` へ登録する案を優先。新しいTurnstile検証コード・独自基盤は作らない。
- 正式SECU:MIE WEBのDraft PR #50（OTP・Web専用受付）は本番未構築の別レーン。Insightの本番構築のためにWEB PR #50/#51のコードを同時マージ・デプロイしない。

### 14.2 これから採取するread-only証跡

1. GCP project `atlib-corporate-site`, region `asia-northeast1` の現在の `corporate-site` **100%トラフィックRevision**を確認（最新Ready Revisionとは別の場合がある）。
2. そのRevisionの `SMTP_HOST`/ `SMTP_PORT` / `SMTP_FROM` の**非秘密設定値**、`SMTP_USER`の有無、`SMTP_PASSWORD`の**Secret参照名とVersionのみ**、`SITE_CONTACT_TURNSTILE_SITE_KEY` / `SITE_CONTACT_TURNSTILE_SECRET` の**有無・Secret参照有無のみ**、`SITE_CONTACT_TURNSTILE_HOSTNAMES` をread-onlyで収集。**パスワード、token、Turnstile site secretは絶対出力しない**。
3. 既存設定がGWS認証付きリレーであることを確認し、利用する `SMTP_FROM` がGoogle WorkspaceのAllowed Senders規則に一致しているかをConsole設定と本番Synthetic配送で確かめる。`notify.atlib.jp` での差出人送信は**許可が確認できるまで推測しない**。暫定的な送信元を変更する場合もOwnerと確定する。
4. Insightの `secumie-prod-smtp-password` は既設の**空Secretを再利用**。既存コーポレート側のSecret値/IAMに触らず、新OTP SAへの広域/cross-project Secret Accessorを増設しない。必要な認証情報はOwnerが別途承認した非ログ経路からInsight専用Secret Version 1へ登録する。
5. Turnstileは既存サービスを使うがホスト `insight.atlib.jp` 限定のWidget/secretの実設定を確認し、最小の新規設定だけを行う。WEBのwww設定を変更しない。
6. 個別SecretのVersion1登録とIAM付与は**別承認**。非公開本番OTP Runtimeが構築され、認証つき/private検証経路が確立するまで公開ユーザー向けOTP送信やフォーム送信を実施しない。

### 14.3 方針とSTOP

- **再利用するもの:** Google Workspace SMTPリレーの既存の配送方式、NodeMailer既存コード、Cloudflare Turnstileの仕組み。**再利用しないもの:** コーポレートの問い合わせAPIをOTP代わりに呼び出す経路、WEB暫定受付のデータ、旧Staging Sandbox、無条件のTurnstile秘密鍵共有。
- **まだ未確定:** Productionの正確なSMTP接続先/From、Workspace送信者ポリシー適合、コーポレート実配送状況、TurnstileのInsight hostname専用Widget、Secret Version1、Runtime実動作。
- **今回のGit記録でのGCP変更はゼロ**。既存コーポレート・WEBのCloud Run、Sales Tools、Secure Guard/Send、Secrets、DNS、IAMには触れない。

**不変:** `Production No-Go`、`PIRA_GENERAL_ENABLED=false`、Sales Tools `sales-tools-wsc-release` 100% Traffic、Retention preview-onlyを維持。


## 15. Corporate Site live SMTP and Turnstile read-back（2026-11-20 JST）

OwnerはCloud Shellで `SECUMIE_REUSE_CHECK`（**read-only**）を実行し、GCP project `atlib-corporate-site`、region `asia-northeast1` の `corporate-site` Serviceと、現在100%配信Revisionの**非Secret設定**を確認した。コマンド入力エコーには乱れがあるが、`1. Production Service`、`2. Active Revision Configuration` のJSON出力と終端 `SECU:MIE REUSE READ-ONLY COMPLETE` が揃っている。直接GCPを再照会せず、Owner提出ログを証跡とする。

| 項目 | Owner live read-back | 確認と限界 |
| --- | --- | --- |
| Service / Ready | `corporate-site`、Ready=`True` | 現在のService Ready PASS（OTP送信E2Eではない） |
| 配信100% Revision | `corporate-site-00030-vow` | 以前の候補Revisionではなく現在の配信先を特定 |
| `SMTP_HOST` | `smtp.gmail.com` | **`smtp-relay.gmail.com`ではない**。認証付きGmail SMTP submissionを採用中 |
| `SMTP_PORT` | `587` | 現行NodeMailer STARTTLS構成にFit |
| `SMTP_FROM` | `system@atlib.jp` | Insightで別Fromを推測しない。送信者・認証アカウントの一致は未確認 |
| `SMTP_USER` | 設定あり（値は未取得） | 実アカウントIDとCredential種別・利用許諾は未確認 |
| `SMTP_PASSWORD` | Secret環境変数→`corporate-site-smtp-password` Version `2` | Secret値取得なし、変更なし。別Projectで直接共有する設計にはしない |
| Turnstile hostname allowlist | `www.atlib.jp` | `insight.atlib.jp`を含まず、既存www用WidgetをそのままInsightへ流用不可 |
| Turnstile site key | 設定あり（値は未取得） | 既存wwwの公開site keyをInsightに無条件共有しない |
| Turnstile server Secret | Secret環境変数→`corporate-site-prod-turnstile-secret` Version `1` | 値取得なし、変更なし。Insight専用WidgetとSecret対応を確認する |

**B5 §2のSMTP候補との差分:** 当初候補はMailtrap Live Sending、`notify.atlib.jp`、`live.smtp.mailtrap.io:587`。Owner指示により、現時点では**Mailtrap新規構築をSTOPし、実稼働しているCorporateの `smtp.gmail.com:587` 方式を先行候補**とする。ただしコーポレートの`SMTP_USER`と送信元の一致、Google Workspaceの認証・送信ポリシー、異なるGCP Project/SAからの疎通、`system@atlib.jp`をInsight送信元として採用するかは未確定。**現物を確認する前に`notify.atlib.jp`を`system@atlib.jp`へ正式変更した扱いにしない。**

**最小再利用方針:** Insightの既存NodeMailer `sendPublicServiceOtp` と、コーポレートで実使用されるGmail SMTP設定方式を再利用する。新SMTPサービス・メールAPI・共有認証基盤を作らない。Insightの空Secret `secumie-prod-smtp-password` を保持し、今後Owner承認後に**Insight専用の認証情報**を安全にVersion 1登録することを第一候補とする（コーポレートのSecret値/IAMに触れず、利用アカウントの条件を確認）。Secretへの直接Cross-project Accessorは付与しない。

**Turnstile境界:** Cloudflareという提供基盤は再利用するが、`www.atlib.jp`限定のWidgetを共有しない。Cloudflareの既存アカウントで`insight.atlib.jp`に限定したWidgetの有無を確認し、未存在なら別Owner承認で追加。既に作成済みの空Secret `secumie-prod-turnstile-secret` へ当該専用Widgetのserver Secretを登録する候補とし、コーポレート側を変更しない。

**次のRead-only:** `corporate-site-00030-vow`の`SMTP_USER`（値はGWSアカウント識別子でありSecret本体ではないことを確認する）、Cloud Run SA、関連Secretのmetadataのみを検証。メール送信試験、Secret payload取得、Secret Version作成、IAM、Cloud Run配備はここで実施しない。送信元ポリシー・認証方式はWorkspace Consoleまたは担当者の設定確認が必要。

**現在のGate:** Insight `secumie-prod-otp-jwt-keys:1` / `secumie-prod-otp-hmac-key:1` は登録済み、Insight SMTP・Turnstile SecretはVersion0のまま。B5-2B/2b IAM・B5-2B/3 Runtimeは未承認・未実施。`Production No-Go`、`PIRA_GENERAL_ENABLED=false`、Sales Tools100%、Retention preview-only、WEB/Corporate/SG/Send無変更を維持。


## 16. SMTP authenticated identity read-back（2026-11-20 JST）

OwnerはCloud Shellで `SECUMIE_SMTP_IDENTITY_CHECK` を read-only実行し、コーポレートサイト `atlib-corporate-site` の現在100%配信中とされたRevision `corporate-site-00030-vow` の、SMTP認証アカウント識別子・送信元・Secret参照・Service Accountを確認した。終端 `SECUMIE_SMTP_IDENTITY_CHECK` を含むJSON出力があり、Secret値へのアクセスやIAM変更は行っていない。

| 設定 | Owner提出した現行Revisionの非秘密値 |
| --- | --- |
| Revision | `corporate-site-00030-vow` |
| Runtime SA | `corporate-site-production@atlib-corporate-site.iam.gserviceaccount.com` |
| SMTP host/port | `smtp.gmail.com:587`（portは前節§15の実測） |
| SMTP auth username | `yoshihisa.hagisaka@atlib.jp` |
| SMTP From | `system@atlib.jp` |
| SMTP password | `corporate-site-smtp-password:2`（参照メタデータのみ） |

**判断:** 現行のSMTP認証ユーザーとFromは**異なるアドレス**。Google Workspace/Gmailの「別のアドレスから送信」（Send mail as）のエイリアス許可、及び `system@atlib.jp` が送信元として期待どおり維持されることは、このCloud Run環境変数read-backだけでは未証明。コーポレートサービスの実配送済み証跡を新たに取得したわけでもない。**Insightにこの組み合わせを採用する候補**とし、既存からそのままコピーして動くと断定しない。

**最小の次工程:** 現在のGoogle Workspaceアカウントで `system@atlib.jp` が実際にSend mail as許可されていることをGmail設定または管理コンソールで確認（アドレスだけを確認し、認証Secretを見せない）。許可済みなら、Insight `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=yoshihisa.hagisaka@atlib.jp`, `SMTP_FROM=system@atlib.jp` を**構築候補**とし、Insight専用 `secumie-prod-smtp-password` のVersion1を独立承認された安全な方法で準備する。既存コーポレートのSecret `corporate-site-smtp-password:2` を読み出したり、Cross-project IAMを広げたりしない。既存個人アカウント利用の継続的な保守・認証失効リスクは公開判断前に確認する。

Turnstileについては前節§15の通り `www.atlib.jp` のWidgetを秘密鍵ごと共用せず、`insight.atlib.jp` に適合する専用Widgetの有無を先に確認する。

**書込みはGitHubの証跡のみ。** GCPのSecret Version/IAM/Cloud Run、Google Workspaceのアカウント/エイリアス、CloudflareのWidget、DNS、メール配送・テストはこの判定では実行しない。 `Production No-Go`、`PIRA_GENERAL_ENABLED=false`、既存Sales Tools100%、Retention preview-onlyを維持。

参考: https://support.google.com/mail/answer/22370


## 17. SMTP alias Owner確認・WEB本番稼働を採用（2026-11-20 JST）

Ownerは `system@atlib.jp` の送信元登録が既に完了していること、ならびに**SECU:MIE WEBが現に本番稼働中**であることを明示した。前節§16の「Gmail送信元登録の有無」を**Owner確認済み**としてクローズし、同じ確認を繰り返さない。

確定したInsight専用OTP SMTPの**構築採用案**：既存コーポレートと同じ `SMTP_HOST=smtp.gmail.com`、`SMTP_PORT=587`、`SMTP_USER=yoshihisa.hagisaka@atlib.jp`、`SMTP_FROM=system@atlib.jp`。既存NodeMailerのSMTP送信経路を流用し、Mailtrap Live Sending/新ドメイン`notify.atlib.jp`の導入を**当面行わない**。過去のMailtrap方針は履歴として残すが、このOwner確認を受けたSMTPの実装候補は本節を優先する。

**確定と未実施を分離:** Owner確認によってWEBの現用SMTP構成と送信元登録は再確認不要。一方、Insightの専用Runtimeは別GCP Projectの別SAであり、SMTP資格情報を使える状態にする**独立Secret `secumie-prod-smtp-password` のVersion1**、必要なIAM、非公開実メールOTP E2Eは未実施。コーポレートの既存 `corporate-site-smtp-password:2` は変更・取得・越境IAM付与しない。既存個人Google Workspaceアカウントの認証方式／パスワード利用許諾は、Secret登録時の有効性で扱い、再度送信元エイリアス設定からやり直さない。

Turnstileは既存WEBの機能を再利用するが、現在の`www.atlib.jp`用Widget/許可hostnameでは`insight.atlib.jp`が対象外。既存Cloudflareアカウント内で `insight.atlib.jp` 専用Widgetが既に存在するかを確認し、なければ最小限追加する。新しいTurnstile検証基盤は不要。

**次工程:** (1) Insight SMTP用の認証情報の安全な手配と専用SecretへのVersion1登録（別承認）、(2) Insight hostnameに対応するTurnstile Widgetと専用SecretへのVersion1登録（別承認）、(3) 既存2 SAへの最小IAM付与とCloud Run非公開E2E（別承認）。新規メールシステム・コーポレートフォームAPIの転用・新OTP開発はしない。

本記録はGitHubのみ更新。GCP、Workspace、Cloudflare、既存WEB、Corporate、Sales Tools、Secure Guard/Sendの変更は実施しない。**Production No-Go**、`PIRA_GENERAL_ENABLED=false`、Sales Tools100%、Retention preview-only維持。
