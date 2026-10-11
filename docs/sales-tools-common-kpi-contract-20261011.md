# Sales Tools 共通KPI Contract

Status: DESIGN READY / IMPLEMENTATION NOT STARTED
Date: 2026-10-11
Scope: IT経営KAIZEN / 業務KAIZENを先頭に、Sales Tools上の複数サービスで共通利用する営業・運用KPIの定義

## 1. Purpose

本書は、サービスごとに別々の「管理表KPI」を設計して二重実装することを避けるため、Sales Tools共通のKPI概念・数え方・期間集計・流入軸・ファネル・ドリルダウンUXを固定する。

共通化するのはKPIの意味とRead Modelであり、各サービス固有の診断ロジック・質問・Case statusを無理に共通化しない。

## 2. Three-layer model

KPIは次の3層で扱う。

1. Sales Tools Common KPI Model
2. Service Funnel Mapping
3. Service-specific KPI / operational metrics

IT経営KAIZENと業務KAIZENは1の共通定義を共有し、2と3だけを各サービスでFit/Gapする。

## 3. KPI counting subject

KPIの1件はCompanyやContactではなく、各サービスのCanonicalな営業・診断単位を数える。

論理表現:

```ts
interface KpiSubjectRef {
  businessLine: string;
  subjectType: string;
  subjectId: string;
}
```

例:
- IT経営KAIZEN: 無料診断Caseを1件
- 業務KAIZEN: 当該サービスでCanonicalと定めた相談/診断CaseまたはLeadを1件

同じ会社が別時期に2件の独立Caseを持つ場合は2件。
同一Case内の再分析・再送付・再ヒアリングは新規KPI subjectにしない。

## 4. Milestone model

ファネルは「現在status」ではなく、Caseが一度到達したBusiness Milestoneを基準に数える。

共通milestone code:

- ENTRY_ACCEPTED — サービス受付が成立
- MEETING_SCHEDULED — 面談/ヒアリング日程が確定
- HEARING_COMPLETED — ヒアリング実施完了
- REPORT_APPROVED — 顧客提示可能なReportがHuman Reviewで確定
- REPORT_DELIVERED — 顧客へReportを送付/提示
- FEEDBACK_COMPLETED — Report説明・Feedback実施完了
- PAID_SERVICE_PROPOSED — 有料サービスをHumanが明示提案
- PAID_SERVICE_WON — 有料サービス受注をHumanが確定

各サービスは不要なMilestoneを省略してよいが、意味を変えて同じcodeを使わない。

Milestoneは原則monotonicな「到達履歴」であり、current stageとは分ける。

## 5. What counts as reaching a milestone

各Milestoneはsubjectごとに最初の到達を1回だけ数える。

- 同一Reportを複数回送付してもREPORT_DELIVERED subject countは1
- 日程変更を複数回行ってもMEETING_SCHEDULED subject countは1
- 再Feedbackを行ってもFEEDBACK_COMPLETED subject countは1

再実行回数を見たい場合はActivity Volumeとして別集計し、Conversion Funnelへ混ぜない。

Milestone時刻は次の優先順位で取得する。

1. Canonical artifact / delivery / feedback / order recordの実時刻
2. Immutable audit / event logの実時刻
3. 明示されたstage transition timestamp

current statusの`updated_at`だけから過去Milestone到達時刻を推測しない。

## 6. Two period views — never mix them

KPIは必ず次の2種類を区別する。

### A. Cohort Funnel

選択期間中にENTRY_ACCEPTEDしたsubjectを母集団とし、その同じsubjectが各Milestoneへ到達した件数/率を見る。

用途:
- CV率
- 施策別成約率
- entry channel別比較

例:
10月受付20件のうち、現在までにヒアリング15件、Report送付12件、受注3件。

### B. Activity Volume

選択期間中に各Milestone eventが実際に発生した件数を見る。

用途:
- 今月何件ヒアリングしたか
- 今週Reportを何件送ったか
- 担当者負荷

Activity Volumeの異なる母集団同士を割ってCV率を作らない。

## 7. Conversion definitions

共通式:

`Conversion(A→B) = subjects in cohort that reached B / subjects in same cohort that reached A`

代表KPI:

- 受付→日程確定率
- 日程確定→ヒアリング実施率
- ヒアリング→Report送付率
- Report送付→Feedback実施率
- Feedback→有料提案率
- 有料提案→受注率
- 受付→有料受注率

分母0の場合は0%ではなく`—`を表示する。

## 8. Healthy / no-paid-service guard

無料診断を有料サービスへ無理に誘導するKPI設計にしない。

Humanが「現時点では有料Assessment不要」と判断する正常終了を許容する。

有料提案されなかったCaseを自動的に「失注」「営業失敗」としない。

次のHuman Outcomeを共通概念として持てるようにする。

- PAID_SERVICE_RECOMMENDED
- NO_PAID_SERVICE_NEEDED_NOW
- FOLLOW_UP_LATER
- CUSTOMER_DECLINED
- OTHER

このOutcomeはSystem Ruleが自動決定しない。Human Decisionである。

したがって営業品質を見る場合、単純な「全受付→有料提案率」だけでなく、必要に応じて

`有料提案率 among PAID_SERVICE_RECOMMENDED`

も見られるようにする。

## 9. Entry channel vs acquisition channel

以下を混同しない。

### Entry Channel

