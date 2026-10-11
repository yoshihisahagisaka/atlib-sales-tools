# Sales Tools 共通KPI基盤 Contract

Status: DESIGN LOCKED / SERVICE FIT-GAP GO / IMPLEMENTATION NOT STARTED
Date: 2026-10-11
Scope: Sales Tools 上の複数サービスに共通する経営KPI基盤

本書は以下の設計原則を最優先Decisionとして固定する。

> 共通KPIは、共通化できる事実だけを共通集計する。
> 各サービスを共通KPIに合わせて変形しない。
> 各サービス詳細KPIは、そのサービスの顧客導線・診断・営業活動に最適化して独自設計する。

本書と既存KPI文書が衝突する場合は本書を優先する。

参照:
- `docs/sales-tools-common-kpi-contract-20261011.md`
- `docs/sales-tools-common-kpi-service-boundary-decision-20261011.md`
- `docs/it-management-kaizen-free-diagnosis-kpi-mapping-20261011.md`
- `docs/gyomu-kaizen-kpi-fit-gap-handoff-20261011.md`

---

## 1. Case simulation requirement

共通KPI基盤そのものを固定するための業務Caseシミュレーションは不要とする。

理由:
- 共通層は診断判断・レポート意味・各サービス固有ファネルを決めない。
- 共通層は、すでに各サービスで成立した事実を共通のRead Modelへ投影するだけである。
- 妥当性確認はBusiness Caseの紙上シミュレーションより、各サービスのSource Fit/GapとAdapter Contract Testで行う方が適切である。

ただし各サービス実装前に、actual sourceを使って以下を確認する。
- どのrecord/table/eventがCanonical Sourceか
- timestampを推測せず取得できるか
- 同一Milestoneの二重countが起きないか
- Company横断IDが取れるか
- Attribution/Owner/Commercial Eventが本当に存在するか
- 存在しない値を0やOTHERへ強制変換していないか

---

## 2. Architecture

共通基盤は次の2系統を明確に分ける。

### 2.1 Common KPI path

`Service Canonical Data`
→ `Service Common KPI Adapter`
→ `Sales Tools Common KPI Read Model`
→ `Common KPI Aggregation/API`
→ `Common Dashboard`

共通ダッシュボードが扱うのは、サービス横断で意味が一致する事実だけ。

### 2.2 Service Detail KPI path

`Service Canonical Data`
→ `Service-specific KPI Read Model`
→ `Service Detail KPI API/UI`

IT経営KAIZEN詳細KPIと業務KAIZEN詳細KPIは独立してよい。
共通画面へ合わせるためにサービス固有の顧客導線、診断、営業活動を変更してはならない。

---

## 3. Common KPI Subject

共通KPIの1件はCompanyやContactではなく、各サービスのCanonicalな案件単位とする。

```ts
interface CommonKpiSubjectRef {
  businessLine: string;
  subjectType: string;
  subjectId: string;
}
```

必須:
- `businessLine`: 安定したService/Business Line code
- `subjectType`: 当該サービスのCanonical subject type
- `subjectId`: 当該サービス内で一意のCanonical ID

同一案件内の再分析、再送付、再ヒアリングは新しいsubjectにしない。
同じ会社でも独立した案件が2件ならsubjectは2件。

---

## 4. Company / Contact identity

### 4.1 companyId

会社横断分析のため、共通Read Modelは`companyId`フィールドを必ず持つ。

- Canonical Company IDが存在する場合は設定必須。
- 受付時点でCompanyが未解決の場合は`null`を許容する。
- `null`を仮IDや会社名文字列で埋めない。
- Company解決後にAdapterが正しいCanonical IDを返せることが望ましい。

`companyId = null`のsubjectもサービス件数には含めるが、Company横断重複・クロスセル分析では`Unresolved`として扱う。

### 4.2 contactId

`contactId`は任意。
Contact単位の分析が必要なサービスのみ返す。
共通KPI参加条件にはしない。

---

## 5. Entry fact

共通KPIへ参加するsubjectは、最低1つの`ENTRY_ACCEPTED`を持つ。

`enteredAt`は`ENTRY_ACCEPTED.firstReachedAt`と同じ意味を持つ。

受付途中、Draft、自動保存だけではENTRY_ACCEPTEDにしない。
各サービスが「案件として受付成立」と定義するCanonical artifact/eventをSourceとする。

---

## 6. Entry Channel

共通で比較できる入力経路のみ共通codeへMappingする。

初期共通code:
- `CUSTOMER_SELF`
- `STAFF_PROXY`
- `OTHER`

ただし意味が一致しないサービス固有経路を無理に`OTHER`へ押し込めない。
共通Mappingできない場合は`entryChannel = null`として、サービス詳細側に固有値を保持してよい。

