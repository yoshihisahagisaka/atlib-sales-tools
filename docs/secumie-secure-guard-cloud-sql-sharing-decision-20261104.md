# SECU:MIE × Secure Guard｜新Cloud SQL共有方針追補（2026-11-04）

## 決定／適用範囲

**統括側の事業・アーキテクチャ方針：SECU:MIE向けに新設するCloud SQLインスタンスを、Secure Guardとも共有する案②で進める。**

既存 `msp-customer-portal-db`／PPAP／Sales Toolsとの分離理由は変わらない。従前の「SECU:MIE専用」という**インスタンスの対象範囲だけ**を「atLIBセキュリティサービス共通基盤（仮）」へ拡張する方針とし、SECU:MIE Insight・Web・SGは**個別database、runtime role、Secret、Service Account、Migration台帳／適用権限、業務データownerを分離**する。共通インスタンス内での業務テーブル共用、無条件のcross-database参照、認証情報共用は行わない。

本追補は既存PR #42の専用Cloud SQL構成・費用・接続予算を**そのままSG共用に承認するものではない**。決定済みのOTP・PIRA・Webの業務契約、保持、GENERAL無効、担当境界、セキュリティ条件を保持する。

## 双方の実装・未解決Gap

- SECU:MIE PR #42：PostgreSQL 16、Enterprise、東京、REGIONAL HA、初期候補1 vCPU／3.75 GiB、SSD 20 GiB。接続予算はSECU:MIE単独で構成上限50、role上限候補54。**SG追加後の予算・machine・費用は再算定が必要。**
- SECU:MIE PR #43：公開OTP/PIRA最大pool2とSales Tools専用第2poolの実装は基礎として維持。共有方針を理由に既存業務poolや移行済みサービスを無断変更しない。
- Secure Guard Draft PR #4：DNSFilter公式APIの割当数/利用数超過監視がDraft実装済み。しかし `011`、`012`、`015` は旧Portalの `portal_users`／`customer_organizations`／`dnsfilter_organization_mappings`／監査テーブルと同じDB・transactionに結合。**DB接続文字列だけの変更は不可**。データ移設境界、専用baseline、監査・権限、read-only本番ledger、rollbackが未解決。
- 共有Stagingは既存 `sales-tools-staging-db` への相乗りではない。SECU:MIE側の独立Staging設計にSGの別DB/role/migrationを追加するか、総合検証方式を再承認する。
- セキュリティサービス共通DBの単一障害・HA・Backup/PITR・restoreの影響範囲はSECU:MIEのOTP受付とSG管理・通知の両方に及ぶ。サービス別RTO/RPOと優先制御を確認する。

## 将来構想（現時点で実行しない）

**Secure Send**は現在atLIB内部利用、将来外部SaaS化予定。外部展開に合わせてDB・送受信・ファイル保存・スキャン・認証・監視の独立性を高める別Workを近いうちに実施する。PPAP/Secure Sendの無停止継続が優先。今回の共通Cloud SQLにSecure Sendを同居させる判断はしていない。

既存Sales Tools・顧客ポータルは当面現行稼働を維持し、各サービスをAPI境界で分離できるよう段階的に整理する。

## Go/No-Go

1. 共有インスタンスの正式owner、命名・稼働費用・HA/RPO/RTO、共通バックアップ・復旧責任を統括承認。
2. SECU:MIE既定54枠＋SG追加接続budgetを計算し、内部接続余力と将来のWeb需要を含めた `max_connections`／CPU/memory／pool上限をStagingで検証。
3. SG既存テーブル・Portal auth・Organization・監査を移す範囲、Migration ledger、原子性・権限、停止条件、切り戻しを決定。
4. SECU:MIEとSGの空DB migration、アクセス拒否、障害分離、共用負荷、復旧、Slack失敗を独立StagingでE2E実施。
5. **Cloud SQL/GCP/DB/IAM/Secret/Trafficの実変更は未承認。Production No-Goを維持する。**

SG側Canonical：`yoshihisahagisaka/atlib-msp-customer-portal` PR #4、
`docs/DECISION_ATLIB_SERVICE_PLATFORM_BOUNDARIES_20261104.md`、
`docs/SECURE_GUARD_SECUMIE_SHARED_SQL_FITGAP_20261104.md`。

本追補はPR #42で承認済みの既存DB非共用方針と整合するが、単独利用を前提とした接続budget・費用の数値については本共有案の再判定前提とする。PR #43はDraft実装の状態を保持し、共用分の変更は別途Fit/Gap・承認後に行う。
