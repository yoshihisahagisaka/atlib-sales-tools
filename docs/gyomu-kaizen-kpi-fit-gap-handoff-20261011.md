# 業務KAIZEN KPI設計 — Sales Tools共通KPI参照Handoff

Status: SHARE GO / FIT-GAP MAY START
Date: 2026-10-11

## 1. Decision

業務KAIZEN側は、IT経営KAIZENのKPI実装完了を待つ必要はない。

以下2文書を共通設計のSource of Truthとして参照し、業務KAIZEN固有部分だけFit/Gapしてよい。

1. `docs/sales-tools-common-kpi-contract-20261011.md`
2. `docs/it-management-kaizen-free-diagnosis-kpi-mapping-20261011.md`

2はIT経営KAIZEN固有Mappingの実例として参照する。業務KAIZENへ質問・stage・診断ロジックをコピーしない。

## 2. Reuse as common

業務KAIZENでそのまま採用する共通概念:

- KPI subjectはCompanyではなくServiceのCanonical Case/Lead
- current statusではなくMilestone到達でFunnelを数える
- subjectごとに同一Milestoneは最初の1回だけcount
- Cohort FunnelとActivity Volumeを分離
- 同一CohortでConversionを計算
- Entry ChannelとAcquisition Channelを分離
- CUSTOMER_SELF / STAFF_PROXYをEntry Channelとして比較可能にする
- Campaign/UTM等は存在するSourceだけを利用
- Case OwnerとOperatorを分ける
- KPIカード → Funnel → Breakdown → Drill-down
- 件数から対象案件一覧へ降りられる管理表UX
- Source不明を0件扱いしない
- KPI Score / maturity scoreを作らない

## 3. Do not copy from IT経営KAIZEN

業務KAIZENへコピーしないもの:

- IT経営KAIZEN Q1〜Q7
- IT経営KAIZEN semantic code
- 技術/運用/管理の診断Ruleそのもの
- IT経営KAIZENのHearing Viewpoint
- IT経営KAIZEN Report内容
- Assessment FACT Candidate Rule
- IT経営KAIZEN固有Case status

KPI共通化は診断プロダクト共通化ではない。

## 4. Required Fit/Gap questions for 業務KAIZEN

業務KAIZEN側で次だけを確定する。

### A. KPI Subject

何を1件として数えるか。

候補:
- business_web_consultation_lead
- 今後追加する業務KAIZEN Case

既存A案/B-Light構造と照合し、Canonicalを1つ決める。

### B. ENTRY_ACCEPTED

本人回答 / 営業代理入力を、どのartifactが確定した時点で1受付とするか。

Draftや入力途中はcountしない。

### C. Service Funnel Mapping

業務KAIZENで実在するBusiness MilestoneをSales Tools Common codeへmappingする。

共通候補:
- ENTRY_ACCEPTED
- MEETING_SCHEDULED
- HEARING_COMPLETED
- REPORT_APPROVED
- REPORT_DELIVERED
- FEEDBACK_COMPLETED
- PAID_SERVICE_PROPOSED
- PAID_SERVICE_WON

存在しないstageは無理に作らない。
業務KAIZEN固有stageが必要なら固有codeを追加し、共通codeの意味を変えない。

### D. Entry Channel

最低限:
- CUSTOMER_SELF
- STAFF_PROXY

本人回答と代理入力は同じKPI Funnelへ載せ、entryChannelで比較できるようにする。

### E. Acquisition Source

既存Business Web LPの流入/marketing attributionで何が保存済みかactual sourceを確認する。

存在しないUTM等を推測で作らない。

### F. Owner

誰をCase/Lead責任担当者とするか。

### G. Paid service outcome

業務KAIZENでも、有料提案されなかったCaseを自動的に失注としない。

Human outcome候補:
- PAID_SERVICE_RECOMMENDED
- NO_PAID_SERVICE_NEEDED_NOW
- FOLLOW_UP_LATER
- CUSTOMER_DECLINED
- OTHER

業務KAIZENの商流に合わなければ最小差分で名称/選択肢を調整する。

## 5. Required output from 業務KAIZEN Fit/Gap

業務KAIZEN側は次の形で返す。

1. Canonical KPI Subject
2. Funnel Milestone表
3. Milestoneごとのexact source table / field / event / timestamp
4. Entry Channel source
5. Acquisition/Campaign source
6. Owner source
7. Paid Service Outcome source
8. Disposition / stop reason source
9. Common ContractでそのままFITな項目
10. GAPとして追加設計が必要な項目

## 6. Implementation boundary

業務KAIZEN側はFit/Gapまでは今すぐ進めてよい。

ただし、IT経営KAIZEN側と別々の共通KPI table/API/dashboardを実装しない。

共通実装はSales Tools Common KPI Read Model/API/UIとして1回だけ作る。
各サービスはadapter/mappingだけを持つ方針とする。

## 7. Current shared implementation strategy

初期実装は物理共通KPI tableを前提にしない。

各サービスのCanonical sourceをCommon KPI Read Modelへadapterし、Query-timeで集計する方針を第一候補とする。

source timestamp不足やhistorical milestone復元不能がactual Fit/Gapで確認された場合のみ、共通event ledger等を追加検討する。

## 8. UI sharing

業務KAIZENのKPI画面も基本UXは共通化する。

- Filter bar
- KPI cards
- Funnel
- Entry/Acquisition/Owner breakdown
- Lead time / bottleneck
- Drill-down list

Service-specific label/stageはMappingから差し替える。

別ページをゼロからデザインしない。

## 9. SHARE GO condition

本書作成時点で、業務KAIZEN側が共通KPI設計を参照するための条件は満たした。

**業務KAIZEN KPI設計：共有GO**

ただし共有GOは実装GOではなく、業務KAIZEN固有Fit/Gap開始GOである。

## 10. STOP

まだ行わない:

- 業務KAIZEN独自の共通KPI基盤実装
- KPI用Production migration
- IT経営KAIZENのPackage D/E中断
- Production deploy

次は業務KAIZEN側Fit/Gap結果を受け、Common API/UI実装前に両サービスのMappingを整合確認する。
