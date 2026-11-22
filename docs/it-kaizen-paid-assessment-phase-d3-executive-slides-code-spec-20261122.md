# IT経営KAIZEN 設計Assessment Phase D3 — Executive Summary PPTX draft (code-level spec)

Date: 2026-11-22
Status: **CODE-LEVEL DESIGN / INTERNAL DRAFT ONLY / NO CUSTOMER RELEASE AUTHORIZATION**
Baseline: Phase D2 Draft PR #83 head `39aa53c11e8ff6da752cf06a57e145ca726bc903`; **do not start implementation until the requested D2 character-count correction and tests are completed**. Actual D3 start HEAD is the *then-current* corrected D2 PR HEAD, not a guessed SHA.
PR base: `feat/paid-assessment-word-draft-phase-d2-20261122` (stacked Draft).
Authority: git_KAIZEN docs/78 (Word-first canonical), docs/77 (Japanese customer language), docs/23 (epistemic separation), docs/75 (PILOT PROPOSAL), Sales Tools D1 specification and D1/D2 actual TypeScript source.

## 1. Business goal and Fit/Gap

Goal: A consultant selects the **existing D1 statements** needed for an executive discussion and obtains an internally reviewable PowerPoint draft. Do not create a separate slide conclusion or force a 21-chapter/3-scenario story; this is a shorter view of the same D1 narrative. Word-type report remains authoritative after later Human Review.

FIT:
- D1 `buildPaidAssessmentDeliverableProjection(input)` validates author-supplied statement kind, source, typed related refs, upstream state and readiness, preserving section and statement order.
- D2 demonstrates in-memory OOXML output and fixed Japanese kind labels; `fflate` is already in devDependencies and can be reused for OOXML tests.
- Package uses Node>=20, TypeScript CommonJS, esModuleInterop. There is no need to alter TS or build tooling.

GAP: the Sales Tools repository does not have an executive PPTX renderer. Existing free-diagnosis HTML/PDF renderer is not a PPTX engine; do not convert slide content to HTML or maintain a second report narrative.

Use existing, standards-compliant `pptxgenjs` library, **version 4.0.1** as first candidate; PptxGenJS publishes CommonJS/ESM builds and provides `write({outputType:'nodebuffer',compression:true})` and `slide.addNotes(...)`. Codex must perform a bounded npm installation/build confirmation against current Node/TS before implementation. STOP and report if incompatible; do not change compiler strategy or author custom OOXML/ZIP. No renderer, graphic design, AI or DB framework.

## 2. Allowed changes ONLY

- `package.json`: add exact runtime `pptxgenjs` dependency once.
- `package-lock.json`: regenerate normally; retain all unrelated versions.
- NEW `src/services/paidAssessmentExecutiveSlidesDraft.ts`.
- NEW `test/paidAssessmentExecutiveSlidesDraft.test.ts`.

Do NOT edit D1/D2, other dependencies or shared domain contracts. Reuse existing `fflate` **devDependency** for PPTX ZIP inspection. No assets/templates required, no image generation.

## 3. Exact exported contract

```ts
import type {
  DeliverableProjectionInput,
  DeliverableReadiness,
} from '../domain/paidAssessmentDeliverableProjection';

export interface ExecutiveSlideSelection {
  sectionId: string;
  statementIds: readonly string[];
}

export interface PaidAssessmentExecutiveSlidesInput {
  assessment: DeliverableProjectionInput;
  slides: readonly ExecutiveSlideSelection[];
}

export interface PaidAssessmentExecutiveSlidesDraft {
  reportId: string;
  filename: string;
  mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  bytes: Buffer;
  readiness: DeliverableReadiness; // D1 status ONLY; never approval
  reviewReasons: string[];
  slideCount: number; // includes cover, review status and selected content slides
  status: 'INTERNAL_REVIEW_DRAFT';
}

export async function renderPaidAssessmentExecutiveSlidesDraft(
  input: PaidAssessmentExecutiveSlidesInput,
): Promise<PaidAssessmentExecutiveSlidesDraft>;
```

