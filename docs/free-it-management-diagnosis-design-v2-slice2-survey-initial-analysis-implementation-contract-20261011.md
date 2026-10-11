# IT経営KAIZEN 無料診断 Design v2 — Slice 2 Survey / Semantic Projection / Initial Analysis Implementation Contract

Status: DESIGN v2 IMPLEMENTATION CONTRACT / NO PRODUCTION CODE CHANGE YET
Date: 2026-10-11
Branch: docs/free-diagnosis-design-v2-20261010

## 1. Purpose

本書は、Design v2 Slice 2として、事前アンケート Q1〜Q7 を Current Structured Stateへ正規化し、Survey回答だけから価値ある Initial Analysis / Initial Narrative を決定論的に生成するための実装契約を固定する。

このSliceではまだDB schema、Post-Hearing更新、Hearing UI、Report保存、HA7、build/deployを変更しない。

HA6の既存Case / Public submission / structured answer envelope / deterministic execution historyを最大限再利用しつつ、M01〜M06中心の意味づけをDesign v2へ切り替える前提を定める。

## 2. Canonical decisions for Slice 2

### 2.1 Stable answer codes

Design v2では、Survey Question Contractに定義した回答codeをCanonicalとする。

以前のworking documentで使用した `FUTURE_GROW_BUSINESS`、`EXPECT_PRODUCTIVITY` 等のaliasは、実装上の新しいCanonical codeにはしない。

Qごとの回答codeをそのままtyped semantic stateで使用し、意味が1対1の項目について不要な第二のalias層を作らない。

Canonical code:

### Q2 Future
- BUSINESS_GROWTH
- FOCUS_ON_CORE_WORK
- LEAN_GROWTH
- NEW_BUSINESS_OR_WORKSTYLE
- BUSINESS_CONTINUITY
- NO_MAJOR_CHANGE
- UNDECIDED

### Q3 IT Expectation
- PRODUCTIVITY
- LEAN_OPERATION
- MANAGEMENT_DECISION_SUPPORT
- DATA_USE
- CHANGE_READINESS
- EMPLOYEE_EXPERIENCE
- RESILIENCE
- IT_OPERATION_EFFICIENCY
- UNDECIDED

### Q4 Current Interest
- MANAGEMENT_DECISION
- PRODUCTIVITY
- INFORMATION_AND_DATA
- GROWTH_AND_CHANGE
- IT_OPERATION_AND_GOVERNANCE
- SECURITY_AND_CONTINUITY
- UNDECIDED

### Q5 Visibility
- VISIBLE_FULL
- VISIBLE_MOSTLY
- VISIBLE_PARTIAL
- RELIES_ON_OTHERS
- LOW_VISIBILITY
- UNKNOWN

### Q6 Management Connection / Decision Usability
- UNMANAGED_OR_NOT_VISIBLE
- MANAGED_NOT_REPORTED
- REPORTED_NOT_DECISION_USABLE
- DECISION_USABLE
- STRATEGICALLY_CONNECTED
- UNKNOWN

### Q7 Interest Theme
- AI
- AUTOMATION
- DATA_VISIBILITY
- SECURITY
- IT_LITERACY
- SYSTEM_LIFECYCLE
- CLOUD
- IT_COST
- IT_ORGANIZATION
- SYSTEM_INTEGRATION
- WORKSTYLE
- UNDECIDED

Q1はContextであり、従業員数・拠点数等を保持するが、単独でFindingやGapを生成しない。

## 3. HA6 reuse boundary

### KEEP

以下のHA6資産は骨格として再利用する。

- `public/it-management-kaizen/free-diagnosis/index.html`
- `public/it-management-kaizen/free-diagnosis/app.js`
- `src/routes/publicCustomerSelfFreeDiagnosis.ts`
- `src/services/publicCustomerSelfSubmissionService.ts`
- `src/services/freeDiagnosisRuleBasedCaseRepo.ts` のCase / Intake保存骨格
- versioned structured answer envelope
- answer provenance / respondent role
- deterministic rule execution recordの考え方

### ADAPT

以下はDesign v2の意味へ変更する。

- `src/domain/freeDiagnosisRuleBasedV1.ts`
  - Q1〜Q7 Question Contract / answer code
- `src/domain/intakeSemanticProjection.ts`
  - Q1〜Q7 → Design v2 Current Structured State projection
- `src/domain/initialRuleEngine.ts`
  - Primary / Secondary Focus中心ではなくDesign v2 Analysisへ
- Public Survey UI
  - Q7自由記述をstructured multi-selectへ変更

### DO NOT USE AS DESIGN v2 RULE SOURCE

- M01〜M06
- Primary / Secondary Focus
- fixed Hearing theme sequence
- Q7 free textをRule入力する経路

