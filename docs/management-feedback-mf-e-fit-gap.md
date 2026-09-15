# MF-E — Pilot Instrumentation Fit/Gap

2026-09-16. Production / Controlled Customer Pilot: **NO-GO**.

## Baseline and source inventory (before implementation)

Fetched feature/local HEAD: `f03aa649e96d3bc9785e2747a770937296a4a726`; PR #2 Draft/Open, unmerged; CI `34843579645` SUCCESS. No integration required. SSOT: git_KAIZEN Development `f4aba98`, doc 80 MF-E Handoff and unchanged docs 76–79; Business `68ab883`, doc 71 Management Feedback Business Contract. MF-D and Closure status documents reviewed. MF-A/B/C/D remain intact.

Counts below measure persisted application observations, not all offline activity, business value or Evidence-confirmed FACT. Missing evidence returns null with NOT_OBSERVED / NOT_DERIVABLE / INCOMPLETE. Positive counts do not claim complete real-world coverage.

| Metric / classification | Authoritative table and event | Derivation / missing meaning |
|---|---|---|
| ai_suggestion_count / DERIVED | ai_proposals; diagnosis_reports.source_ai_execution_id; ai_executions | Proposal rows plus AI-generated Report drafts (one draft, not blocks). Zero only with a SUCCEEDED execution proving observation; absent runs => NOT_OBSERVED |
| ai_failure_count / DERIVED | ai_executions.status | Persisted FAILED executions; zero only when executions exist; no execution => NOT_OBSERVED |
| human_ai_correction_count / DERIVED | diagnosis_audit_logs | STAFF EditAndAcceptAIProposal, ApproveAIProposalWithEdit, ConvertProposalToUnknown; UpdateReportWording only for a same-case AI draft. Counts explicit edit commands, not inferred semantic differences; absent => NOT_OBSERVED |
| human_ai_rejection_count / DERIVED | diagnosis_audit_logs | STAFF RejectAIProposal; ResolveInterviewSuggestion with UNNECESSARY. ASK is not semantic approval. Absent => NOT_OBSERVED |
| human_approval_count / DERIVED | diagnosis_audit_logs | STAFF AcceptAIProposal, EditAndAcceptAIProposal, ApproveAIProposal, ApproveAIProposalWithEdit, ConvertProposalToUnknown, CreateHumanInsight, CreateAssessmentConfirmationItem, ConfirmDiagnosisPlan, CompleteHumanReview, ApproveReport; one command counted once, never also its human_reviews mirror. No FACT promotion; absent => NOT_OBSERVED |
| customer_correction_or_restatement_observed / DERIVED | source_records; management_feedback_decisions | Same-case FEEDBACK_STATEMENT ids / Decision references only. Existence proves a recorded statement, not semantic correction or understanding. Missing => NOT_OBSERVED, not false |
| selected_route / DERIVED | management_feedback_decisions | Latest version's existing Human route. Missing => NOT_OBSERVED |
| redecision_count / DERIVED | management_feedback_decisions | Chain length minus one only if version/supersedes chain complete; gaps => INCOMPLETE |
| assessment_proposed_after_route_c / DERIVED | management_feedback_decisions; diagnosis_audit_logs | Latest C plus matching STAFF RecordManagementFeedbackDecision event followed strictly by separate STAFF ProposeAssessment. Database audit timestamps determine order (not application clock); ambiguous equal timestamps or missing decision audit => INCOMPLETE. A/B/D or C with NOT_PROPOSED and no proposal => false. Prior proposal alone does not satisfy latest C |
| manual_fallback_count / DERIVED (limited scope) | diagnosis_audit_logs | Explicit CreateHumanReportDraft commands only; counts manual report paths without assuming AI failure caused them. Other fallback / duplicate re-entry is NOT_DERIVABLE, absent commands => NOT_OBSERVED |
| feedback_preparation_duration / DERIVED (elapsed) | diagnosis_reports.created_at/approved_at | Latest report draft creation → approval elapsed seconds, including waiting, not active labor. One missing endpoint => INCOMPLETE; none => NOT_OBSERVED |
| human_review_duration / DERIVED (elapsed) | case_transitions | Latest entry to HUMAN_REVIEW_REQUIRED → subsequent CompleteHumanReview; return-to-review starts another interval. Missing endpoint => INCOMPLETE; none => NOT_OBSERVED. Includes waiting, not active labor |
| feedback_conversation_duration / NOT_DERIVABLE | No authoritative actual-conversation clock | StartFeedback/CompleteFeedback are application commands, not proof of actual conversation boundaries. Separate recorded_feedback_elapsed exposes their interval for the same Report; never relabeled actual talk time |
| existing_coded_pilot_evidence / MANUAL_CODED | diagnosis_audit_logs / STAFF RecordControlledPilotEvidence | Whitelist confusing_question_codes, unknown_pattern_codes, operator_correction_categories, ai_misclassification_categories, management_feedback_reaction, customer_feedback_signal; retain coded Human observations separately; absent => NOT_OBSERVED |

