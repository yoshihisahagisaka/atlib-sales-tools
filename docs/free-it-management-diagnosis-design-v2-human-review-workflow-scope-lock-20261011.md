# Free IT Management Diagnosis Design v2 — Human Review Workflow Scope Lock

Date: 2026-10-11
Status: DECISION LOCKED

## Decision

The current Design v2 system boundary is sufficient for this phase.

The system must NOT analyze Hearing memo free text in order to automatically change structured answers, automatically re-run diagnosis semantics, or automatically generate customer-facing narrative from memo text.

Hearing memo remains a Human Review information source only.

The intended operating flow is:

1. Original Survey is preserved as immutable historical input.
2. During Live Hearing, the operator records memo against the relevant hearing theme where possible.
3. In Post-Hearing Analysis, the operator reviews Hearing memo and Original Survey.
4. If hearing changes the operator's understanding, the operator explicitly changes the Current Structured State (Q2–Q7 only).
5. The system re-runs deterministic analysis using the updated Current Structured State.
6. The system generates the current analysis and generated narrative from that structured state.
7. A human reviews and, when necessary, edits the customer-facing narrative.
8. Human Review / Approval remains authoritative for the customer-facing output.

## Human responsibility

Humans remain responsible for:

- interpreting what was learned in the hearing,
- deciding whether a survey answer should change,
- explicitly updating Current Structured State,
- deciding whether re-analysis is necessary,
- reviewing the regenerated analysis,
- reviewing and editing customer-facing narrative,
- deciding whether the output is appropriate to deliver,
- later deciding whether paid Assessment is appropriate.

## System responsibility

The system remains responsible for:

- preserving Original Survey history,
- presenting hearing viewpoints and provenance,
- storing Hearing memo as record only,
- preserving Current State revisions,
- deterministic re-analysis from Current Structured State,
- deterministic generated narrative,
- freshness / stale guards,
- provenance and revision history,
- supporting Human Review without replacing it.

## Explicitly out of scope for this phase

Do not add:

- AI extraction from hearing memo,
- automatic answer correction from hearing memo,
- automatic semantic state mutation from hearing memo,
- automatic customer narrative generation directly from hearing memo,
- automatic conclusion that a memo implies a finding, problem, recommendation, or Assessment scope,
- LLM summarization as a required diagnosis step,
- recording / speech-to-text derived diagnosis input.

These may be reconsidered in a future phase only after separate product, governance, audit, and Human Authority review.

## UX implication

The remaining Package D work is UX / traceability support only.

The UI should help a human move through:

Hearing Theme
→ Theme Memo
→ Related Survey Question(s)
→ Human Current State Update
→ Deterministic Re-analysis
→ Related Analysis Section(s)
→ Related Generated Narrative Section(s)
→ Human Customer-facing Edit.

This traceability must not be interpreted as memo-driven automation.

A hearing theme may map to multiple survey questions, analysis items, and narrative sections. The UI may expose those relationships for review and navigation.

## Acceptance principle

The objective is not to make the system decide more.

The objective is to make it easy for a human to understand:

- what was originally answered,
- what was learned in the hearing,
- what should be reconsidered,
- what changed in the current understanding,
- why the analysis changed,
- where that analysis appears in the customer-facing narrative.

FACTACT principle remains:

AI Suggests. Human Decides. Authority Governs. Executes & Records.