There is no summary-text field in this contract. Human selection only chooses which **already authored D1 statements** are shown. Slide title is the existing selected D1 section title. Selected D1 statement `text` must be rendered **verbatim**: do not auto-summarize, ellipsize, translate, rank or generate a headline.

## 4. Validation, algorithm, limits

1. Validate input as object, `assessment` present, `slides` an array. **Always call existing `buildPaidAssessmentDeliverableProjection(input.assessment)` first** for upstream input, provenance and readiness checks. Do not accept a caller-forged `DeliverableProjection`.
2. `slides` must contain 1..40 entries. This upper bound is a technical render-size guard, not a fixed business chapter/slides count. Each entry is object with nonblank `sectionId`; resolve it from D1 projection's `sections`, not from raw unchecked input. It must contain 1..4 unique, nonblank `statementIds`; every referenced statement must belong to that **exact** D1 section. Reject unknown section, statement, duplicate within a slide, and cross-section link with `TypeError`. The same D1 statement may legitimately appear on different slides/sections; do not treat it as new FACT or duplicate authority. Preserve the supplied slide order and the chosen statement order.
3. Content-fit guards to avoid hidden clipping: `customerLabel` <=80 Unicode code points, `purpose` <=160, section title <=60, each selected statement text <=90, and sum of selected statement text code points per slide <=240. Use `Array.from(text).length` to count Unicode code points. Exceeding any limit throws `TypeError` with a useful field name; **never silently truncate or create AI paraphrases**. These limits apply to PPTX display only and do not change D1/D2 business scope. A human can choose shorter D1 statements or fewer items.
4. Reviewer-note content, including sources and `relatedRefs`, must not exceed 20,000 code points per selected slide. Reject oversize; do not truncate and do not copy source hashes. No private contact details, credentials or raw Evidence bytes are introduced by renderer. Source data is **caller-supplied reference**, not a Core authentication.
5. Stable path-safe file naming exactly `assessment-<sanitizedReportId>.draft.pptx` where sanitized ID contains only `[A-Za-z0-9_-]`, first 48 permitted characters; when empty use `assessment-report.draft.pptx`. Never use `customerLabel`, timestamps, slash/backslash, CRLF or path traversal in filename.
6. Construct a single PptxGenJS presentation with `layout='LAYOUT_WIDE'` (16:9), Japanese-capable font `Yu Gothic` fallback, generous margins and fixed body text boxes. No image placeholders, auto-generated graphs, custom slide master infrastructure or marketing illustrations. Slide 1 cover has title `IT経営KAIZEN 改善計画書 — 経営判断用要約`, customerLabel, purpose, prominent `内部確認用・未承認`. Slide 2 `内部確認状況` has exact readiness mapping: REVIEWABLE_DRAFT=`下書き確認可能`, NEEDS_CONFIRMATION=`追加確認が必要`, BLOCKED_BY_EVIDENCE=`根拠の確認が必要`. Show reason count on status slide; if no reasons, `正式承認・顧客納品前`. Place **all exact D1 reason codes** in slide-2 speaker notes; do not replace them with fabricated customer statements.
7. Add one content slide per selection, in the selection order. Title = D1 section `title`. Each selected statement has explicit Japanese kind label plus verbatim text, in supplied order. Use the following ten fixed labels; no semantic detection from text: FUTURE=`実現したい会社の姿`; VERIFIED_FACT_REFERENCE=`確認済み事実への参照（要照合）`; CUSTOMER_STATEMENT=`お客様のご発言`; UNKNOWN=`まだ確認できていないこと`; OBSERVATION=`観察事項`; RISK_IMPACT=`リスク・経営への影響`; HYPOTHESIS=`原因仮説`; PROPOSAL=`改善案`; DECISION_CANDIDATE=`経営判断の候補（未承認）`; EXPECTED_CHANGE=`期待する変化（未検証）`. This is a small fixed presentation label table, **not** an analysis/FACT registry. Do not import D2 renderer just to reuse private constants or modify D2; customer wording must agree with docs/77 and D2 labels.
8. Each content slide's speaker notes record its D1 sectionId and each selected D1 statementId/kind, `sourceRefs` kind/id/version, and `relatedRefs` kind/id in order; no `hash` or Evidence bytes. If no source: `未確認事項（現時点では根拠未取得）` for UNKNOWN, else `根拠参照：未提示`. Do not make notes into an independent new narrative. Include an internal notice that these are references and not verified authorization.
9. EVERY slide, including cover, status and selected slides, prominently carries `内部確認用・未承認`. Human Decision candidates always remain candidates, and Expected Change never becomes actual result. D1 readiness passes through unchanged, whether REVIEWABLE_DRAFT, NEEDS_CONFIRMATION or BLOCKED_BY_EVIDENCE. All states produce internal review drafts; none constitutes approval or customer delivery.
10. Export with `await pptx.write({outputType:'nodebuffer',compression:true})`; assert a non-empty Buffer with PK ZIP signature and return it. Return a detached `reviewReasons` array and no mutable shared input references. Never write disk, call API/DB/FACTACT/AI, contact external services or auto-send. No PDF. No file content re-interpretation.

