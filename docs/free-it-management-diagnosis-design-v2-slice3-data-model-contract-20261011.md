# IT経営KAIZEN 無料診断 Design v2 — Slice 3 Data Model Contract

Status: DESIGN v2 IMPLEMENTATION CONTRACT / NO MIGRATION YET
Date: 2026-10-11

## 1. Purpose

Design v2の中核である以下4層を、HA6の既存Case / Survey / Hearing / Review / Report基盤を壊さず追加できる形で固定する。

1. Original Survey Snapshot — 顧客/営業が回答を確定した時点の不変な原本
2. Current Structured State — Hearing後にHumanが更新できる現在の構造化認識
3. System Generated Narrative — Current Structured Stateから決定論的に生成した分析文
4. Human Edited Narrative — Humanが実態に合わせて修正した顧客向け分析文

Hearing memoはこの4層とは別のObservation / Recordであり、Ruleへ直接入力しない。
録音機能はDesign v2の対象外とする。

---

## 2. Core information model

Design v2では、以下を混同しない。

```text
Survey Draft
  ↓ complete
Original Survey Snapshot (immutable)
  ↓ initialize
Current Structured State v1
  ↓ deterministic analyzer
System Generated Narrative v1

60-minute Hearing
  ↓ memo / statements only
Human reviews Original + Hearing Record
  ↓ if needed
Current Structured State v2, v3 ...
  ↓ same deterministic analyzer
System Generated Narrative v2, v3 ...
  ↓ optional human edit
Human Edited Narrative v1, v2 ...
  ↓ Human Review
Report Draft
  ↓ approve
Approved Customer Report Snapshot
```

重要：

- Original SurveyはHearing後も変えない。
- Hearing Record自体がCurrent Structured Stateを書き換えない。
- Current Structured Stateの更新はHuman actionのみ。
- Initial AnalysisとPost-Hearing Analysisは同じAnalyzerを使う。
- Narrative編集でSemantic Stateは変わらない。
- Narrative編集でFACTに昇格しない。

---

## 3. Existing HA6 assets and role

### Reuse as Survey Draft / intake transport

HA6の `hearing_intake_response_v2` は、回答入力中またはCase作成時のstructured answer envelopeとして再利用できる。

現行upsertはOriginal Surveyの正本にはしない。

Design v2では、Survey Complete時にこの入力を読み取り、別のimmutable snapshotを作る。

### Reuse as Hearing Record

HA6の `hearing_statement_v2` / memo系基盤は、Hearing Recordとして再利用する。

- statement text
- operator note
- timestamp / author / provenance

を保持できることは有用。

ただし `structured_answer_json` をDesign v2 Analyzerへ直接渡す既存経路は、Design v2のRule Source of Truthにしない。

### Reuse downstream assets

- Case
- Rule execution / audit
- Human Review
- Report Draft
- Approval
- Delivery
- Feedback
- Approved Report snapshot/hash

は原則再利用する。

---

## 4. Logical Entity A — Original Survey Snapshot

### Role

回答確定時点の「その人がその時どう答えたか」を保存する歴史的原本。

Survey AnswerはFACTではないが、後から上書きしてはいけない。

### Creation timing

Survey Complete / Staff Proxy Completeの1回だけ作成する。

回答途中の変更はSnapshot作成前なので許可する。
Snapshot作成後に認識訂正が発生してもOriginalを修正せず、Current Structured Stateを変更する。

### Logical fields

最低限以下を持つ。

- `id`
- `case_id`
- `survey_version`
- `entry_channel` — customer_self / staff_proxy
- `answered_by_role`
- `entered_by_user_id` nullable
- `answers_json`
- `submitted_at`
- `created_at`
- `content_hash` recommended

`answers_json` はQuestion Contractに沿ったQ1〜Q7のCanonical Semantic Codeを保持する。

### Invariants

- Caseあたり有効なOriginal Survey Snapshotは1つ。
- application business operationからUPDATEしない。
- 再回答・訂正でもOriginalは上書きしない。
- retention/deletion policyによる削除はimmutabilityとは別のgovernance operationとして扱う。
- Q7 free textをDesign v2 Originalとして正本化しない。Design v2ではstructured multi-selectを保存する。

---

## 5. Logical Entity B — Current Structured State

### Role

「診断時点で、Hearingも踏まえてHumanが現在そう認識している構造化状態」。

Original Surveyとの差分をHumanが明示的に更新するためのRule Source of Truth。

### Initial state

Original Survey Snapshot完成時に、Q2〜Q7を同じ値で初期化する。

Q1 Company ContextはOriginal Snapshot / Case contextから参照し、Current Structured StateのHuman更新対象には原則含めない。

### Human-updatable scope

HumanはQ2〜Q7について、Question Contractと同じ選択肢体系で以下を行える。

- SINGLE_SELECTの変更
- MULTI_SELECTの追加/削除
- UNKNOWN / UNDECIDEDへの変更
- UNKNOWN / UNDECIDEDから具体値への変更

### Supplemental note

各QuestionにHuman補足メモを付けてもよい。

ただし補足メモはDeterministic Ruleの入力にはしない。
補足メモをSystemが自動解釈してSemantic Codeを変更しない。

