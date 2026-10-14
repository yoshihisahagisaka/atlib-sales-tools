import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Source contract checks for the isolated implementation branch.
 * These complement (do not replace) future DB transaction integration tests.
 */
const service = readFileSync(join(__dirname, '../src/services/publicCustomerSelfSubmissionService.ts'), 'utf8');
const existingAudit = readFileSync(join(__dirname, '../src/services/testCaseManagementRepo.ts'), 'utf8');
const migration = readFileSync(join(__dirname, '../migrations/035_it_management_test_case_designation.sql'), 'utf8');

test('public entry point always selects PUBLIC context', () => {
  assert.match(service, /return this\.submitWithTrustedContext\(input, \{ mode: 'PUBLIC' \}\)/);
});

test('staff simulation is blocked before DB work while consent provenance is unsupported', () => {
  const guard = service.indexOf("if (context.mode === 'STAFF_TEST')");
  const transaction = service.indexOf("const client = await this.pool.connect()");
  assert.ok(guard >= 0 && guard < transaction);
  assert.match(service, /STAFF_TEST_PROVENANCE_NOT_IMPLEMENTED/);
});

test('test Case is created as test within the submission transaction', () => {
  assert.match(service, /await client\.query\('BEGIN'\)/);
  assert.match(service, /cases\.createCase\(activity\.companyId, activity\.contactId, activity\.salesActivityId, actor, isStaffTest\)/);
  assert.match(service, /if \(isStaffTest\) \{/);
  assert.match(service, /it_management_diagnosis_test_case_designation_audit/);
  assert.match(service, /await client\.query\('COMMIT'\)/);
  assert.match(service, /await client\.query\('ROLLBACK'\)/);
});

test('initial audit uses the existing append-only designation table', () => {
  assert.match(migration, /CREATE TABLE it_management_diagnosis_test_case_designation_audit/);
  assert.match(migration, /action TEXT NOT NULL CHECK \(action IN \('DESIGNATED','RELEASED'\)\)/);
  assert.match(existingAudit, /INSERT INTO it_management_diagnosis_test_case_designation_audit/);
  assert.match(service, /'Authenticated staff test submission at Case creation'/);
});

test('idempotent replay checks stored normal/test designation', () => {
  const matches = service.match(/SUBMISSION_MODE_MISMATCH/g) ?? [];
  assert.equal(matches.length, 2);
});
