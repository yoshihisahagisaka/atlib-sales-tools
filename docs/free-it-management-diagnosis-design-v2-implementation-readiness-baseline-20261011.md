# IT経営KAIZEN 無料診断 Design v2 — Implementation Readiness Baseline

Status: DESIGN v2 IMPLEMENTATION BASELINE / CODE NOT STARTED
Date: 2026-10-11
Branch: docs/free-diagnosis-design-v2-20261010

## 1. Decision

Design v2の上位設計は、Slice 1〜7をもって実装準備へ進める状態とする。

本書は、途中のWorking Contract間に残る表記差・旧案を整理し、実装時にどの契約を優先するかを固定する。

ここでProduction Canonicalやmainへの統合を行うものではない。

## 2. Authoritative design order

実装時の優先順位は次のとおり。

1. Slice 1 — Golden Rule Contract
2. Survey Question Contract — Q1〜Q7 Stable Semantic Codes
3. Slice 2 — Survey / Semantic Projection / Initial Analysis
4. Slice 3 — Data Model
5. Slice 4 — Post-Hearing Update / Re-analysis API
6. Slice 5 — Live Hearing UX / Coverage
7. Slice 6 — Post-Hearing Analysis UX
8. Slice 7 — Report / FACT Candidate / Human Review
9. Minimal Implementation Direction / Implementation Slice Plan

上記と矛盾する以前のWorking Example / HA6-era wordingは、上記を優先して解釈する。

## 3. Contradiction cleanup decisions

### 3.1 Recording

FINAL:

- 録音機能は不要。
- 音声ファイル保存なし。
- 文字起こしなし。
- AI音声要約なし。
- Hearing Recordはmemo / statementのみ。

以前のWorking Contractに残る `optional recording` / `recording reference` はSUPERSEDED。

### 3.2 Semantic code naming

FINAL:

Survey Question ContractのStable Semantic CodesをCanonicalとする。

Examples:

- `BUSINESS_GROWTH`
- `LEAN_GROWTH`
- `PRODUCTIVITY`
- `MANAGEMENT_DECISION_SUPPORT`
- `VISIBLE_PARTIAL`
- `RELIES_ON_OTHERS`
- `REPORTED_NOT_DECISION_USABLE`
- `STRATEGICALLY_CONNECTED`
- `AI`
- `AUTOMATION`

以前のWorking Narrative文書にある `FUTURE_GROW_BUSINESS`, `EXPECT_PRODUCTIVITY`, `THEME_AI` 等のaliasは新実装のCanonical Codeとして使わない。

### 3.3 Hearing Rule source

FINAL:

- Hearing memo / statementはreference material。
- Ruleへ直接入力しない。
- HA6のHearing Structured AnswerをFinal Ruleへ直接渡す経路はDesign v2のSource of Truthではない。
- HumanがPost-HearingでCurrent Structured Stateを更新する。
- Re-analysisはCurrent Structured Stateだけをstructured sourceとして使用する。

### 3.4 M01〜M06

FINAL:

- 顧客向けHearing chapterとして使用しない。
- 固定questionSequenceを生成しない。
- Primary / Secondary FocusをHearing進行の主単位にしない。
- 旧M01〜M06 field/tableを後方互換で保持することは可能だがDesign v2 Rule Source of Truthにはしない。

### 3.5 技術 / 運用 / 管理

FINAL:

- UIの3列ではない。
- スコアではない。
- 排他的分類ではない。
- 同一論点へ複数lensを付与可能。

### 3.6 Initial vs Post-Hearing analysis

FINAL:

別Engineを作らない。

Same analyzer:

Current Structured State
→ Deterministic Analysis
→ Analysis Result
→ Narrative

Survey完了直後は `Current State = Original Survey`。
Post-HearingではHuman更新後のCurrent Stateを同じAnalyzerへ渡す。

### 3.7 Original Survey

FINAL:

- 回答途中のdraft upsertは許容。
- Survey Complete時にimmutable Original Survey Snapshotを固定。
- Post-HearingでOriginalを修正しない。
- 認識変更はCurrent Structured State revisionとして保存。

### 3.8 Narrative

FINAL:

- System Generated NarrativeとHuman Edited Narrativeを分離。
- Current State変更後はSystem Narrativeを新revisionとして再生成。
- 既存Human Editを自動上書きしない。
- 古いHuman Editは `STALE_REVIEW_REQUIRED`。
- STALEのままApproval不可。

### 3.9 FACT semantics

FINAL:

Survey / Hearing / NarrativeはFACTではない。

Free Diagnosis:

Future
→ Current Understanding
→ Possibility / UNKNOWN
→ Where to look
→ FACT Candidate
→ Expected learning from verification

Assessment:

Evidence
→ Verification
→ FACT / UNKNOWN
→ Finding / Gap
→ Human Decision material

## 4. Final UX baseline

### Live Hearing — 2 columns

Left:
- 最初の回答 / Original Survey

