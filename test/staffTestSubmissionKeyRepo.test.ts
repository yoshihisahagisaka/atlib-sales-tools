import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectSubmissionKeyWithinTransaction } from '../src/services/staffTestSubmissionKeyRepo';
import type { PoolClient } from 'pg';

function fakeClient(publicRows: unknown[], testRows: unknown[]) {
  const calls: string[] = [];
  const client = {
    query: async (sql: string) => {
      calls.push(sql);
      if (sql.includes('FROM it_management_public_self_submission')) return { rows: publicRows };
      if (sql.includes('FROM it_management_staff_test_submission_receipt')) return { rows: testRows };
      return { rows: [] };
    },
  } as unknown as PoolClient;
  return { client, calls };
}

test('shared lock is acquired before reading either receipt', async () => {
  const {client,calls} = fakeClient([],[]);
  assert.deepEqual(await inspectSubmissionKeyWithinTransaction(client,{key:'k',mode:'PUBLIC',payloadHash:'h'}),{action:'CREATE'});
  assert.match(calls[0]!,/pg_advisory_xact_lock/);
  assert.match(calls[1]!,/it_management_public_self_submission/);
  assert.match(calls[2]!,/it_management_staff_test_submission_receipt/);
});

test('public receipt blocks staff test reuse of the same key', async () => {
  const {client} = fakeClient([{payload_hash:'h',it_management_diagnosis_case_v2_id:'c'}],[]);
  assert.deepEqual(await inspectSubmissionKeyWithinTransaction(client,{key:'k',mode:'STAFF_TEST',payloadHash:'h'}),{
    action:'CONFLICT',code:'SUBMISSION_MODE_MISMATCH',
  });
});

test('test receipt blocks public reuse of the same key', async () => {
  const {client} = fakeClient([],[{payload_hash:'h',diagnosis_case_id:'c'}]);
  assert.deepEqual(await inspectSubmissionKeyWithinTransaction(client,{key:'k',mode:'PUBLIC',payloadHash:'h'}),{
    action:'CONFLICT',code:'SUBMISSION_MODE_MISMATCH',
  });
});

test('same mode retries are idempotent; dual receipt is corruption', async () => {
  const {client} = fakeClient([],[{payload_hash:'h',diagnosis_case_id:'c'}]);
  assert.deepEqual(await inspectSubmissionKeyWithinTransaction(client,{key:'k',mode:'STAFF_TEST',payloadHash:'h'}),{
    action:'REPLAY',caseId:'c',
  });
  const dual = fakeClient([{payload_hash:'h',it_management_diagnosis_case_v2_id:'c'}],[{payload_hash:'h',diagnosis_case_id:'d'}]);
  await assert.rejects(()=>inspectSubmissionKeyWithinTransaction(dual.client,{key:'k',mode:'PUBLIC',payloadHash:'h'}),/CROSS_MODE_SUBMISSION_RECEIPT_CORRUPTION/);
});
