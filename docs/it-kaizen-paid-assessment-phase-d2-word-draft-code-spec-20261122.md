# IT経営KAIZEN 設計Assessment Phase D2 — Word-first DOCX draft renderer (code spec)

Date: 2026-11-22
Status: CODE SPEC / INTERNAL DRAFT ONLY; NO CUSTOMER DELIVERY AUTHORIZATION
Baseline: D1 Draft PR #79 HEAD `9493792615a3a5b55e818bffc33abd28aadef07a`.
Authority: git_KAIZEN docs/78 (CANONICAL Word-style detail report -> customer PDF, slides and Evidence Book), docs/77 (CANONICAL Japanese customer language), docs/23 (CANONICAL epistemic separation), docs/75 (PILOT PROPOSAL; chapter/scenario layout not fixed).

## Fit/Gap
- D1 builds a validated, read-only, provenance-aware deliverable projection from human-authored sections/statements and C1–C4c review projections. D1 does NOT authenticate CORE_VERIFIED_REFERENCE or human Decision. D1 is the sole source for all downstream views.
- Sales Tools has no actual Word report renderer. Existing `src/services/freeDiagnosisDesignV2ReportPdf.ts` generates a different free diagnosis PDF via Playwright; do not repurpose or edit.
- D2 generates an actual Office Open XML .docx Buffer for **internal review only**; not a renamed HTML file, not a finished customer-facing PDF. File render, not another domain analysis slice.
- D2b will address PDF conversion and human approval/delivery gate. D3 slides, D4 Evidence Book, E workflow and F pilot follow separately.

## Allowed implementation files
- MODIFY `package.json` (new runtime dependency `docx`; exact tested version suggested `9.15.4`, confirm availability and compatibility with Node>=20 / current TS CommonJS).
- MODIFY `package-lock.json` (regenerate through npm, no unrelated changes).
- NEW `src/services/paidAssessmentWordDraft.ts`.
- NEW `test/paidAssessmentWordDraft.test.ts`.
- OPTIONAL direct devDependency `fflate` in package and lock **only** for unzipping DOCX to inspect real word/document.xml in tests. No custom ZIP writer, no new framework or template files.

## Public contract
```ts
import type {
  DeliverableProjectionInput,
  DeliverableReadiness,
} from '../domain/paidAssessmentDeliverableProjection';

export interface PaidAssessmentWordDraft {
  reportId: string;
  filename: string;
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  bytes: Buffer;
  readiness: DeliverableReadiness; // never delivery permission
  reviewReasons: string[];
  sectionCount: number;
  status: 'INTERNAL_REVIEW_DRAFT';
}
export async function renderPaidAssessmentWordDraft(
  input: DeliverableProjectionInput,
): Promise<PaidAssessmentWordDraft>;
```
- Import and invoke `buildPaidAssessmentDeliverableProjection(input)` **inside render** to revalidate; never trust a caller-forged projection. Use `docx` Document/Paragraph/TextRun/HeadingLevel/Packer.toBuffer. All text goes through OOXML-safe library text objects, not HTML interpolation.
- Only return Buffer; never write disk or call API, DB, FACTACT, AI, HTTP, or cloud. No writable endpoint in this slice.