`STAFF_PROXY`はMarketing Sourceではない。

---

## 7. Acquisition / Attribution

顧客獲得経路と入力経路を分離する。

### 7.1 Common Acquisition Channel

意味が一致する場合のみ以下へMapping可能とする。

- `WEB`
- `REFERRAL`
- `EVENT`
- `OUTBOUND`
- `PARTNER`
- `EXISTING_CUSTOMER`
- `DIRECT`
- `OTHER`

Mapping不能なら`null`。

### 7.2 Attribution Snapshot

受付時点で取得できるMarketing AttributionをSnapshotとして扱う。

候補:
- `source`
- `medium`
- `campaign`
- `content`
- `term`
- `referrer`
- `landingPath`

存在しない値を新設前提で埋めない。
後からKPI都合で過去Snapshotを推測・遡及書換えしない。

### 7.3 Marketing Initiative

交流会、チラシ、広告、紹介施策等を横断管理する場合は、raw UTMとは別に正規化された施策参照を許容する。

```ts
marketingInitiativeId?: string | null;
```

例:
- 守成クラブ2026年10月配布チラシ
- 2026年秋Web広告

`marketingInitiativeId`はMarketing施策マスタで管理し、raw UTM Snapshotを消さない。
施策マスタ未実装のサービスは`null`でよい。

---

## 8. Owner / Operator

共通Read Modelは案件責任者を次で表す。

```ts
ownerId?: string | null;
```

営業CVや滞留の担当者別集計はCase Ownerを優先する。

個々の操作担当者Operatorは共通Subjectの主フィールドに混ぜない。
Activity KPIで必要な場合のみevent source側から取得する。

---

## 9. Common Milestone vocabulary

共通Milestoneは「サービス横断で同じ意味の場合だけ」使用する。

利用可能な共通code:

- `ENTRY_ACCEPTED`
- `MEETING_SCHEDULED`
- `HEARING_COMPLETED`
- `REPORT_APPROVED`
- `REPORT_DELIVERED`
- `FEEDBACK_COMPLETED`
- `PAID_SERVICE_PROPOSED`
- `PAID_SERVICE_WON`

重要:
- 各サービスが全codeを持つ必要はない。
- 存在しないstageを共通KPIのために追加しない。
- 同名でも意味が違うなら共通codeを使わない。
- サービス固有stageはサービス詳細側に置く。

Milestoneはsubjectごとの最初の到達を1回だけcountする。

```ts
interface CommonMilestone {
  code: string;
  firstReachedAt: string;
}
```

timestamp Source優先順位:
1. Canonical artifact/eventの実時刻
2. Immutable audit/event logの実時刻
3. 明示されたstage transition timestamp

`updated_at`だけから過去Milestone時刻を推測しない。

---

## 10. Commercial Events

商談・受注情報はsubject上の単一値に固定せず、Commercial Eventとして扱う。

```ts
interface CommercialEvent {
  type: "PROPOSED" | "WON";
  serviceCode: string;
  occurredAt: string;
  amount?: number | null;
  currency?: string | null;
}
```

理由:
- 1案件から複数の有料サービスを提案する可能性がある。
- 提案額と受注額が異なる可能性がある。
- 後から追加提案が発生してもsubject構造を壊さない。

ルール:
- 金額不明を0円にしない。
- amountを持つ場合はcurrencyを明示する。初期運用がJPYでもschema上はcurrencyを持てるようにする。
- `PAID_SERVICE_PROPOSED` / `PAID_SERVICE_WON` MilestoneはCommercial Eventから導出できる場合、そのSource関係をService Mappingに明記する。

---

## 11. Outcome / Disposition

各サービスの終了理由を無理に共通化しない。

共通側では、意味が一致する場合のみHigh-level categoryを返せるようにする。

```ts
outcomeCategory?: string | null;
dispositionReason?: string | null;
closedAt?: string | null;
```

初期共通category候補:
- `PAID_SERVICE_RECOMMENDED`
- `NO_PAID_SERVICE_NEEDED_NOW`
- `FOLLOW_UP_LATER`
- `CUSTOMER_DECLINED`
- `OTHER`

ただしサービスに合わない場合は`null`でよい。
詳細な失注理由・終了理由は各サービス側のSSOTを維持する。

有料提案されなかったことを自動的に「失注」とみなさない。

---

## 12. Common Read Model

共通Adapterが返す論理モデルを次で固定する。

