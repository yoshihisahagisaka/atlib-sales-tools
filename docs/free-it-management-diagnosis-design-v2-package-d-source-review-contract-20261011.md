# IT経営KAIZEN 無料診断 Design v2 — Package D Source Review Contract

Status: REVIEW CONTRACT
Date: 2026-10-11

## 1. Purpose

Package DのAdmin UX実装が、Design v2のLive Hearing / Post-Hearing Analysis契約、Package C API境界、HA6独立性、安全なfree-text renderingをactual sourceで満たしているかをread-onlyで確認する。

Source ReviewはHuman Acceptanceの前提Gateである。

## 2. Review target

Expected branch:

`feat/free-diagnosis-design-v2-package-d`

Expected HEAD:

`c2db6ba2f64ccd6ef52d2d71fc6440a97b177ad3`

Expected worktree:

clean

Package D base:

`9fc0cbaef90480dafe525de667da52bf92260ea3`

## 3. Scope review

Package D code diff must remain bounded to Admin UX and Package D tests/docs.

Expected runtime files:

- `public/admin/free-diagnosis-v2-hearing.html`
- `public/admin/free-diagnosis-v2-analysis.html`
- `public/admin/free-diagnosis-v2.css`
- `public/admin/free-diagnosis-v2-common.js`
- `public/admin/free-diagnosis-v2-hearing.js`
- `public/admin/free-diagnosis-v2-analysis.js`

Expected tests:

- `test/freeDiagnosisDesignV2AdminUx.integration.test.ts`
- `test/freeDiagnosisDesignV2AdminUx.browser.test.ts`
- `test/freeDiagnosisDesignV2AdminUx.playwright.config.ts`

Migration 027–033 changes, Report wiring, Human Review wiring, Delivery/Feedback wiring, Public Survey changes, HA7/deploy changes are FAIL conditions.

## 4. Live Hearing gate

Live Hearing must be a true 2-column operator UX on desktop:

Left:

- Original Survey Q1–Q7
- read-only
- human-readable Japanese labels

Right:

- Hearing Viewpoints
- why useful / related lens / optional example question
- Hearing Record
- memo append
- proceed to Post-Hearing Analysis

Must not include:

- Current Structured State editor
- Re-analysis controls
- Narrative editor
- M01–M06 fixed question sequence
- Primary/Secondary Focus
- completion score / progress percentage
- maturity / risk score

## 5. Viewpoint source gate

Hearing Viewpoints must come from Design v2 analysis/read model, not be re-derived by frontend ad hoc rules.

Frontend must not manufacture:

- Finding
- Problem
- Recommendation
- Assessment scope

Q7 interests may be displayed but must not become solution recommendations.

## 6. Hearing memo persistence gate

Actual source must confirm the reused Hearing Statement API allows plain append without semantic structured-answer requirements.

Memo persistence must satisfy:

- authenticated actor provenance
- append-oriented behavior
- same Case association
- no Current State mutation
- no automatic semantic extraction
- no Analyzer input from memo text

If hidden defaults force M01–M06/question codes/structured answers into Design v2 memo semantics, review FAILS.

## 7. Case guard

Both Design v2 pages must fail safely when:

- no caseId
- invalid caseId
- Design v2 Original not initialized

They must not auto-create Design v2 state from HA6 mutable intake or other V1 sources.

## 8. Post-Hearing layout gate

Desktop must visibly preserve 3 distinct columns/layers:

1. 最初の回答
2. ヒアリング記録
3. 現在の理解

Original and Hearing Record are read-only reference layers.

Only Q2–Q7 are editable as Current Understanding.

Q1 is not editable.

## 9. Validation gate

UI uses the same Design v2 canonical option semantics.

Required client guards:

- Q2 NO_MAJOR_CHANGE exclusive
- Q2 UNDECIDED exclusive
- Q3 UNDECIDED exclusive
- Q3 max 2
- Q7 UNDECIDED exclusive
- Q7 max 3
- Q4/Q5/Q6 single select

Validation messages are operator-readable Japanese.

Client validation does not replace server validation.

## 10. Difference-first gate

UI must show Original-vs-Current differences without implying customer error or diagnostic problem.

Acceptable concepts:

- 変更なし
- ヒアリング後に変更
- 追加
- 外した項目

Not acceptable:

- 顧客の回答が間違い
- 問題
- Gap
- score

## 11. Save / Re-analysis boundary gate

Actual frontend source must prove two separate HTTP operations:

1. Current State revision save
2. Re-analysis

The UI may present one primary action label, but must not collapse the backend semantics into one atomic endpoint.

The second request must occur only after successful Current State save.

## 12. Re-analysis failure preservation gate

When Current State save succeeds and Re-analysis fails:

- saved Human Current State remains
- UI does not revert local/remote state
- user receives clear Japanese message that save succeeded but re-analysis failed
- UI indicates re-analysis is required
- retry action calls Re-analysis against the saved latest revision
- successful retry refreshes to CURRENT

## 13. Freshness / Human Edit gate

When `analysisFreshness = REANALYSIS_REQUIRED`:

- customer-facing narrative save is disabled
- UI tells operator to re-analyze first
- frontend must not intentionally submit old Generated Narrative IDs

When Human Edit is stale:

- stale warning is visible
- old edit can be reference material
- system must not auto-merge old edit into new Generated Narrative

Fresh Generated Narrative is read-only.

Human Edited Narrative remains a separate editable layer.

## 14. Analysis presentation gate

Operator-facing UI must use plain Japanese labels, not internal vocabulary.

Expected concepts:

- 実現したい会社の未来
- 現在どこまで分かっているか
- 技術・運用・管理から見た確認ポイント
- まだ確認できていないこと
- 次に確認する価値があること
- 分析から作成した文面
- 顧客向け文面

Must not surface raw primary labels such as:

- Semantic Projection
- Current Structured State
- Generated Narrative
- Rule Result
- UNKNOWN Code
- M01–M06
- Primary / Secondary Focus

## 15. UNKNOWN / FACT Candidate guard

UNKNOWN must not be presented as confirmed defect/problem/risk.

FACT Candidate must remain a next-confirmation item, not a committed Assessment scope.

Each candidate should preserve meaning equivalent to:

- what to check
- why it matters
- what may become knowable
- related lenses

## 16. Healthy / solution-interest guard

Healthy cases must not receive artificial gaps/problems or forced paid-service pressure.

AI/AUTOMATION/CLOUD/SECURITY interest must not produce solution recommendation copy.

## 17. Navigation gate

Live Hearing:

- back to case list
- forward to Post-Hearing Analysis

Post-Hearing:

- back to Live Hearing
- back to case list

No irreversible wizard behavior.

Package E Report action must not be active.

## 18. XSS / free-text gate

Customer/operator free text must not be interpolated directly into HTML via unsafe `innerHTML`.

Review at minimum:

- hearing memo
- customer statement
- supplements
- Human Edited Narrative

Use `textContent`, explicit escaping, or equivalent safe rendering.

## 19. Responsive gate

Desktop:

- Live = 2 columns
- Post-Hearing = 3 columns

Narrow/mobile may stack vertically, but the three conceptual layers must remain visually distinguishable.

## 20. Acceptance test review

The review must inspect actual assertions, not only test count.

Minimum scenarios to verify in tests/source:

1. Live Hearing 2-column
2. Original read-only
3. Viewpoint display
4. no M01–M06 fixed hearing UI
5. no Current editor in Live Hearing
6. memo append
7. memo does not mutate semantic/current state
8. Post-Hearing 3-layer separation
9. Q2–Q7 editing only
10. Original unchanged
11. diff display
12. Save and Re-analysis are separate requests
13. Re-analysis failure preserves saved Current State
14. retry succeeds
15. healthy case has no artificial gap
16. AI interest has no recommendation
17. Generated narrative read-only
18. fresh Human Edit works
19. Human Edit disabled while reanalysis required
20. stale warning behavior
21. back navigation
22. internal raw terms not surfaced
23. XSS-safe free-text rendering
24. narrow/mobile behavior
25. uninitialized Design v2 safe guard

Weak or indirect assertions should be reported as PARTIAL.

## 21. Regression evidence

Expected reported results:

- Package D memo integration: 1/1 PASS
- Package D Browser desktop/mobile: 8/8 PASS
- Package C API: 26/26 PASS
- Package B persistence: 29/29 PASS
- Package A Golden: 21/21 PASS
- HA6 Vertical Slice: 15/15 PASS
- HA6 Browser desktop/mobile: 24/24 PASS
- `npm run build`: PASS

Known V1 Golden 2 failures are PRE-EXISTING / NON-BLOCKING and must not be fixed under Package D review.

## 22. Final verdict

Use one of:

- `PACKAGE D SOURCE REVIEW: PASS`
- `PACKAGE D SOURCE REVIEW: PARTIAL / HOLD`
- `PACKAGE D SOURCE REVIEW: FAIL / FIX REQUIRED`

PASS requires all critical UX/domain boundaries to be satisfied.

If PARTIAL/FAIL, report exact file/symbol/reason only. Do not modify code.

## 23. STOP

After Source Review, STOP.

Do not start:

- Package E
- Migration 033 Production application
- HA7
- deploy
- Production traffic

If Source Review passes, the next step is Human Acceptance of the actual Admin UX.