### Versioning

Current Structured Stateは上書きではなくversioned / append-orientedとする。

最低限以下を持つ。

- `id`
- `case_id`
- `revision_no`
- `source_type` — INITIAL_FROM_ORIGINAL / HUMAN_UPDATE
- `based_on_original_snapshot_id`
- `previous_state_id` nullable
- `state_json`
- `supplement_json` nullable
- `updated_by_user_id` nullable for system initialization
- `change_reason` nullable
- `created_at`

### State JSON scope

`state_json` のRule InputはCanonical Semantic Codeだけとする。

- Q2 Future
- Q3 IT Expectation
- Q4 Current Interest
- Q5 Visibility
- Q6 Management Connection / Decision Usability
- Q7 Interest Theme

### Invariants

- revision_noはCase内で単調増加。
- 過去revisionをUPDATEしない。
- 最新revisionだけがAnalyzerの入力となる。
- SystemはHearing memoから自動revisionを作らない。
- Human Updateの履歴が追える。
- Original Surveyとの差分が復元可能である。

---

## 6. Logical Entity C — Analysis Result

Narrativeだけを保存する前に、Analyzerが生成した構造化分析結果を持つ。

### Role

Current Structured Stateに対するdeterministic calculation result。

最低限以下を含む。

- Future Summary data
- Current Understanding data
- Lens Findings / Possibilities
  - TECH
  - OPERATION
  - MANAGEMENT
  - 同一項目に複数lens可
- UNKNOWN items
- Hearing Viewpoints
- FACT Candidates

### FACT Candidate contract

各Candidateは少なくとも以下を持つ。

- `what_to_verify`
- `why_it_matters_to_future`
- `what_may_become_knowable`
- `related_lenses[]`

必要に応じてsource question / rule idを持ってよい。

### Provenance

最低限以下を持つ。

- `case_id`
- `current_state_id`
- `analyzer_version`
- `rule_set_version`
- `analysis_json`
- `created_at`

同じCurrent State + Analyzer Version + Rule Set Versionからは同じ結果が得られることを前提とする。

---

## 7. Logical Entity D — System Generated Narrative

### Role

Analysis Resultを顧客に読める文章へ決定論的に組み立てたもの。

### Sections

Report Contractと接続できる単位で保持する。

1. Future
2. Current Understanding
3. 技術・運用・管理から見た確認ポイントと改善可能性
4. UNKNOWN
5. FACT Candidate / Expected Learning

### Logical fields

- `id`
- `case_id`
- `current_state_id`
- `analysis_result_id`
- `narrative_version`
- `content_json`
- `generator_version`
- `created_at`

### Invariants

- Generated Narrative自体は生成後にUPDATEしない。
- Current Stateが変わったら新しいAnalysis Result / Narrativeを作る。
- 古いGenerated Narrativeを消さない。
- Humanが文章を直接変更する場合はHuman Edited Narrativeを別に作る。

---

## 8. Logical Entity E — Human Edited Narrative

### Role

System Generated Narrativeを元に、HumanがHearingで確認した実態や顧客に伝わる表現へ修正した文章。

例：

System Generated:
「ITに関する報告はあるものの、経営判断に使える形へ十分に整理されていない可能性があります。」

Human Edited:
「IT費用や障害に関する情報は経営へ共有されています。一方、システム更新予定や今後必要となるIT投資については、担当者へ確認しないと把握しにくい状態です。」

後者もAssessment Evidenceで確認したFACTではなく、Human Approved Diagnosis Narrativeである。

### Logical fields

- `id`
- `case_id`
- `generated_narrative_id`
- `revision_no`
- `content_json`
- `edited_by_user_id`
- `edit_reason` nullable
- `status`
- `created_at`

### Status

最小限、以下の概念を持つ。

- `CURRENT` — 現在のGenerated Narrativeを元にした編集
- `STALE` — Current State変更後、新しいGenerated Narrativeが生成されたため再確認が必要

Report Approval後の固定化は既存Approved Report snapshot/hashで担保し、Narrative側で別の承認モデルを増やしすぎない。

### Re-generation rule

Current Structured Stateが変更され、新しいGenerated Narrativeが作られた場合：

- 既存Human Edited Narrativeを上書きしない。
- 既存editはSTALEとして残す。
- 新しいGenerated Narrativeを表示する。
- Humanが必要なら旧editを参考に、新しいHuman Edited Narrativeを作る。

これによりHumanの編集をSystemが消さない。

---

## 9. Hearing Record boundary

Hearing RecordはObservationでありCurrent Stateではない。

Live Hearing UI:

- Left: Original Survey Snapshot
- Center: Hearing Viewpoints + Hearing memo

Post-Hearing Analysis UI:

- Left: Original Survey Snapshot
- Center: Hearing Record
- Right: Current Structured State + Generated Narrative

Hearing Recordから以下を自動実行しない。

- Semantic Code変更
- UNKNOWN解除
- FACT認定
- Solution Recommendation
- Assessment Scope決定

HumanがHearing Recordを読んでCurrent Structured Stateを変更する。

---

