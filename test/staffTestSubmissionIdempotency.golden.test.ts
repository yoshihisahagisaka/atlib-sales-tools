import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideExistingSubmission, SHARED_SUBMISSION_IDEMPOTENCY_LOCK_SQL } from '../src/domain/staffTestSubmissionIdempotency';

test('new submission may create when no receipt exists', () => {
  assert.deepEqual(decideExistingSubmission(null, { mode:'STAFF_TEST',payloadHash:'a' }),{action:'CREATE'});
});
test('same mode and payload replays existing Case', () => {
  assert.deepEqual(decideExistingSubmission({mode:'STAFF_TEST',payloadHash:'a',caseId:'case-1'}, {mode:'STAFF_TEST',payloadHash:'a'}),{action:'REPLAY',caseId:'case-1'});
});
test('cross-mode collision is rejected even with matching payload', () => {
  assert.deepEqual(decideExistingSubmission({mode:'PUBLIC',payloadHash:'a',caseId:'case-1'}, {mode:'STAFF_TEST',payloadHash:'a'}),{action:'CONFLICT',code:'SUBMISSION_MODE_MISMATCH'});
});
test('different payload cannot reuse same mode key', () => {
  assert.deepEqual(decideExistingSubmission({mode:'STAFF_TEST',payloadHash:'a',caseId:'case-1'}, {mode:'STAFF_TEST',payloadHash:'b'}),{action:'CONFLICT',code:'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_SUBMISSION'});
});
test('existing advisory transaction lock primitive is reused', () => {
  assert.match(SHARED_SUBMISSION_IDEMPOTENCY_LOCK_SQL,/pg_advisory_xact_lock/);
});
