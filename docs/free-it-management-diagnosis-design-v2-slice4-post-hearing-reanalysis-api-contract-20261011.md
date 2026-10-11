# IT経営KAIZEN 無料診断 Design v2 — Slice 4 Post-Hearing Human Update / Deterministic Re-analysis API Contract

Status: DESIGN v2 IMPLEMENTATION CONTRACT / NO PRODUCTION CODE YET
Date: 2026-10-11
Branch: docs/free-diagnosis-design-v2-20261010

## 1. Purpose

本書は、60分Hearing後にHumanがCurrent Structured Stateを更新し、同一のdeterministic analyzerで再分析し、NarrativeとReport Draftへ接続するためのAPI／操作契約を固定する。

対象はPost-Hearing Analysisであり、録音・文字起こし・AI自動解釈は対象外とする。

Design v2の中核は以下。

Original Survey Snapshot (immutable)
→ Hearing Record (memo / observation)
→ Human Updated Current Structured State
→ deterministic re-analysis
→ Analysis Result
→ System Generated Narrative
→ Human Edited Narrative
→ Report Draft

Hearing Recordは参照材料でありRule Sourceではない。

---

## 2. Core invariants

以下はAPI層でも必ず守る。

1. Original Survey Snapshotは更新しない。
2. Current Structured StateはHuman actionでのみ新revisionを作成する。
3. Hearing memo本文をSystemが自動semantic化してCurrent Stateへ反映しない。
4. Re-analysisはCurrent Structured Stateのみを主Rule Inputとする。
5. Initial AnalysisとPost-Hearing Re-analysisは同じDesign v2 analyzerを使用する。
6. System Generated NarrativeとHuman Edited Narrativeを分離する。
7. Current State変更後に旧Human Edited Narrativeを無条件上書きしない。
8. Healthy CaseではProblem / Gap / Assessment需要を強制しない。
9. Interest ThemeからSolutionを自動決定しない。
10. HumanがApproveするまでCustomer Reportの正本とはしない。

---

## 3. Post-Hearing Analysis UI assumptions

Post-Hearing画面は3列を前提とする。

### Left — Original Survey

- immutable
- Q1〜Q7を表示
- Survey回答時の認識を保持
- Current Stateと差がある場合、差異を視覚表示してよい

### Center — Hearing Record

- Hearing memo / statement
- operator note
- 会話で得た具体例
- Ruleへ直接入力しない
- recording機能は持たない

### Right — Current State / Analysis

- Q2〜Q7 Current Structured State
- Current supplement / clarification
- System Generated Narrative
- 技術 / 運用 / 管理lens
- UNKNOWN
- FACT Candidate
- Human Edited Narrative

HumanはCenterを参照し、Rightだけを更新する。

---

## 4. API responsibility separation

Post-Hearingでは操作を最低でも以下へ分離する。

A. Read Analysis Workspace
B. Save Current Structured State Revision
C. Run Deterministic Re-analysis
D. Read Analysis Result / Generated Narrative
E. Save Human Edited Narrative
F. Build / Refresh Report Draft

1つの巨大endpointで全操作を暗黙実行しない。

ただし実装上のHTTP endpoint数は既存route構成へ合わせてよい。重要なのは責務分離である。

---

## 5. A — Read Analysis Workspace

Conceptual operation:

`GET /admin/free-diagnosis/cases/:caseId/post-hearing-analysis`

名称は実装時に既存route規約へ合わせてよい。

### Response requirements

少なくとも以下を返す。

- case summary
- originalSurveySnapshot
- hearingRecords
- currentStructuredState
- currentStateRevision
- currentAnalysisResult
- systemGeneratedNarrative
- humanEditedNarrative
- narrativeFreshness
- reportDraftStatus
- humanReviewStatus

### Important

originalSurveySnapshot と currentStructuredState は別objectとして返す。

フロント側でOriginalをCurrentへコピーして疑似的に分離する設計は不可。

---

## 6. B — Save Current Structured State Revision

Conceptual operation:

`POST /admin/free-diagnosis/cases/:caseId/current-state-revisions`

### Request

最低限以下を持つ。

- baseRevisionId or expectedRevision
- updatedByUserId / operator identity
- answers:
  - Q2 Future
  - Q3 IT Expectation
  - Q4 Current Interest
  - Q5 Visibility
  - Q6 Management Connection
  - Q7 Interest Theme
- supplements (optional, non-rule text)
- changeReason (optional Human note)

