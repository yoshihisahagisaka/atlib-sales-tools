# SECU:MIE 専用Cloud SQL基盤 設計判断記録（履歴・旧単独構成）

> 2026-11-05: SECU:MIEとSecure Guardの共用Cloud SQL方針により、インスタンス構成および第11節のStaging作成手順は実行対象外となった。接続分離・権限・保持の既存判断は継承する。新しい実行正本は `docs/secumie-secure-guard-shared-cloud-sql-design-20261105.md` とする。旧名称 `secumie-staging-db` でリソースを作成してはならない。

- 作成日: 2026-11-04（Asia/Tokyo）
- 対象project / region: `msp-zabbix` / `asia-northeast1`
- 基準: PR #36〜#43、PR #43 HEAD `18f0787565a858a4045892eb159d4c13cbe7aaa6`
- 状態: 専用DB設計および接続実装完了。隔離Stagingの実リソース作成は未承認。Production No-Goを維持する。

## 1. Decision

統括承認済みの方針として、SECU:MIEの本番データ基盤は既存の`msp-customer-portal-db` / `sales_tools`を共用せず、PostgreSQL 16の専用Cloud SQL instanceを第一候補とする。

理由は次のとおりである。

- 既存本番instanceは`max_connections=25`で、既存サービスだけで1分最大22接続の実績がある。
- OTP/PIRA runtimeは現行実装のままでも1 instance当たり各pool最大5接続を持つ。
- Sales Tools、Portal、PPAPとSECU:MIEの障害、容量、復旧、権限の影響範囲を分離する必要がある。
- SECU:MIE Insightの一般展開と将来のSECU:MIE Webを見込み、独立したBackup/PITR、接続budget、保守運用を持たせる。

既存Production Cloud SQLのmachine増強、role変更、schema追加は行わない。共有Stagingの`secumie_rehearsal`作成と一時管理Job案（PR #40/#41）は実行停止とし、履歴・安全設計の参照資料として維持する。

## 2. 推奨する初期本番構成

| 項目 | 推奨値 | 根拠・条件 |
|---|---|---|
| Database | PostgreSQL 16 | Migration 037〜041および検証済みruntimeと一致 |
| Edition | Cloud SQL Enterprise | 初期負荷に対しEnterprise Plusは過剰。PITR 7日とHAを利用可能 |
| Region | `asia-northeast1` | runtime、利用者、既存運用と同一地域 |
| Availability | **REGIONAL (HA)** | 顧客向けOTP・受付を一つのzone障害で長時間停止させないため |
| Machine | General Purpose dedicated core、custom 1 vCPU / 3.75 GiB | Enterprise dedicated coreの最小メモリ条件を満たし、shared-coreを避ける |
| Storage | SSD 20 GiB、automatic storage increase有効 | 初期容量を抑えつつ、容量枯渇による書込み停止を防止 |
| Backup | daily automated backup、30世代を候補 | 最終保持数、backup window、削除後保持は配備前承認対象 |
| PITR | 有効、transaction logs 7日 | Enterpriseの上限内。作成方法がCLI/APIでも明示的に有効化する |
| Deletion protection | 有効 | 誤削除防止。正式な廃止手順だけで解除する |
| Connectivity | Cloud Run Cloud SQL attachment / connector。public IPの有効化は原則不要 | DBをInternetへ直接公開しない。実VPC/private IP採否は現行ネットワークとのFit/Gap後に確定 |
| Encryption | Google-managed encryptionを初期候補 | CMEK要件は未承認。必要なら鍵運用を別Decisionとする |

`db-f1-micro`と`db-g1-small`はshared-coreでCloud SQL SLA対象外かつGoogleがtest/development用途としているため、本番既定値にしない。

### 2.1 接続budget

既存`sales-tools`のCloud Run最大instance数20は変更しない。Sales Tools管理用SECU poolを各instance最大2接続とすると、この主体だけで通常時の理論最大は40接続となる。前版の「既存service内で最大2接続」はservice全体の集計になっておらず、過少評価だったため次のように補正する。

| 主体 | Cloud Run / Job上限 | pool上限 | 通常時の構成上限 | DB role接続上限候補 |
|---|---:|---:|---:|---:|
| OTP Cloud Run | service最大2 | 2 | 4 | 6 |
| PIRA Cloud Run | service最大2 | 2 | 4 | 6 |
| Sales Tools管理用SECU pool | **既存service最大20** | 2 | **40** | **40** |
| Migration | 直列1 | 1 | 1 | 1 |
| 保持Job | 直列1 | 1 | 1 | 1 |
| 合計 |  |  | **50** | **54** |

Migrationと保持Jobは運用上同時実行しないが、安全評価では同時接続を含む50を通常構成上限とする。Cloud Runはmax instanceを短時間超過し得る。またrevision単位の上限の場合はdeploy時に旧新revisionが一時並存し得る。Sales Toolsの最大20がservice-levelかrevision-levelかを現物で再確認し、未確認の間はDB roleの`CONNECTION LIMIT 40`を最終防波堤とする。上限到達時は管理機能の新規DB接続を安全に失敗させ、既存業務DBやOTP/PIRAの接続枠を消費させない。