## 10. Read model for Post-Hearing Analysis UI

UIは物理table構造をそのまま見せず、Case単位で次のread modelを組み立てる。

```text
PostHearingAnalysisView
- originalSurvey
- hearingRecords[]
- currentStructuredState
- currentStateDiffFromOriginal
- latestAnalysisResult
- latestGeneratedNarrative
- latestHumanEditedNarrative
- humanEditedNarrativeIsStale
```

右ペインで選択肢を変更→保存すると新Current State revisionを作る。

その後Analyzerを再実行し、新Analysis Result / Generated Narrativeを作る。

System Generated Narrativeの再生成とHuman Edited Narrativeの扱いを一つのUPDATEで混ぜない。

---

## 11. Initial Survey completion transaction

Survey Complete時の概念処理は以下。

1. Draft answers validation
2. Original Survey Snapshot create
3. Initial Current Structured State create
4. Deterministic Analysis execute
5. Analysis Result create
6. System Generated Narrative create
7. Case statusを次状態へ進める

途中失敗でOriginalだけ作られCurrent Stateがない等の中途半端状態を作らないよう、実装時はtransaction boundaryを設ける。

既存Public Customer Self / Staff Proxyのどちらも同じDomain operationへ接続する。

---

## 12. Post-Hearing Human update transaction

HumanがCurrent Stateを保存した場合：

1. latest Current State revision確認
2. Human update validation
3. new Current State revision create
4. deterministic analysis execute
5. new Analysis Result create
6. new System Generated Narrative create
7. previous Human Edited NarrativeがあればSTALE扱い
8. audit record

Hearing memoの内容はstep 4へ直接渡さない。

---

## 13. Concurrency / stale edit guard

Post-Hearing画面を2人が同時編集する可能性に備え、Current State save時は少なくとも

- expected latest revision_no

を要求し、最新revisionが変わっていたら上書きせずconflictにする。

Silent last-write-winsは採用しない。

Narrative editも、基になった `generated_narrative_id` を保持し、別Current State由来のNarrativeへ誤って保存しない。

---

## 14. Audit contract

最低限、以下のHuman actionは既存Audit基盤へ接続する。

- Original Survey completion
- Current Structured State update
- Human Edited Narrative save
- Report approval / delivery

Auditは「誰が、いつ、どのCaseで、どのrevisionを作ったか」を追えること。

Hearing Recordは既存provenanceを活用する。

---

## 15. Data deletion / retention boundary

Immutableは「編集不可」を意味し、法的・契約上の削除不能を意味しない。

既存のdata retention / deletion policyに従う削除・匿名化は別Governance operationとして許容する。

Design v2の業務UIからOriginal Survey / old Current State / Generated Narrative historyを任意編集・削除できるようにはしない。

---

## 16. Physical schema direction

この文書ではmigration番号・最終table名を確定しない。

実装開始時にmain / Production Canonicalと最新schema_migrationsを再確認し、未使用migration番号を採用する。

推奨はHA6既存tableを破壊的変更せず、additiveに次の論理領域を追加すること。

- original survey snapshot
- current structured state revisions
- analysis result revisions
- generated narrative revisions
- human edited narrative revisions

既存migration 027〜032は編集・再実行しない。

---

## 17. Minimum persistence for first Design v2 implementation

初回Design v2で必須なのは以下。

### MUST

- Original Survey Snapshot
- Current Structured State revision
- Analysis Result revision
- System Generated Narrative revision
- Human Edited Narrative revision
- Hearing memo reuse
- audit

### NOT REQUIRED

- recording / audio
- transcript
- AI auto-summary
- AI auto-classification
- vector database
- semantic search
- automatic FACT certification
- automatic Solution recommendation

---

## 18. Acceptance invariants for Slice 3

後続実装testでは少なくとも以下を証明する。

1. Survey Complete後にOriginal Surveyを変更できない。
2. Hearing後のHuman変更はOriginalではなくCurrent State revisionを作る。
3. Hearing memoを書いてもCurrent Stateは自動変更されない。
4. Current State変更で同じAnalyzerが再実行される。
5. Q2〜Q7変更に応じてGenerated Narrativeが変わる。
6. 過去Generated Narrativeは残る。
7. Human Edited NarrativeはGenerated Narrativeと別保存される。
8. Current State変更後、旧Human Editは消えずSTALEになる。
9. Narrative編集だけではSemantic State / Analysis Resultは変わらない。
10. Original / Hearing / Currentの3層を同時に復元できる。
11. Concurrent stale Current State updateを上書きしない。
12. Report approval後の既存immutable snapshot/hashを維持できる。

---

## 19. Decision

Slice 3のCanonical候補は、**Original / Current / Analysis / Generated Narrative / Human Editを分離し、すべての診断変更をHuman Updated Current Structured Stateから再計算するモデル**とする。

HA6のHearing Structured Answerやmemoを直接Final Ruleへ流す方式はDesign v2の主要経路から外す。

この時点ではschema migration、production code、test、build、HA7、deployを作成しない。

次工程はSlice 4として、このData Modelを使うPost-Hearing Human Update / Deterministic Re-analysis API Contractを固定する。
