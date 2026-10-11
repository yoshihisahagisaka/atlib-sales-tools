# IT経営KAIZEN 無料診断 Design v2 — Slice 7 Report / FACT Candidate / Human Review Contract

Status: DESIGN v2 IMPLEMENTATION CONTRACT / NO IMPLEMENTATION YET
Date: 2026-10-11
Branch: docs/free-diagnosis-design-v2-20261010

## 1. Purpose

本書は、Post-Hearing AnalysisでHumanがCurrent Structured Stateを確定し、Deterministic Re-analysisを実行した後、その結果を顧客向け5章レポートへ接続し、Human Review / Approval / Deliveryまで一貫して扱うための契約を定義する。

Design v2の無料診断は、課題を断定したり解決策を決めるためのものではない。

最終的に顧客へ返す価値は、

- 実現したいFuture
- 現在どこまで見えているか
- 技術 / 運用 / 管理から見た確認ポイントと改善可能性
- まだ分からないこと
- 次に確認する価値があるFACTと、その確認によって何が分かりそうか

を整理することである。

## 2. Source of truth for Report Draft

Report DraftはOriginal Surveyから直接生成しない。

Canonical flow:

Original Survey Snapshot (immutable)
→ Initial Current Structured State
→ Initial Analysis / Narrative
→ Hearing Record
→ Human Updated Current Structured State
→ Deterministic Re-analysis
→ Analysis Result
→ System Generated Narrative
→ Human Edited Narrative where needed
→ Report Draft
→ Human Review / Approval
→ Customer Report

Report DraftのSource of Truthは、最新のCurrent Structured Stateに紐づく最新Analysis ResultとNarrativeである。

Hearing memoは、Humanが内容を確認しCurrent Structured StateやHuman Edited Narrativeへ反映するためのreferenceであり、Report Generatorが直接意味解釈して利用しない。

録音・文字起こし・AI要約はDesign v2の対象外とする。

## 3. Customer Report — fixed five sections

顧客向け無料診断レポートは以下の5章を基本構造とする。

### Section 1 — 実現したい会社の未来

Purpose:

- Current Q2 Futureを中心にFutureを整理する。
- Current Q3 IT Expectationを用いて、Futureに対してITへ何を期待しているかを表す。
- IT製品やSolutionから始めない。

Allowed example:

> 事業を拡大しながら、少人数でも無理なく成長・運営できる会社を目指しています。その実現に向けて、ITには業務生産性の向上と経営判断を支える役割を期待しています。

### Section 2 — 現在どこまで分かっているか

Purpose:

- Current Q5 Visibility
- Current Q6 Management Connection / Decision Usability

を中心に、経営として現在どこまで状況が見え、判断につながっていると理解しているかを整理する。

Rules:

- FACTとして断定しない。
- 良い / 悪いの採点をしない。
- Original SurveyではなくPost-HearingのCurrent Structured Stateを使う。

### Section 3 — 技術・運用・管理から見た確認ポイントと改善可能性

3つは排他的分類ではなくlensである。

#### 技術 lens

自動化、AI、データ活用、連携、システム変更等でFutureを支えられる可能性を見る。

#### 運用 lens

仕事の進め方、情報の流れ、確認、承認、属人化、手作業、負担等がFutureを支えられるかを見る。

#### 管理 lens

管理、報告、責任、投資・更新計画、経営判断、事業計画との接続を見る。

Rules:

- 1つの論点に複数lensを付けてよい。
- 各lensに必ずProblemを出してはいけない。
- Healthy Caseでは「現時点で明確な改善事項は確認されなかった」と表現してよい。
- Q7 Interest Themeだけを根拠にSolution Recommendationを出さない。

### Section 4 — まだ分からないこと

Purpose:

- 無料診断終了時点でも未確認のことを明示する。
- UNKNOWNとProblemを分離する。

Rules:

- 「分からない」は失点ではない。
- Hearingで解消されたUNKNOWNは残さない。
- Hearingで新たに曖昧さが判明した場合は追加できる。

### Section 5 — 次に確認する価値があるFACT

