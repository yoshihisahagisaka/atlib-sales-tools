# IT経営KAIZEN 無料診断 Design v2 — Package C Stale Edit Fix Contract

Status: FIX REQUIRED / BOUNDED
Date: 2026-10-11
Base branch: feat/free-diagnosis-design-v2-package-c
Base commit: b774e03c6df7d42b265cfaf1b2df70324e18199c

## 1. Purpose

Package C Source Reviewで検出された1件のContract違反を最小修正する。

Current State保存後、Re-analysis未実行の間は、Case内で最新のGenerated Narrativeが旧Current State由来であっても、それをHuman Editのsourceとして新規編集してはならない。

Human Edited Narrativeの新規作成条件は、単に「Case内の最新Generated」であることではなく、**latest Current Stateに対応するfresh Generated Narrativeであること**とする。

## 2. Required behavior

`appendDesignV2HumanEditedNarrative()` 相当のoperationは、同一transaction内で最低限以下を確認する。

1. target Generated Narrativeが指定Caseに属する。
2. target Generated NarrativeがCase内の最新Generatedである。
3. target Generated Narrativeの `current_state_id` がCase内latest Current State IDと一致する。
4. したがってAnalysis freshnessがCURRENTである。

3または4を満たさない場合、新規Human Editを拒否する。

API層では stale source conflict として409相当へmapする。

## 3. Forbidden behavior

次の状態で旧GeneratedへのHuman Editを受理してはならない。

1. revision 3までRe-analysis済み
2. revision 4をHuman Save
3. revision 4はまだRe-analysis未実行
4. revision 3由来Generated IDを指定してHuman Edit

Expected:

- Human Edit新規rowなし
- audit追加なし
- 409相当
- Workspaceは `analysisFreshness=REANALYSIS_REQUIRED`
- 旧Human Edit/Generated/Current Stateは変更しない

## 4. Scope

原則変更対象:

- `src/services/freeDiagnosisDesignV2PersistenceRepo.ts`
- `test/freeDiagnosisDesignV2Api.integration.test.ts`

必要ならAPI serviceのerror mappingを最小変更してよい。

Migration 027〜033、Public/Admin UI、V1 flow、Report/Approval/Delivery/Feedbackは変更しない。

## 5. Test additions

最低限次のAcceptanceを追加する。

### A. Save後・Re-analysis前のstale Generated edit拒否

- current revision N is analyzed
- Human saves revision N+1
- no reanalysis for N+1
- attempt edit using Generated from revision N
- expect 409
- assert no Human Edit row added
- assert no `SaveDesignV2HumanEditedNarrative` audit added
- assert old rows unchanged

### B. Repeated Re-analysis canonical row count

同一Current State/versionでre-analysisを繰り返したとき、

- Analysis ID same
- Generated ID same
- Analysis row count unchanged
- Generated row count unchanged

を直接assertする。

## 6. Regression

実行:

- Package C API suite
- Package B persistence suite
- Package A Golden
- `npm run build`
- HA6 Vertical Slice integration
- HA6 Browser desktop/mobile

既知V1 Golden 2件はPRE-EXISTING / NON-BLOCKINGとして修正しない。

## 7. STOP

Fix commit後STOP。

まだ進まない:

- Package D
- Package E
- Migration 033 Production適用
- HA7
- deploy
- Production traffic