既存実装をこのSliceで削除する意味ではない。Design v2 Initial AnalysisのSource of Truthから外す。

## 4. Input contract

Initial Analysisの入力は `CurrentStructuredStateV2` とする。

Survey提出直後のInitial Current Stateは、Original Surveyと意味的に同一でよい。

後続SliceではHumanがCurrent Structured Stateを更新できるが、Initial / Post-HearingでAnalyzerを分けない。

概念型:

```ts
interface CurrentStructuredStateV2 {
  q1: {
    employeeRange: string;
    siteRange: string;
  };
  q2Future: FutureCode[];
  q3ItExpectation: ItExpectationCode[];
  q4CurrentInterest: CurrentInterestCode;
  q5Visibility: VisibilityCode;
  q6ManagementConnection: ManagementConnectionCode;
  q7InterestTheme: InterestThemeCode[];
}
```

実装時の型名は既存repo命名規約へ合わせてよいが、意味は変えない。

## 5. Survey validation guards

### Q2
MULTI_SELECT。
`NO_MAJOR_CHANGE` / `UNDECIDED` は、他のFutureと同時選択不可。

### Q3
MULTI_SELECT。UI上は原則最大2件。
`UNDECIDED` は他項目と同時選択不可。

### Q4
SINGLE_SELECT。

### Q5
SINGLE_SELECT。

### Q6
SINGLE_SELECT。

### Q7
MULTI_SELECT。UI上は原則最大3件。
`UNDECIDED` は他項目と同時選択不可。

Q7は自由記述ではなくstructured theme selectionとする。

## 6. Semantic Projection contract

Semantic Projectionの役割は、回答値を別名へ変換することではなく、以下を行うこととする。

1. version / question codeの妥当性確認
2. answer typeの正規化
3. multi-select順序の正規化
4.排他選択Guardの適用
5. Design v2 typed stateへの投影
6. source question / answer provenanceの保持

同じ選択集合は選択順に関係なく同じSemantic Stateになること。

Q1はContextとして保持するが、Primary Findingを発生させない。

## 7. Initial Analysis output contract

Analyzerは、単なるFocus listではなく以下を返す。

```ts
interface DiagnosisAnalysisV2 {
  futureSummary: NarrativeBlock[];
  currentUnderstanding: NarrativeBlock[];
  lensInsights: LensInsight[];
  unknowns: UnknownItem[];
  hearingViewpoints: HearingViewpoint[];
  factCandidates: FactCandidate[];
  guards: AnalysisGuardResult[];
  appliedRuleIds: string[];
}
```

### NarrativeBlock

最低限:
- id
- ruleId
- text
- sourceQuestionCodes
- epistemicType

`epistemicType` は少なくとも以下を区別できること。

- DIRECT_RECOGNITION
- POSSIBILITY
- CONFIRMATION_VALUE
- UNKNOWN

### LensInsight

最低限:
- id
- ruleId
- lenses: TECH / OPERATION / MANAGEMENT の複数選択
- text
- sourceQuestionCodes

1つのInsightへ複数lensを付けてよい。

### UnknownItem

最低限:
- id
- ruleId
- text
- sourceQuestionCodes
- relatedLenses[]

### HearingViewpoint

固定質問ではなく「確認すると解像度が上がる視点」。

最低限:
- id
- ruleId
- label
- whyItMatters
- relatedLenses[]

### FactCandidate

最低限:
- id
- ruleId
- whatToVerify
- whyItMattersToFuture
- whatMayBecomeKnowable
- relatedLenses[]
- sourceQuestionCodes

無料診断ではこのFact CandidateをFACT認定しない。

## 8. Deterministic pipeline

Initial Analysisは以下の順で決定論的に実行する。

1. Normalize Current Structured State
2. Validate guards
3. Direct Recognition generation
4. Cross-rule evaluation
5. Lens insight generation
6. UNKNOWN generation
7. Hearing Viewpoint generation
8. FACT Candidate generation
9. semantic deduplication
10. Narrative assembly order決定

同一inputは常に同一semantic outputになること。

文章の並び順もrule priority + stable idで固定する。

## 9. Epistemic wording rules

### Surveyに直接書かれていること

以下のような表現を使う。

- 「〜を目指しています」
- 「〜を期待しています」
- 「〜という認識です」
- 「〜に関心があります」

### 複数回答から推論すること

以下に限定する。

- 「〜の可能性があります」
- 「〜を確認する価値があります」
- 「現時点では〜は分かっていません」
- 「〜を確認すると、判断材料が得られそうです」

### 禁止

Surveyだけを根拠に以下を出さない。

- 「問題です」
- 「不足しています」
- 「導入すべきです」
- 「AIを導入する必要があります」
- 「システム連携が必要です」
- 「Assessmentが必要です」
- 「このScopeで進めるべきです」

