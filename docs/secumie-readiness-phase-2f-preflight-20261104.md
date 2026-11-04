# SECU Insight Readiness Phase 2F 本番適用前Preflight

照合日: 2026-11-04（Asia/Tokyo）

基準: PR #37 / `fcecc0e1ee3ade0e09afac26f442d1443eee5be8`

対象: GCP project `msp-zabbix` / region `asia-northeast1`

本書はRead-only調査と配備前判定である。Production、Staging、Cloud Run、Cloud SQL、LB、DNS、IAM、Secret、Migration、Trafficには変更を加えていない。

## 1. 結論

- 既存Cloud SQL `msp-customer-portal-db` / `sales_tools`の再利用判定は **Conditional Fit** とする。
- 7日間の実測ではCPU・DBプロセスメモリ・ストレージ・接続数に直ちに容量不足を示す値はない。一方、`db-f1-micro`、ZONAL構成であり、複数の既存本番サービスが同一instanceを共有している。
- DB内部の`SHOW max_connections`、`schema_migrations`、schema/role privilegeは、Secretを取得せず利用可能なRead-only DBセッションがないため未確認である。これらは本番適用前のSTOP条件である。
- Phase 2Eの専用LB、OTP/PIRA専用Cloud Run、同一Origin構成は技術的に整合するが、現物リソースは未作成である。
- Stagingはinstanceとして分離されているが既存用途がある。専用database/role/serviceを承認後に追加する隔離リハーサルは可能性があるが、現存databaseを未確認のまま流用しない。
- Production判定は **NO-GO** を維持する。

## 2. 調査範囲と証跡

2026-11-04に、GCP API / Cloud Monitoring / Cloud Run / Cloud SQLのメタデータをRead-onlyで取得した。Secret値、DB業務レコード、個人情報、認証トークンは取得・記録していない。

測定期間は2026-10-28 00:00 UTC〜2026-11-04 00:00 UTC。Cloud Monitoringは1時間単位で整列した。接続数はPostgreSQL `num_backends`を系列横断で合計し、各時間帯の最大値を採用した。

## 3. Cloud SQL容量・負荷

### 3.1 確認済みFACT

対象`msp-customer-portal-db`はPostgreSQL 16、`db-f1-micro`、ZONAL、10 GiB SSD、自動拡張有効である。Cloud RunはCloud SQL attachmentとUnix socketを使用する。自動backupは30世代、PITRは7日、直近5件のbackupは成功している。

| 指標 | 7日実測 | 評価 |
| --- | ---: | --- |
| CPU utilization | 平均11.40%、最大13.03% | 現状のCPU余力あり |
| PostgreSQL backends | 最小6、平均8.48、最大24 | 実測は低いが設定上限未確認 |
| Memory component: Usage | 平均7.25%、時間平均最大8.94% | DBプロセス利用は低い |
| Memory component: Cache | 平均13.22%、時間平均最大15.90% | OS cache。一般に回収可能 |
| Memory component: Free | 平均79.52%、時間平均最大83.28% | 逼迫を示さない |
| Disk bytes used | 平均約135.7 MiB、最大約135.8 MiB | quota約9.74 GiBの約1.4% |

`database/memory/utilization`と`database/memory/usage`は100%相当を返したが、同じ期間の公式memory componentsと`total_usage`は低利用を示した。小型instanceでの当該集計値を単独の逼迫根拠にせず、componentsを判断根拠とする。

### 3.2 接続数の影響

リポジトリの共通poolはruntimeごとに`max: 5`である。現行Cloud Runの最大instance数は次のとおり。

| Service | max instances | 同一本番Cloud SQL |
| --- | ---: | --- |
| `msp-customer-portal` | 5 | Yes |
| `ppap-download-service` | 20 | Yes |
| `ppap-upload-service` | 20 | Yes |
| `ppap-virus-scan` | 20 | Yes |
| `sales-tools` | 20 | Yes |