Cloud SQLの内部・管理・superuser予約分を固定値と推測しない。instance作成後に`SHOW max_connections`と、アイドル時・backup時・HA/failover時の内部接続実測を取得し、次の両方を満たすことを配備Gateとする。

```text
M = SHOW max_connections
R = max(10, ceil(M * 0.20), 実測したCloud SQL内部最大接続 + 5)
A = M - R
必要条件: A >= 54
```

通常構成50に対しrole上限合計54は、OTP/PIRAの短時間scale超過を各2接続だけ吸収し、それ以上はDB側で拒否する。`A < 54`ならmachine memoryの増強、pool/instance上限の再承認、または管理runtime分離のいずれかを選び、Productionへ進まない。

### 2.2 Sales Tools管理poolの最小実装差分

既存Sales Tools業務poolの設定、最大instance数20、既存router/repositoryを無断変更しない。追加差分は次に限定する。

1. `createPool()`へ任意の`max` / `idleTimeoutMillis`を渡せる後方互換optionを追加する。既存呼出しの既定値`max: 5`は維持する。
2. SECU専用接続設定（別instance socket、database、user、password Secret）から`max: 2`、`min: 0`相当の第2 poolを生成する。`pg.Pool`はquery取得時まで接続を作らないため、Sales Tools起動だけではSECU DB接続を生成しない。
3. 第2 poolはPIRA/SECU管理routerが初めてqueryを実行した時だけ接続し、idle connectionを短時間で解放する。値はStaging実測後に確定し、初期候補を`idleTimeoutMillis: 10_000`とする。
4. `PiraAdminRepo`だけへ第2 poolを注入する。既存Sales Tools業務repositoryは既存poolを使い続ける。
5. SIGTERM時に両poolを明示的にcloseする。SECU DB障害時も既存業務poolと一般管理画面を停止させない。
6. DB側でOTP 6、PIRA 6、管理40、Migration 1、保持1のrole別`CONNECTION LIMIT`を設定し、runtime資格情報の共用を禁止する。

管理機能の利用時だけ接続を生成する方式は、通常利用量を大きく下げるが、容量判定は平均値ではなく上記の構成上限50とrole上限54で行う。

## 3. ZONAL / REGIONAL比較

| 観点 | ZONAL | REGIONAL (HA) |
|---|---|---|
| 構成 | 単一zone | 同一regionのprimary/standby、同期複製 |
| zone障害 | 手動復旧・PITR/restoreを伴う可能性 | 自動failover、同一接続名/IPを維持 |
| SLA/本番適合 | dedicated coreならshared-coreより適切だがzone障害を吸収しない | dedicated core HAは本番可用性に最も整合 |
| 費用 | compute/storage 1系統 | compute、memory、storageがおおむね2倍 |
| 運用 | 安価だが障害時の復旧責任が重い | 固定費増、failover試験と監視が必要 |

**推奨はREGIONAL (HA)** とする。SECU:MIE Insightはメール認証から受付までが同期処理であり、DB停止中は新規利用を安全に継続できない。一般展開を前提にすると、月額差よりzone障害と復旧の独立性を優先する。費用優先でZONALを選ぶ場合は、停止許容時間、手動復旧担当、RTO/RPOを経営者が明示的に受容することを条件とする。

## 4. 月額概算（Tokyo、USD、税・為替・CUDを除く）

### 4.1 前提

- 730時間/月
- Enterprise dedicated core Tokyo参考単価: vCPU `$0.0537/hour`、memory `$0.0091/GiB-hour`
- 1 vCPU / 3.75 GiBのcompute: `(0.0537 + 3.75 × 0.0091) × 730 = $64.11/月`
- Tokyo SSD参考単価: `$0.221/GiB-month`、20 GiBで`$4.42/月`
- HAはCPU、memory、storageを2系統分として試算する。
- EnterpriseのCloud Storage上のPITR logsは7日まで追加料金なし。automated backupの有償超過、restore用一時instance、egress、Logging/Monitoringは利用量依存として別枠にする。
- 2026-11-04にGoogle Cloud公式料金表のTokyo選択値へ再照合し、Pricing Calculatorへ入力するedition、region、vCPU、memory、availability、storage、稼働時間を同じ条件にそろえた概算である。Billing account固有の割引を含む保存済みCalculator estimateはまだ作成していない。契約割引、為替、税、実使用量は含めず、正式発注直前にBilling account上のestimateを保存して再承認する。

