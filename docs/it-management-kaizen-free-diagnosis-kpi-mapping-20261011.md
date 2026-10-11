# IT経営KAIZEN 無料診断 — KPI Mapping Contract

Status: DESIGN READY / SOURCE FIT-GAP PARTIAL
Date: 2026-10-11
Depends on: `docs/sales-tools-common-kpi-contract-20261011.md`
Design v2 implementation baseline: Package C FINAL PASS, Package D in progress

## 1. Purpose

Sales Tools共通KPI ContractをIT経営KAIZEN無料診断へ適用する際の、KPI subject、Milestone意味、集計軸、Human Outcomeを固定する。

本書はKPIの意味を決める。未確認のphysical sourceを推測で決めない。

## 2. KPI subject

IT経営KAIZEN無料診断のKPI 1件は、Canonicalな無料診断Case 1件とする。

Company数、Contact数、Survey回答row数、Analysis revision数、Report version数を受付件数として数えない。

同じ会社が別Caseとして再診断した場合は別件。

## 3. Funnel start

### ENTRY_ACCEPTED

意味:

「顧客本人回答または営業代理入力の内容が、無料診断CaseのOriginal Surveyとして確定し、無料診断を開始できる状態になった」

Design v2ではOriginal Survey SnapshotがCaseに対して確定した時点を論理startとする。

重要:
- Public formを開いただけでは数えない
- draft入力では数えない
- idempotent retryで二重計上しない
- customer self / staff proxyの両方を同じ受付Milestoneへ載せる

Physical source:
- Design v2 Original Survey Snapshotを第一候補とする
- Package D/E完了後の実配線Source Reviewでexact timestampを固定する

## 4. IT経営KAIZEN Funnel

経営用の主ファネルは次を標準とする。

1. ENTRY_ACCEPTED — 無料診断受付
2. MEETING_SCHEDULED — 60分ヒアリング日程確定
3. HEARING_COMPLETED — 60分ヒアリング実施完了
4. REPORT_DELIVERED — 診断Report送付/提示
5. FEEDBACK_COMPLETED — Report説明・Feedback完了
6. PAID_SERVICE_PROPOSED — 有料AssessmentをHumanが提案
7. PAID_SERVICE_WON — 有料Assessment受注

`REPORT_APPROVED`は重要な内部Operational Milestoneとして保持するが、主ファネル表示ではREPORT_DELIVEREDの前段として補助表示してよい。

## 5. Milestone semantics

### MEETING_SCHEDULED

「顧客と60分ヒアリングの日時が確定した」時点。

候補Sourceに予約/日程情報が存在しても、単なる`BOOKING_PENDING`は到達とみなさない。
Physical sourceはImplementation Fit/Gapで確認する。

### HEARING_COMPLETED

「実際の60分ヒアリングを完了した」時点。

Hearing memoが1件存在するだけでは完了とみなさない。
固定質問の全消化も完了条件にしない。
Package DのCoverage型Hearing終了操作またはCase transitionのexact sourceを実装時に固定する。

### REPORT_APPROVED

Human Reviewにより顧客提示可能なReportが確定した時点。

Generated Narrative作成だけでは数えない。
Human Edited Narrative保存だけでも数えない。

### REPORT_DELIVERED

顧客へReportが実際に送付/提示された最初の時点。

Report生成、PDF生成、Approvalとは分ける。
既存Delivery recordを再利用候補とする。

### FEEDBACK_COMPLETED

顧客へReport説明・Feedbackを実施完了した時点。

Feedback予定作成だけでは数えない。

### PAID_SERVICE_PROPOSED

有料AssessmentをHumanが顧客へ明示提案した時点。

次を自動的に提案扱いしない:
- FACT Candidate生成
- Assessmentに向く可能性
- Assessment Handoff draft
- System suggestion

Human actionが必要。

### PAID_SERVICE_WON

有料Assessmentの受注をHumanが確定した時点。

「Assessment Scopeを作成した」「見積を作成した」だけでは受注にしない。
正式な受注Sourceが現行Sales Toolsに不足する場合はGAPとして追加設計する。

## 6. Primary KPI

経営/営業の基本KPI:

- 無料診断受付数
- 日程確定率 = MEETING_SCHEDULED / ENTRY_ACCEPTED
- ヒアリング実施率 = HEARING_COMPLETED / MEETING_SCHEDULED
- Report送付率 = REPORT_DELIVERED / HEARING_COMPLETED
- Feedback実施率 = FEEDBACK_COMPLETED / REPORT_DELIVERED
- Assessment提案率 = PAID_SERVICE_PROPOSED / FEEDBACK_COMPLETED
- Assessment受注率 = PAID_SERVICE_WON / PAID_SERVICE_PROPOSED
- 無料診断→Assessment受注率 = PAID_SERVICE_WON / ENTRY_ACCEPTED

すべて同一Cohortで計算する。

## 7. Operational KPI

ボトルネック把握用:

- 受付→日程確定 中央日数
- 日程確定→ヒアリング 中央日数
- ヒアリング→Report Approved 中央日数
- ヒアリング→Report Delivered 中央日数
- Report Delivered→Feedback 中央日数
- Assessment提案→受注 中央日数

Activity Volumeとして:
- 期間内ヒアリング実施件数
- 期間内Report承認件数
- 期間内Report送付件数
- 期間内Feedback件数
- 期間内Assessment提案件数
- 期間内Assessment受注件数

を別表示する。

## 8. Service-quality guard

IT経営KAIZEN無料診断は「Assessmentを売るためにGapを作る診断」ではない。

したがってFeedback後にHumanが次のOutcomeを明示できる設計を採用する。

- PAID_SERVICE_RECOMMENDED
- NO_PAID_SERVICE_NEEDED_NOW
- FOLLOW_UP_LATER
- CUSTOMER_DECLINED
- OTHER

`NO_PAID_SERVICE_NEEDED_NOW`は正常終了であり、失注色で表示しない。

ReportがHealthy CaseでAssessment不要となったケースを営業失敗として扱わない。

## 9. Entry channel

最低限:

- CUSTOMER_SELF — 顧客本人回答
- STAFF_PROXY — 営業代理入力

を分ける。

比較KPI:
- 受付件数
- ヒアリング実施率
- Report送付率
- Assessment提案率
- Assessment受注率

ただしentry channelはMarketing Sourceではない。

## 10. Acquisition / campaign dimensions

利用可能なAttributionが存在する範囲で:
- Acquisition Channel
- source
- medium
- campaign
- content
- term
- referrer
- landing path

をfilter/breakdown候補とする。

現行Package CまでのSource ReviewではKPI用Attribution mappingは未確定。
Implementation前にmigration 030等のactual sourceをFit/Gapし、存在するfieldだけ使用する。

## 11. Owner dimension

Case責任担当者をKPI filter対象とする。

Human Edited Narrative編集者やHearing memo作成者などのOperatorは、Case Ownerと同一とは限らない。
営業CVはOwner、Activity workloadは必要に応じてOperatorを使用する。

## 12. Dashboard layout for IT経営KAIZEN

### Top filter
- 期間
- Cohort Funnel / 期間内実施件数
- Entry Channel
- Acquisition / Campaign
- Case Owner
- Human Outcome

### KPI cards
- 無料診断受付
- ヒアリング実施
- Report送付
- Assessment提案
- Assessment受注
- 受付→受注率

### Funnel
受付 → 日程確定 → ヒアリング → Report送付 → Feedback → Assessment提案 → Assessment受注

### Operational bottleneck
- 各stageの中央値
- 長期滞留Case数

### Breakdown
- 本人回答 / 代理入力
- 流入元 / Campaign
- 担当者

### Drill-down
各数値から既存Case一覧/対象Caseへ移動。

## 13. Drill-down contract

KPI画面は集計だけで完結しない。

例:
「ヒアリング済み12件」をクリック
→ その12 Caseの一覧

「Report未送付4件」をクリック
→ HEARING_COMPLETED済みかつREPORT_DELIVERED未到達Case一覧

「Assessment提案済み未受注3件」
→ PAID_SERVICE_PROPOSED済みかつPAID_SERVICE_WON未到達Case一覧

Operatorが次の行動を取れる管理表にする。

## 14. Source Fit/Gap status as of Package C

現時点の設計上の整理:

- KPI subject Case: FIT
- Original Survey / Entry Channel構造: FIT candidate; Design v2 wiring完了後にexact source固定
- Hearing Record: FIT for record, completion milestone sourceは要確認
- Report version / Human Review基盤: FIT candidate
- Approved Report snapshot/hash: FIT candidate
- Delivery: FIT candidate
- Feedback: FIT candidate
- Audit: FIT
- Marketing Attribution: PARTIAL / exact mapping未確認
- Assessment proposal explicit event: GAP/PARTIAL — exact Human action sourceを要確認
- Assessment won explicit source: GAP候補 — exact order sourceを要確認
- Paid-service Human Outcome: GAP — KPI用に明示保存できるか要確認

Fit candidateは「存在する資産を再利用できそう」という意味で、Implementation Source Gateでactual schema/APIを確認するまで確定しない。

## 15. Implementation gate

Package D/Eを止めてKPI実装を割り込ませない。

推奨:

1. Package D completion / Human Acceptance
2. Package E Report/Review integration
3. KPI Source Fit/Gap
4. Common KPI Read Model/API
5. KPI Admin UX
6. Regression
7. Human Acceptance
8. Production readiness

ただしSales Tools Common KPI Contractと本Mappingは、業務KAIZEN側が今から参照してFit/Gapを開始してよい。

## 16. Non-goals / STOP

本書では以下を実施しない。

- KPI migration
- shared KPI table作成
- Package D/E変更
- Production DB変更
- Assessment受注Sourceの推測実装
- Marketing attributionの架空field追加