## Implemented projection / minimization

Staff-only GET `/api/admin/it-management-diagnosis/cases/:id/pilot-instrumentation`. One repeatable-read, read-only transaction; no Case lock/version update, audit write, AI call, Decision or Assessment action. SQL selects only metadata or named JSON scalars/categories, never raw payloads, report bodies, contact information, actor email, restatement text or arbitrary audit detail_json. Existing manual PilotEvidence API/history stays; legacy completion_status/next_action_code become optional to avoid duplicate required entry. No Pilot Evidence form currently exists in public UI; do not add a duplicate measurement form.

Response: `case` contains id/version/status only; `metrics` contains classification/status/value; `references` contains sanitized Decision versions/hashes, same-case statement ids, and audit command ids/timestamps. The response is `Cache-Control: no-store`. Repository and HTTP staff authentication both apply. Existing recorded categories remain manual observations and never override the derived route, count or lifecycle.

Coverage limits: suggestion units are persisted `ai_proposals` plus AI Report drafts, not counts of sentences, Report blocks or unpersisted provider-output candidates. Correction/approval metrics count the explicit commands listed above, not offline work or inferred edits. No claim is made about unrecorded re-entry, actual active work time, or why a manual report was chosen. Durations describe the latest recorded cycle/report; history remains available through reference ids. The instrumentation read model adds no new data-retention authority.

## Migration and boundaries

No migration or duplicate measurement/event table is needed. Existing metadata survives current raw anonymization; missing/purged metadata is not reconstructed. MF-F / Core changes are out of scope.

Business Decision Required: RTO 24h Canonical vs internal 8h verification target; 120万円 vs old 80万円 before any price connection. No customer SLA or price change here. Product Decision Required: typed temporal semantics and Diagnosis → Assessment → FACTACT mapping.

External Evidence remains open: actual retention/deletion, external manifest storage, Cloud SQL backup/PITR/restore/reconciliation, real Anthropic, Google OAuth, Secret Manager/IAM, Cloud Run worker, ingress/proxy/rate limit, monitoring/alert, staging E2E, Legal/Privacy, Pilot owner/incident contact and Human role-play. Synthetic tests cannot close these gates.

## Validation

Local validation completed: TypeScript build PASS; 115 application/security tests PASS (including MF-E 8, MF-A/B/C/D 14), three real-AI opt-in tests SKIPPED; real PostgreSQL 17: 9 PASS including the parent; desktop/mobile Chromium: 32 PASS. Readiness collector/rehearsal script syntax checks and git diff whitespace check PASS. CI now includes `test:management-feedback-mf-e`; exact pushed-HEAD CI must be checked separately.

MF-E Golden coverage: AI generation/correction/approval/rejection/failure, avoiding mirrored-review double counting, A/B/D and C-only behavior, separate Human proposal after C, latest-C supersession, old snapshot preservation, concurrent reads without mutation, raw deletion continuity, unavailable audit metadata, timestamp ambiguity, incomplete durations, metadata-only privacy (including actual synthetic Transcript/Survey/AI sentinel payloads), staff-only API and existing AI Decision prohibition. PostgreSQL repeats concurrent reads across separate connections and Decision/Audit continuity through raw deletion. All customer fixtures are synthetic; real AI and external operational evidence were not executed.
