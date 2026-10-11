# IT経営KAIZEN 無料診断 Design v2 — Package C API Implementation Contract

Status: READY FOR BOUNDED IMPLEMENTATION
Date: 2026-10-11
Base expectation: Package B final fix commit `8d468d2562026426504cdb3310ba34fb23191b4d`

## 1. Goal

Package Cは、Package Aのdeterministic domainとPackage Bの5層Persistenceを、Admin向けのbounded API / application serviceとして接続する。

対象はPost-Hearing Analysis APIであり、UI実装・Report wiring・Production deployは含まない。

最低限提供する責務:

1. Post-Hearing Analysis Workspace読取
2. Human Current Structured State revision保存
3. Deterministic Re-analysis
4. Human Edited Narrative保存
5. Analysis / Narrative freshnessとdiffの返却

## 2. Source of Truth / precedence

優先順位:

1. Package C API Boundary Decision
2. Slice 4 Post-Hearing Re-analysis API Contract
3. Package B Architecture / Implementation Contract
4. Package A domain contracts

特にfailure semanticsはPackage C API Boundary Decisionを採用する。

Human Current State saveとRe-analysisは別transactionとし、Re-analysis失敗でHuman保存済みCurrent Stateを消さない。

## 3. Non-goals

Package Cでは実装しない。

- Public Survey UI変更
- Admin Hearing UI変更
- Post-Hearing 3-column UI本体
- Report Draft生成/wiring
- Human Review/Approval UI
- Migration追加
- Migration 033 Production適用
- HA7 build/deploy
- Production traffic変更
- AI summary / AI semantic extraction
- recording / speech-to-text

## 4. Existing assets to reuse

優先再利用:

- Admin auth / guard
- existing Admin route conventions
- Case lookup / same-case guard
- `freeDiagnosisDesignV2PersistenceRepo.ts`
- Package A analyzer / narrative generator
- existing Hearing Record repository
- existing Case audit

既存HA6 route / V1 Final Rule / Structured HearingをDesign v2正本として流用しない。

## 5. Required API/read operations

実際のURL namingは既存route規約へ合わせてよいが、責務は分離する。

### A. Read Post-Hearing Workspace

Conceptual:

`GET /admin/free-diagnosis/cases/:caseId/design-v2/post-hearing-analysis`

Response minimum:

- case summary
- `originalSurvey`
- `hearingRecords[]`
- `currentStructuredState`
- `currentStateRevision`
- `currentStateDiffFromOriginal`
- `latestAnalysisResult` nullable
- `latestGeneratedNarrative` nullable
- `latestHumanEditedNarrative` nullable
- `humanEditedNarrativeStatus`: CURRENT / STALE_REVIEW_REQUIRED / NONE
- `analysisFreshness`: CURRENT / REANALYSIS_REQUIRED

OriginalとCurrentを別objectで返す。

### B. Save Current Structured State Revision

Conceptual:

`POST /admin/free-diagnosis/cases/:caseId/design-v2/current-state-revisions`

Request minimum:

- `expectedRevision`
- Q2〜Q7 canonical semantic state
- optional `supplements`
- optional `changeReason`

Server-side operator identityを使用する。Clientから任意のuser idを信用しない。

Behavior:

- validate canonical codes
- lock/check latest revision
- expectedRevision mismatch → 409
- append new Current State revision only
- audit same transaction
- COMMIT
- analysisはこのtransactionでは実行しない

Q1はCurrent State編集対象外。

### C. Run Deterministic Re-analysis

Conceptual:

`POST /admin/free-diagnosis/cases/:caseId/design-v2/reanalyze`

Request:

- `expectedCurrentStateRevision` または exact `currentStateId`

Behavior:

- exact/latest Current Stateを確認
- Hearing memo / operator note / `structured_answer_json`をRule Inputにしない
- Package A `analyzeFreeDiagnosisV2()`を実行
- Analysis Resultをexact Current Stateへ保存
- Generated Narrativeをexact Analysisへ保存
- audit/provenanceを必要範囲で保存
- COMMIT

Analysis failure時:

- Current Stateは既に保存済みなので残す
- new Analysis / Generatedは残さない
- error responseは `ANALYSIS_FAILED` 相当を返す
- GET workspaceでは `analysisFreshness=REANALYSIS_REQUIRED`

同一Current State + same analyzer/rule/generator versionに対する二重実行は、既存unique/integrityに従いidempotent readまたはconflict-free reuseを優先する。重複正本を作らない。

### D. Save Human Edited Narrative

Conceptual:

`POST /admin/free-diagnosis/cases/:caseId/design-v2/narrative-edits`

Request minimum:

- `generatedNarrativeId`
- edited narrative content
- optional `editReason`

Behavior:

- operator identityはserver-side
- generated narrative same-case確認
- latest Generatedであることを確認
- append Human Edit revision
- audit same transaction
- old Human Editは変更しない

Stale Generatedをsourceにした新規editは拒否。

## 6. Application service boundary

Route handlerへDB/business logicを大量に書かない。

必要ならPackage C用serviceを追加する。

