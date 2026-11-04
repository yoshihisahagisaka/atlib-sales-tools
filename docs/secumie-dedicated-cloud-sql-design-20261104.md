# SECU:MIE 専用Cloud SQL基盤 設計判断記録

- 作成日: 2026-11-04（Asia/Tokyo）
- 対象project / region: `msp-zabbix` / `asia-northeast1`
- 基準: PR #36〜#41、PR #41 HEAD `2465b34283da344d30e47c07aa1d11cffb3a59a6`
- 状態: 設計確定候補。実リソース作成は未承認。Production No-Goを維持する。

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

初期上限案は次のとおりとする。実負荷試験で引き上げるまでは拡張しない。

| 主体 | max instances / 同時実行 | pool上限 | 最大接続予算 |
|---|---:|---:|---:|
| OTP Cloud Run | 2 | 2 | 4 |
| PIRA Cloud Run | 2 | 2 | 4 |
| Sales Tools管理用SECU pool | 既存service内 | 2 | 2 |
| Migration | 直列1 | 1 | 1 |
| 保持Job | 直列1、Migrationと同時実行しない | 1 | 1 |
| 合計 |  |  | **通常10、保守時最大11** |

現行`createPool()`は一律`max: 5`であるため、配備前にruntime別pool上限を環境設定可能にする最小変更が必要である。`max_connections`はmachine memoryに応じCloud SQLが初期値を決めるため、instance作成後の実値を取得し、上記最大11接続に20%以上の余裕とCloud SQL内部接続分があることをGateとする。値を推測して本番設定しない。

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
- 正式発注前にGoogle Cloud Pricing CalculatorとBilling Catalogで同じ設定を再計算する。

| 案 | Compute | SSD | Backup/PITR・network等 | 基本月額概算 |
|---|---:|---:|---:|---:|
| A. Enterprise / ZONAL / 1 vCPU・3.75 GiB / 20 GiB | `$64.11` | `$4.42` | `$0〜数ドル` + egress | **約`$69〜75/月`** |
| B. Enterprise / REGIONAL HA / 同構成 | `$128.22` | `$8.84` | `$0〜数ドル` + egress | **約`$137〜145/月`** |
| C. B + 検証時だけ作成するZONAL Staging | Bと同じ | Bと同じ | Staging 72時間例: compute `$6.32`、SSD按分約`$0.44`、backup/logging等 | **通常約`$137〜145/月`、検証月約`$145〜160/月`** |

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

したがって次を確定する。

- ブランドが共通でもInsightとWebのデータ共有を前提にしない。
- 現行SECU:MIE WebをMigration 037〜041や`public_auth` / `pira`へ接続しない。
- 将来、外部利用者向けOTP/受付や履歴保存が承認された場合は、Web固有Canonicalを先に確定し、同一instance内の別database（例: `secumie_web`）と別roleを第一比較候補にする。
- Webが異なる保持、機密性、負荷、復旧目標を持つ場合は別instanceを再評価する。
- 現時点でWeb用database/schema/Migrationを新規設計しない。

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
| Sales Tools PIRA管理 | Gapあり | 現在は既存`pool`を`PiraAdminRepo`へ渡す。SECU専用第2poolを追加し、PIRA管理だけへ注入する |
| DB role/保持 | Fit | Migration 041の5主体分離を専用instanceで適用し、owner/search_path/EXECUTEを再検証 |
| WSC / SECU:MIE Web | 現行はDB不要 | 変更なし。将来の外部受付要件は別Canonical |
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

## 10. 旧設計との差分

- PR #37の既存`msp-customer-portal-db`再利用を採用しない。
- PR #38/#39のConditional Fit条件を閉じる代わりに、専用instanceの容量・復旧・費用Gateへ置換する。
- PR #40/#41の共有Staging databaseと一時管理Jobは実行停止する。
- 認証、受付、診断、管理、固定文、Migration 037〜041、保持仕様は変更しない。
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
