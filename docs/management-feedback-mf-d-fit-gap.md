# Management Feedback MF-D — reconciliation and Fit/Gap

2026-09-14. **Production / Controlled Customer Pilot: NO-GO.**

## Baseline and execution order

Fetched before editing. Local `6fe142bd2ef633ced83af99d438513e71c07f0bc` was an ancestor of remote `387bdcad15f1c74456bf193b9c53491fcf27babf`; integrated all 73 commits by fast-forward. Parallel MF-A/B/C, retention worker, external-manifest adapter and Pilot Evidence capture were retained. PR #2 remains Draft/Open; main was not merged.

Incoming CI `34840564743` failed because real PostgreSQL fixtures proposed Assessment without the required explicit Human C decision. Browser fixtures also attempted to replace a grounded WHY block with an ungrounded hypothesis. Corrected these fixtures to exercise the current contract, then verified build, 102 application/security tests, 7 PostgreSQL tests (including parent), and 32 browser tests before starting MF-D. Three opt-in real-AI tests remained skipped.

SSOT refs and external Critical Path are recorded in [Closure status](controlled-pilot-policy-closure-status.md). Development doc 79's FEEDBACK_COMPLETED precondition takes precedence over earlier progress descriptions. Business doc 71 defines the output contract; A/B/C/D remain application projections.

## Fit / Gap and implementation

| Requirement | Incoming fit/gap | MF-D result |
|---|---|---|
| Immutable, append-only Decision | MF-C table 015 already has immutable update/delete guards and supersession | Reuse it; no migration, new object or Core change |
| Future / FUTURE UNKNOWN | Existing Future reference lacked explicit knowledge status | v2 freezes id/version/intention and UNKNOWN or CUSTOMER_STATED; no duplicated Future statement |
| Approved Observation, UNKNOWN, GAP, hypotheses | Existing versioned insight references cover most requirements | Explicit observation/GAP/UNKNOWN/hypothesis/evidence-candidate reference lists; preserve epistemic types; absent candidates stay absent |
| WHY and Evidence Needed | Existing OPEN confirmation ids; no frozen WHY reference connections | Freeze existing reviewed provenance connections and OPEN confirmation refs; do not infer missing connections |
| Approved Report | Existing id/version/content and approval snapshot hashes | Preserve hashes; reject a new Decision if current context differs from the approved Report; use existing Human reissue/approval/Feedback loop |
| Route, material Decision, next action, Human/time | Existing immutable columns, but outside context hash | v2 hash also binds Decision id/version, route, material decision, next action, staff id/system time and predecessor |
| Customer restatement | Same-case FEEDBACK_STATEMENT reference already validated | Preserve reference only; no restatement raw content in snapshot |
| Re-decision and Closed cases | Append-only writes already fit; reading was tied to FEEDBACK_COMPLETED | New version supersedes without modifying old row; staff history remains readable after Close, during reissue, and after raw deletion |
| Retention | Worker already restricts approved evidence from destruction | Add Decision rows to approved-evidence inventory; preserve rows, hashes and history |

v1 records are returned unchanged, without fabricated historical fields or rehashing. v2 retains the existing JSON structure with additive fields; the legacy `future.statement` slot is null. Approved Report snapshots remain the immutable approved-content reference. This is an application continuity record, not an Evidence-confirmed FACT. Human-entered Decision text is stored because it is the decision record; raw SurveyResponse, Transcript, feedback statement and AI payloads are not copied by the snapshot builder.

Latest Human C still only permits a subsequent, separate Human Assessment proposal. A/B/D and AI actors acquire no proposal or Decision authority. No atLIB Actor is auto-selected. No price or customer promise was added.

## Validation

Current local full regression: build PASS; 107 application/security tests PASS, three opt-in real-AI tests SKIPPED; real PostgreSQL 17: 8 PASS (parent plus seven scenarios); Chromium desktop/mobile: 32 PASS. CI includes MF-A/B/C/D explicitly. Remote exact-commit CI must be checked after push; these local results do not assert remote CI or deployment success.

MF-D tests cover complete hash binding, Future UNKNOWN after context correction and report reapproval, supersession preserving old bytes, audit rollback, conflicting commands, raw deletion, Closed history and legacy compatibility. Real PostgreSQL also verifies multi-connection serialization, direct SQL UPDATE/DELETE rejection and rollback on audit failure. Tests use synthetic data and fake AI providers. No real provider, GCP or S-company execution evidence was produced.

## Remaining external gates and decision referrals

1. Actual retention/deletion operation, external manifest storage, Cloud SQL backup/PITR/restore, deletion reconciliation, RPO <=24h, requested internal RTO <=8h and backup retention 30 days.
2. Real Anthropic AI-01–04 and provider retention/privacy; Google OAuth allowed/denied paths; Secret Manager/IAM; Cloud Run worker behavior; ingress/proxy/rate limiting; monitoring/alert delivery.
3. Real staging WEB/SALES_VISIT E2E, Privacy/Legal approval, named Pilot owner/incident contact, and Human operation/role-play evidence.

**Business Decision Required:** reconcile doc 66's internal RTO <=24h with this task's <=8h verification target before Canonical/customer promise changes. Price reconciliation (newer 120万円 vs historical 80万円) remains a prerequisite if pricing is connected later; this change does not connect it.

**Product Decision Required:** typed temporal semantics and Diagnosis → Assessment → FACTACT mapping remain in the Product lane. MF-D requires neither to be decided and introduces no Core Object/authority/boundary change. MF-E instrumentation and MF-F mapping are separate future slices.

Green automated checks do not close external or operational gates and do not authorize Pilot GO.