## 10. Direct narrative rules

### V2-D-Q2-FUTURE

Q2をCustomer Futureとしてそのまま要約する。

例:
BUSINESS_GROWTH + LEAN_GROWTH

→
「事業を拡大しながら、少人数でも無理なく成長・運営できる会社を目指しています。」

### V2-D-Q3-EXPECTATION

例:
PRODUCTIVITY + MANAGEMENT_DECISION_SUPPORT

→
「その実現に向けて、ITには業務生産性の向上と経営判断を支える役割を期待しています。」

### V2-D-Q5-VISIBILITY

例:
VISIBLE_PARTIAL

→
「現在の業務・ITについて、分かることと分からないことがあるという認識です。」

RELIES_ON_OTHERS

→
「現在の業務・ITについて、担当者へ確認しないと分からないことが多いという認識です。」

### V2-D-Q6-MGMT

REPORTED_NOT_DECISION_USABLE

→
「ITに関する報告・共有はあるものの、経営判断に使える形へ十分に整理されていないという認識です。」

STRATEGICALLY_CONNECTED

→
「ITに関する情報や提案が、経営課題や事業計画と結びついた形で経営判断に活用されているという認識です。」

### V2-D-Q7-INTEREST

Q7は関心としてのみ表現する。

AI
→「AI・生成AIに関心があります。」

AIを選択しただけではTechnology FindingやSolution Recommendationを発生させない。

## 11. Core cross-rules

### V2-C-001 Growth / Lean Growth × Productivity

IF:
- Q2 includes BUSINESS_GROWTH or LEAN_GROWTH
- Q3 includes PRODUCTIVITY or LEAN_OPERATION

THEN:
- OPERATION lens
- 「現在の仕事の進め方が、事業規模が大きくなっても無理なく回るかを確認する価値があります。」

Unknown candidates:
- 負担が増えそうな業務
- 人に依存している業務
- 手作業 / 転記 / 集計 / 確認 / 情報探索の実態

### V2-C-002 Growth / Lean Growth × Productivity × AI / Automation

IF:
- Q2 includes BUSINESS_GROWTH or LEAN_GROWTH
- Q3 includes PRODUCTIVITY or LEAN_OPERATION
- Q7 includes AI or AUTOMATION

THEN:
- TECH + OPERATION lenses allowed
- 「自動化・効率化・AI活用など、技術を使って事業成長を支えられる可能性があります。ただし、どの業務へ適用する価値があるかは現時点では分かっていません。」

Guard:
AI導入をRecommendationにしない。

### V2-C-003 Future × Limited Visibility

IF:
- Q2 contains a material future change
- Q5 in {VISIBLE_PARTIAL, RELIES_ON_OTHERS, LOW_VISIBILITY}

THEN:
- OPERATION + MANAGEMENT lenses
- 「今後の会社の変化に対して、現在十分に把握できていない部分が、事業運営や経営判断にどのように関係するかを確認する価値があります。」

### V2-C-004 Management Interest × Visibility × Reporting Usability

IF:
- Q4 = MANAGEMENT_DECISION
- Q5 in {VISIBLE_PARTIAL, RELIES_ON_OTHERS, LOW_VISIBILITY}
- Q6 = REPORTED_NOT_DECISION_USABLE

THEN:
- MANAGEMENT lens
- 「ITや業務について一定の情報は得られている一方、その情報が経営判断に使える形へ整理されているかを具体的に確認する価値があります。」

### V2-C-005 Managed but Not Reported

IF:
- Q6 = MANAGED_NOT_REPORTED

THEN:
- MANAGEMENT lens
- 「ITの管理自体は行われている一方、経営へどの情報がどの頻度で共有されているかを確認する価値があります。」

Guard:
管理不足とは断定しない。

### V2-C-006 Unmanaged / Not Visible

IF:
- Q6 = UNMANAGED_OR_NOT_VISIBLE

THEN:
- MANAGEMENT lens
- 「ITについて経営として継続的に把握・判断するために、現在どの情報が管理されているかを確認する価値があります。」

### V2-C-007 Healthy / Strategic Connection

IF:
- Q5 in {VISIBLE_FULL, VISIBLE_MOSTLY}
- Q6 in {DECISION_USABLE, STRATEGICALLY_CONNECTED}

THEN:
- do not create Problem / Gap
- Current narrative:
  「現時点では、ITの把握や経営判断への接続について大きな懸念は見えにくい状態です。」

Futureに変化がある場合のみ、将来変化へ対応できる状態かを確認対象にしてよい。

### V2-C-008 Security Interest

IF:
- Q7 includes SECURITY