Purpose:

無料診断の最終価値を「次に何を確認すれば経営判断が進むか」へ接続する。

Each FACT Candidate must contain:

- What to verify
- Why it matters to Future
- What may become knowable after verification
- Related lenses: 技術 / 運用 / 管理 (multi-select)

Example:

> 月次集計に必要な作業時間と情報収集経路を確認することで、事業拡大時に負担が集中する箇所があるか、自動化・AI・運用見直しのどの方向を検討する価値があるかを判断する材料が得られそうです。

Not allowed:

> このFACTを確認すればAI導入が必要だと判断できます。

無料診断はSolutionを先に決めない。

## 4. Report item cardinality

機械的に全欄を埋めることを禁止する。

- Section 1: 原則1 narrative
- Section 2: 原則1 narrative
- Section 3: lensごとに0..n item
- Section 4: 0..n UNKNOWN
- Section 5: 0..n FACT Candidate

Healthy CaseではSection 4 / 5が0件または少数でも正しい。

営業上Assessmentへつなげる目的だけでFACT Candidateを追加しない。

## 5. Narrative precedence

Report Draftへ採用する文章は次の優先順位とする。

1. Human Edited Narrative — latest Current Stateに対してREVIEWED / CURRENT
2. System Generated Narrative — latest Current Stateに対する最新生成版

Human Edited NarrativeがSTALE_REVIEW_REQUIREDの場合、そのままCustomer Reportへ確定できない。

Humanは以下のいずれかを選ぶ。

- 維持して再確認済みにする
- 最新System Generated Narrativeを基に修正する
- 破棄してSystem Generated Narrativeへ戻す

SystemはHuman Edited Narrativeを自動上書きしない。

## 6. Human Review purpose

Human Reviewは単なる文章校正ではない。

Human Reviewの責任は、

- Current Structured StateがHearing後の理解として妥当か
- Analysis ResultがRule Contractに沿っているか
- Narrativeが顧客へ誤解を与えないか
- Problem / FACT / UNKNOWNを混同していないか
- Q7 InterestをSolution Recommendationへ変換していないか
- FACT CandidateがFutureとつながっているか
- 不要なAssessment誘導が入っていないか

を人間が確認することである。

FACTの真偽をHuman Reviewだけで認定するものではない。

## 7. Human Review operations

Human Reviewでは少なくとも以下を可能とする。

- wording edit
- Hearing Recordに基づく具体的説明の追加
- Generated itemのkeep / omit
- FACT Candidate wording edit
- 不要なFACT Candidateの除外
- Human judgmentによる追加Narrative
- Human judgmentによる追加FACT Candidate

Humanが新しい項目を追加する場合、System Generatedと区別可能なprovenanceを持つ。

Suggested provenance:

- SYSTEM_GENERATED
- HUMAN_EDITED
- HUMAN_ADDED

Human-added contentも自動的にFACTにはならない。

## 8. Approval gate

Customer Reportを確定できる条件:

1. latest Current Structured Stateに対するAnalysis Resultが存在する
2. latest Generated Narrativeが存在する
3. STALE_REVIEW_REQUIREDなHuman Edited Narrativeが未解決でない
4. Human Reviewが完了している
5. Review完了後にCurrent Structured Stateが変更されていない

Current Structured Stateが変更された場合:

- Analysis / Narrativeを再生成
- Report Draftは要再確認
- 以前のApprovalはそのまま再利用しない

## 9. Approved Report immutability

HA6の既存Human Review / Approved Report / snapshot / hash基盤は再利用方向とする。

Approval後はCustomer Report versionをimmutableに固定する。

変更が必要な場合は、承認済み版を書き換えず新Report versionを作る。

最低限保持するprovenance:

- case_id
- report_version
- source current_state_revision
- source analysis_revision
- source generated_narrative_revision
- source human_edit_revision where used
- approved_by
- approved_at
- content snapshot / hash

## 10. Healthy Case contract

Free Diagnosisは必ず問題を発見するサービスではない。

Healthy Caseでは、例えば次のようなReportを正とする。