Q1 Company Contextは原則Current State編集対象外とする。
会社情報自体を訂正する必要がある場合は別責務で扱い、診断意味更新と混ぜない。

### Validation

- Q2/Q3/Q7 MULTI_SELECT制約
- Q4/Q5/Q6 SINGLE_SELECT制約
- UNDECIDED / UNKNOWNとの排他制御
- Stable Semantic Codeのみ許可
- Original Survey Snapshotそのものは更新不可

### Concurrency

Current Stateはrevisionedとし、expected revision mismatch時は409相当で競合を返す。

最後に保存した人の内容で無条件上書きしない。

### Save semantics

- INSERT new revision
- old revision remains immutable
- latest pointerは導出または安全に更新
- auditを残す

---

## 7. Current State initialization

初回Current Structured StateはSurvey完了後に作る。

Initial Current State = Original SurveyのQ2〜Q7 semantic state

ただし、Original Survey Snapshotと同一データを別objectとして持つ。

理由:

- Originalはhistorical source
- Currentはdiagnosis-time working state

同じ値でも意味上は別レイヤーである。

---

## 8. C — Run Deterministic Re-analysis

Conceptual operation:

`POST /admin/free-diagnosis/cases/:caseId/reanalyze`

### Input source

Systemが取得するRule Sourceはlatest Current Structured State revision。

Hearing memo / operator note / free textはRule Inputへ渡さない。

### Analyzer

Slice 2で定義したDesign v2 analyzerをInitial / Post-Hearing共通で使用する。

Input:
- Company Context (supplemental)
- Current Structured State Q2〜Q7

Output:
- Future Summary
- Current Understanding
- Lens Analyses
  - TECHNOLOGY
  - OPERATION
  - MANAGEMENT
- UNKNOWN items
- Hearing / Confirmation Viewpoints
- FACT Candidates
- Guard outcomes
- rule provenance / rule version

### Determinism

同一Rule Version + 同一Current Stateなら同じAnalysis Resultとなること。

AI生成を挟まない。

---

## 9. Re-analysis transaction boundary

推奨される論理順序:

1. Current State Revisionを保存
2. revision idを確定
3. analyzerを実行
4. Analysis Resultをそのrevisionへ紐づけて保存
5. System Generated Narrativeを生成し保存
6. old Human Edited Narrativeを必要に応じSTALE扱いへ
7. auditを保存

### Failure behavior

Current State保存成功後にanalysis生成が失敗した場合、Current Stateをロールバックして消さない。

状態として、

- Current State saved
- Analysis pending / failed

を区別できるようにする。

Human入力をSystem処理失敗で失わない。

---

## 10. D — Analysis Result / Generated Narrative

Re-analysis後に返す／取得できる内容:

### Structured Result

- `futureSummary`
- `currentUnderstanding`
- `lenses[]`
- `unknowns[]`
- `viewpoints[]`
- `factCandidates[]`
- `healthyGuard`
- `recommendationGuard`
- `ruleVersion`
- `sourceCurrentStateRevisionId`

### Lens object

例:

- lens: TECHNOLOGY | OPERATION | MANAGEMENT
- status: POSSIBILITY | CONFIRMATION_VALUE | NO_IMPORTANT_GAP_IDENTIFIED 等
- narrative fragment
- source semantic codes
- related fact candidate ids

1論点に複数lensが付いてよい。

### FACT Candidate

最低限:

- id
- whatToVerify
- whyItMattersToFuture
- whatMayBecomeKnowable
- relatedLenses[]
- sourceRuleIds[]

FACT認定フラグは持たせない。

---

## 11. System Generated Narrative

Structured Analysis Resultからdeterministicに生成する。

### Required sections

1. Future Narrative
2. Current Understanding Narrative
3. 技術 / 運用 / 管理から見た確認ポイントと改善可能性
4. UNKNOWN Narrative
5. Next FACT Candidate Narrative

Narrative versionは以下へ紐づく。

- Current State Revision
- Analysis Result Version
- Rule Version

System Generated Narrative自体は上書きせずversioned保存を優先する。

---

## 12. Human Edited Narrative

Conceptual operation:

`POST /admin/free-diagnosis/cases/:caseId/narrative-edits`

### Request

- sourceGeneratedNarrativeVersionId
- edited sections
- editedByUserId
- optional edit note

### Rules

- Human EditはStructured Stateを変更しない
- Human EditはAnalysis Resultを変更しない
- Human EditはFACT化しない
- Human EditはHuman Reviewの対象となる