```ts
interface SalesToolsCommonKpiSubject {
  ref: {
    businessLine: string;
    subjectType: string;
    subjectId: string;
  };

  companyId: string | null;
  contactId?: string | null;

  enteredAt: string;

  entryChannel?: string | null;
  acquisitionChannel?: string | null;
  marketingInitiativeId?: string | null;

  attribution?: {
    source?: string | null;
    medium?: string | null;
    campaign?: string | null;
    content?: string | null;
    term?: string | null;
    referrer?: string | null;
    landingPath?: string | null;
  };

  ownerId?: string | null;

  milestones: Array<{
    code: string;
    firstReachedAt: string;
  }>;

  outcomeCategory?: string | null;
  dispositionReason?: string | null;
  closedAt?: string | null;

  commercialEvents: Array<{
    type: "PROPOSED" | "WON";
    serviceCode: string;
    occurredAt: string;
    amount?: number | null;
    currency?: string | null;
  }>;
}
```

物理共通tableをこの時点では要求しない。
まず各サービスのCanonical SourceからAdapterでこのRead Modelを返す。

---

## 13. Required vs nullable

### 13.1 Schemaとして必須

全サービスが必ず提供する:
- `ref.businessLine`
- `ref.subjectType`
- `ref.subjectId`
- `companyId` field（値はnull可）
- `enteredAt`
- `milestones`
- `commercialEvents`
- `ENTRY_ACCEPTED` milestone

### 13.2 値が存在する場合は必ず提供

Sourceに存在するなら隠さずMappingする:
- `contactId`
- `entryChannel`
- `acquisitionChannel`
- `marketingInitiativeId`
- Attribution fields
- `ownerId`
- 共通意味を満たすMilestone
- `outcomeCategory`
- `dispositionReason`
- `closedAt`
- Commercial Event / amount / currency

### 13.3 値が存在しない場合

- 推測しない
- 0にしない
- 仮値を入れない
- `null`または空配列
- Data Quality上はMissing/Unresolvedとして可視化可能にする

---

## 14. Common aggregation semantics

### 14.1 Cohort Funnel

選択期間中に`ENTRY_ACCEPTED`したsubjectを母集団とする。
同じsubjectが後に到達した共通Milestoneを追跡する。

CV率:
`Conversion(A→B) = same cohort subjects reached B / same cohort subjects reached A`

分母0は`0%`ではなく`—`。

### 14.2 Activity Volume

選択期間中に実際に起きたMilestone/Commercial Event件数。

Cohort Funnelの分子・分母とActivity Volumeを混ぜない。

### 14.3 Company-level aggregation

`companyId`で複数サービスを横断可能にする。

例:
- IT経営KAIZEN利用企業のうち業務KAIZENにも進んだ企業数
- 同一企業の複数サービス利用
- Company単位の提案額/受注額

`companyId = null`はCompany横断集計から除外し、Unresolved件数を別表示する。

---

## 15. Common Dashboard responsibility

共通Dashboardは会社全体とサービス横断の事実把握に限定する。

想定:
- 期間
- Service / Business Line
- Acquisition Channel / Campaign
- Entry Channel
- Owner
- 受付件数
- 共通Milestone件数
- 共通Milestone CV
- 有料提案件数
- 受注件数
- 提案額 / 受注額（Sourceがある場合）
- Company横断利用
- Lead time
- Data Quality
- 件数からsubject一覧へDrill-down

サービス固有の診断品質、質問別傾向、独自ファネル、独自営業ステージは共通Dashboardへ押し込まない。

---

## 16. Service Detail KPI responsibility

各サービスは共通基盤と別に、そのサービスに最適な詳細KPIを自由に設計する。

例:
- IT経営KAIZEN: 診断→Hearing→Report→Assessmentに必要な独自管理
- 業務KAIZEN: 自己診断/代理入力/相談/改善支援の実導線に最適化した独自管理

共通Dashboardと同じUI構造にする必要はない。
共通化のためにサービス固有stageを削除・追加・改名しない。

---

## 17. Drill-down contract

共通Dashboardの数値は必ず元subjectへ降りられること。

各Service Adapterは少なくとも次を解決可能にする。
- subject ID
- 表示用案件名/会社名（read-model側で取得してよい）
- 対象サービス
- 当該サービスの案件一覧/詳細へ遷移するためのroute resolver

KPI値だけを表示し、元案件を確認できない実装は禁止。

---

## 18. Data Quality

共通基盤はデータ欠損を営業評価へ変換しない。

区別:
- `0`: 実際に0件
- `null`: 値が未取得/未解決
- `—`: 当該サービスでは非該当または未実装

確認対象:
- companyId unresolved
- acquisitionChannel missing
- campaign attribution missing
- owner missing
- milestone timestamp source missing
- commercial amount unknown

---

## 19. Prohibited commonization