| 案 | Compute | SSD | Backup/PITR・network等 | 基本月額概算 |
|---|---:|---:|---:|---:|
| A. Enterprise / ZONAL / 1 vCPU・3.75 GiB / 20 GiB | `$64.11` | `$4.42` | `$0〜数ドル` + egress | **約`$69〜75/月`** |
| B. Enterprise / REGIONAL HA / 同構成 | `$128.22` | `$8.84` | `$0〜数ドル` + egress | **約`$137〜145/月`** |
| C. B + 検証時だけ作成するZONAL Staging | Bと同じ | Bと同じ | Staging 72時間例: compute `$6.32`、SSD按分約`$0.44`、backup/logging等 | **通常約`$137〜145/月`、検証月約`$145〜160/月`** |

固定費相当は、Production Cloud SQLのvCPU、memory、provisioned SSDであり、REGIONALでは概算`$137.06/月`（compute `$128.22` + SSD `$8.84`）である。利用量依存費用は、provisioned容量を超えるbackup、restore時の一時instance、network egress、Cloud Logging/Monitoring、Query Insights、Staging稼働時間である。PITR用Cloud Storage WALはEnterpriseの7日以内では追加料金なしだが、restoreにより作られるinstanceは別途課金される。

Stagingは「停止」だけではstorage等が残るため、費用を抑える案Cは、必要時にTerraform等の承認済み構成から作成し、証跡取得後にinstanceを削除する方式を意味する。長期反復テストや継続的な変更が月1回以上になる場合は、常設ZONAL Staging（約`$69〜75/月`）の方が再現性と事故防止に優れるため再評価する。

## 5. データ境界

### 5.1 SECU:MIE Insight

- 専用instance内の初期databaseは`secumie_insight`を候補とする（名称は実行前承認）。
- Migration 037〜041を改変せず、空databaseへ順番どおり適用する。
- `public_auth` schema: OTP challenge、送信予約、session、安全ログ。
- `pira` schema: initiative、submission、consumed_jti、export audit。
- OTP / PIRA / 管理 / Migration / 保持の5主体を別role・別Secret・別Service Accountに対応させる。
- UNION / GENERALの論理分離、GENERAL本番無効、保持期間、回答・レポート非永続化を維持する。
- 既存Sales Tools管理画面は専用DBへの**第2 pool**を持つ必要がある。既存Sales Tools業務poolを置換せず、PIRA管理router/repositoryだけをSECU poolへ注入する最小変更とする。

### 5.2 SECU:MIE Web Fit/Gap

現行GitのWSC実装は`/api/admin/web-security-check`配下のスタッフ認証済み機能である。CSV検証、外部サイトの制限付き診断、HTML/PDF生成を都度実行し、診断結果・PDF・能力tokenをDBへ永続保存しない。`WscSalesService`とrouterにCloud SQL操作はなく、現時点で専用Cloud SQLを必要としない。

一方、統括は将来のSECU:MIE Webについて、企業情報、診断実施履歴、管理帳票・Excel、Sales Tools管理画面接続をWeb側の責任範囲として確定し、Web側も採用済みである。したがって次を確定する。

- ブランドが共通でもInsightとWebのデータ共有を前提にしない。
- 現行SECU:MIE WebをMigration 037〜041や`public_auth` / `pira`へ接続しない。
- Web側は独自Cloud SQLや共通DB接続基盤を構築しない。Insight側が管理するSECU:MIE専用Cloud SQLと共通接続方式を使用する。
- Web固有テーブル、診断実施履歴、管理帳票・Excel、Sales Tools接続、およびMigration SQL本文はWeb側が設計・実装する。Insight側はこれらを再設計しない。
- Web固有Canonicalが確定した後、同一instance内の**別database**（候補`secumie_web`）と別roleを第一候補とする。同一schema、同一runtime role、無条件のcross-database/cross-schema参照は認めない。
- Webが異なる保持、機密性、負荷、復旧目標を持つ場合は別instanceを再評価する。
- 現時点でInsight側がWeb用table、column、index、保持仕様、Migration SQL本文を新規設計しない。

### 5.3 Insight / Web担当境界

| 領域 | Insight側 | Web側 |
|---|---|---|
| Cloud SQL | instance、network、Backup/PITR、監視、接続budget、復旧 | 独自instanceを作らない。承認済み接続契約を利用 |
| DB接続 | connector、Secret、pool、Service Account、最小権限の共通方式 | Web runtime/adminへ組み込み、固有SQLだけを実行 |
| DB認証・role | database/schema/roleの作成、権限境界、credential rotation | 必要操作のrole matrixを提示し、割当済みroleを利用 |
| OTP | `public_auth`、session、JWT/JWKS、service/brand/audience契約 | Web固有audienceでJWTを検証。OTP tableへ直接接続しない |
| Migration | 番号空間、manifest、digest、ledger、適用Job、実行・証跡・rollback/restore規則 | Web固有tableのMigration SQLと検証を作成 |
| Web業務データ | 内容を再設計しない | 企業情報、診断履歴、管理帳票・Excel、Sales Tools接続を所有 |

共通OTPの利用は、InsightとWebで利用者情報、challenge、session、同意、受付履歴を共有することを意味しない。OTPはservice/brand/audienceを分離し、Web側へは認証契約で許可された短命JWT claimだけを渡す。Web runtimeまたは管理runtimeへ`public_auth` / `pira`のtable権限を付与しない。