### Re-analysis after Human Edit

Current Stateが後から変更され、新Generated Narrativeが作られた場合:

旧Human Edited Narrativeは削除しない。

状態例:

- CURRENT
- STALE_REVIEW_REQUIRED
- SUPERSEDED

少なくとも「現在のGenerated Narrativeと一致しない可能性がある」ことが分かればよい。

---

## 13. Change diff requirement

Post-Hearing Analysis UIではOriginalとCurrentの差を表示できるようにする。

最低限Humanが理解できる形で:

- unchanged
- changed
- added
- removed

をQ2〜Q7単位で表現できること。

例:

Q5
Original: VISIBLE_PARTIAL
Current: RELIES_ON_OTHERS

Q7
Original: AI
Current: AI + AUTOMATION

差分は意味理解支援用であり、スコア化しない。

---

## 14. Supplements

Current StateにHuman supplement textを持たせてよい。

例:

Q6 Current = MANAGED_NOT_REPORTED
Supplement:
「費用と障害情報は都度確認できるが、更新計画や投資予定は定期共有されていない」

重要:

- supplementはNarrative具体化の参考表示には使える
- deterministic semantic decisionを自由文解析で変更しない
- supplementからAIが新semanticを自動生成しない

初回実装ではRule Input外とする。

---

## 15. Audit requirements

少なくとも以下を追跡可能にする。

- Original Survey completion
- Current State revision creation
- who changed what / when
- re-analysis execution
- rule version
- Generated Narrative version
- Human Edit creation
- Human Review / Approval

既存HA6 audit基盤を可能な限り再利用する。

---

## 16. Human Review boundary

Re-analysis完了はReport承認ではない。

Systemは以下を自動でCustomer-facing finalにしない。

- Current State revision
- Analysis Result
- Generated Narrative
- Human Edited Narrative

Report Draft作成後に既存Human Review / Approvalを通す。

FACT CandidateがあることとAssessment実施決定も同義ではない。

---

## 17. Error / guard cases

### No Current State

Survey完了済みだがCurrent State未生成の場合:
- Original Snapshotから初期Current Stateを作る明示操作またはservice recoveryを行う
- Hearing memoから生成しない

### Invalid semantic code

400相当。

### Revision conflict

409相当。

### Re-analysis failure

Current Stateを保持し、analysis statusをFAILED / PENDINGにする。

### No meaningful gap

Healthy outcomeを正しく返す。
FACT Candidateを無理に生成しない。

### Q7 AI only

AI Recommendationを生成しない。
関心テーマとして扱うのみ。

---

## 18. HA6 assets to reuse

実装時に優先再利用するもの:

- Admin auth / guard
- Case lookup / integrity
- existing case repository patterns
- append-only hearing statement storage
- audit log patterns
- Rule execution history patterns
- Report Draft / Human Review / Approval / Delivery / Feedback

変更対象となるもの:

- Hearing Structured Answer → Final Rule direct path
- M01〜M06 final rule dependency
- Report generation source assumptions

---

## 19. Minimum API acceptance scenarios

実装後は少なくとも以下をGolden / integration levelで確認する。

1. Original SurveyとCurrent Stateが別objectで返る
2. Hearing後にQ5だけ変更してrevision作成できる
3. Q5変更後のre-analysisでCurrent Narrativeが変わる
4. Original Surveyは変わらない
5. Hearing memo本文を変更しても、Current State未変更ならanalysis semanticは変わらない
6. Q7 AI追加だけでAI導入Recommendationにならない
7. Healthy Current StateでProblemを強制生成しない
8. Human Edit後にCurrent State変更→旧Human EditがSTALEになる
9. revision conflictが無条件上書きにならない
10. analysis失敗でもHumanが保存したCurrent Stateが失われない
11. FACT CandidateがWhat / Why / Expected Learning / Lensを持つ
12. Human Review前にCustomer Report finalizedにならない

---

## 20. Non-goals

Slice 4には含めない。

- recording
- speech-to-text
- AI summary
- AI semantic extraction
- migration作成
- Production schema適用
- UI実装
- Report文面最終調整
- HA7 build / deploy

---

## 21. STOP gate

この文書でSlice 4の操作契約を固定する。

次工程はSlice 5のLive Hearing UX / Coverage Contract。

まだProduction Code、migration、test実行、build、HA7、deploy、traffic変更は行わない。
