# IT経営KAIZEN 無料診断 Design v2 — Package C API Boundary Decision

Status: DECIDED / PACKAGE C INPUT
Date: 2026-10-11

## 1. Decision purpose

Package Cへ進む前に、Slice 4 API ContractとPackage B Persistence Contractの間にあるfailure semanticsの差を明示的に解消する。

Package BはPersistence / Provenance基盤としてCLOSED / PASSのままとする。Migration 033および5層の正本構造をやり直さない。

## 2. Detected semantic difference

Slice 4ではPost-HearingのHuman Current State更新について、Humanが保存したCurrent Stateはanalysis生成失敗で失わないことを要求している。

一方Package Bでは、Persistence substrateのatomic helperとして `appendDesignV2CurrentStateAndReanalyze()` を実装し、Current State + Analysis + Generated Narrative + Auditを同一transactionでrollbackできることを検証した。

両者は用途が異なる。

- Package B helper: persistence内部のatomic operation capability
- Package C API: Human actionを失わないproduct operation semantics

## 3. Final precedence

Human action preservationを優先する。

Package CのAdmin APIでは、Post-Hearing Current State保存とRe-analysisを別責務・別transactionに分ける。

```text
Human Save
  -> append Current Structured State revision
  -> COMMIT

Re-analysis
  -> read exact/latest Current State revision
  -> deterministic analyzer
  -> Analysis Result
  -> Generated Narrative
  -> audit/provenance
  -> COMMIT
```

Re-analysisが失敗しても、直前にHumanが保存したCurrent State revisionは残す。

## 4. Package B status

Package Bはreopenしない。

`appendDesignV2CurrentStateAndReanalyze()` はatomic helperとして残してよいが、Package CのHuman Current State save endpointからは使用しない。

Package Cで必要なら同じPersistence moduleへ以下のbounded operationを追加する。

- `appendDesignV2CurrentStateRevision(...)`
- `reanalyzeDesignV2CurrentState(...)` または同等責務

既存Package B testは維持する。

## 5. Analysis freshness

Persistent read modelでは、latest Current Stateとlatest Analysisのsource Current Stateを比較する。

- 同じCurrent StateをsourceにしたAnalysis / Generated Narrativeがある → `CURRENT`
- latest Current Stateに対応するAnalysisがない → `REANALYSIS_REQUIRED`

Re-analysis operation自体が失敗したresponseでは `ANALYSIS_FAILED` を返してよい。

Package Cでは新しいmutable status table / columnを追加しない。

## 6. User-visible behavior

Post-Hearing UIは将来「現在の理解を保存して再分析」という1 actionとして見せてもよい。

ただし内部では:

1. Current State save成功
2. Re-analysis実行

の順で行い、2が失敗しても1を失わない。

UIは「現在の理解は保存済み。再分析に失敗したため再実行が必要」と表現できること。

## 7. Non-negotiable invariants

- Original Surveyは変更しない
- Hearing memo / operator note / structured hearing answerをAnalyzer inputにしない
- Current StateはHuman actionでのみappendする
- Analysisはexact Current State revisionへ紐付く
- Generated Narrativeはexact Analysisへ紐付く
- Human Edited NarrativeはGeneratedと別履歴
- stale Human Editは削除・上書きしない
- Healthy caseへProblem / Assessmentを強制しない
- Solutionを自動決定しない

## 8. Migration boundary

Package Cではmigrationを追加しない。

Migration 033はまだProduction未適用であり、Package CでもProduction DBへ適用しない。

## 9. Result

Package C APIは「Human Save」と「Deterministic Re-analysis」を分離し、Human入力保存をSystem analysis failureから保護する。

このDecisionはPackage C以降のAPI / UI wiringに対して、Slice 4のfailure semanticsを具体化する最新決定として扱う。