### 5.4 Web側へ提供する接続・Migrationインターフェース

Insight側は、Web側の実装開始前に次の契約を提供する。

1. 割当database/schema、接続名、Secret名、Service Account、runtime/admin/migration roleの識別子。秘密値そのものは文書・Git・ログへ記録しない。
2. roleごとの許可操作と拒否操作。Web runtimeにDDL、role管理、他database/schema、`public_auth` / `pira`への権限を与えない。
3. pool上限、timeout、transaction、TLS/connector、health check、Secret rotation時の再起動規則。
4. Migration packageの配置、連番予約、forward-only方針、checksum/digest、ledger、適用順、排他、timeout、失敗時STOP、証跡形式。
5. Stagingでの空DB適用、再実行、権限否定、保持、logical backup/restore、既存Insight回帰の受入条件。

Web側は各Migrationについて、目的、対象object、SQL本文、必要権限、データ保持、実DBテスト、想定lock/所要時間、前後互換性、rollbackまたはrestore判断条件を提示する。Insight側は共通規約・権限・運用安全性を検証して適用を管理するが、Webの業務仕様を変更しない。

番号競合を避けるため、Migration番号は単一の予約台帳でInsight側が払い出す。Web側が独自に番号を確定しない。既存037〜041はInsightの確定済み範囲として維持し、Web Migrationの開始番号は現行mainと全関連branchを再照合した時点で割り当てる。

## 6. Staging最小構成

共有` sales-tools-staging-db`へのdatabase追加は停止する。推奨は、専用ZONAL Cloud SQL Enterpriseを検証時だけ作成・撤去する方式である。

| 項目 | 最小構成 |
|---|---|
| DB | PostgreSQL 16、ZONAL、1 vCPU / 3.75 GiB、SSD 20 GiB、自動拡張 |
| Data | synthetic UNIONのみ。GENERAL無効。顧客・本番Secretを使用しない |
| Migration | 空DBへ037〜041、ledgerとrole/ACLを検証 |
| Roles | 本番同様の5主体。資格情報はStaging専用Secret |
| Runtime | OTP/PIRA Staging Cloud Run、max instances 1、pool 2 |
| Test | E2E、同時接続、保持、logical backup/restore、revision rollback、HA以外の障害動作 |
| Lifetime | 原則72時間以内。延長は費用・責任者を再承認 |
| Cleanup | Cloud Run、Secret versions、roles/database、Cloud SQL instance、SA/IAMの順序と証跡を固定 |

HA failoverとmanaged PITR restoreはZONAL一時Stagingだけでは検証できない。Production構築前に、短時間のREGIONAL Stagingまたは本番no-traffic状態で別承認のfailover/restore rehearsalを行う。

## 7. 新規作成候補リソース

名称は候補であり、実行承認時にGCP現物との重複を再確認する。

1. Cloud SQL production instance `secumie-prod-db`（REGIONAL、PostgreSQL 16）
2. Production database `secumie_insight`
3. DB roles/users 5主体と各Secret 5件
4. Cloud SQL接続権限を持つOTP、PIRA、Sales Tools管理、Migration、保持用Service Account/既存SAへの限定binding
5. Cloud Run OTP/PIRA 2サービス（PR #37の設計を継承）
6. Migration Job、保持Job
7. 専用LB、serverless NEG、証明書、DNS（PR #37の設計を継承）
8. DB/Cloud Run uptime、connections、CPU、memory、storage、5xx、latency、backup失敗のmetric/alert
9. 必要時だけ作成するStaging Cloud SQL、database、roles、Secrets、Cloud Run、SA/IAM

既存Sales Tools、PPAP、PortalのCloud SQL、database、role、Secret、revision、trafficは変更対象外とする。ただしSales Tools管理runtimeへSECU専用DB attachment/Secret/第2poolを追加する変更は、既存業務poolを維持する条件で別途承認が必要である。

## 8. 既存コード・Migrationへの影響

| 対象 | 判定 | 必要差分 |
|---|---|---|
| Migration 037〜041 | Fit | 空の専用databaseへ適用。SQL内容は変更しない |
| OTP/PIRA runtime | Conditional Fit | `DB_SOCKET_PATH`、`DB_NAME`、role Secretを新instanceへ向ける。pool上限をruntime別設定可能にする |
| Sales Tools PIRA管理 | Fit（PR #43） | SECU専用第2poolを追加し、`PiraAdminRepo`だけへ注入済み。既存業務poolの既定値は不変 |
| DB role/保持 | Fit | Migration 041の5主体分離を専用instanceで適用し、owner/search_path/EXECUTEを再検証 |
| WSC / SECU:MIE Web | 現行はDB不要 | 変更なし。将来の外部受付要件は別Canonical |
| Web将来DB接続 | 境界Contractのみ確定 | Web側が固有DDL/Migrationを作成し、Insight側が別database/roleと共通適用管理を提供 |
| Docker runtime | Fit | image変更不要。配備環境のCloud SQL attachment/Secretを専用化 |

