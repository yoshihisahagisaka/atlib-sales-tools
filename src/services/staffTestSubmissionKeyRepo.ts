import type { PoolClient } from 'pg';
import {
  decideExistingSubmission,
  SHARED_SUBMISSION_IDEMPOTENCY_LOCK_SQL,
  type SubmissionMode,
} from '../domain/staffTestSubmissionIdempotency';

/**
 * Future shared public/test idempotency lookup. NOT wired into live submission.
 * Both modes must acquire this transaction-scoped lock before either inserts.
 * Requires the unnumbered staff-test receipt draft to be approved and migrated.
 */
export async function inspectSubmissionKeyWithinTransaction(
  client: PoolClient,
  input: { key: string; mode: SubmissionMode; payloadHash: string },
): Promise<
  | { action: 'CREATE' }
  | { action: 'REPLAY'; caseId: string }
  | { action: 'CONFLICT'; code: string }
> {
  await client.query(SHARED_SUBMISSION_IDEMPOTENCY_LOCK_SQL, [input.key]);
  const publicReceipt = await client.query<{
    payload_hash: string;
    it_management_diagnosis_case_v2_id: string;
  }>(
    `SELECT payload_hash,it_management_diagnosis_case_v2_id
       FROM it_management_public_self_submission
      WHERE idempotency_key=$1`,
    [input.key],
  );
  const testReceipt = await client.query<{
    payload_hash: string;
    diagnosis_case_id: string;
  }>(
    `SELECT payload_hash,diagnosis_case_id
       FROM it_management_staff_test_submission_receipt
      WHERE idempotency_key=$1`,
    [input.key],
  );
  if (publicReceipt.rows.length > 1 || testReceipt.rows.length > 1) {
    throw new Error('DUPLICATE_SUBMISSION_RECEIPT');
  }
  if (publicReceipt.rows.length && testReceipt.rows.length) {
    throw new Error('CROSS_MODE_SUBMISSION_RECEIPT_CORRUPTION');
  }
  const existing = publicReceipt.rows[0]
    ? {
        mode: 'PUBLIC' as const,
        payloadHash: publicReceipt.rows[0].payload_hash,
        caseId: publicReceipt.rows[0].it_management_diagnosis_case_v2_id,
      }
    : testReceipt.rows[0]
      ? {
          mode: 'STAFF_TEST' as const,
          payloadHash: testReceipt.rows[0].payload_hash,
          caseId: testReceipt.rows[0].diagnosis_case_id,
        }
      : null;
  return decideExistingSubmission(existing, input);
}
