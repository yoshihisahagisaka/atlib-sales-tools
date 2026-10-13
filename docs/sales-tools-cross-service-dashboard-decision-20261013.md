# Sales Tools Cross-Service Dashboard Decision

Status: BUSINESS DECISION RECORDED / IMPLEMENTATION NOT STARTED

Date: 2026-10-13
Scope: Sales Tools上のIT経営KAIZEN、業務KAIZEN、共通KPIダッシュボードの責任分界

## Decision

Sales Toolsの共通KPIダッシュボードを、Sales Toolsのトップページ兼ポータルとする。独立したポータルは作らない。

ダッシュボードは次の3要素で構成する。

1. 共通KPI
   - 既存Contractで意味と計算基準が一致するデータラベルだけを横断集計する。
   - サービス間で意味が異なるデータは無理に共通化しない。
2. サービス別KPIカード
   - 各サービス固有KPIのサマリーを表示する。
   - 初期対象はIT経営KAIZENと業務KAIZENとする。
   - その他サービスを将来追加できる境界を維持する。
3. サービス管理画面への導線
   - 各サービスカードから、そのサービス固有の顧客・案件管理画面へ遷移する。

## Responsibility boundary

| Boundary | Responsibility |
| --- | --- |
| 各サービス | 顧客管理、案件管理、サービス固有KPI |
| 共通ダッシュボード | 横断KPI集計、サービス別サマリー、各サービス管理画面へのナビゲーション |
| 各サービスのImplementation Contract | データの意味、業務状態、Canonical source |
| Sales Tools Common KPI Foundation Contract | 共通データラベル、Read Model、集計契約 |

共通KPIのために既存サービスのDB、Case lifecycle、診断、営業フローを統合または変形しない。共通層は、各サービスのCanonical sourceから意味が一致する事実だけをadapterする。

## Rationale

- 共通ダッシュボードと別ポータルを二重に持つ必要がない。
- 横断経営指標とサービス固有の運用指標では責任が異なる。
- 既存Common KPI Foundationは「共通化できる事実だけを共通集計する」と固定している。
- 各サービス固有の状態やKPIを共通モデルへ押し込むと、既存Contractの意味を変えるため避ける。
- サービス別カードと管理画面への導線により、横断把握から元案件へのdrill-downを維持できる。

## Existing Canonical references

本文を複製せず、次の既存Canonical／実装正本を参照する。

### Common KPI

- `docs/sales-tools-common-kpi-foundation-contract-20261011.md`
  - Canonical commit: `4d433028a354f8a3c468c62d4308e6a0f7a37a29`
  - Status: `DESIGN LOCKED / SERVICE FIT-GAP GO / IMPLEMENTATION NOT STARTED`
- `docs/sales-tools-common-kpi-service-boundary-decision-20261011.md`
  - Canonical commit: `4d433028a354f8a3c468c62d4308e6a0f7a37a29`
  - 共通ダッシュボードとサービス固有KPIの分離原則を優先する。
- `docs/sales-tools-common-kpi-contract-20261011.md`
  - Canonical commit: `4d433028a354f8a3c468c62d4308e6a0f7a37a29`

これらは取得済みGit履歴には存在するが、本Decision作成時点の`main` treeには含まれていない。参照時は上記commitで内容を固定する。

### 業務KAIZEN

- `docs/gyomu-kaizen-kpi-fit-gap-handoff-20261011.md`
  - Latest known commit: `b5a02941a680b87ece2de4d9a3b58addcd1e8cf9`
- `docs/gyomu-kaizen-restart-go-after-it-kaizen-package-b-20261011.md`
  - Latest known commit: `7122e6360227d7a4ffff6e6ef15d026f5e706654`
- Sales Tools上の現行管理実装
  - `public/admin/business-web-consultation-leads.html`
  - `public/admin/business-web-consultation-lead-detail.html`
  - 関連するBusiness Web Consultation API／persistence

「業務KAIZEN Implementation Contract v1」という完全一致の文書名・パスは、本Decision作成時点の`main`および取得済みGit履歴から特定できなかった。このため本Decisionはその内容を推測せず、上記既存文書と実装を参照する。正式Contractが別repositoryまたは未取得refに存在する場合は、そのpathとSHAを別途Canonical登録する。

### IT経営KAIZEN

- Business Canonical:
  - `docs/free-diagnosis-rule-based-v1-business-design-canonical-20261003.md`
  - Canonical commit: `a8cb578a9a5ed097d68bbf99819b3533556b52fc`
- Implementation Specification:
  - `docs/free-diagnosis-rule-based-v1-implementation-specification-20261003.md`
  - Canonical commit: `a8cb578a9a5ed097d68bbf99819b3533556b52fc`
- Design v2の各Package／Slice Contractは、それぞれのデータ意味とlifecycleの正本として維持する。

### Marketing Initiative / Sales Launcher

- `docs/production-release-marketing-initiative-v1-034.md`
  - Latest main commit affecting the document: `5a8ffdeec13c719ee5c96c189f658f7c820c4837`
- `docs/sales-tools-production-canonical-policy-20261003.md`
  - Latest main commit affecting the document: `acda3f5d643a81d1d309163d2ec0a1108ee218b6`
- Current Sales Launcher／Admin implementation:
  - `public/admin/free-diagnosis-v1.html`
  - `public/admin/marketing-initiatives.html`
  - 対応するAdmin route／repository

Marketing InitiativeのUTM照合、施策KPI、各サービスの案件一覧は既存責任境界を維持する。本Decisionはそれらの計算契約を変更しない。

## Pending decisions

次は未決事項であり、本Decisionでは確定しない。

- 共通KPIの最終表示項目
- 各サービスカードに表示する具体的KPI
- 集計期間と更新頻度
- KPI集計の対象サービス範囲
- サービス間の顧客重複の扱い
- 権限と表示範囲
- Dashboard UIの詳細
- 「業務KAIZEN Implementation Contract v1」の正式pathとCanonical SHA
- Common KPI Canonical文書を`main` treeへ統合するかどうか

## Implementation boundary

本Decisionは設計・責任分界の記録であり、次を承認しない。

- Dashboard実装
- DB schemaまたはmigration
- Common KPI physical table
- 既存サービスのCase／status／業務フロー変更
- Production DB操作
- Cloud Build、deploy、traffic変更

実装開始時は、Common KPI Foundation Contractに従い、各サービスのactual source Fit/Gapとadapter contractを先に確定する。
