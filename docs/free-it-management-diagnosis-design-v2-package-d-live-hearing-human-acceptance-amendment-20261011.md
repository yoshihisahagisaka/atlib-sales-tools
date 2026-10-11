# IT経営KAIZEN 無料診断 Design v2 — Package D Live Hearing Human Acceptance Amendment

Status: UX DECISION LOCKED / IMPLEMENTATION FIX REQUIRED
Date: 2026-10-11
Scope: Package D Live Hearing UI only

## 1. Human Acceptance finding

Live Hearing screen was reviewed by the product owner.

Diagnosis logic, analysis direction, and generated narrative direction remain accepted. The remaining issue is human usability of the Live Hearing UI.

The product owner confirmed that the five Hearing Viewpoints are the five cards shown on the Live Hearing screen.

Two UX requirements are now locked:

1. This amount of Live Hearing information should fit within one standard desktop viewport as much as reasonably possible.
2. Notes should be recordable per Hearing Viewpoint rather than relying only on one large global memo field.

This amendment supersedes conflicting Live Hearing layout details in earlier Package D UX fix documents. It does not change Design v2 domain semantics.

## 2. Live Hearing desktop target

For a normal desktop working size, the operator should be able to see at once:

- compact Original Survey summary on the left
- all five `今回確認したいこと` cards on the right
- a memo action/input associated with each card
- navigation to Post-Hearing

The page should not require several screens of vertical page scrolling merely to move between the five viewpoints and memo entry.

The target is not a literal guarantee for every screen resolution. The target is that a common desktop viewport such as approximately 1366×768 or larger presents the essential hearing workspace as one working surface.

If overflow is unavoidable, pane-local scrolling is preferred to long whole-page scrolling.

## 3. Original Survey compact presentation

The left pane remains read-only and immutable.

Each Q1–Q7 item should be visually separable and compact:

- Q number
- short Japanese question label
- selected answer(s)

Multi-select answers may use chips/badges.

No score, risk color, good/bad color, or maturity signal.

The left pane should use only the space required to support conversation reference.

## 4. Five Viewpoint cards

The five `hearingViewpoints` from Design v2 Analysis remain the only source of these cards.

Operator-facing heading:

`今回確認したいこと`

Each card should show by default:

- number 1–5
- short title
- short `why useful` text
- related lens badges: 技術 / 運用 / 管理
- memo control/input for that viewpoint

Example questions must not consume permanent vertical space.

They should be collapsed by default and opened only through an action such as:

`聞き方の例を見る`

No completion checkbox, completion percentage, mandatory coverage count, score, M01–M06, Primary/Secondary Focus.

## 5. Per-viewpoint memo

A memo recorded while discussing a viewpoint should be associated with that viewpoint when the existing Hearing Statement model/API can support the association cleanly.

Required behavior:

- each viewpoint card has its own memo entry affordance
- operator can append one or more notes during conversation
- memo remains a Hearing Record, not a structured diagnosis answer
- memo must not update Current State automatically
- memo text must never become direct analyzer input
- memo must not be parsed into a hidden semantic answer
- original memo history remains append-oriented

Before implementation, inspect the existing Hearing Statement API/schema for a safe existing reference field such as a plan/viewpoint reference.

If the existing schema can associate a statement with the Design v2 viewpoint ID without changing domain meaning, reuse it.

If it cannot, STOP and report Fit/Gap before adding any DB column or migration. No migration is approved by this document.

## 6. General / uncategorized memo

Not every conversation note necessarily belongs to one of the five viewpoints.

A small optional `その他メモ` affordance may remain for uncategorized notes.

It must not be the dominant memo UI and must not force a large always-open textarea that breaks the one-screen hearing workspace.

## 7. Hearing Record presentation

On the Live Hearing screen, a large separate chronological record area is not required if it makes the page excessively long.

The live operator should primarily record notes in the relevant viewpoint card.

Previously saved notes may be shown compactly within the card, for example as recent notes/count with expansion.

In Post-Hearing, all Hearing Statements must still be available in the Hearing Record layer. If a viewpoint reference exists, Post-Hearing may show the associated viewpoint label for readability while preserving the original statement text and timestamp.

## 8. Suggested desktop layout

Preferred concept:

- page header: compact
- left pane: approximately 28–32%
- right pane: approximately 68–72%
- right viewpoints: 2-column compact grid where viewport width allows
- five cards arranged 3+2 or equivalent
- example questions collapsed
- memo inputs compact by default

The exact CSS percentages are not semantic requirements; usability is the requirement.

## 9. Preserved boundaries

Do not change:

- Original Survey immutability
- Analysis Result / hearingViewpoints source
- Design v2 analyzer
- Current State semantics
- Save / Re-analysis separation
- Generated / Human Edited Narrative layers
- Healthy Guard
- UNKNOWN semantics
- FACT Candidate semantics
- Package B persistence
- Package C API semantics

## 10. Acceptance criteria

Human Acceptance can pass the Live Hearing portion when the operator can reasonably say:

- I can understand the customer's original answers at a glance.
- I can see what five topics I may want to discuss without searching down the page.
- The screen feels like conversation support, not a questionnaire.
- I can write a note against the topic I am currently discussing.
- I do not have to remember which topic a global memo belonged to.
- I can still record an uncategorized note when needed.
- Notes do not change the diagnosis automatically.
- The essential hearing workspace fits within one desktop working surface or requires only minimal pane-local scrolling.

## 11. Gate

Package D remains Human Acceptance HOLD until this Live Hearing UX and the previously identified Post-Hearing density UX are corrected and re-reviewed by the product owner.

Package E, HA7, Production migration, deploy, and traffic remain STOP.
