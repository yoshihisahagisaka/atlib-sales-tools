# IT経営KAIZEN 無料診断 Design v2 — Package A Implementation Contract

Status: READY FOR BOUNDED IMPLEMENTATION
Date: 2026-10-11
Implementation base: HA6 local commit `0f8700e4454bf3ead886057b0993863e28d34fc8`
Expected worktree: `C:\atlib\worktree-sales-tools-release-candidate`
Expected branch before implementation: `release-candidate-sales-tools-20261008`

## 1. Implementation base decision

Design v2 Package AはHA6をbaseとして開始する。

理由:

- `origin/main` はHA6の祖先であり、HA6はmain上にCurrent Design v1の20コミットを積んでいる。
- HA6にのみPublic Funnel、Semantic Projection、Initial/Final Rule、Structured Hearing、Review/Report/Feedback、migration 028〜032、Current Design/golden/browser/integration testsが揃っている。
- `origin/main` から開始するとHA6で確認済みの実装資産を失う。

したがって、Package Aではmainへ戻らない。

ただしHA6 commitはGitHub未pushのlocal reachable commitであるため、実装作業開始時にはHA6から新しい作業branchをローカルで作る。`release-candidate-sales-tools-20261008` 自体へ直接実装しない。

## 2. Package A goal

Package Aの目的は、Design v2のProduct CoreをHA6の既存API/DB/UIから独立したpure deterministic domainとして実装し、Golden Testsで設計契約を固定すること。

Package Aでは次を実装する。

1. Design v2 Q1〜Q7 semantic contract
2. Current Structured State type
3. Deterministic Analysis Engine
4. Narrative generation
5. Hearing Viewpoint generation
6. FACT Candidate generation
7. Golden Tests

Package Aでは次を実装しない。

- DB schema / migration
- Original Survey Snapshot persistence
- Current State persistence
- API route
- Public Survey UI変更
- Admin Hearing UI変更
- Post-Hearing 3-column UI
- Report persistence / approval変更
- Cloud Build / deploy / HA7

## 3. New domain files

Package AではHA6の既存M01〜M06実装を直接改造せず、以下の独立したDesign v2 domainを追加する。

### 3.1 `src/domain/freeDiagnosisDesignV2.ts`

責務:

- canonical semantic code/type definitions
- Current Structured State
- Analysis Result
- Lens
- UNKNOWN
- Hearing Viewpoint
- FACT Candidate
- Narrative object

Canonical semantic valuesはQuestion Contractと一致させる。

#### Q2 Future

- `BUSINESS_GROWTH`
- `FOCUS_ON_CORE_WORK`
- `LEAN_GROWTH`
- `NEW_BUSINESS_OR_WORKSTYLE`
- `BUSINESS_CONTINUITY`
- `NO_MAJOR_CHANGE`
- `UNDECIDED`

#### Q3 IT Expectation

- `PRODUCTIVITY`
- `LEAN_OPERATION`
- `MANAGEMENT_DECISION_SUPPORT`
- `DATA_USE`
- `CHANGE_READINESS`
- `EMPLOYEE_EXPERIENCE`
- `RESILIENCE`
- `IT_OPERATION_EFFICIENCY`
- `UNDECIDED`

#### Q4 Current Interest

- `MANAGEMENT_DECISION`
- `PRODUCTIVITY`
- `INFORMATION_AND_DATA`
- `GROWTH_AND_CHANGE`
- `IT_OPERATION_AND_GOVERNANCE`
- `SECURITY_AND_CONTINUITY`
- `UNDECIDED`

#### Q5 Visibility

- `VISIBLE_FULL`
- `VISIBLE_MOSTLY`
- `VISIBLE_PARTIAL`
- `RELIES_ON_OTHERS`
- `LOW_VISIBILITY`
- `UNKNOWN`

#### Q6 Management Connection

- `UNMANAGED_OR_NOT_VISIBLE`
- `MANAGED_NOT_REPORTED`
- `REPORTED_NOT_DECISION_USABLE`
- `DECISION_USABLE`
- `STRATEGICALLY_CONNECTED`
- `UNKNOWN`

#### Q7 Interest Theme

- `AI`
- `AUTOMATION`
- `DATA_VISIBILITY`
- `SECURITY`
- `IT_LITERACY`
- `SYSTEM_LIFECYCLE`
- `CLOUD`
- `IT_COST`
- `IT_ORGANIZATION`
- `SYSTEM_INTEGRATION`
- `WORKSTYLE`
- `UNDECIDED`

Q1はContextでありProblem/Findingを単独生成しない。

### 3.2 `src/domain/freeDiagnosisSemanticProjectionV2.ts`

責務:

- Design v2 structured answersを`CurrentStructuredStateV2`へ正規化
- exclusive option guard
- multi-select max guard where applicable
- no narrative / no persistence / no side effects

Important:

- `NO_MAJOR_CHANGE` / `UNDECIDED` の排他性を扱う
- Q7 `UNDECIDED` も原則排他
- Q3 max 2、Q7 max 3はContract validationとして扱う

### 3.3 `src/domain/freeDiagnosisAnalysisV2.ts`

責務:

`CurrentStructuredStateV2`だけを入力に、pure deterministicな`AnalysisResultV2`を返す。

Initial AnalysisとPost-Hearing Re-analysisで同じ関数を使う。

Suggested public function:

```ts
export function analyzeFreeDiagnosisV2(
  state: CurrentStructuredStateV2,
): AnalysisResultV2
```

Output minimum:

- `futureUnderstanding`
- `currentUnderstanding`
- `lensFindings`
- `unknowns`
- `hearingViewpoints`
- `factCandidates`
- `healthyGuard`

`lensFindings`は1論点に複数lensを持てる。

```ts
type Lens = 'TECHNOLOGY' | 'OPERATION' | 'MANAGEMENT'
```

M01〜M06をDesign v2 public outputへ含めない。

### 3.4 `src/domain/freeDiagnosisNarrativeV2.ts`

責務:

Analysis ResultからSystem Generated Narrativeをdeterministicに生成する。

Suggested function:

```ts
export function generateFreeDiagnosisNarrativeV2(
  state: CurrentStructuredStateV2,
  analysis: AnalysisResultV2,
): GeneratedNarrativeV2
```

Minimum sections:

- `future`
- `currentUnderstanding`
- `confirmationAndImprovement`
- `unknowns`
- `nextFacts`

NarrativeはFACT認定ではない。

Survey/Current State由来の記述では必要に応じて「という認識です」「確認する価値があります」「可能性があります」を用いる。

## 4. Analysis rules to implement in Package A

最初から全組合せを巨大なrule tableにしない。
Golden Contractで必要な意味を満たす最小のcomposable rulesから始める。

### Rule Group A — Future × Visibility × Management Connection

目的:

Futureに対して、経営として現在どこまで見え、IT情報が判断へつながっているかを整理する。

Required behaviors:

- material Future + `VISIBLE_PARTIAL` / `RELIES_ON_OTHERS` / `LOW_VISIBILITY` → confirmation valueを上げる
- `REPORTED_NOT_DECISION_USABLE` → 管理lensで「情報はあるが判断利用性を確認する価値」
- `MANAGED_NOT_REPORTED` → 「管理情報が経営へ継続的に届いているか」を確認
- `UNMANAGED_OR_NOT_VISIBLE` → 管理/可視性のUNKNOWN/confirmationを生成
- `DECISION_USABLE` / `STRATEGICALLY_CONNECTED` → problemを強制しない
- Healthy conditionでは`noImportantGapIdentified=true`を許す

### Rule Group B — Future × IT Expectation × Interest Theme

目的:

技術・運用・管理から改善可能性を見る。

Required examples:

`LEAN_GROWTH` + `PRODUCTIVITY` + `AI`

Allowed:

> 自動化・効率化・AI活用など、技術を使って少人数での事業成長を支えられる可能性がある。ただし、どの業務へ適用する価値があるかは未確認。

Not allowed:

- AI導入が必要
- RPA導入が必要
- システム連携が問題

`AI` / `AUTOMATION` / `CLOUD` / `SECURITY`等はInterestでありRecommendationではない。

### Rule Group C — Current Interest × Visibility × Management Connection

目的:

60分Hearingでどこを具体化する価値が高いかを決める。

Example:

`MANAGEMENT_DECISION` + `VISIBLE_PARTIAL` + `REPORTED_NOT_DECISION_USABLE`

→ Hearing viewpoints:

- 何が経営へ届いているか
- 何が判断に使えているか
- 何が判断に使いにくいか
- 欲しいが届いていない情報は何か

固定質問sequenceは作らない。

### Rule Group D — Healthy Guard

Healthy CaseではProblem/Gap/Assessment需要を作らない。

Example:

- Q5=`VISIBLE_FULL` or `VISIBLE_MOSTLY`
- Q6=`DECISION_USABLE` or `STRATEGICALLY_CONNECTED`
- Future change low or adequately supported

→ `noImportantGapIdentified=true` candidate

それでもFuture readiness等の軽い確認価値は残してよい。

### Rule Group E — UNKNOWN

UNKNOWNはProblemではない。

- Q5/Q6の`UNKNOWN`
- futureが`UNDECIDED`
- solution interestに対して適用対象が不明
- report/operation detailが不足

