/**
 * Cross-mode idempotency contract for staff test vs real customer submission.
 * The existing public and proposed test receipt tables have separate PKs.
 * A shared advisory transaction lock can serialize requests with the same UUID,
 * but it does not replace cross-table lookup and unique/rollback checks.
 */
export const SHARED_SUBMISSION_IDEMPOTENCY_LOCK_SQL =
  'SELECT pg_advisory_xact_lock(hashtextextended($1,0))';

export type SubmissionMode = 'PUBLIC' | 'STAFF_TEST';

export function decideExistingSubmission(
  existing: { mode: SubmissionMode; payloadHash: string; caseId: string } | null,
  requested: { mode: SubmissionMode; payloadHash: string },
): { action: 'CREATE' } | { action: 'REPLAY'; caseId: string } | { action: 'CONFLICT'; code: string } {
  if (!existing) return { action: 'CREATE' };
  if (existing.mode !== requested.mode) {
    return { action: 'CONFLICT', code: 'SUBMISSION_MODE_MISMATCH' };
  }
  if (existing.payloadHash !== requested.payloadHash) {
    return { action: 'CONFLICT', code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_SUBMISSION' };
  }
  return { action: 'REPLAY', caseId: existing.caseId };
}