「誰が/どの経路でSales Toolsへ回答・受付を登録したか」

例:
- CUSTOMER_SELF
- STAFF_PROXY
- OTHER

### Acquisition Channel

「その顧客がどこから来たか」

例:
- WEB
- REFERRAL
- EVENT
- OUTBOUND
- PARTNER
- EXISTING_CUSTOMER
- DIRECT
- OTHER

STAFF_PROXYはMarketing Sourceではない。

## 10. Attribution snapshot

MVPでは複雑なmulti-touch attributionを実装しない。

ENTRY_ACCEPTED時点で保持されている取得可能なMarketing AttributionをCase/Leadの流入Snapshotとして使用する。

候補軸:
- acquisitionChannel
- source
- medium
- campaign
- content
- term
- referrer
- landingPath

既存migration/fieldの実在名称はImplementation Fit/Gapで確認し、存在しないfieldを新設前提にしない。

KPI集計途中でAttributionを遡及上書きしない。

## 11. Owner / operator dimension

担当者別KPIは、Caseの責任担当者と操作実行者を分ける。

- Case Owner: 案件責任者
- Operator: 特定eventを実行した人

営業CVの基本filterはCase Ownerを優先する。
操作量のActivity KPIではOperatorを使ってよい。

## 12. Time-to-milestone metrics

件数/CVだけでなくボトルネックを見るため、少なくとも以下を測定可能にする。

- ENTRY_ACCEPTED → MEETING_SCHEDULED
- MEETING_SCHEDULED → HEARING_COMPLETED
- HEARING_COMPLETED → REPORT_DELIVERED
- REPORT_DELIVERED → FEEDBACK_COMPLETED
- PAID_SERVICE_PROPOSED → PAID_SERVICE_WON

初期UIでは中央値を基本とする。
件数が少ない場合は過度な統計表示をしない。

## 13. Common KPI Read Model

物理共通tableを先に作ることを必須にしない。

まず各サービスのCanonical dataから次の共通Read Modelへadapterする。

```ts
interface SalesKpiSubject {
  ref: KpiSubjectRef;
  enteredAt: string;
  entryChannel?: string;
  acquisitionChannel?: string;
  attribution?: Record<string, string | null>;
  ownerId?: string | null;
  milestones: Array<{
    code: string;
    firstReachedAt: string;
  }>;
  paidServiceOutcome?: string | null;
  disposition?: string | null;
}
```

このRead Modelで不足が判明した場合だけ、共通event ledger等の追加Persistenceを検討する。

## 14. Dashboard UX contract

共通KPI画面は、サービスをまたいだ経営把握と、各サービスの実案件確認を両立する。

基本構成:

### A. Filter bar
- 期間
- Service / Business Line
- Entry Channel
- Acquisition Channel / Campaign
- Case Owner
- Outcome / Disposition

### B. KPI cards
- 受付数
- ヒアリング実施数
- Report送付数
- 有料提案数
- 有料受注数
- 受付→受注率

サービスに存在しない項目は非表示。

### C. Funnel
Milestoneごとのsubject数と直前stageからのCV率を表示。

### D. Breakdown
最低限:
- Entry Channel別
- Acquisition Channel / Campaign別
- Owner別

### E. Bottleneck / lead time
代表区間の中央値。

### F. Drill-down
すべての件数はクリックして、対象subject一覧まで降りられる。

KPI数値だけで終わらせず「どの案件か」を追えることを必須とする。

## 15. Metric semantics shown in UI

画面上でCohort FunnelとActivity Volumeを明示する。

推奨表示:
- 「受付月別の転換率」
- 「期間内の実施件数」

単に「CV率」とだけ表示し、母集団が不明な状態を禁止する。

## 16. Data quality / Unknown handling

Sourceが存在しないKPIを0として扱わない。

区別:
- 0 = 実際に0件
- — = 集計対象外 / Source未実装
- Unknown = Sourceはあるが値が不明

欠損を良い/悪いスコアへ変換しない。

## 17. No scoring / no artificial sales pressure

禁止:
- KPI Score
- 営業成熟度Score
- Case quality Score
- Assessmentへ進まないCaseを赤表示する設計
- Healthy Caseへ人工的にProblemを作るインセンティブ

KPIは事実の可視化と運用改善のために使う。

## 18. Service adapter contract

各サービスは実装前に次を明示する。

1. KPI subjectのCanonical ID
2. ENTRY_ACCEPTEDの定義とsource timestamp
3. 各Milestoneのexact source
4. entryChannel source
5. acquisition/UTM source
6. Case Owner source
7. Human paid-service outcome source
8. disposition / stop reason source
9. Source不足項目

Source不在の場合、推測で埋めずGAPとする。

## 19. Implementation sequencing

推奨順序:

1. Common Contract固定
2. IT経営KAIZEN Service Mapping
3. 業務KAIZEN Fit/Gap
4. 共通Read Model/API
5. Common KPI Admin UI
6. Service adapters
7. Regression
8. Human Acceptance

IT経営KAIZENの全機能完成を待たず、1と2が固定された時点で業務KAIZENはFit/Gapを開始してよい。

## 20. STOP / non-goals

本書だけでは以下を承認しない。

- DB migration
- 共通KPI table新設
- Production query追加
- Production deploy
- 既存Case status変更
- 業務KAIZEN固有stageの自動決定

Implementationは各Service MappingのSource確認後に行う。