## 9. 実行前承認事項とGate

次をすべて証跡付きで承認するまで、Cloud SQL作成・Migration・配備を行わない。

1. REGIONAL/ZONALの最終選択、RTO/RPO、月額上限。
2. instance/database/resource名、project、region、primary/secondary zone。
3. 1 vCPU / 3.75 GiB、20 GiB SSD、自動拡張上限、backup/PITR保持、maintenance window。
4. public IPなし/private IPまたはCloud SQL connector経路、VPC/egress影響。
5. 5 DB role、owner、Service Account、Secret名、最小IAM差分。
6. Sales Tools第2poolのコード差分、接続予算、既存業務DB回帰。
7. Migration 037〜041のdigest/manifest、実行Job、直前backup、停止条件。
8. Staging作成・撤去、synthetic data、費用上限、cleanup期限。
9. failover、logical restore、PITR restore、revision rollbackの実施方法と責任者。
10. Monitoring閾値、通知先、一次停止、復旧、証跡保管。
11. GENERAL同意・公開経路は未承認のまま本番無効であること。
12. Pricing Calculator/Billing Catalogによる発注時点の再見積り。
13. Web用database/schema/roleの命名、Migration番号予約台帳、Web側Canonicalと保持・復旧目標。Web固有DDLの承認前には作成しない。

## 10. 旧設計との差分

- PR #37の既存`msp-customer-portal-db`再利用を採用しない。
- PR #38/#39のConditional Fit条件を閉じる代わりに、専用instanceの容量・復旧・費用Gateへ置換する。
- PR #40/#41の共有Staging databaseと一時管理Jobは実行停止する。
- 認証、受付、診断、管理、固定文、Migration 037〜041、保持仕様は変更しない。
- Web側の独自Cloud SQL構築は採用せず、専用Cloud SQLの共通接続・権限・Migration適用契約をInsight側が提供する。ただし同一database/schema/roleや業務データ共有は採用しない。
- 正式ブランド表記を`SECU:MIE`、`SECU:MIE Insight`、`SECU:MIE Web`に統一する。内部識別子は変更しない。

## 11. 参照

- Cloud SQL pricing: https://cloud.google.com/sql/pricing
- Cloud SQL instance settings: https://docs.cloud.google.com/sql/docs/postgres/instance-settings
- Cloud SQL high availability: https://docs.cloud.google.com/sql/docs/postgres/high-availability
- Cloud SQL PITR/restore: https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/restore
- PR #37: `docs/secumie-gcp-production-deployment-design-20261104.md`
- PR #38: `docs/secumie-readiness-phase-2f-preflight-20261104.md`
- PR #39: `docs/secumie-readiness-phase-2g-db-staging-preflight-20261104.md`
- PR #40/#41: `docs/secumie-phase2h-isolated-staging-runbook-20261104.md`

## 12. 結論

初期本番はCloud SQL Enterprise、PostgreSQL 16、Tokyo、REGIONAL HA、dedicated core 1 vCPU / 3.75 GiB、SSD 20 GiB、自動拡張、daily backup、PITR 7日を推奨する。基本月額は約`$137〜145`、検証月に一時ZONAL Stagingを72時間使用する案は約`$145〜160`を目安とする。

これは設計判断であり、実作成の承認ではない。専用instanceの作成、IAM、Secret、Cloud Run、LB/DNS、Migration、Sales Tools第2poolの適用は、それぞれ差分・費用・切り戻しを提示した後の個別承認を必要とする。Production No-Goを維持する。

## 11. 専用Cloud SQL Staging実行前承認契約（PR #43反映）

### 11.1 状態と実行境界

- 基準実装: PR #43 / `18f0787565a858a4045892eb159d4c13cbe7aaa6`
- 目的: 専用Cloud SQL、PR #43の分離pool、Migration 037〜041、OTP/PIRA runtime、管理機能を隔離Stagingで実証する。
- 本節は作成差分と受入条件の確定であり、GCP resource作成、Migration、配備、Traffic変更を承認しない。
- 旧共有Staging DB案と一時管理Job案は実行停止を維持する。`sales-tools-staging-db`、`sales-tools-staging`、Production、PPAP、Portalを変更しない。
- GENERALは無効、synthetic UNION dataのみとする。顧客情報、本番Secret、本番メール送信を使用しない。

### 11.2 固定するresource manifest

実行時は、作成前に同名resourceが存在しないこと、project/regionが一致することを再確認する。同名の想定外resourceがあればSTOPし、自動修復や上書きを行わない。

2026-11-04（Asia/Tokyo）に`msp-zabbix` / `asia-northeast1`をRead-only照合し、`secumie`を含むCloud SQL instance、Cloud Run service、Service Account、Secretが存在しないことを確認した。これは実行時点の予約を保証しないため、作成直前の再照合を必須とする。Secret値、認証情報、DB recordは取得していない。

