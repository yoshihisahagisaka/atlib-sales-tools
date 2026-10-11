# IT経営KAIZEN 無料診断 Design v2 — Package B Persistence Implementation Contract

Status: READY FOR BOUNDED IMPLEMENTATION AFTER MIGRATION GATE
Date: 2026-10-11
Architecture: Clear Separation

## 1. Goal

Package BはDesign v2のPersistence / Provenance基盤だけをadditiveに実装する。

Package Aのpure domainを既存HA6 route/UIへまだ接続しない。

Package Bで実装する正本object:

1. Original Survey Snapshot
2. Current Structured State Revision
3. Analysis Result
4. System Generated Narrative
5. Human Edited Narrative

既存HA6のCase / Hearing / Report / Approval / Delivery / Feedback / Auditは再利用する。

## 2. Non-goals

Package Bでは実装しない。

- Public Survey UI変更
- Admin Hearing UI変更
- Post-Hearing 3-column UI
- existing Final Rule replacement
- existing route wiring
- Report Draft content wiring
- Human Review UI
- HA7
- deploy / Production traffic

Package B完了時点では新Persistence APIを既存production flowから呼ばない。

## 3. Migration gate

migration作成前に必ずread-onlyで次を再確認する。

- implementation branch HEAD / clean
- current `origin/main` HEAD
- HA6 ancestry relationship
- repository内の最大migration番号
- Production DBの適用済みmigration最大番号と027〜032の適用状態

027〜032は絶対に変更・再実行・番号再利用しない。

次migration番号はこのgateで初めて確定する。

remote/mainまたはProduction migration stateが想定と異なる場合はSTOPする。

## 4. Physical objects

### 4.1 `it_management_diagnosis_original_survey_snapshot_v2`

Role:
Survey Complete時点のimmutable original response。

Required fields:

- `id`
- `case_id`
- `survey_version`
- `entry_channel` — CUSTOMER_SELF / STAFF_PROXY
- `answered_by_role`
- `entered_by_user_id` nullable
- `answers_json`
- `submitted_at`
- `content_hash`
- `created_at`

Required integrity:

- `case_id` FK → `it_management_diagnosis_case_v2`
- Caseあたり1 Original Snapshot
- `answers_json` はDesign v2 Q1〜Q7 canonical semantic code
- business operationからUPDATEしない
- normal application flowからDELETEしない

Existing `hearing_intake_response_v2`はdraft/transportであり、このtableの代替にしない。

### 4.2 `it_management_diagnosis_current_state_revision_v2`

Role:
Humanが現在そう認識しているQ2〜Q7のversioned semantic state。

Required fields:

- `id`
- `case_id`
- `revision_no`
- `source_type` — INITIAL_FROM_ORIGINAL / HUMAN_UPDATE
- `based_on_original_snapshot_id`
- `previous_state_id` nullable
- `state_json`
- `supplement_json` nullable
- `updated_by_user_id` nullable for initial system creation
- `change_reason` nullable
- `created_at`

Required integrity:

- `UNIQUE(case_id, revision_no)`
- revision_noは1から単調増加
- revision 1はINITIAL_FROM_ORIGINAL
- revision 1のprevious_state_idはNULL
- HUMAN_UPDATEはprevious_state_idを持つ
- previous_stateは同一Case
- `state_json` はQ2〜Q7 canonical semantic stateのみ
- Q1はCurrent State Human update対象にしない
- past revision UPDATE禁止
- latest判定は最大revision_no

Concurrency:

save operationは `expectedRevision` を必須とする。

latest revision != expectedRevision ならconflict。
Silent last-write-winsは禁止。

### 4.3 `it_management_diagnosis_analysis_result_v2`

Role:
exact Current State revisionに対するdeterministic structured analysis result。

Required fields:

- `id`
- `case_id`
- `current_state_id`
- `analyzer_version`
- `rule_set_version`
- `analysis_json`
- `input_hash`
- `result_hash`
- `created_at`

Required integrity:

