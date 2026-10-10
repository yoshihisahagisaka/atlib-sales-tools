# IT経営KAIZEN 無料診断 Design v2 — HA6 Fit/Gap Source Gate

Status: SOURCE RECOVERY GATE RESOLVED / READY FOR READ-ONLY FIT-GAP
Date: 2026-10-10
Branch: docs/free-diagnosis-design-v2-20261010

## 1. Purpose

Design v2の上位Contract確定後、現行HA6実装との1:1 Fit/Gapへ進む前に、比較対象となるHA6 sourceを事実ベースで取得できるか確認した記録。

## 2. Expected HA6 source

既存運用記録上のHA6 source commit:

`0f8700e4454bf3ead886057b0993863e28d34fc8`

Known release context:

- candidate revision: `sales-tools-00068-hoy`
- tag: `it-kaizen-cdv1-ha6`
- Production traffic remains on prior VS1; HA6 is not Production traffic
- HA6 was the Human Acceptance candidate whose hearing UX exposed the redesign need

## 3. Initial GitHub verification

Repository checked:

`yoshihisahagisaka/atlib-sales-tools`

Initial result:

- Fetch by exact commit SHA `0f8700e4454bf3ead886057b0993863e28d34fc8` returned: commit not found.
- Search for commit text `HA6` returned no matching commit.
- Search for branch name containing `ha6` returned no branch.
- Search for branch name containing `it-kaizen` returned no branch.

This established that the connected GitHub remote alone could not prove the exact HA6 source tree.

## 4. Local source recovery result

Work performed a read-only recovery investigation under `C:\atlib` and found the exact HA6 source.

**HA6 SOURCE RECOVERY: FOUND**

Recovered source:

- shared Git repository: `C:\atlib\atlib-sales-tools`
- worktree: `C:\atlib\worktree-sales-tools-release-candidate`
- branch: `release-candidate-sales-tools-20261008`
- HEAD / HA6 source: `0f8700e4454bf3ead886057b0993863e28d34fc8`
- subject: `feat: expand deterministic hearing themes`
- commit date: `2026-10-10 02:25:32 +09:00`
- parent: `1a3890937b71fea59254c6ebc75bc811d634cad7`
- remote: `https://github.com/yoshihisahagisaka/atlib-sales-tools.git`

Evidence reported by Work:

- `git worktree list` records the worktree at HA6 SHA on branch `release-candidate-sales-tools-20261008`.
- `.git\worktrees\worktree-sales-tools-release-candidate\HEAD` points to the same branch.
- SHA exists as a commit object in the shared object database.
- SHA is reachable from the local branch, worktree HEAD and reflog.
- SHA is not detached, stashed, dangling or unreachable.
- `git fsck --unreachable` did not report the HA6 SHA.
- worktree HEAD exactly matches the HA6 SHA.
- worktree is clean with no uncommitted changes.

Reason the SHA was not visible from GitHub:

- local branch is three commits ahead of `origin/release-candidate-sales-tools-20261008`.
- remote branch remains at `d4e66b7`.
- HA6 therefore remained valid in the local repository without being pushed to GitHub.

## 5. HA6 commit changed files

The recovered HA6 commit changed:

- `public/admin/free-diagnosis-v1.html`
- `public/it-management-kaizen/free-diagnosis/app.js`
- `src/domain/finalRuleEngine.ts`
- `src/domain/initialRuleEngine.ts`
- `src/domain/structuredHearing.ts`
- `src/routes/adminFreeDiagnosisRuleBasedV1.ts`
- `src/services/freeDiagnosisRuleBasedCaseRepo.ts`
- `src/services/vs1ReviewReportFeedbackRepo.ts`
- `test/freeDiagnosisRuleBasedV1.browser.test.ts`
- `test/freeDiagnosisRuleBasedV1VerticalSlice.integration.test.ts`
- `test/reverseHearingContract.test.ts`

## 6. Recovered implementation map

Work identified the following HA6 implementation locations for the upcoming 1:1 Fit/Gap:

| Concern | HA6 location |
|---|---|
| Public survey UI | `public/it-management-kaizen/free-diagnosis/index.html`, `app.js` |
| Q1〜Q7 / answer contract | `src/domain/freeDiagnosisRuleBasedV1.ts` |
| Public submission API | `src/routes/publicCustomerSelfFreeDiagnosis.ts` |
| Customer Self submission/save | `src/services/publicCustomerSelfSubmissionService.ts` |
| Intake / Case persistence | `src/services/freeDiagnosisRuleBasedCaseRepo.ts` |
| Semantic Projection | `src/domain/intakeSemanticProjection.ts` |
| Initial Rule | `src/domain/initialRuleEngine.ts` |
| Hearing theme / question sequence | `src/domain/structuredHearing.ts` |
| Final Rule / re-analysis | `src/domain/finalRuleEngine.ts`, `src/domain/ruleAnalysisEngine.ts` |
| Hearing / Admin UI | `public/admin/free-diagnosis-v1.html`, `src/routes/adminFreeDiagnosisRuleBasedV1.ts` |
| Review / Report / Feedback | `src/services/vs1ReviewReportFeedbackRepo.ts`, `src/domain/diagnosisReport.ts` |
| Schema | `migrations/027_free_diagnosis_rule_based_v1.sql` 〜 `032_sales_activity_referral_person_name.sql` |
| Browser / integration / golden tests | `test/freeDiagnosisRuleBasedV1.browser.test.ts`, `test/freeDiagnosisRuleBasedV1VerticalSlice.integration.test.ts`, `test/reverseHearingContract.test.ts`, `test/structuredHearingFinalRule.test.ts`, `test/currentDesignV1.golden.test.ts`, `test/ruleAnalysisEngine.golden.test.ts` |

The base worktree `C:\atlib\atlib-sales-tools` has unrelated uncommitted changes, but the HA6 worktree itself is clean and those changes are not part of the HA6 source.

## 7. Decision

The source gate is now satisfied.

The exact local HA6 source is:

`C:\atlib\worktree-sales-tools-release-candidate @ 0f8700e4454bf3ead886057b0993863e28d34fc8`

This source, and not `main`, VS1, HA5 or memory of HA6 behavior, is the baseline for the next Design v2 1:1 Fit/Gap.

## 8. Next gate

**READY: read-only Design v2 vs HA6 Fit/Gap may begin.**

Still prohibited until that Fit/Gap is reviewed and an implementation plan is explicitly approved:

- code modification
- migration creation/application
- HA7 creation
- build
- deploy
- Cloud Run traffic change
- Production change

## 9. Design v2 artifacts already completed

- Design v2 checkpoint
- Initial Analysis Contract
- Survey Semantic / Narrative Rule
- Survey Question Contract
- HA6-style paper simulation
- Healthy / Solution Hypothesis validation
- Report / Current Understanding Contract

These design artifacts remain the comparison target. HA6 is the implementation baseline, not the source of product design decisions.
