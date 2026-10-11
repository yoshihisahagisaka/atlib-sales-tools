# Sales Tools 共通KPI — Service Boundary Decision

Status: CANONICAL DESIGN PRINCIPLE / OVERRIDES CONFLICTING PRIOR WORDING
Date: 2026-10-11

## 1. Decision

以下を共通KPI設計の固定原則とする。

> **共通KPIは、共通化できる事実だけを共通集計する。**
> **各サービスを共通KPIに合わせて変形しない。**
> **業務KAIZEN詳細KPIは、業務KAIZENの顧客導線・診断・営業活動に最適化して独自設計する。**

この原則は、既存の `sales-tools-common-kpi-contract-20261011.md` および `gyomu-kaizen-kpi-fit-gap-handoff-20261011.md` のうち、各サービス詳細画面のUXまで共通化すると読める記述より優先する。

## 2. What is common

Sales Tools共通層で持つのは、複数サービスで意味が一致する事実・ラベル・集計規則だけとする。

例:

- KPI Subjectの識別方式
- Business Line / Service識別
- 共通化可能なMilestone
- Entry Channel
- Acquisition / Attribution
- Case Owner / Operator
- Cohort Funnel / Activity Volumeの定義
- 共通化可能なConversionの計算規則
- 横断集計可能な件数・到達事実
- 共通ダッシュボードから各サービス詳細への導線

共通Milestoneは「実際に意味が同じ場合のみ」mappingする。

サービスに存在しないMilestoneを作らない。
意味の異なるstageを共通codeへ無理に押し込まない。

## 3. Common dashboard responsibility

共通ダッシュボードは、経営としてサービス横断で比較可能な事実を表示する。

例:

- サービス別受付件数
- 共通化可能な活動件数
- 共通化可能な受注件数
- 流入元 / Campaign
- Entry Channel
- 担当者
- 期間推移

共通ダッシュボードは各サービス固有の診断品質・固有stage・固有CVを一つの標準ファネルへ矯正しない。

## 4. Service detail responsibility

各サービス詳細KPI画面は、そのサービスの顧客導線・営業活動・診断プロセスに最適化して設計する。

### IT経営KAIZEN

IT経営KAIZENの実際の無料診断→Hearing→Report→Feedback→Assessment等の流れに最適化する。

### 業務KAIZEN

業務KAIZENの実際の顧客導線・無料診断・相談・営業活動・有料サービスへの接続に最適化する。

IT経営KAIZENの詳細KPI画面構造を、業務KAIZENへテンプレートとして強制しない。

共通化できる表示部品・filter・table component等を再利用してもよいが、情報設計そのものを共通化のために歪めない。

## 5. Adapter boundary

各サービスは共通KPIへ「共通化可能な事実」だけをadapterする。

Service-specific dataは、そのサービス詳細画面で直接利用してよい。

したがって:

`Service Canonical Data`
→ `Common Adapter: 共通化できる事実のみ`
→ `Common Dashboard`

と並行して:

`Service Canonical Data`
→ `Service-specific KPI Read Model`
→ `Service Detail KPI Screen`

を持つ。

Service-specific KPIをCommon Read Modelへ無理に格納しない。

## 6. 業務KAIZEN implementation implication

業務KAIZEN側は以下を行う。

1. 共通KPI Contractに対して、何が本当に共通事実としてmapping可能かFit/Gapする。
2. 共通化可能な部分だけCommon Adapterへ接続する。
3. 業務KAIZEN固有のKPI・ファネル・滞留・診断/営業指標は独自に設計する。
4. 詳細KPI画面は業務KAIZENの運用に最適化して実装する。

禁止:

- 共通KPIに合わせるために業務KAIZENのstageを変更する
- 存在しないMilestoneを追加する
- IT経営KAIZEN固有ファネルをコピーする
- 共通Dashboard都合で業務KAIZENのCanonical data modelを歪める

## 7. Precedence

KPI関連の解釈が衝突する場合、優先順位は以下とする。

1. 本Decision
2. Sales Tools Common KPI Contract
3. Service-specific KPI Mapping / Fit-Gap
4. それ以前のHandoff / implementation notes

## 8. Implementation status

本Decisionは設計原則の固定であり、Production migration / deploy / 共通KPI実装GOを意味しない。
