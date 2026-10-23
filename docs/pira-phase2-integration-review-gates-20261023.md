# PIRA共同購買 B案 Phase 2：統括レビュー結果・次工程受入ゲート

記録日：2026年10月23日  
判定：**CODE SEPARATION ACCEPTED WITH GATES / MIGRATION NO-GO**

本書は統括レーンで実施したレビュー結果と受入ゲートを正式記録する。Workによる追加設計・追加コードレビュー・再テスト・実環境確認の結果ではない。B案のコード分離を受け入れる判定であり、実環境への適用承認ではない。

## 対象・記録時点

- Repository：`yoshihisahagisaka/atlib-sales-tools`
- Draft PR：[#17](https://github.com/yoshihisahagisaka/atlib-sales-tools/pull/17)
- 開発ブランチ：`feat/pira-b-phase2-20261018`
- **レビュー対象SHA：`27fb87a048eb1b65dd850dd77b4f27a4a9fefe09`**
- 作業開始時に取得したPR #17 HEAD：`27fb87a048eb1b65dd850dd77b4f27a4a9fefe09`（レビュー対象と一致）
- 関連PR：[#13：B案アーキテクチャ設計](https://github.com/yoshihisahagisaka/atlib-sales-tools/pull/13)、[#14：Phase 1実装・親PR](https://github.com/yoshihisahagisaka/atlib-sales-tools/pull/14)
- PR #17のbase：`feat/pira-joint-purchasing-phase1-20261018`
- 既存Runbook：[`docs/pira-phase2-b-runbook-20261018.md`](pira-phase2-b-runbook-20261018.md)
- 検証証跡：[`docs/evidence/pira-phase2-20261018/validation.json`](evidence/pira-phase2-20261018/validation.json)

PR HEAD、PR本文・コメント、既存Runbook、検証証跡、新規文書の不存在を確認して本記録を追加した。#13・#14とのstack関係を維持し、既存差分を二重適用しない。本書の追加Commitは文書の記録であり、レビュー対象コードSHAを変更するものではない。

## 統括レビューの判定と範囲

**B案のコード分離は、既存の承認済みアーキテクチャと整合している。**

統括が確認した実装：

1. 公開Portal、非公開Core、Sales Tools社内Adapterの責務分離。
2. PortalからのDB・社内権限・通知Secretの分離。
3. Google ID TokenによるPortal／Sales Toolsの機械間認証。
4. 外部Google OAuth／PKCE、専用Session、CSRF検証。
5. PIRA専用DB接続設定、限定参照、企業・見積管理の責務分離。
6. Phase 1の申込・正式発注・排他・冪等性・監査・Outboxの継承。
7. 通知WorkerとWebプロセスの分離。

レビュー対象は主要境界コード、PR本文、Runbook、検証証跡であり、**変更38ファイルの全行監査が完了したという意味ではない。** コード分離の受入れと、実IAM・ネットワーク・DB・認証・通知の結合検証、実環境適用の承認を区別する。

## 維持する検証結果

既存証跡を転記する。今回の文書追加ではテストを再実行せず、既存証跡・結果を書き換えない。

| 検証項目 | 維持する結果 |
|---|---|
| TypeScript strict build | PASS |
| Phase 1継承＋境界試験 | 23 PASS / 0 FAIL / 8 SKIP |
| モック画面 | 4 PASS |
| 既存回帰 | 78 PASS / 既知2 FAIL / 1 SKIP |
| 補助HTTP試験13件 | `fetch failed`により未確認 |
| 実Cloud Run IAM／ingress／VPC | 未検証 |
| 実Google OAuth | 未検証 |
| 実PostgreSQL／ACL | 未検証 |
| 実Slack／SMTP | 未検証 |
| Docker image build | 未実施 |

過去のPASSを実環境PASSに読み替えない。補助HTTP試験13件を本書の追加によってPASS扱いしない。既知2件の回帰失敗は既存のmain再現証跡とともに保持する。

## 次工程に向けた受入ゲート

以下は次工程の条件の記録であり、本書追加作業での調査・実行指示や適用承認ではない。

### A. 実環境Read-only調査

既存PR #14の調査資産を再利用し、未取得情報のみ確認する。

- Production Revision／Image／TrafficとGit SHA
- Migration Ledger
- DB Owner／Default ACL／実効ACL
- 既存企業の重複候補件数
- Cloud Run IAM／Ingress
- VPC／Subnet／Egress
- Cloud SQL接続予算

### B. 非公開Coreの通信境界

- Coreは非公開IngressとIAM認証の**両方**を必要条件とする。
- Portal／Sales Toolsからの到達経路は実GCP情報をもとに統括側で確定する。
- 到達できない場合に公開Ingressへ緩和しない。
- Sales ToolsからCoreへ渡すstaff情報が、認証済みサーバー由来であることを実環境で検証する。

### C. DBの安全性

- 専用検証DBと専用Roleを使用する。
- 既存Sales Tools本番DBへの影響を評価する。
- PostgreSQLの所有者・継承・Default ACL・実効ACLを確認する。
- 接続数、ロック、バックアップ、復旧条件を確認する。
- **DB物理共有のリスク受容は統括側の別承認**とする。

### D. Migration

- Phase 1 DDLは変更しない。
- Phase 2 DDLは**未採番・runner外・未適用**を維持する。
- 最新Production Ledgerと既存予約を確認するまで採番しない。
- **検証DBを含む実DBへの適用は禁止**する。

### E. 認証・通知

- 実Google OAuth／PKCE／Session失効を検証する。
- 組合・企業間の越境拒否を検証する。
- Slack／SMTPは別承認後、専用Secretとテスト宛先で検証する。
- Googleを利用できない担当者向けの認証方式は未決定。独自追加しない。

### F. HTTP補助試験

未確認の13件は、許可された検証環境で再実行する必要がある。今回の文書更新でPASS扱いしない。

## Claude APIキー依存関係の確認記録

以下は**2026年10月23日の統括側コード確認結果として提供された内容**を補足記録したものである。今回Workがコード全体や本番Secret設定を再調査した結果ではない。キー値は記録しない。

- PIRA Phase 1／Phase 2の主要実装にはAnthropic Claude APIへの直接呼び出しを確認できなかった。
- PIRA Core、公開Portal、通知WorkerにClaude専用環境変数・Secret参照は確認できなかった。
- Sales Tools Adapterは共同購買業務APIを利用するもので、Claude呼び出しのための経路ではない。
- Phase 2は未デプロイ。
- 既存Sales ToolsとMSP Customer Portalが参照する `ANTHROPIC_API_KEY` → `portal-anthropic-api-key:latest` は、共同購買とは別の既存本番依存として管理する。
- **共同購買の確認結果だけを根拠に旧Claude APIキーの廃止を承認しない。**

この調査は共同購買の主要コードとPR記録を対象としたもので、Sales Tools全体のAI呼び出し経路を完全監査したものではない。

## 今回の文書追加範囲・変更ゼロの対象

追加するファイルは本書 `docs/pira-phase2-integration-review-gates-20261023.md` の1件のみ。開発ブランチへの文書CommitとPR #17コメントへの記録を行う。

| 対象 | 今回の操作 |
|---|---|
| 新規レビュー文書 | 1ファイル追加 |
| PR #17 | 文書リンク・判定・未解決ゲート・操作範囲をコメント追記 |
| アーキテクチャ・仕様・TypeScript・SQL等の実装 | 変更0件 |
| 既存Runbook・DDL・検証証跡 | 変更0件 |
| テスト再実行 | 0件 |
| Migration採番・適用 | 0件 |
| GCP・DB・Secret・IAM・Production | 変更0件 |
| 実通知・mainマージ | 0件 |
| PR #13／#14 | 変更0件 |

**CODE SEPARATION ACCEPTED WITH GATES / MIGRATION NO-GOを維持する。** レビュー記録の追加後に停止し、次工程の設計・実装・実環境操作には着手しない。
