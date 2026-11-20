# SECU Insight Readiness Phase 2D 統合・GCP現物照合

確認日: 2026-11-02（Asia/Tokyo）

## 1. 統合基準

- GitHub `main`: `850e1f0bc9c6a2d269b0d5f71d239c1c98df05ae`
- Phase 2C正本: PR #35 / `be4f7c37683fce95d1d3e599d82a8726b82cf393`
- 共通祖先: `850e1f0bc9c6a2d269b0d5f71d239c1c98df05ae`
- 統合ブランチ: `release/secumie-readiness-integration`

PR #35は現行mainの直系で、mainからPhase 2Cまで34 Commitであった。既存PRをMerge、Rebase、Base変更せず、mainから新規ブランチを作り、PR #35の最終ツリー差分だけを適用した。適用対象は99ファイル、6,918追加・86削除で、競合、大量削除、既存ファイルの消失はなかった。

## 2. PR依存関係と正本

| 範囲 | PR / HEAD | Base | 状態 |
| --- | --- | --- | --- |
| v6 | #16 / `60bfb8c42b20439e0d039ba31a5539cad4c7d847` | v6設計文書branch | Draft |
| v7 | #20 / `83260ef011628ff1a34e8c4ae02862a606c3e35d` | #16 head | Draft |
| 公開アプリ | #21 / `29a1994049a367c61701fea790ad18012c8db446` | #20 head | Draft |
| OTP Contract / 実装 | #22 / `b940ff60...`, #23 / `b036abcc...` | main / #22 head | Draft |
| 受付Contract / API | #24 / `819d6140...`, #25 / `422b7c61...` | main / #23 head | Draft |
| E2 / E3 | #26 / `0779928c...`, #27 / `a5a47d3b...` | #25 / #26 head | Draft |
| HA / 依存是正 / runtime / DB運用 | #29–#35 / #35 `be4f7c37...` | 積み上げ | Draft |

PR #28はReadiness文書用の横枝であり、実装の直列系統へは取り込まない。PR #19はmainへMerge済みで、現行mainのWSC実装を統合基底として保持する。

## 3. 診断資産manifest

PR #26からPR #35まで、次のblob SHAは完全一致した。

| ファイル | blob SHA |
| --- | --- |
| `data.js` | `b27521d22240c1887d09bdae59cebf1d8933da92` |
| `diagnosis.js` | `d7d486d883c69722617e40049a9cf2a6028b38cf` |
| `v6-content.js` | `a1c2deb54497dc46fbc243cad96fa73642a1a8ff` |
| `v6.js` | `6b360cc6ce4791d242ac1f9e3df7862cf5bb58fe` |
| `v7-fixed-content.js` | `6f2441f6dede3761f8d3f4faf004c2860d137a65` |
| `v7-prototype-app.js` | `07598c1c1c3dacad754527413fad95da0c1805e0` |
| `v7-prototype.js` | `47feafff6d1e0678e64173e68fc539c5a0e6b323` |
| `resources.js` | `1953ca4fc6a512418e7b0e5c14ada073d2e4f188` |

PR #21との差分はPR #26で承認済みのOTP・受付・直接質問開始接続を含む。PR #26以降に8問、38回答ID、C方式、v7固定文への追加変更はない。

## 4. Migration

適用順は `037_public_service_otp.sql` → `038_pira_public_intake.sql` → `039_pira_admin_export.sql` → `040_pira_export_audit_retention.sql` → `041_secumie_db_operations.sql`。037–040を変更せず、041がrole分離と固定保持期間の保守関数を追加する。

本番では、現行migration ledgerに037–041が未適用であることと、番号競合がないことをRead-onlyで確認してから、専用migration主体で順次適用する。runtimeからMigrationを実行しない。

## 5. GCP現物照合

ローカル設定から以下を確認した。

- active account表示: `yoshihisa.hagisaka@atlib.jp`
- project: `msp-zabbix`
- region: `asia-northeast1`

Cloud Run、Cloud SQL、Secret ManagerのAPI照会時に、非対話実行では解消できない再認証要求となった。指示に従い再認証、認証回避、設定変更を行っていない。このため次は現物未確認であり、本番No-Goである。

- Cloud Run service、Revision、Traffic、Ingress、IAM、service account
- Cloud SQL instance、database、接続名、backup、PITR、runtime role、migration ledger
- Secret名、version参照、service account別Secret Accessor
- HTTPS LB、URL map、backend、DNS、証明書
- `www.atlib.jp`の既存経路、Apache/LBとの境界
- Cloud Logging、Monitoring、Alert、保持期間、Revision rollback実績