## Content rules, exact ordering
1. A4 portrait; readable Japanese (Yu Gothic where available), clear title/section/body hierarchy, safe margins and spacing. Simple professional style, not a pixel-perfect marketing design. No fixed chapter number or fabricated content.
2. Cover: `IT経営KAIZEN 改善計画書`, D1 `customerLabel`, `purpose`, and conspicuous `内部確認用・未承認` at ALL review states. Explain that Decision Candidate is not authorized, Expected CHANGE not measured actual CHANGE. Never invent report date, verifier, actor or approval.
3. Immediately after cover: internal review status. Map `REVIEWABLE_DRAFT` -> `下書き確認可能`; `NEEDS_CONFIRMATION` -> `追加確認が必要`; `BLOCKED_BY_EVIDENCE` -> `根拠の確認が必要`. Print actual D1 `reviewReasons` codes as internal reviewer annotations, without rewriting them into unsupported factual customer statements. If none, show `正式承認・顧客納品前`.
4. Render all D1 `sections` in original order. For each: `title` as Heading1; `narrative` as body prose with line breaks preserved (paragraphs / breaks), then each section's `statements` in original order: explicit Japanese kind label + `text` verbatim + `sourceRefs` kind/id/version labels + `relatedRefs` kind:id internal traceability. If no source, print `根拠参照：未提示` (non-UNKNOWN); for UNKNOWN `未確認事項（現時点では根拠未取得）`. Do not transform UNKNOWN into GAP or FACT.
5. EXACT 10 kind labels: FUTURE=実現したい会社の姿; VERIFIED_FACT_REFERENCE=確認済み事実への参照（要照合）; CUSTOMER_STATEMENT=お客様のご発言; UNKNOWN=まだ確認できていないこと; OBSERVATION=観察事項; RISK_IMPACT=リスク・経営への影響; HYPOTHESIS=原因仮説; PROPOSAL=改善案; DECISION_CANDIDATE=経営判断の候補（未承認）; EXPECTED_CHANGE=期待する変化（未検証）. Hard-code a total Record mapping. Do not infer semantics from text.
6. Append `判断の根拠・参照一覧` from **D1 evidenceIndex**, in supplied order: statement ID + kind Japanese label + each source kind/id/version; this is an index, not duplicated Evidence bytes/FACTACT state. Do not expose hash contents/secret data or fabricate Core verification.
7. No forced 21 chapters, scenarios, 90-day schedule, investment amounts/ROI, actor allocations, quote, future-year commitments, recommendations, or NEW FACT. Text is human-authored and must not be AI-generated here.
8. All readiness states may produce **internal review drafts** including BLOCKED and no sections. For BLOCKED, prominent warning and reasons; never represent result as approved/deliverable. For zero sections, render only cover, status and index; D1 state NEEDS_CONFIRMATION, never imply completeness.
9. Filename must be path-safe and deterministic: prefix `assessment-`, sanitized reportId containing only ASCII letters/digits/underscore/hyphen truncated to 48 chars, suffix `.draft.docx`. If sanitized value becomes empty use `assessment-report.draft.docx`. Never include customerLabel, slashes, backslashes, CRLF or traversal characters; no current clock in document text.
10. Render-size guards, not commercial scope rules: reject >200 sections or >3000 rendered statement occurrences or >1,000,000 text characters; deterministic TypeError; never silently truncate. Return detached reviewReasons, do not mutate input. OOXML ZIP metadata may not be byte-identical, so semantic ordering is deterministic but do not promise byte-for-byte identity.

## Tests / gates
- Actual .docx PK ZIP with `word/document.xml` and `[Content_Types].xml`. If using `fflate`, unzip in tests and assert Japanese title/cover, narrative, source IDs, category labels and statements appear in OOXML in correct section order.
- All ten labels; UNKNOWN!=FACT, HYPOTHESIS!=FACT, EXPECTED_CHANGE!=Actual, Decision Candidate!=approved; permanent `内部確認用・未承認`.
- Each readiness state, including BLOCKED, shows internal review warning and returned review reasons; no approval/delivery flag.
- Zero sections, newlines, XML-special characters, Unicode customer names and source refs; no fabricated scenario/date/cost/actor.
- Path-traversal/CRLF/Unicode/long reportId filename tests; oversize input rejection.
- D1 validation invoked and invalid input rejected; input immutability.
- `npm ci` from lockfile, `npm run build`, D2 new tests and **102 existing D1 regressions**, `git diff --check`. No external services.

## STOP
STOP if chosen DOCX library cannot work with Node>=20 / TypeScript CommonJS or scope requires other files; report minimal alternative without modifying compiler strategy. No prior PR changes, merge, migration, GCP, production, file delivery, email or PDF generation. Retain Draft PR.