共通KPI基盤へ入れない:
- 診断質問/回答
- Semantic State
- 診断Rule
- Hearing Viewpoint
- Report本文/章構成
- FACT Candidate
- Problem/Gap score
- maturity/risk score
- サービス固有stageを無理に変換した疑似Milestone
- サービス固有の有料誘導ロジック

---

## 20. Requirements for every service

各サービスは共通KPI接続前に以下を提出・確定する。

### A. Identity
1. `businessLine` code
2. Canonical `subjectType`
3. Canonical `subjectId`
4. `companyId` exact source / unresolved時の扱い
5. `contactId` source（ある場合）

### B. Entry
6. `ENTRY_ACCEPTED`の業務定義
7. exact source table/artifact/event
8. `enteredAt` exact timestamp source
9. DraftとAcceptedの境界

### C. Input / Acquisition
10. `entryChannel` source
11. Common codeへのMapping表
12. `acquisitionChannel` source
13. UTM/source/medium/campaign/content/term/referrer/landingPathの保存有無
14. `marketingInitiativeId`とのMapping可否

### D. Responsibility
15. `ownerId` exact source
16. Owner未設定時の扱い

### E. Common Milestones
17. 使用する共通Milestoneだけ列挙
18. 各Milestoneの業務意味
19. exact source
20. firstReachedAt exact timestamp
21. 二重count防止方法
22. 共通化しないService-specific stage一覧

### F. Commercial
23. 有料提案のCanonical source
24. 受注のCanonical source
25. `serviceCode`
26. proposed amount source（あれば）
27. won amount source（あれば）
28. currency source/default policy
29. 1subjectから複数提案がある場合の識別方法

### G. Outcome
30. Human outcome / disposition source
31. 共通outcomeCategoryへMapping可能か
32. closedAt source
33. loss/stop reason source（ある場合）

### H. Drill-down
34. 共通Dashboardから案件へ戻るroute
35. 一覧filterへsubject IDを渡す方法

### I. Gaps
36. Source不足項目
37. historical復元不能項目
38. 新Persistenceが本当に必要な項目
39. 共通にせずサービス詳細KPIへ残す項目

---

## 21. Required deliverable from each service Fit/Gap

各サービスは次の成果物を返す。

1. Common KPI Subject定義
2. Common Field Source Mapping表
3. Common Milestone Mapping表
4. Attribution Mapping表
5. Commercial Event Mapping表
6. Company/Owner Mapping
7. Drill-down Mapping
8. GAP一覧
9. Service-specific KPI一覧
10. 「共通化しないもの」一覧

このFit/GapがPASSするまで、共通KPIのためだけのmigrationを作らない。

---

## 22. Adapter acceptance tests

Business Caseシミュレーションの代わりに、各Service Adapterは最低限以下をContract Testする。

1. 1 Canonical subject = 1 KPI subject
2. ENTRY_ACCEPTEDが1回だけ出る
3. 再送付/再ヒアリングでsubject件数が増えない
4. Milestone firstReachedAtが安定する
5. Company IDが正しくMappingされる
6. self/proxyが存在する場合に正しく分かれる
7. Attributionが原Sourceどおりで推測されない
8. 未取得値が0/OTHERへ自動変換されない
9. Commercial PROPOSED/WONが実Sourceから生成される
10. 金額不明が0円にならない
11. 同一subjectの複数Commercial Eventを保持できる
12. Drill-down先が正しいsubjectを開く
13. Service-specific stageを共通Milestoneへ誤変換しない

---

## 23. Implementation sequence

1. 本Common Foundation Contract固定
2. 各サービスSource Fit/Gap
3. 両サービスMapping整合確認
4. Common Read Model / Adapter interface実装
5. Service Adapter実装
6. Common Aggregation/API
7. Common Dashboard
8. 各サービス詳細KPI画面は各サービス側で独自実装
9. Regression
10. Human Acceptance

IT経営KAIZENの詳細KPI完成を業務KAIZENのFit/Gap開始条件にしない。

---

## 24. STOP / implementation boundary

本書作成だけでは以下を承認しない。

- DB migration
- 共通KPI physical table
- Production query
- Production deploy
- Production traffic
- 既存サービスCase/status変更
- サービス固有顧客導線の変更

各サービスはまずSource Fit/Gapまで進めてよい。

---

## 25. Final Design Decision

共通KPI基盤は「共通サービスモデル」ではない。

共通基盤が要求するのは、サービス横断で意味が変わらない次の事実だけである。

**どの案件か / どの会社か / どのサービスか / いつ受付したか / どこから来たか / 誰が担当したか / 共通して意味が一致する節目にいつ到達したか / どう終わったか / 何をいついくら提案・受注したか。**

それ以外は各サービスのDomainに残す。
