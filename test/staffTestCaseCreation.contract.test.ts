import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const service = readFileSync(join(__dirname, '../src/services/publicCustomerSelfSubmissionService.ts'), 'utf8');

test('public entry point always selects PUBLIC context', () => {
  assert.match(service, /return this\.submitWithTrustedContext\(input, \{ mode: 'PUBLIC' \}\)/);
});

test('staff test is rejected before any DB connection until provenance is approved', () => {
  const guard = service.indexOf("if (context.mode === 'STAFF_TEST')");
  const connect = service.indexOf('const client = await this.pool.connect()');
  assert.ok(guard >= 0 && guard < connect);
  assert.match(service, /STAFF_TEST_PROVENANCE_NOT_IMPLEMENTED/);
});

test('public application remains a non-test Case and customer-self survey', () => {
  assert.match(service, /cases\.createCase\(activity\.companyId, activity\.contactId, activity\.salesActivityId, PUBLIC_ACTOR, false\)/);
  assert.match(service, /entryChannel: 'CUSTOMER_SELF'/);
  assert.match(service, /consent_provenance\)/);
});

test('public idempotency rejects replay of an existing test Case', () => {
  assert.match(service, /SUBMISSION_MODE_MISMATCH/);
  assert.match(service, /designation\.rows\[0\]\?\.is_internal_test !== false/);
});
