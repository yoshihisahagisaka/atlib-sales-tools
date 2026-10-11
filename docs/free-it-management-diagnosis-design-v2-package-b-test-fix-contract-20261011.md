# IT経営KAIZEN 無料診断 Design v2 — Package B Analysis Rollback Test Fix Contract

Status: PACKAGE B HOLD / TEST-ONLY FIX REQUIRED
Date: 2026-10-11

## 1. Purpose

Package B Source Reviewでは、DDL、Persistence Repository、provenance、immutability、same-case integrity、concurrency、transaction boundary、Human Edited Narrative stale derivation、HA6 independenceはPASSした。

HOLD理由は1点のみ:

- `appendDesignV2CurrentStateAndReanalyze()` 等でAnalysis生成そのものが失敗した場合に、Current State / Analysis / Generated Narrative / Auditがtransaction rollbackされることを直接注入して検証するAcceptance Testがない。

Package B実装コードの修正を前提としない。まず既存transaction設計をtestで直接証明する。

## 2. Allowed change

原則変更可能なのは:

- `test/freeDiagnosisDesignV2Persistence.integration.test.ts`

だけとする。

既存実装にtest failure injection seamが存在せず、testからAnalysis failureを発生させるために最小限のdependency injection seamが必要な場合のみ:

- `src/services/freeDiagnosisDesignV2PersistenceRepo.ts`

の最小変更を許可する。

その場合もproduction behaviorを変更してはならず、default analyzerは既存の`analyzeFreeDiagnosisV2()`のままとする。

## 3. Required test

少なくともPost-Hearing reanalysis transactionについて、AnalyzerがCurrent State revision INSERT後かつAnalysis Result INSERT前にthrowする状況を直接作る。

例:

1. Existing Design v2 CaseをOriginal + Current revision 1まで初期化
2. `appendDesignV2CurrentStateAndReanalyze()` を expectedRevision=1 で実行
3. Analyzer executionを明示的にthrowさせる
4. operationがerrorとなることを確認
5. transaction後にDBをreadし、以下をassert

- Current State revision 2が存在しない
- Analysis Resultの追加行が存在しない
- Generated Narrativeの追加行が存在しない
- `CreateDesignV2CurrentStateRevision` auditが存在しない
- Original Surveyは変更されない
- revision 1は保持される
- latest Current Stateはrevision 1のまま

## 4. Initialization path

可能であれば、Initial persistence operation `initializeDesignV2FromCompletedSurvey()` に対してもAnalyzer failure rollbackを直接確認する。

その場合:

- Original Survey rowが残らない
- Current revision 1が残らない
- Analysis Resultが残らない
- Generated Narrativeが残らない
- `CompleteDesignV2OriginalSurvey` auditが残らない

ことをassertする。

ただしPackage B Source ReviewのHOLD解除に必須なのは、少なくとも1つの実Analysis generation failureをtransaction内部で直接発生させ、そのartifact/audit rollbackを証明すること。

## 5. Failure injection rule

Mock名やtest-only flagだけでproduction semanticsを分岐させない。

望ましい順序:

1. Existing dependency injection / constructor injectionがあるなら利用
2. Testからrepo/serviceへAnalyzer function dependencyを渡せる最小seam
3. それでも困難ならtest-only DB failureではなく、必ずAnalyzer throwとして観測できる方法を採用

Audit failureをAnalysis failureの代用にしない。

## 6. Regression

修正後、最低限以下を再実行する。

- Package B persistence integration tests
- Package A Golden tests
- `npm run build`

可能なら前回greenだったHA6 Vertical Slice / Browser regressionも再確認する。

既知の`currentDesignV1.golden.test.ts` 2件FAILは、既にPRE-EXISTING / NON-BLOCKINGと証明済みなので今回修正しない。

## 7. Commit boundary

Test補強だけを1 commitにする。

Recommended message:

`test: verify design v2 analysis failure rollback`

Pushしない。

## 8. Acceptance

Package B HOLD解除条件:

- Analyzer failureを直接発生させるAcceptance Testが存在
- Current State/Analysis/Generated/AuditのrollbackをDB状態でassert
- 既存Package B tests green
- Package A Golden green
- build green
- production persistence semanticsに不要な変更なし

## 9. STOP

Fix commit後STOP。

まだ進まない:

- Package C
- API/UI wiring
- Report wiring
- migration 033 Production適用
- HA7
- deploy
- Production traffic