- Current Stateとsame Case
- Current State revisionを必ずFKで固定
- `UNIQUE(current_state_id, analyzer_version, rule_set_version)` を原則とする
- generation後UPDATEしない

`rule_analysis_execution`はDesign v2 Analysis Resultの正本にしない。

### 4.4 `it_management_diagnosis_generated_narrative_v2`

Role:
Analysis Resultからdeterministicに生成したSystem Generated Narrative。

Required fields:

- `id`
- `case_id`
- `current_state_id`
- `analysis_result_id`
- `generator_version`
- `content_json`
- `content_hash`
- `created_at`

Required integrity:

- Analysis Result / Current Stateとsame Case
- exact Analysis ResultをFKで固定
- `UNIQUE(analysis_result_id, generator_version)` を原則とする
- generation後UPDATEしない

### 4.5 `it_management_diagnosis_human_edited_narrative_v2`

Role:
Generated NarrativeをHumanが顧客向けに編集したappend-only revision。

Required fields:

- `id`
- `case_id`
- `generated_narrative_id`
- `revision_no`
- `content_json`
- `edited_by_user_id`
- `edit_reason` nullable
- `content_hash`
- `created_at`

Required integrity:

- Generated Narrativeとsame Case
- `UNIQUE(generated_narrative_id, revision_no)`
- append-only
- old editをUPDATE/DELETEしない

Stored mutable statusはSource of Truthにしない。

Read modelで:

- edit.generated_narrative_id == latest generated narrative id → CURRENT
- otherwise → STALE_REVIEW_REQUIRED

と導出する。

## 5. Same-case integrity

可能な範囲でDB constraint / composite FKを使い、cross-case linkを防止する。

最低限、repo層でもCase一致を検証する。

次のcross-case参照を許可しない。

- Current State → Original Snapshot
- Current State → previous Current State
- Analysis → Current State
- Generated → Analysis / Current State
- Human Edit → Generated

## 6. Append-only / immutability

次のobjectはnormal business operationではUPDATEしない。

- Original Survey Snapshot
- Current State Revision
- Analysis Result
- Generated Narrative
- Human Edited Narrative

既存Hearing Statementと同様、DB immutability guardを使える場合は採用する。

ただしretention/deletion governanceは別operationであり、通常UIからの編集禁止と混同しない。

## 7. Persistence module

新規Persistence moduleは既存HA6 repoから分離する。

Candidate:

`src/services/freeDiagnosisDesignV2PersistenceRepo.ts`

責務:

- Original Snapshot create/read
- Current State append/list/latest
- Analysis Result create/read latest for state
- Generated Narrative create/read latest for analysis/state
- Human Edit append/list/latest
- stale derivation helper/read model
- same-case validation
- expectedRevision conflict guard

Existing `freeDiagnosisRuleBasedCaseRepo.ts` をPackage Bの正本repoへ拡張しすぎない。

## 8. Package A integration inside Package B

Persistence service/repo testではPackage Aの:

- `CurrentStructuredStateV2`
- `analyzeFreeDiagnosisV2()`
- `generateFreeDiagnosisNarrativeV2()`

を利用してよい。

ただしexisting HA6 routeからはまだ呼ばない。

## 9. Atomic domain operations

### 9.1 Initial persistence operation

Package B内部に、route非依存のtransactional operationを用意する。

Conceptual API:

`initializeDesignV2FromCompletedSurvey(...)`

Atomic sequence:

1. validate completed Design v2 survey answers
2. Original Snapshot create
3. Current State revision 1 create
4. Package A analysis execute
5. Analysis Result create
6. Generated Narrative create
7. audit insert
8. commit

Package BではCase lifecycle transitionは既存routeへまだwireしない。

同Caseへの二重initializationは拒否またはidempotentに同一結果を返し、2つ目のOriginalを作らない。

### 9.2 Human Current State update operation

Conceptual API:

`appendDesignV2CurrentStateAndReanalyze(...)`

Atomic sequence:

1. latest revision lock/check
2. expectedRevision compare
3. validate new Current Structured State
4. append new Current State revision
5. Package A analysis execute
6. Analysis Result create
7. Generated Narrative create
8. audit insert
9. commit

Hearing memo / `structured_answer_json` をAnalyzerへ直接渡さない。

### 9.3 Human Narrative edit operation

Conceptual API:

`appendDesignV2HumanEditedNarrative(...)`

Requirements:

- source generated_narrative_id required
- same Case validation
- append revision
- audit insert
- stale Generated Narrativeを基に新editを作る場合は原則拒否
- explicit overrideをPackage Bでは設けない

## 10. Audit

既存 `it_management_diagnosis_case_v2_audit` を再利用する。

Package Bで最低限記録:

- `CompleteDesignV2OriginalSurvey`
- `CreateDesignV2CurrentStateRevision`
- `SaveDesignV2HumanEditedNarrative`

Detail JSONにはartifact id / revision / actor / sourceを含める。

Analysis / Generated Narrativeは各table自体がsystem provenanceを保持するため、個別audit rowは必須としない。

Audit insertは対象artifact作成と同一transactionに入れる。

## 11. Read model

Package BでPost-Hearing向けread model組立まで実装してよい。

`PostHearingAnalysisViewV2`

Minimum:

- originalSurvey
- currentStructuredState
- currentStateDiffFromOriginal
- latestAnalysisResult
- latestGeneratedNarrative
- latestHumanEditedNarrative nullable
- humanEditedNarrativeStatus: CURRENT / STALE_REVIEW_REQUIRED / NONE

Hearing Recordsは既存repoから後続API層で合成してよく、Package B persistence repoへ複製しない。

## 12. Hashes

Original / Analysis / Generated / Human Editにはcanonical JSONから安定したhashを保存する。

既存report context hash utilityが再利用可能ならFitを確認して使う。

hashはFACT認定ではなくcontent/provenance integrity用。

## 13. Tests

最低限次を追加する。

1. Original SnapshotはCaseあたり1つ
2. Original Snapshot business UPDATE不可
3. Initial Current State revision=1
4. Human updateでrevision=2
5. old Current State保持
6. expectedRevision mismatchでconflict
7. same-case previous state guard
8. Analysisがexact Current State idを保持
9. same state + same analyzer/rule set duplicate guard
10. Generatedがexact Analysis idを保持
11. Generated immutable
12. Human Edit append revision
13. Human Edit source generated id必須
14. Current State更新後、old Human Editはread modelでSTALE_REVIEW_REQUIRED
15. old Human Edit rowは変更されない
16. latest Generatedに対するeditはCURRENT
17. Hearing memoをAnalyzer sourceとして使うAPIがPackage Bにない
18. initial transaction rollbackでpartial Originalだけ残らない
19. reanalysis transaction rollbackでpartial Current Stateだけ残らない
20. auditとartifactがtransactionally整合
21. cross-case link拒否
22. existing HA6 regression PASS
23. Package A Golden PASS

## 14. Existing HA6 boundaries

変更しない:

- migrations 027〜032
- existing V1 tables semantics
- `rule_analysis_execution` V1 behavior
- Hearing Statement behavior
- Report approval/delivery/feedback behavior
- existing routes/UI wiring

Package B migrationはadditiveのみ。

## 15. Acceptance criteria

Package B PASS条件:

- 5 persistence layers are physically separate
- Original immutable
- Current State append/versioned + expectedRevision
- Analysis exact Current State FK
- Generated exact Analysis FK
- Human Edit separate append history
- stale derived without mutating old edit
- same-case integrity
- audit in same transaction
- Package A analyzer/narrative can be persisted transactionally
- no Hearing memo direct analyzer input
- existing HA6 flow not wired/changed
- Package A Golden + HA6 regression green

## 16. STOP gate

Package B code/migration/testをlocal commitしたらSTOP。

Do not proceed to:

- Package C API wiring
- Survey UI
- Hearing UI
- Post-Hearing UI
- Report wiring
- build/deploy artifact
- HA7
- Production migration execution
- Production traffic