既存文書には `sales-tools`、`msp-customer-portal-db`、`sales_tools`、`sales-tools-sa@msp-zabbix.iam.gserviceaccount.com` の記録があるが、現存値の証拠には使用しない。

## 6. ローカル統合検証

| 検証 | 結果 |
| --- | --- |
| TypeScript build | PASS |
| OTP/PIRA Docker target | PASS / PASS |
| Migration 037–041、role、保持 | 4/4 PASS |
| OTP送信予約 | 10/10 PASS |
| OTP API | 8/8 PASS |
| PIRA受付 | 8/8 PASS |
| E3管理・CSV/XLSX・監査 | 12/12 PASS |
| 本番相当runtime E2E | 2/2 PASS |
| E2ブラウザ | 2/2 PASS |
| HA-1 / HA-2 | 1/1 / 1/1 PASS |
| OTP UI（正規Playwright runner） | 2/2 PASS |
| 既存Sales Tools主要回帰 | PASS（計85 PASS、4 skip） |
| `npm audit --omit=dev` | Critical 0 / High 0 / Moderate 14 |
| `git diff --check` | PASS（既存`data.js`末尾空行警告のみ） |

Moderate 14件はPhase 2Aの記録どおりで、ExcelJS/archiver系、Google client間接依存等。Critical/Highは0件である。

## 7. 本番配備計画（実行禁止）

### 7.1 事前Gate

1. GCP再認証済みのRead-onlyセッションで上記現物を採取し、担当者が承認する。
2. GENERAL同意文言と公開経路が未承認の間、`PIRA_GENERAL_ENABLED=false`を維持する。
3. Cloud SQL backup/PITR、復元手順、直前backup ID、現行migration ledgerを記録する。
4. immutable image digest、service account、DB role、Secret参照、LB変更差分をレビューする。
5. stagingで本番SMTP、Turnstile、Workspace認証、JWT鍵rotation、Cloud SQL接続を実証する。

### 7.2 適用順序

1. OTP、PIRA、管理、migration、保守のDB roleを既存Cloud SQL内に承認済み手順で準備する。
2. 専用migration主体で037–041を順次適用し、ledger・権限・保持previewを検証する。
3. OTP runtimeをtraffic 0または内部確認経路へデプロイし、health、JWKS、SMTP、Turnstile、DB権限を確認する。
4. PIRA runtimeをtraffic 0または内部確認経路へデプロイし、JWT検証、受付、静的画面、GENERAL無効を確認する。
5. Sales Tools管理runtimeへ管理資産をデプロイし、Workspace認証、管理者／閲覧者、監査、CSV/XLSXを確認する。
6. LBへOTP path、PIRA rootの順に経路を追加し、`pira.atlib.jp`のDNS・証明書を確認する。既存`www.atlib.jp`経路は変更しない。
7. UNION smoke E2Eを行い、OTP→受付→8問→レポート→COMPLETEDと管理画面反映を確認する。
8. 監視が正常なことを確認して承認済み割合へ段階的にtrafficを移す。

### 7.3 切り戻し

- runtime障害: LB経路またはCloud Run trafficを検証済み直前Revisionへ戻す。旧Revisionと037–041のadditive schema互換を事前確認する。
- OTP障害: 新規認証を停止し、PIRA受付へ未認証で迂回させない。
- DB障害: 追加書込みを止める。Migrationを手修正・逆適用せず、backup/PITR復元はDB責任者が別途判断する。
- Secret/JWT障害: 直前Secret version／鍵構成へ戻し、新旧JWKS併存期間とcacheを考慮する。
- DNS/LB障害: 変更前URL map／DNS recordへ戻す。既存`www.atlib.jp`とSales Tools経路を優先保護する。
- 保持ジョブ障害: ジョブを停止する。手動DELETEせず、previewと監査ログを確認後に冪等再実行する。

## 8. 最終Go/No-Go

現時点は **NO-GO（外部環境未確認）**。ローカル統合はPASSしているが、GCP現物、実Secret/IAM、backup/PITR、LB/DNS/証明書、staging外部サービスE2E、Revision rollbackの確認が完了していない。本書のGateがすべて証跡付きで承認されるまで、Production、Cloud Run、Cloud SQL、IAM、Secret、DNS、Migration、Trafficを変更しない。
