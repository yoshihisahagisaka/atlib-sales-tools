# Design Assessment — Human Final Scope / Price Decision Fit-Gap and Implementation Gate
Date: 2026-11-17
Status: CODE-DESIGN GATE; NO IMPLEMENTATION AUTHORIZATION
Baseline: Git main 850e1f0bc9c6a2d269b0d5f71d239c1c98df05ae; Assessment branch includes eligibility projection 56a0be16880fbb9875c0a154ee6e3437cbba0371.

## Canonical verified
- git_KAIZEN docs/83-assessment-scope-commercial-adjustment-rules-v1.md (Business CANONICAL): COMPACT ¥800k, sales discretion ¥750–790k, below ¥750k supervisor approval; STANDARD ¥1.2m, sales discretion ¥1.0–1.19m, below ¥1.0m generally prohibited / Management Review; REVIEW no final quote; EXPANDED ¥1.2m + individually agreed additional scope.
- git_KAIZEN docs/84-assessment-scope-recommendation-human-decision-business-requirements-v1.md: system suggests, human decides, immutable snapshot with confirmed state, remaining UNKNOWN, scope, estimated confirmation load, recommendation and rationale, final scope/price, discount approval, actor/time. Reuse existing diagnosis; no additional blanket survey.
- Existing src/domain/assessmentStructureRule.ts and migration 027: deterministic system suggestion, immutable, no final commercial decision.
- Existing src/middleware/staffAuth.ts, src/services/staffAuthService.ts: email-authenticated staff only, no admin/supervisor/management authority claim; explicitly says atlib.jp staff share same rights.
- Existing migration 016 assessment_scope_clarifications is tied to legacy diagnosis_cases, not v2. Do not reuse FK by renaming.
- Existing v2 eligibility projection provides validated read-only report and feedback decision references; no payment acceptance or quote approval.

## FIT/GAP
| Topic | Classification | Evidence |
|---|---|---|
| Scope recommendation, base price, grounds | FIT | src/domain/assessmentStructureRule.ts; migration 027 |
| Approved diagnosis and route source references | FIT | src/services/designV2AssessmentEligibility.ts; feedback decision/report tables |
| Final human commercial decision and immutable versions | GAP | migration 027 explicitly excludes commercial_final_decision; no corresponding existing code found in targeted search |
| Approval authority | GAP | StaffAuthService session carries email only, no supervisor/management authority |
| Existing scope clarification table for v2 | CONFLICT | migration 016 FK points to legacy diagnosis_cases |
| FACTACT API | UNKNOWN, irrelevant to local commercial decision | Await Product lane |

## Narrow design choices for this lane (not a new Business decision)
1. Keep commercial final decision in Sales Tools Assessment application boundary, separate from FACTACT's authoritative domain FACT/Evidence.
2. Never automatically convert a suggestion to final decision; REVIEW must remain unpriced.
3. Link every future immutable final decision to the v2 case, exact latest approved feedback decision/report and the specific suggestion (when present), plus an explicit source snapshot, UNKNOWN and decision rationale.
4. Any price requiring approval must fail closed without a verified approver authority. Do not treat a free-text approver email as proof.
5. Prefer existing staff/approval primitives if an exact matching authority source is found; do not introduce generic organization-wide RBAC or guess admin emails.
6. Distinguish proposal/draft from final decision; never record an unapproved exception as FINAL.
7. Use append-only versioning for final and subsequent scope revisions; preserve original decisions.
8. No new endpoints or DB migrations until authority and workflow contract have been resolved.

## Minimal bounded read-only task to resolve remaining implementation design
Check existing atlib-sales-tools staff auth and commercial approval call sites, plus approved existing msp-customer-portal admin_principals design only if directly reusable, and report:
A. Is there a verifiable existing supervisor/management approval authority contract accessible from Sales Tools? Exact code/schema and trust boundary.
B. What minimal current staff identity/role context can a service receive without new platform-wide RBAC?
C. What existing append-only human decision and audit pattern should be reused for v2 commercial decision? Identify exact code/migration and transactional pattern.
D. Is the v2 scope recommendation persisted as preliminary/recommendation with stable ID, and how can the most recent record be read deterministically?
No edits, no branch operations, no broad search, no GCP/DB/Production changes. If no authority source exists, report GAP and STOP, not a guessed workaround.

## STOP
Do not implement commercial FINAL, approval authority or Handoff persistence until exact authority, source snapshot, transaction/locking and pricing exceptions are specified at code level here.