## 5. Tests (real OOXML, plus in-person Office check)

New test file must use existing `fflate` to unzip PPTX and inspect `ppt/slides/slideN.xml` and `ppt/notesSlides/notesSlideN.xml`. Verify actual `[Content_Types].xml` and ZIP PK signature. Do not only mock `addText`.

At minimum:
1. Real PPTX with correct mime, internal status on all slides, path-safe .draft.pptx filename, cover, status, 2 selected slides and correct total slideCount.
2. Selection changes *which* source statement appears; slide text and title remain verbatim; no new conclusion/summary, no auto extra slides; order follows human slide selection and statementIds.
3. Ten category labels preserved; UNKNOWN≠FACT, Hypothesis≠confirmed, Decision Candidate≠authenticated, Expected Change≠Actual Change, Core source never becomes an authenticated record.
4. Selected source kind/id/version and typed relatedRefs appear in notes, while source hash does not appear anywhere in the PPTX XML.
5. Every readiness state and reason codes: REVIEWABLE_DRAFT has no customer approval; NEEDS_CONFIRMATION and BLOCKED stay unapproved; exact reasons kept in notes, no slide delivery permission.
6. Reject unknown/duplicate section/statement IDs, cross-section statement refs, invalid `slides`, null entries, invalid D1 source. Allow the same raw statement ID across *separate* valid slide selections.
7. Unicode, XML special characters, line breaks, source types preserve meaning and do not corrupt OOXML; filenames reject path traversal, CRLF, long and Japanese-only report IDs.
8. Reject each size guard (>40 slides, >4 statements, >90 per statement, >240 total, >60 title, >80 customer label, >160 purpose, >20k note characters) and never silently clip.
9. D1 input unchanged; repeated runs same semantic text/order/status and no new timestamp/actor/approval/rank/ROI; zip bytes need not be identical.
10. Open one generated internal PPTX in Microsoft PowerPoint; verify Japanese rendering, fit, no overlap/off-slide text, and notes access. Report actual manual check result separately from automatic tests.

## 6. Execution and STOP

1. Confirm latest D2 PR #83 (including pending render-size correction), corrected D2 HEAD, planning doc and seven existing upstream domains. Only start D3 from the **current corrected D2 HEAD** after it has passed validation; never assume the earlier head is still current.
2. Create new branch `feat/paid-assessment-executive-slides-phase-d3-20261122` from corrected D2 PR HEAD. Open stacked Draft PR base `feat/paid-assessment-word-draft-phase-d2-20261122`. No changes to previous PRs.
3. `npm ci`, `npm run build`, new D3 tests, **all existing D1+D2 regression tests at starting HEAD**, `git diff --check`; compare actual test totals, do not invent a fixed number if D2 changed. Only when ALL PASS, Commit / Push / Draft PR. Report SHA, files, dependency versions, actual test totals, all Canonical Fit/Gap and unresolved points.
4. STOP before implementation if the corrected D2 HEAD is missing, chosen PPTX library is incompatible with Node>=20/TS CommonJS, the four-file scope must expand, or an unapproved semantic/Business/FACTACT authority change is required. Report exact mismatch and minimal alternatives for our decision.
5. No Merge, Migration, GCP, Production, approval, actual customer delivery, AI narrative writing or external file storage.
