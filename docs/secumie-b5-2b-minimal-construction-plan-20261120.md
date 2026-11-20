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
