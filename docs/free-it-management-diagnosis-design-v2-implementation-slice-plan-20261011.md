# IT経営KAIZEN 無料診断 Design v2 — Implementation Slice Plan

Status: PRE-IMPLEMENTATION CONTRACT / NO CODE CHANGE YET
Date: 2026-10-11
Baseline HA6: `0f8700e4454bf3ead886057b0993863e28d34fc8`

## 1. Purpose

Design v2をHA6へ最小差分で実装するため、実装を独立した小さいSliceへ分割する。

目的は、HA6の既存基盤を活かしつつ、Design v2の中核である以下を安全に導入すること。

- immutable Original Survey Snapshot
- Human Updated Current Structured State
- deterministic Initial / Re-analysis
- System Generated Narrative / Human Edited Narrative
- Coverage型Hearing
- 技術 / 運用 / 管理のmulti-lens
- Next FACT Candidate
- Design v2 5章Report

Recording機能は対象外であり、実装しない。

## 2. Global guardrails

全Slice共通で以下を守る。

1. HA6のCustomer / Contact / Sales Activity / Case / Auth / Audit / Human Review / Delivery / Feedback基盤を不要に作り直さない。
2. migrations 027〜032は編集・再実行しない。
3. Original SurveyとCurrent Structured Stateを同一rowとして扱わない。
4. Hearing memo / statementをRule Sourceへ自動変換しない。
5. Human Updated Current Structured StateだけをPost-Hearing re-analysisの構造化入力とする。
6. Q7 Interest ThemeからSolution Recommendationを自動生成しない。
7. Healthy CaseでProblem / Gap / Assessment Needを強制しない。
8. 技術 / 運用 / 管理は排他的分類ではなくmulti-lens。
9. Generated NarrativeとHuman Edited Narrativeを同一値として上書き運用しない。
10. Free DiagnosisではFACT認定をしない。
11. 各Slice終了時にSTOPし、次Sliceへ進む前にRegression / Contract確認を行う。

## 3. Target end-to-end flow

Survey Draft
→ Survey Complete
→ Immutable Original Survey Snapshot
→ Semantic Projection
→ Initial Current Structured State
→ Deterministic Initial Analysis
→ Initial Generated Narrative
→ Hearing Coverage + Memo
→ Post-Hearing Human Update of Current Structured State
→ Deterministic Re-analysis
→ Regenerated Narrative
→ Human Edit
→ Report Draft
→ Human Review / Approval
→ Customer Report

## 4. Slice 0 — Baseline / Contract Freeze

### Goal

実装前にHA6 baselineとDesign v2 Contractを固定する。

### Inputs

- HA6 exact source SHA: `0f8700e...`
- Design v2 Survey Question Contract
- Semantic / Narrative Rule
- Report / Current Understanding Contract
- HA6 Fit/Gap
- Minimal Implementation Direction

### Outputs

実装時に変更してはいけない境界を明文化する。

### Must remain true

- HA6 baselineが証明可能
- Production trafficは変更しない
- HA7をまだ作らない
- migration番号をまだ決め打ちしない

### Acceptance

Contract上の曖昧点がないこと。

---

## 5. Slice 1 — Golden Rule Contract

### Goal

Design v2の意味をコード変更より先にGolden Caseとして固定する。

### Required golden scenarios

最低限以下を固定する。

#### Case A — HA6型

- Future: BUSINESS_GROWTH + LEAN_GROWTH
- IT Expectation: PRODUCTIVITY + MANAGEMENT_DECISION_SUPPORT
- Current Interest: MANAGEMENT_DECISION
- Visibility: VISIBLE_PARTIAL
- Management Connection: REPORTED_NOT_DECISION_USABLE
- Interest Theme: AI

期待:

- Future narrativeが事業拡大 + 少人数運営を表す
- AIはrecommendationではなくtechnology opportunityとしてのみ出る
- Management lensにdecision usabilityの確認価値が出る
- Unknown / FACT Candidateが出せる

#### Case B — Healthy

期待:

- 無理にGapを生成しない
- 無理にAssessmentへ誘導しない
- 「現時点で大きな問題は確認されていないが、Futureに対して必要な確認がある場合のみ示す」ことが可能

#### Case C — Solution Hypothesis

例: AI Interestあり。

期待:

- AI導入を自動推奨しない
- 実態によって運用 / 管理の確認が主になってもよい

#### Case D — Human Update

Survey初期値:
- Visibility = VISIBLE_PARTIAL

Post-Hearing Human Update:
- Visibility = RELIES_ON_OTHERS

期待:

- Original Surveyは不変
- Current Stateだけ変わる
- Re-analysis Narrativeが変わる

#### Case E — Unknown reversal

SurveyでKnown寄りだった内容がHearingで不明確になった場合、HumanがCurrent StateをUNKNOWN側へ変更できる。

### Non-goals

- DB
- UI
- API

### Acceptance

Design v2の主要意味がpure deterministic ruleとして表現可能であること。

---

## 6. Slice 2 — Survey Contract / Semantic Projection / Initial Narrative

### Goal

Q1〜Q7をDesign v2へ合わせ、Surveyだけで価値のあるInitial Analysisを生成する。

### Changes in meaning

- Q1: Company Context
- Q2: Future
- Q3: IT Expectation
- Q4: Current Interest
- Q5: Visibility
- Q6: Management Connection / Decision Usability
- Q7: Interest Theme

### Analysis axes

1. Q2 × Q5 × Q6
   - Futureに対するCurrent Understanding
2. Q2 × Q3 × Q7
   - 技術 / 運用 / 管理から見た改善可能性
3. Q4 × Q5 × Q6
   - Hearingで解像度を上げる視点