| 種別 | 固定候補名 | 主な設定 | cleanup |
|---|---|---|---|
| Cloud SQL | `secumie-staging-db` | PostgreSQL 16、Enterprise、ZONAL、`asia-northeast1`、custom 1 vCPU / 3.75 GiB、SSD 20 GiB、自動拡張、public IPなし、deletion protection、automated backup/PITR有効 | 最終証跡・logical backup確認後にinstance削除 |
| Database | `secumie_insight_staging` | UTF-8。Migration role所有。PUBLIC CONNECTを撤回 | instanceと同時削除 |
| DB users/roles | `secumie_otp_staging`, `secumie_pira_staging`, `secumie_admin_staging`, `secumie_migration_staging`, `secumie_maintenance_staging` | LOGIN、5主体分離。runtimeはNOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION/NOBYPASSRLS | instanceと同時削除 |
| Service Account | `secumie-otp-staging`, `secumie-pira-staging`, `secumie-migration-staging`, `secumie-maintenance-staging` | 対象instanceへのCloud SQL Clientと、主体別Secret accessのみ | binding確認後に削除 |
| DB password Secrets | `secumie-staging-db-{otp,pira,admin,migration,maintenance}-password` | 各1 active version。値はCLI引数・Git・ログへ出さない | version destroy後にSecret削除 |
| JWT Secrets | `secumie-staging-jwt-private-key`, `secumie-staging-jwt-key-id`, `secumie-staging-jwt-session-hmac` | Staging専用。private keyはOTP SAだけが参照 | version destroy後にSecret削除 |
| External adapter Secrets | `secumie-staging-turnstile-secret`, `secumie-staging-smtp-*` | Turnstile test keyとtest SMTP。実顧客宛送信不可 | version destroy後にSecret削除 |
| Cloud Run | `secumie-otp-staging` | PR #43 artifactの`otp-runtime`、min 0/max 1、concurrency 20、pool max 2、専用SA、専用SQL attachment | Revision/Traffic証跡後にservice削除 |
| Cloud Run | `secumie-pira-staging` | PR #43 artifactの`pira-runtime`、min 0/max 1、concurrency 20、pool max 2、GENERAL無効、専用SA、専用SQL attachment | Revision/Traffic証跡後にservice削除 |
| Migration実行 | `secumie-migration-staging` | digest固定artifact、task 1/parallelism 1/max retries 0、専用SA、専用SQL attachment | 実行証跡後にJob削除 |
| 保持実行 | `secumie-maintenance-staging` | preview/executeを分離、task 1/parallelism 1/max retries 0 | 保持検証後にJob削除 |
| Artifact | `secumie-staging/otp`, `secumie-staging/pira`, migration/maintenance用同一承認SHA artifact | digestで配備しtagだけを根拠にしない | 証跡保持方針に従う |

Cloud SQL zoneはinstance作成承認時に`asia-northeast1-a/b/c`から、quota・障害domain・Cloud Run配置を確認して一つを指定する。未指定のまま作成しない。Staging専用LB、NEG、DNS、証明書は今回の作成対象外とし、Cloud Run IAM認証と承認済みproxyで検証する。

### 11.3 IAM・Secret境界

1. OTP SAはOTP DB password、JWT private key/HMAC、SMTP、Turnstileだけを参照し、PIRA/admin/maintenance passwordを参照しない。
2. PIRA SAはPIRA DB passwordとOTPのJWKS URLだけを使用し、JWT private key、SMTP、admin passwordを参照しない。
3. Migration SAはmigration passwordとCloud SQL接続だけを使用する。Secret/IAM/instance設定の変更権限を持たない。
4. Maintenance SAはmaintenance passwordとCloud SQL接続だけを使用し、table直接DELETE権限を持たない。
5. `secumie_admin_staging` passwordはCloud Runへ付与しない。管理検証時だけ、承認済みoperator identityがCloud SQL Auth Proxyとローカルtest harnessを介して参照する。
6. 各Secretのaccessor bindingはresource単位とし、project-wide Secret accessorを採用しない。
7. DB user作成とpassword設定は承認済みbootstrap実行者が行う。passwordをshell履歴、command args、environment dump、Cloud Loggingへ出さない。

### 11.4 Cloud SQL作成・DB初期化の固定手順

以下は実行順序であり、今回実行しない。