既存サービスのすべてが同一pool実装とは確認できないため、単純な理論最大値を実接続数として扱わない。SECU Insightの実装だけでは、OTPとPIRAを各`N` instanceとすると最大`5 × (N_OTP + N_PIRA)`接続を追加し得る。例として各max 2なら最大20接続の追加シナリオになるが、本番設定値としては未承認である。

実測最大24接続に対し、DBの実`max_connections`、既存各serviceのpool設定、同時scale時の接続ピークが未確認である。次の条件を満たすまでmaxScaleを確定しない。

1. 承認済みRead-only DBセッションで`SHOW max_connections`と現在/最大接続のSQL確認を行う。
2. 既存サービスを含む接続budgetを作成し、20%以上の運用余裕を残す。
3. OTP/PIRAは初期maxScaleを小さく制限し、接続・CPU・latency・5xxのalertを設定する。
4. Stagingでscale/connection exhaustion試験を行う。

### 3.3 Migration ledger・schema・role

コード上のrunnerは`schema_migrations(filename, applied_at)`を使用し、advisory lockとmigration単位transactionを持つ。Migration 037〜041の順序とローカル新規適用は既存検証で成立している。

本番DB内部は未確認であるため、次はFACTではない。

- `schema_migrations`の実在と適用済みfilename
- 037〜041との番号/filename競合
- `public_auth` / `pira` schemaの既存有無
- 同名table/function/roleの競合
- `sales_tools_migration`のDDL権限
- runtime/maintenance roleの実権限

これらはSecretを取得せず、統括が承認したRead-only DBアクセス方法で確認する。未確認のままMigrationを実行しない。

## 4. 外部公開構成Preflight

| 項目 | FACT | Gap / 未確定 | 本番前対応 |
| --- | --- | --- | --- |
| LB / NEG | project内に既存LBはあるがPIRA用なし | 専用LB、2 NEG、専用IPなし | Phase 2E設計どおり独立作成を別承認 |
| DNS / TLS | `pira.atlib.jp`はNXDOMAIN、専用証明書なし | DNS管理主体未確認 | 管理者・TTL・切替時刻を確定 |
| Cloud Run | OTP/PIRA runtimeとDocker targetはローカル成立 | service/SA/ingress/IAM未作成 | `internal-and-cloud-load-balancing`、LB経由invocationを検証 |
| Host/Path | 同一Origin URL map設計あり | 現物未設定 | OTP/JWKSをOTP NEG、その他をPIRA NEGへ固定 |
| JWT/JWKS | RS256、`kid`、rotation互換実装あり | issuer/audience/key/併存期間未確定 | issuerを実URLと一致させ、旧公開鍵併存期間を承認 |
| SMTP | 既存portal SMTP資産あり | OTP専用SAからの利用方針未承認 | 共有/専用Secretと送信上限を確定 |
| Turnstile | server-side fail-closed実装あり | site/secret/hostname未作成 | `pira.atlib.jp`専用設定を準備 |
| CORS/CSP | same-origin優先実装 | LB経由header実測なし | rehearsalでブラウザ検証 |
| `trust proxy` | LB前提の設定項目あり | 実hop/header未実測 | GFE経路の実リクエストでIP判定を確認 |
| Logging/Monitoring | Cloud Logging基盤あり | SECU固有alert/uptimeなし | 5xx、latency、DB、mail、retention失敗を通知 |

既存`www.atlib.jp`、`sales.atlib.jp`、PPAP、コーポレートサイトの経路は変更しない。GENERALは無効を維持する。

## 5. Stagingリハーサル計画

### 5.1 Fit/Gap

`sales-tools-staging-db`は本番から分離されたPostgreSQL 16 instanceで、backup/PITRが有効、`sales-tools-staging`はmax 2で稼働しているため、基盤候補としてFitする。一方、既存database `sales_tools_staging`と`sales_tools_staging_f4`の用途・所有者・migration ledgerは未確認であり、既存用途を阻害しない保証がない。