を、`UnknownItemV2`として表現する。

Hearing後のCurrent State変更でUNKNOWNが消える/新たに発生することを許す。

## 5. FACT Candidate contract

```ts
interface FactCandidateV2 {
  id: string
  whatToVerify: string
  whyItMattersToFuture: string
  whatMayBecomeKnowable: string
  lenses: Lens[]
  sourceRuleIds: string[]
}
```

Requirements:

- Solutionを確定しない
- Assessment scopeを自動決定しない
- 1つのFACTに複数lens可
- Healthy Caseでは0件も可
- 営業都合で件数を増やさない

## 6. Hearing Viewpoint contract

```ts
interface HearingViewpointV2 {
  id: string
  label: string
  whyUseful: string
  lenses: Lens[]
  exampleQuestions?: string[]
  sourceRuleIds: string[]
}
```

`exampleQuestions`は補助であり必須質問ではない。

Hearing completionをquestion countで判定しない。

## 7. Golden tests

Package Aでは少なくとも以下をpure domain testとして追加する。

Suggested file:

`test/freeDiagnosisDesignV2.golden.test.ts`

Required cases:

1. HA6-like Growth + Lean Growth + Productivity + Management Decision Support + Partial Visibility + Reported Not Usable
2. Same as #1 + AI interest
3. Healthy: Visible Full + Strategically Connected
4. Healthy: Visible Mostly + Decision Usable
5. AI interest only does not recommend AI
6. Security interest only does not assert security risk
7. Q5 Low Visibility does not itself become FACT
8. Q6 Managed Not Reported generates management confirmation value
9. Q6 Reported Not Decision Usable generates decision-usability confirmation
10. Q6 Strategically Connected does not manufacture gap
11. Future `UNDECIDED` does not manufacture problem
12. Q7 `UNDECIDED` does not manufacture recommendation
13. Multi-lens item can contain TECHNOLOGY + OPERATION + MANAGEMENT where warranted
14. FACT Candidate contains What / Why / What may become knowable / lenses
15. Unknown can exist without Problem
16. Same analyzer called with changed Current State produces changed analysis deterministically
17. Q5 change `VISIBLE_PARTIAL` → `RELIES_ON_OTHERS` changes current-understanding narrative
18. Q6 change `REPORTED_NOT_DECISION_USABLE` → `MANAGED_NOT_REPORTED` changes management narrative
19. Interest theme change does not override Future/Visibility/Management facts
20. No M01〜M06 identifiers appear in Design v2 public analysis output

Tests should assert semantic structure first, exact Japanese prose only where wording is contract-critical.

## 8. Compatibility boundary with HA6

Package A must not delete or modify the following existing HA6 behavior yet:

- `freeDiagnosisRuleBasedV1.ts`
- `intakeSemanticProjection.ts`
- `initialRuleEngine.ts`
- `finalRuleEngine.ts`
- `structuredHearing.ts`
- existing routes/repos/UI
- migrations 027〜032
- Current Design v1 tests

Package A is additive.

Existing HA6 tests must continue to compile/pass after Package A unless an unrelated pre-existing failure is proven.

Package A is not wired into production flow yet.

## 9. Implementation branch rule

Work should create a new local branch from exact HA6 commit.

Recommended name:

`feat/free-diagnosis-design-v2-package-a`

Before branch creation verify:

```powershell
git status
git rev-parse HEAD
git branch --show-current
```

Expected HEAD:

`0f8700e4454bf3ead886057b0993863e28d34fc8`

Worktree must be clean.

Do not implement directly on `release-candidate-sales-tools-20261008`.

## 10. Package A acceptance criteria

Package A is PASS only when:

1. new Design v2 domain core exists independently of M01〜M06
2. canonical Q2〜Q7 codes match Design v2 Question Contract
3. analyzer is pure and deterministic
4. same analyzer supports Initial and Post-Hearing Current State
5. AI/security/cloud interest cannot automatically create recommendation
6. Healthy Case can return no important gap
7. UNKNOWN is separated from Problem/FACT
8. multi-lens works
9. FACT Candidate contract is satisfied
10. Golden tests pass
11. existing HA6 tests remain green or any pre-existing failures are explicitly isolated
12. no DB/API/UI/migration/cloud changes are included

## 11. STOP gate after Package A

After code + tests + local commit, STOP.

Do not proceed to:

- Package B persistence
- migration creation
- API wiring
- Survey UI change
- Hearing UI change
- Report wiring
- build/deploy
- HA7
- Production

Return:

- branch
- commit SHA
- changed files
- test commands and results
- Golden case summary
- any contract ambiguity found
- confirmation that existing HA6 flow was not wired/changed