THEN:
- TECH + MANAGEMENT lenses as interest / confirmation possibility
- 「セキュリティに関心があります。現在の対策の有無だけではなく、経営としてリスクや事業への影響をどこまで把握・判断できているかを確認する価値があります。」

Guard:
Security risk existsとは断定しない。

### V2-C-009 System Lifecycle Interest

IF:
- Q7 includes SYSTEM_LIFECYCLE

THEN:
- TECH + MANAGEMENT lenses
- 「システムの更新や老朽化に関心があります。更新時期やサポート期限、事業への影響を経営として把握できる状態かを確認する価値があります。」

Guard:
更新が必要とは断定しない。

### V2-C-010 Undecided Future

IF:
- Q2 = UNDECIDED

THEN:
- no Problem
- Hearing viewpoint:
  「今後1〜3年で会社としてどのような変化を実現したいか」
- Narrative:
  「今後1〜3年で実現したい会社の姿は、現時点ではまだ具体化の途中です。まず、経営として優先したい変化を確認する価値があります。」

## 12. Generic Interest Theme behavior

Q7の全テーマは、最低限「関心テーマ」としてNarrativeに反映できる。

ただしQ7単独で以下を変化させない。

- Problem / Gap有無
- Assessment Need
- Assessment Scope
- Solution recommendation
- Priority

Q7はQ2/Q3/Q4/Q5/Q6と組み合わせたときに、確認視点・lens・FACT Candidateの候補を追加する。

## 13. Narrative assembly

Initial Narrativeは以下の順で組み立てる。

1. Future Summary
2. IT Expectation
3. Current Understanding
4. Lens Insights
5. UNKNOWN
6. Next FACT Candidate

同義の文章が複数ruleから出る場合はsemantic dedupeを行う。

M01〜M06の章立ては出力しない。

## 14. Initial Analysis and Post-Hearing Re-analysis must be one engine

Slice 2で作るAnalyzerは、Initial専用として設計してはいけない。

同じ関数に同じ型の `CurrentStructuredStateV2` を渡せば、

- Survey直後のInitial Analysis
- Hearing後にHumanが更新したPost-Hearing Analysis

のどちらも生成できること。

差はinput stateだけとする。

Hearing memoはAnalyzer inputに含めない。

## 15. Suggested code boundary for later implementation

実装時の最小安全案として、HA6のv1 domainを直接巨大改修するより、Design v2の純粋domain coreを分離する。

候補:

- `src/domain/freeDiagnosisDesignV2.ts`
  - Q1〜Q7 code / types / validation
- `src/domain/freeDiagnosisSemanticProjectionV2.ts`
  - stored survey → CurrentStructuredStateV2
- `src/domain/freeDiagnosisAnalysisV2.ts`
  - deterministic analysis rule
- `src/domain/freeDiagnosisNarrativeV2.ts`
  - narrative assembly / dedupe

既存のroute / service / Case基盤からV2 coreを呼ぶ。

これはParallel Productを作るためではなく、M01〜M06へ強く結合したHA6 domainを壊さず、Design v2のRuleを純粋関数としてテスト可能にするための分離である。

実装時に実ファイル構成を変更する場合でも、この責務分離は維持する。

## 16. Slice 2 acceptance contract

Slice 2実装時は最低限以下を満たすこと。

1. Q1〜Q7をstructured inputとして表現できる
2. Q7はfree textではなくstructured multi-select
3. 同一回答集合は選択順に関係なく同じSemantic Stateになる
4. SurveyだけでFuture / Current / lens / UNKNOWN / FACT Candidateを生成できる
5. Q2単独でProblemを作らない
6. Q7単独でSolutionを推奨しない
7. Healthy CaseでProblem / Gapを強制作成しない
8. 技術 / 運用 / 管理を複数lensとして付与できる
9. M01〜M06をInitial Analysisの主単位にしない
10. AnalyzerはHearing memoを入力に取らない
11. AnalyzerはInitial / Post-Hearing共通で使える
12. 同一inputから同一semantic outputを返す
13. Golden Rule Contractの代表caseを表現できる
14. Customer-facing textがFACT断定をしない
15. Recording機能を要求しない

## 17. Explicit non-goals in Slice 2

- Original Survey SnapshotのDB実装
- Current Structured StateのDB実装
- Human Update API
- Hearing UI変更
- Post-Hearing 3-column UI
- System Generated / Human Edited Narrativeの永続化
- Report Approval変更
- migration
- build / deploy / HA7

これらは後続Sliceで扱う。

## 18. STOP gate

本書でSlice 2の実装契約を固定する。

次の工程はSlice 3として、immutable Original Survey Snapshot / Current Structured State / Narrative separationの最小data modelを設計する。

Production code、migration、test実行、build、HA7、deployにはまだ進まない。