1. 実行直前にproject、region、quota、課金通知、resource未存在、実行者、停止判断者、cleanup期限を確認する。
2. `secumie-staging-db`を固定仕様で作成し、operation成功、PostgreSQL 16、ZONAL、backup/PITR、deletion protection、接続経路をRead-onlyで再確認する。
3. 5 DB users/rolesを作成し、elevated属性がないことを確認する。migration roleだけに専用database作成・ownerに必要な限定権限を与える。
4. `secumie_insight_staging`を作成し、`REVOKE CONNECT ... FROM PUBLIC`、5 roleだけのCONNECTを確定する。
5. Migration artifactのGit SHA、image digest、`037`〜`041`各SQL SHA-256を承認証跡と照合する。
6. Migration Jobを1回だけ実行する。`DB_NAME=secumie_insight_staging`、migration user/Secret、Cloud SQL socketだけを注入し、`npm run migrate:artifact`を使用する。
7. `schema_migrations`に037〜041が各1件・昇順で存在し、`public_auth`、`pira`、`secumie_deployment`以外の業務schema/tableがないことを確認する。
8. `OTP_DB_ROLE`、`PIRA_DB_ROLE`、`PIRA_ADMIN_DB_ROLE`、`SECU_MAINTENANCE_DB_ROLE`へ固定role名を設定し、`npm run db:configure:secumie`を1回実行する。
9. role別の許可SQLが成功し、DDL、他schema、監査UPDATE/DELETE、table直接保持削除が拒否されることを確認する。
10. synthetic UNION initiative/dataだけを承認済みfixtureから投入する。GENERAL initiativeを公開有効化しない。

Migration runnerは全migration directoryを番号順に処理するため、実行artifactには承認済み037〜041だけを格納した専用directoryを指定する。空の専用DBへ001〜036を誤適用しない。`MIGRATIONS_DIR`、格納ファイル一覧、各digestを実行前証跡に固定する。

PR #43基準の承認候補digestは次のとおり。実行artifact内で一つでも不一致ならMigrationを開始しない。

| Migration | SHA-256 |
|---|---|
| `037_public_service_otp.sql` | `a2b15297d894dde5c732cf9a6e74596dd17d223b09a37974ff1c490949a6d69b` |
| `038_pira_public_intake.sql` | `c97e12560894dd76e04ae2c58d3d703e5931b9903eb261b05af1a0c26d90e677` |
| `039_pira_admin_export.sql` | `082bbd8506110b671ac2ff7cc3750d8a4abb95701c8dc75273cca19da1606490` |
| `040_pira_export_audit_retention.sql` | `6708892a7228925fcb1d08a19c6b0cfeb4469bcae2ed7a1e7b503d449e8fe104` |
| `041_secumie_db_operations.sql` | `b004b4bc69b1c379bbc75993b13d3209fa3ddb803ed564cbf53d4bb4d21c09a7` |

### 11.5 Runtime接続設定

OTP/PIRA共通:

- `DB_SOCKET_PATH=/cloudsql/msp-zabbix:asia-northeast1:secumie-staging-db`
- `DB_NAME=secumie_insight_staging`
- 主体別`DB_USER` / `DB_PASSWORD` Secret
- `DB_POOL_MAX=2`, `DB_POOL_IDLE_TIMEOUT_MS=10000`
- Cloud Run max instances 1。旧新Revisionを同時に有効化する場合も合計接続budgetへ含める。

PIRA:

- `PIRA_GENERAL_ENABLED=false`
- UNION host/initiative/brandだけを有効化する。
- OTP issuer/audience/JWKSはStaging専用値とし、Production値を使用しない。

管理機能:

- 既存`sales-tools` / `sales-tools-staging`のRevision、Traffic、Cloud SQL attachment、Secret、業務DBを変更しない。
- PR #43の`PiraAdminRepo`だけが第2poolを利用することは、承認済みoperator端末上の既存HA-2/管理test harnessをCloud SQL Auth Proxy経由で`secumie_insight_staging`へ接続して確認する。
- harnessには`SECUMIE_DB_*`だけを専用DBへ設定し、既存業務DBの資格情報を渡さない。Workspace本番認証、顧客情報、既存Sales Tools serviceを使用しない。
- 一覧、詳細、フィルタ、CSV/XLSX、監査、viewer 403、監査失敗時の出力拒否を確認する。これは既存Sales Tools Revisionへの配備を意味しない。

### 11.6 固定する受入検証

| 領域 | 必須確認 | PASS条件 |
|---|---|---|
| 接続budget | `SHOW max_connections`、role別/全体接続、idle解放、max instance 1、pool 2 | Cloud SQL予約分を除く20%以上の余裕。各runtime 2以下。timeout/枯渇なし |
| Migration | fresh 037〜041、ledger、schema、owner、関数search_path | 各1回、想定objectだけ、再実行は全skip |
| 権限 | 5主体のpositive/negative SQL | 必要操作のみ成功。elevated属性・横断参照・直接監査削除なし |
| OTP/JWT | 送信予約、6桁/10分、制限、Turnstile、RS256/JWKS/kid/aud/exp | 正常系と既存異常系PASS。Secret/OTP/JWTをログへ出さない |
| PIRA | JWT/jti、UNION受付、状態、24時間、GENERAL拒否 | RECEIVED→ANSWERING→COMPLETED。回答/report/PDF非永続化 |
| 管理 | staff権限、一覧/詳細、CSV/XLSX、監査 | admin成功、viewer出力403、固定11列/BOM/数式対策、監査失敗時はファイルなし |
| 保持 | preview、期限到達/未到達、execute、再実行 | 24時間/30日/2年/3年を維持。任意日時で短縮不可。未到達data保護 |
| 障害 | SECU DB停止、SMTP/Turnstile失敗、JWT鍵不正 | fail closed。UNKNOWN自動再送なし。既存Sales Tools/業務DBへ通信なし |
| 終了 | SIGTERM中のHTTP停止とpool close | grace period内exit 0、接続0、未完了transactionなし |
| 起動拒否 | 各必須Secret、DB設定、JWT設定を一つずつ欠落 | exit 1、listener未起動、秘密情報なしの固定error event |
| 復元 | logical dump/別一時database restore、Migration/ACL/E2E | digest一致、role/owner再設定、synthetic E2E PASS |
| 切り戻し | OTP/PIRA前Revision、Migration失敗、DB接続不良 | 専用serviceだけを戻し、既存service/DB/Traffic差分ゼロ |