> 現時点では、経営判断に必要なIT情報が大きく不足している状況や、直ちに改善が必要な明確な課題は確認されませんでした。今後の事業計画やIT環境の変化に応じて、現在の管理・運用を継続できる状態かを確認していくことに価値があります。

この場合:

- Gapを捏造しない
- FACT Candidateを水増ししない
- Assessmentを強く推奨しない

## 11. Solution Interest guard

Q7 = AI / AUTOMATION / CLOUD / SECURITY 等はInterestである。

Allowed:

> AI・自動化が生産性向上の選択肢となる可能性があります。どの業務へ適用する価値があるかは、実際の業務内容を確認する必要があります。

Not allowed:

> AIを導入すべきです。

Human ReviewでもこのGuardを解除しない。

HumanがSolution仮説を持つ場合も、Customer Report上は「可能性 / 確認価値」として扱う。

## 12. Assessment bridge

Free DiagnosisからAssessmentへの接続は、営業CTAではなく診断結果から自然に理解できる形にする。

Concept:

> 無料診断で「どこを確認する価値があるか」までは整理できた。
> Assessmentでは、そのFACTをEvidenceで確認し、人間が経営判断できる材料を揃える。

Free Diagnosis Reportは以下を自動決定しない。

- Assessment実施必須
- Assessment Scope
- 優先順位
- 製品 / SaaS / AI / 開発手法
- 価格

Assessmentへ進むか、何を確認するかはHuman Decisionを介する。

## 13. Human Review UI direction

既存HA6のReport Draft / Review / Approval基盤を再利用するが、意味をDesign v2へ合わせる。

推奨表示順:

1. Current Structured State summary
2. Current vs Original changes
3. Analysis Result summary
4. Section 1〜5 Report Draft
5. System Generated / Human Edited indication
6. STALE warning if any
7. Human edit controls
8. Approval

内部用語を顧客向けUIへ露出しない。

Customer-facing labels:

- 実現したい会社の未来
- 現在どこまで分かっているか
- 技術・運用・管理から見た確認ポイントと改善可能性
- まだ分からないこと
- 次に確認する価値があること

内部ではFACT Candidateと呼んでもよいが、顧客表示は「次に確認する価値があること」を基本とする。

## 14. Delivery / Feedback reuse

HA6の既存Delivery / Feedback / Audit資産は原則KEEPする。

Design v2で変更するのはReport内容とSource provenanceであり、既存の送付記録・Feedback導線・Audit思想を再設計し直さない。

## 15. HA6 implementation mapping — design-only

Later implementation should preferentially reuse:

- `src/services/vs1ReviewReportFeedbackRepo.ts`
- `src/domain/diagnosisReport.ts`
- existing report approval / delivery / feedback schema and audit
- existing approved snapshot / hash behavior

But the current HA6 5-section meaning must be adapted to this Design v2 contract.

Do not preserve old Gap / Root Cause / KAIZEN section semantics merely for backward compatibility in the new Design v2 report.

## 16. Acceptance conditions for Slice 7

Slice 7 design is considered satisfied when all of the following are true:

1. Report has the fixed five Design v2 sections.
2. Report Draft uses latest Current State, not Original Survey directly.
3. System Generated and Human Edited narratives are distinguishable.
4. STALE Human Edit cannot silently reach approval.
5. Healthy Case can produce no-problem output.
6. Q7 Interest cannot become automatic recommendation.
7. Each FACT Candidate has What / Why Future / What becomes knowable / lenses.
8. Report approval becomes invalid for a newer Current State revision.
9. Approved Report is immutable/versioned.
10. Assessment remains a separate evidence-verification phase decided by humans.
11. Recording / transcript / AI summary are not required or designed.

## 17. STOP gate

At this document stage, do not perform:

- production code patch
- migration creation / application
- test execution
- HA7
- build
- deploy
- Cloud Run change
- Production traffic change

Next step after Slice 7 is the final Design v2 implementation-readiness review across Slice 1〜7, including contradiction cleanup and a minimal implementation package boundary before any code changes begin.
