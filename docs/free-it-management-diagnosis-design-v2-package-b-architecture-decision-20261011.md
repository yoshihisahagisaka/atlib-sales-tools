# IT経営KAIZEN 無料診断 Design v2 — Package B Architecture Decision

Status: DECIDED / IMPLEMENTATION CONTRACT NEXT
Date: 2026-10-11

## Decision

Package BのPersistenceは **Option B — Clear Separation** を採用する。

HA6の `rule_analysis_execution` はCurrent Design v1のexecution historyとして保持し、Design v2 Analysis Resultの正本にはしない。

Design v2では、Case配下に以下5層を別objectとして持つ。

1. Original Survey Snapshot
2. Current Structured State Revision
3. Analysis Result Revision
4. System Generated Narrative Revision
5. Human Edited Narrative Revision

既存の以下は再利用する。

- `it_management_diagnosis_case_v2`
- `hearing_intake_response_v2` — editable survey transport only
- `hearing_statement_v2` — append-only Hearing Record only
- `diagnosis_reports` — downstream Report/Approval/Delivery artifact
- `management_feedback_decisions`
- `it_management_diagnosis_case_v2_audit`

## Why Option B

Fit/GapではOption A Minimal Additiveも成立するが、Design v2のSource of Truthを `rule_analysis_execution` に混在させると、V1のINITIAL/FINAL stage、review fields、nullable組合せ、mutable review metadataとDesign v2のimmutable analysis provenanceが同一objectへ混在する。

Design v2ではInitial/Post-Hearingで同一Analyzerを使い、exact Current State revisionに対してAnalysisとNarrativeを再生成する。これはV1のINITIAL/FINAL execution semanticsとは異なる。

Package Bは今後、業務KAIZEN等の共有基盤Fit/Gapにも影響するため、短期的なtable数削減より、意味とprovenanceの分離を優先する。

## Authoritative boundaries

```text
hearing_intake_response_v2
  = editable survey draft / transport
  != Original Survey Snapshot

hearing_statement_v2
  = immutable Hearing Record / observation
  != Analyzer source

Original Survey Snapshot
  = completion時点のimmutable customer/staff response

Current Structured State Revision
  = Human-updatable semantic state history
  = Design v2 Analyzer Source of Truth

Analysis Result Revision
  = exact Current State revisionからのdeterministic structured result

System Generated Narrative Revision
  = exact Analysis Resultからのdeterministic narrative

Human Edited Narrative Revision
  = Generated Narrativeを基にHumanが編集した別履歴

diagnosis_reports
  = downstream customer report artifact
  = existing approval snapshot/hashを継続利用
```

## Human Edited Narrative stale decision

Physical tableにはmutableな `CURRENT/STALE` statusをSource of Truthとして保存しない。

各Human Edited Narrativeは必ず `generated_narrative_id` を保持する。

Read modelで、

- editの `generated_narrative_id` がlatest Current Stateに対するlatest Generated Narrativeと一致する → `CURRENT`
- 一致しない → `STALE_REVIEW_REQUIRED`

と導出する。

理由:

- Current State変更時に過去Human Edit rowをUPDATEせずに済む
- append-only historyを維持できる
- stale statusの更新漏れによる不整合を防げる
- UI/APIでは明示的なCURRENT/STALEとして扱える

古いHuman Editは削除・上書きしない。

## Concurrency decision

Current Structured State saveはCase lifecycle versionとは別に、Current State専用の `revision_no` と `expectedRevision` を使用する。

Silent last-write-winsは禁止。

同時更新時は新revisionを作らずconflictとする。

## Transaction decision

Survey completionは、customer self / staff proxyとも最終的に同一Domain transactionへ接続する。

Atomic unit:

1. draft validation
2. Original Survey Snapshot create
3. Initial Current Structured State revision create
4. Design v2 deterministic analysis execute
5. Analysis Result create
6. System Generated Narrative create
7. audit insert
8. Case lifecycle transition

途中だけ保存された状態を残さない。

Post-Hearing Human updateもatomicに扱う。

1. expectedRevision確認
2. new Current State revision create
3. deterministic analysis execute
4. new Analysis Result create
5. new Generated Narrative create
6. audit insert

Hearing memoはAnalyzer inputへ渡さない。

## Existing HA6 assets to keep

- 027〜032は変更・再利用しない
- `rule_analysis_execution` はHA6/V1 historyとしてKEEP
- existing Report / Approval / Delivery / Feedback lifecycleはKEEP
- approved report snapshot/hashはKEEP
- Hearing Statement append-only DB protectionはKEEP
- VS1 Case auditはadapterで再利用

## Governance boundary

Immutableはnormal business operationからUPDATE/DELETEしないことを意味する。

Retention/deletion governanceによる削除・匿名化は別operationとして後続で接続する。

Package B実装では通常UI/APIからhistoryを書き換えられない構造を優先する。

## GO / NO-GO

Package B Implementation Contract策定へGO。

まだmigration番号、SQL、deploy、HA7、Production操作は行わない。