Candidate:

`src/services/freeDiagnosisDesignV2ApiService.ts`

責務:

- existing Case / Hearing repoとのcomposition
- Workspace read model組立
- save current state operation
- re-analysis operation
- human edit operation
- API error mappingのためのdomain/application error

Persistence SQL自体はPackage B repoへ集約する。

## 7. Package B repo extension rules

Package Cで必要なら `freeDiagnosisDesignV2PersistenceRepo.ts` へ最小追加してよい。

許可候補:

- `appendDesignV2CurrentStateRevision(...)`
- `reanalyzeDesignV2CurrentState(...)`
- exact state/analysis/generated lookup helper

ただし:

- existing Package B behaviorを壊さない
- `appendDesignV2CurrentStateAndReanalyze()` は残してよい
- Package C Human Save endpointからatomic helperを呼ばない
- migration 033 schemaは変更しない

## 8. Analysis freshness

Persistent mutable statusは追加しない。

Workspaceで以下を導出:

- latest Analysisがlatest Current Stateをsourceにし、対応Generatedが存在 → `CURRENT`
- それ以外 → `REANALYSIS_REQUIRED`

Human Edited Narrative statusはPackage B通り:

- edit source Generated == latest Generated → `CURRENT`
- otherwise → `STALE_REVIEW_REQUIRED`
- no edit → `NONE`

## 9. Diff contract

Original Q2〜Q7 vs latest Current Q2〜Q7について、最低限:

- UNCHANGED
- CHANGED
- ADDED
- REMOVED

を表現可能にする。

score化しない。

Q1 Company ContextはOriginal側表示専用でよい。

## 10. Error mapping

既存API conventionを調査し、それに合わせる。

最低限意味として:

- invalid semantic input → 400
- case / Design v2 original not found → 404
- expectedRevision mismatch → 409
- stale Generated edit → 409相当
- cross-case reference → 409/422相当（既存convention優先）
- deterministic analysis failure → 500相当 + machine-readable `ANALYSIS_FAILED`

Error responseへstack / SQL / secretを出さない。

## 11. Auth / operator provenance

Admin routeは既存Admin guard配下へ追加する。

- unauthenticated accessを許可しない
- actor identityは既存認証contextから取得
- Client指定の`updatedByUserId` / `editedByUserId`をそのまま採用しない

Package C testでguardを確認する。

## 12. Hearing Record boundary

Workspace responseへHearing Recordを含める。

ただし:

- Hearing memo
- operator note
- structured hearing answer

をRe-analysis request bodyやAnalyzer inputへ混ぜない。

Hearing RecordはHuman参照材料のみ。

## 13. API acceptance scenarios

最低限以下をintegration levelで確認する。

1. WorkspaceがOriginalとCurrentを別objectで返す
2. Hearing RecordsがWorkspaceに表示用として含まれる
3. Save CurrentでQ5だけ変更しrevision+1
4. Save Current後、Originalは不変
5. Save Current直後は `analysisFreshness=REANALYSIS_REQUIRED`
6. Re-analysis後は `analysisFreshness=CURRENT`
7. Q5変更後Narrativeが変わる
8. Hearing memoだけ変更してもCurrent未変更ならsemantic analysisは変わらない
9. expectedRevision mismatch → 409
10. true concurrent saveで一方のみ成功
11. Analyzer failure後もnew Current State revisionが残る
12. Analyzer failure後new Analysis / Generatedは残らない
13. Analyzer failure後Workspace freshnessはREANALYSIS_REQUIRED
14. Retry re-analysisで同じCurrent Stateからsuccessできる
15. Q7 AI追加のみでAI recommendationを生成しない
16. Healthy stateでProblem/Gap/Assessmentを強制しない
17. Human Edit保存でCURRENT
18. Current State変更後、旧Human EditはSTALE_REVIEW_REQUIRED
19. stale Generatedへの新規edit拒否
20. cross-case Generated edit拒否
21. invalid semantic code拒否
22. authなし拒否
23. Hearing structured answerがAnalyzer inputになっていない
24. no customer report finalized side effect
25. Package B acceptance regression PASS
26. Package A Golden regression PASS
27. HA6 integration/browser regression PASS

## 14. Existing HA6 independence

Package CではDesign v2 Admin APIを追加してよいが、既存HA6の以下を置換しない。

- Public submission flow
- existing intake complete flow
- Structured Hearing flow
- Final Rule flow
- V1 Review / Report / Feedback flow

Package C endpointはDesign v2 namespace/責務としてadditiveにする。

## 15. No migration / no Production

Package Cではmigrationを追加しない。

Migration 033をProductionへ適用しない。

Cloud build / deploy / HA7 / traffic変更を行わない。

## 16. Commit / STOP gate

Package C code + testsをlocal commitしたらSTOP。

推奨commit:

`feat: add free diagnosis design v2 admin api`

Do not proceed to:

- Package D Admin UX
- Package E Report wiring
- Migration 033 Production execution
- HA7
- deploy
- Production traffic

Source Review PASS後にPackage Dへ進む。