### Required outputs

- Initial Structured State
- Future Narrative
- Current Narrative
- Lens Narratives
- Initial Unknowns
- Initial FACT Candidates

### Non-goals

- Hearing結果反映
- Human Update
- DB変更

### Acceptance

Survey回答だけでInitial Report Draft相当の分析材料が生成できること。

---

## 7. Slice 3 — Immutable Original Survey / Current State / Narrative Persistence

### Goal

Design v2の3層構造をadditiveに保存できるようにする。

### Logical layers

#### A. Original Survey Snapshot

- Survey Complete時に固定
- immutable
- 回答時点の顧客認識

#### B. Current Structured State

- Originalから初期生成
- Humanが更新可能
- versioned / history-preserving

#### C. Narrative

- System Generated Narrative
- Human Edited Narrative
- edited narrativeはgenerated narrative更新時に無条件上書きしない

### Existing HA6 reuse

- `hearing_intake_response_v2`はSurvey Draftとして利用可能
- existing Case identity / provenanceを再利用

### New schema direction

具体的なtable名・migration番号はこのSlice実装開始直前にmain / Production Canonicalを再確認して決める。

### Non-goals

- Recording
- Hearing memoからの自動state update

### Acceptance

Original / Current / Generated / Editedが論理的にもDB上も区別できること。

---

## 8. Slice 4 — Post-Hearing Human Update / Re-analysis API

### Goal

Hearing後、人間がCurrent Structured Stateを更新して再分析できるようにする。

### Required actions

- Current State取得
- Q2〜Q7 current values更新
- optimistic concurrency / version guard
- deterministic re-analysis
- new Generated Narrative保存
- Existing Human Edited Narrativeがある場合はreview-needed状態にする

### Critical guard

Hearing memo / statementを読み取ってSystemが自動でCurrent Stateを更新しない。

### Acceptance

Human Update
→ deterministic re-analysis
→ narrative regeneration
が明示的な操作として成立すること。

---

## 9. Slice 5 — Coverage-based Hearing Model / UI

### Goal

HA6の固定M01〜M06質問列を、Design v2のCoverage型Hearingへ変更する。

### Live Hearing UI

2 columns:

Left:
- Original Survey
- Initial Analysisの要点

Center:
- 今回確認したい視点
- short coverage items
- optional example questions
- Hearing memo

### Coverage principle

- fixed question completionではない
- 1つの会話が複数coverage itemを満たしてよい
- Surveyですでに分かっていることを聞き直さない
- 技術 / 運用 / 管理はUI列ではなくanalysis lens

### Existing HA6 reuse

- Hearing case transition
- statement / memo保存基盤
- admin auth

### Remove from Design v2 primary flow

- Primary / Secondary Focus中心
- M01〜M06 section progression
- mandatory `questionSequence`
- structured_answer_json → Final Rule direct path

### Acceptance

営業担当が固定質問を読み上げず、Surveyを見ながら自然に確認できること。

---

## 10. Slice 6 — Post-Hearing Analysis UI

### Goal

Hearing後のHuman Analysisを1画面で行えるようにする。

### UI

3 columns:

Left:
- Original Survey
- immutable

Center:
- Hearing Record / memo

Right:
- Current Structured State
- changed / unchanged表示
- Generated Narrative
- Human Edited Narrative
- re-analysis action

### Human actions

1. OriginalとHearingを比較
2. 必要なCurrent Stateだけ変更
3. 再分析
4. Narrative確認
5. 必要なら文章編集
6. Report Draftへ進む

### Acceptance

「Surveyの選択肢を実態に合わせて必要箇所だけ直すと、Hearingを反映した分析文へ更新される」UXが成立すること。

---

## 11. Slice 7 — Report / FACT Candidate

### Goal

Current StateとNarrativeをCustomer Reportへ接続する。

### 5 chapters

1. 実現したい会社の未来
2. 現在どこまで分かっているか
3. 技術・運用・管理から見た確認ポイントと改善可能性
4. まだ分からないこと
5. 次に確認する価値があるFACT + そのFACTを確認すると何が分かりそうか

### FACT Candidate contract

各candidate:

- What to verify
- Why it matters to Future
- What may become knowable
- Related lenses[]

### Guard

- FACTではなくCandidate
- AssessmentでEvidence確認する
- solution / scope / priceを自動確定しない

### Acceptance

無料診断単体で顧客価値があり、Assessmentへ自然につながるReportになること。

---

## 12. Slice 8 — Human Review / Regression / Candidate Gate

### Goal

既存HA6の強い部分をDesign v2へ接続し、リグレッションを確認する。

### Reuse

- Human Review
- Approval
- Delivery
- Feedback
- Audit
- immutable approved report snapshot / hash

### Regression targets

- Partner Funnel
- Business Web
- Historical IT経営KAIZEN
- existing auth / admin gate
- Customer Self
- Staff Proxy
- Healthy Guard
- Solution Hypothesis Guard
- UNKNOWN Guard

### Candidate gate

ここまで全て通過してから初めてcandidate build / HA7作成可否を判断する。

Production traffic変更は別の明示承認が必要。

## 13. Explicit non-goals

Design v2実装に含めない。

- Recording
- Audio upload / storage
- Speech-to-text
- AIによるHearing memo解釈
- AIによるCurrent State自動更新
- AIによるFACT認定
- AIによるSolution決定
- 自動Assessment Scope / Price決定
- Maturity / Risk / Gap Score

## 14. Next gate

このPlanの次工程は **Slice 1 Golden Rule Contractの具体化**。

まだ以下は実行しない。

- code patch
- migration作成 / 適用
- build
- test execution
- HA7
- deploy
- Production変更