既存Sales Toolsへの影響確認では、実行前後の`services describe`、Revision/Traffic、Cloud SQL attachment、Secret/IAM、既存DB metadataを比較する。差分が一つでもあればSTOPし、SECU専用resourceのcleanupへ移る。

### 11.7 監視・停止条件

実行中はCloud SQL connections/CPU/memory/storage、Cloud Run instance/latency/5xx、Secret access、Migration/maintenance Job結果を監視する。

直ちにSTOPする条件:

- 対象project/region/resource/digestの不一致、同名resourceの存在。
- 既存Sales Tools、PPAP、Portal、共有StagingへのRevision/Traffic/DB/IAM/Secret差分。
- 顧客情報、本番Secret、OTP/JWT/private keyのログ出力。
- GENERAL有効化、外部への実メール送信、想定外Originへの通信。
- DB pool 2超過、role connection limit超過、利用可能接続余力20%未満。
- Migration ledger/object/digest不一致、権限否定test失敗、監査/保持境界違反。
- Cloud SQL CPU 80%が5分継続、storage自動増加の想定外発生、Cloud Run 5xx、接続timeout。
- cleanup対象を厳密に識別できない、またはrollback/cleanupが失敗。

### 11.8 費用上限と存続時間

- 作成からcleanup完了まで72時間以内を既定とする。延長は再承認する。
- PR #42のTokyo ZONAL参考額（約`$69〜75/月`）から、72時間のcompute/SSD按分は約`$7〜8`。Cloud Run、Artifact、Secret、Logging、backup/networkの従量を含む**実行承認上限候補を`$25`**とする。
- 公式Pricing Calculatorで同一条件のestimateを実行承認時に保存し、Billing account固有割引・税・為替を区別する。estimateまたはbudget通知先が未確定なら作成しない。
- managed PITR restore、専用LB/NEG/IP/証明書、REGIONAL failover検証は`$25`枠外の別承認とする。

### 11.9 原状復帰

1. test requestと保持Jobを停止する。
2. OTP/PIRA専用Cloud Runを0 trafficにし、Revision/ログを保存後serviceを削除する。
3. Migration/maintenance Jobを削除する。
4. Staging JWT/SMTP/Turnstile/DB Secret versionを無効化・destroyし、Secretを削除する。
5. 専用SAのresource bindingを削除し、SAを削除する。
6. logical restore用temporary database/resourceを削除する。
7. deletion protectionを承認済みcleanup時だけ解除し、`secumie-staging-db`を削除する。
8. Artifactは証跡保持規則に従い削除または隔離する。
9. 固定名resource一覧が0件であること、既存Sales Tools/Staging/PPAP/Portalに実行前差分がないことを確認する。
10. 費用、Audit Log、Monitoring、cleanup実行者/時刻/結果を非機密証跡へ記録する。

wildcard、project全体、未解決変数をcleanup対象に使用しない。削除は固定resource IDを二者確認し、各操作を個別承認されたcleanup手順で行う。

### 11.10 次に必要な個別承認

1. `secumie-staging-db`のzone、仕様、72時間、`$25`上限、cleanup担当・期限。
2. 固定5 DB users/roles、database、5 DB password Secretsの作成方法とbootstrap実行者。
3. 専用SA、resource単位IAM、JWT/SMTP/Turnstile test Secrets、Artifact push。
4. Migration 037〜041専用artifact/digestと、Migration/role設定Jobの1回実行。
5. OTP/PIRA Cloud Run 2サービスの作成。未認証公開、LB、DNSは含めない。
6. operator端末のCloud SQL Auth Proxyを使う管理test harness接続。
7. synthetic data投入、E2E、接続負荷、保持execute、logical backup/restore。
8. 専用resource一式のcleanup。managed PITR、LB、REGIONAL failoverは別承認。

上記承認前は、GCP resource、IAM、Secret、DB、Migration、Cloud Run、Trafficを変更しない。Production No-Goを維持する。