したがって、既存databaseへの直接適用はGap、承認後に専用database/role/test dataを作る方式はConditional Fitとする。

### 5.2 承認後に行う隔離リハーサル

1. Staging現利用者・保守時間・rollback責任者を確認する。
2. 既存databaseを使わず、専用databaseまたは明確に隔離した領域と5主体の専用roleを作る。
3. 実顧客情報を含まない固定test dataのみ投入する。
4. 037〜041を新規適用し、ledger、権限拒否、保持preview/executeを確認する。
5. OTP/PIRA専用staging serviceを既存`sales-tools-staging`とは別に配備する。既存revisionを置換しない。
6. test SMTP、Turnstile test key、test JWT keyでOTP→受付→8問→report→COMPLETEDを実行する。
7. maxScale、pool、connection exhaustion、SMTP UNKNOWN、JWT rotation、LB/CORS/CSP/`trust proxy`を試験する。
8. 管理画面はstaging staff authで一覧/CSV/XLSX/監査を検証する。
9. backupから別領域へのrestoreを実演し、RTO/RPOを記録する。
10. Cloud Run revision rollback、DB前方修正方針、専用test data/role/resource削除手順を確認する。

書込み対象、resource名、差分、費用、rollbackを提示して統括承認を得るまでは実施しない。

## 6. DB再利用判定

**判定: Conditional Fit**

根拠:

- CPU、DB memory component、storage、実接続数は現在低い。
- backup/PITRとCloud Run Unix socket接続が既にある。
- schema/role分離と保持処理はMigration 037〜041でローカル検証済み。
- ただし小型ZONAL instanceをPortal、PPAP、Sales Toolsが共有しており、障害影響範囲が広い。
- 実`max_connections`、既存pool合計、ledger、権限、restore rehearsalが未確認である。

Fitへ変更する条件は、DBメタデータ確認、接続budget、Staging負荷/復元リハーサル、runtime maxScale、監視、直前backupとrollback責任者の確定である。条件を満たせない場合は専用Cloud SQLを選択する。

## 7. 費用前提

Phase 2Eの公式料金に基づく概算を維持する。

| 区分 | 既存DB再利用 | 専用DB |
| --- | --- | --- |
| 専用LB | 固定約$18.25/月 + 処理量 | 同左 |
| Cloud Run 2 services | min 0なら主に従量。各min 1の概算約$19.71/月 | 同左 |
| DNS | zone約$0.20/月 + query | 同左 |
| Secret Manager | free枠超過後version/アクセス従量 | 同左 |
| Cloud SQL | instance固定費の追加なし。負荷増と障害共有 | 新instance、storage、backup、networkの固定/従量費増 |
| Logging/Monitoring | 取込量・保持・alertに応じる | 同左、DB監視分増 |

LB固定費と専用DBが主要差分である。利用量、log量、mail数、egressは未確定のため確定費用ではない。専用DBは費用増と引き換えに接続容量、障害、restore、権限の分離が明確になる。

## 8. 残存NO-GOと必要承認

1. Read-only DBセッションによる`max_connections`、ledger、schema/role privilege確認。
2. 接続budgetとOTP/PIRA maxScaleの承認。
3. Staging隔離リハーサルの対象resource、書込み、rollback、費用承認。
4. Backup restore rehearsalとRPO/RTO、直前backup、復旧責任者の確定。
5. 専用LB/IP/NEG/証明書、DNS管理主体と変更承認。
6. OTP/PIRA service account、Cloud Run IAM/ingress、DB role/Secret accessの承認。
7. 本番SMTP、Turnstile、JWT issuer/audience/key rotation値の確定。
8. CORS/CSP/`trust proxy`の実経路検証。
9. SECU固有Monitoring/Logging/通知先・閾値の承認。
10. GENERAL無効、Production traffic変更なしを再確認。

以上が完了し、統括がGoを明示するまでProduction No-Goを維持する。