Center:
- 今回確認したい視点
- optional example question
- Hearing memo / statement

Do not show editable Current State during live conversation.

### Post-Hearing Analysis — 3 columns

Left:
- 最初の回答 / Original Survey

Center:
- ヒアリング記録

Right:
- 現在の理解 / Current Structured State
- Originalとの差分
- 再分析
- Generated Narrative
- 技術 / 運用 / 管理 lens result
- UNKNOWN
- FACT Candidate
- Human text edit

## 5. Final Report baseline

Customer Report sections are fixed:

1. 実現したい会社の未来
2. 現在どこまで分かっているか
3. 技術・運用・管理から見た確認ポイントと改善可能性
4. まだ分からないこと
5. 次に確認する価値があること

Internal Section 5 object is FACT Candidate.

Each FACT Candidate contains:

- What to verify
- Why it matters to Future
- What may become knowable
- Related lenses

No forced cardinality except Section 1 / 2 narrative.
Healthy Case may have few or zero UNKNOWN / FACT Candidates.

## 6. Human Decision baseline

Human is responsible for:

- Current Structured State update
- Narrative edit
- Human-added report item
- Report Review
- Approval
- Decision whether to proceed to Assessment

System is responsible for:

- deterministic semantic projection
- deterministic analysis
- possibility / UNKNOWN / FACT Candidate suggestion
- deterministic narrative generation
- provenance / revision tracking

System must not:

- auto-certify FACT
- auto-decide Solution
- auto-decide Assessment Scope
- auto-change Current State from memo text

## 7. HA6 reuse boundary

KEEP:

- Customer / Contact / Sales Activity / Case
- Customer Self / Staff Proxy paths
- auth / admin guard
- deterministic execution history concept
- Hearing statement storage concept
- Healthy / UNKNOWN guards where semantics still match
- Human Review / Approval / Delivery / Feedback / Audit
- approved report immutable snapshot / hash
- same-case integrity

ADAPT:

- Q1〜Q7
- semantic projection
- analysis rules
- admin UI
- report content
- review UI
- next-confirmation representation

REPLACE AS CORE FLOW:

- M01〜M06 fixed hearing catalog
- fixed question sequence
- Primary / Secondary Focus-driven hearing
- Hearing Structured Answer → Final Rule direct path
- mutable intake rows as Original Survey truth

ADD:

- immutable Original Survey Snapshot
- versioned Current Structured State
- Analysis Result revision
- Generated Narrative revision
- Human Edited Narrative revision / stale handling
- multi-lens analysis
- structured FACT Candidate

## 8. Minimal implementation package boundary

Implementation should be split into bounded packages and should not combine everything into one HA7-sized rewrite.

### Package A — Pure Design v2 Domain Core

No DB dependency.

Target concepts:

- Q1〜Q7 types / stable semantic codes
- semantic projection
- deterministic analyzer
- narrative generator
- Golden cases

Expected new module direction:

- `src/domain/freeDiagnosisDesignV2.ts`
- `src/domain/freeDiagnosisSemanticProjectionV2.ts`
- `src/domain/freeDiagnosisAnalysisV2.ts`
- `src/domain/freeDiagnosisNarrativeV2.ts`

Names are implementation candidates; semantic boundaries are fixed.

### Package B — Persistence / provenance

Additive only.

- Original Survey Snapshot
- Current State revisions
- Analysis revisions
- Generated Narrative revisions
- Human Edit revisions

Do not modify or rerun migrations 027〜032.
Use the next confirmed unused migration number only after main / Production migration state is re-verified.

### Package C — API

- read Design v2 analysis workspace
- append Current State revision
- run deterministic re-analysis
- save Human Edited Narrative
- prepare Review Draft

### Package D — Admin UX

- Live Hearing 2-column
- Post-Hearing 3-column
- Human Review with stale guard

### Package E — Report / approval integration

- 5-section report
- FACT Candidate
- existing Approval / Delivery / Feedback / Audit reuse

## 9. Implementation entry gate

Before production code changes begin, confirm only the following operational facts from the HA6 local worktree:

- exact target implementation worktree / branch to use
- clean status
- current main / production canonical relationship
- whether implementation will branch from HA6 commit or from a later canonical commit containing HA6 assets
- next unused migration number if Package B is reached

These are factual repository/deployment checks, not product-design tasks.

If branch/base ambiguity exists, STOP before coding.

## 10. Readiness verdict

**DESIGN v2: READY FOR BOUNDED IMPLEMENTATION**

The remaining uncertainty is repository / canonical integration mechanics, not product design.

No further product redesign should be delegated to Work.
Work may be used for factual source/base verification, bounded patch application where necessary, build/test/regression, and release verification.

## 11. Current STOP

This readiness verdict does not authorize automatically:

- migration creation/application
- HA7
- build/deploy
- Production traffic change

The next action is to resolve the implementation base/canonical repository factually, then start Package A with Golden tests and pure Domain Core only.
