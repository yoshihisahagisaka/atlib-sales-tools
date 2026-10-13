import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(__dirname, '..');
const builder = require('../scripts/migration/buildTestCaseManagementReleaseArtifact.cjs');
const preflight = require('../scripts/migration/preflightTestCaseManagementProduction.cjs');
const verifier = require('../scripts/migration/verifyTestCaseManagementProduction.cjs');
const manifestPath = path.join(root, 'migration-allowlists', 'production-test-case-management-v1-035.json');
const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

test('035 manifest fixes one SQL identity and denies migration execution', () => {
  const manifest = builder.readManifest(root, manifestPath);
  assert.equal(manifest.application_rc_sha, 'db5107396374761ff777b991ae38accfe687e750');
  assert.deepEqual(manifest.migrations.map((entry: any) => entry.filename), ['035_it_management_test_case_designation.sql']);
  assert.equal(manifest.migrations[0].byte_count, 1703);
  assert.equal(manifest.migrations[0].sha256, 'e93cc59066dbb6f19a02e4b80a7493ab519606c15b871e8f80a4d11620d2e6b7');
  assert.equal(manifest.release_decision.migration_execution_authorized, false);
});

test('035 artifact contains only reviewed SQL and fails closed on tampering', () => {
  const temp = mkdtempSync(path.join(root, '.test-case-management-035-'));
  try {
    const artifact = path.join(temp, 'artifact'); builder.build(root, manifestPath, artifact, head);
    assert.deepEqual(readdirSync(path.join(artifact, 'migrations')), ['035_it_management_test_case_designation.sql']);
    assert.equal(preflight.verifyArtifact(root, manifestPath, artifact).migrations.length, 1);
    const sql = path.join(artifact, 'migrations', '035_it_management_test_case_designation.sql');
    writeFileSync(sql, Buffer.concat([readFileSync(sql), Buffer.from('-- changed\n')]));
    assert.throws(() => preflight.verifyArtifact(root, manifestPath, artifact), /ARTIFACT_SQL_BYTES/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('035 packaged artifact accepts the image manifest layout', () => {
  const temp = mkdtempSync(path.join(root, '.test-case-management-035-packaged-'));
  const previous = process.env.PACKAGED_ARTIFACT;
  try {
    const artifact = path.join(temp, 'artifact'); builder.build(root, manifestPath, artifact, head);
    renameSync(path.join(artifact, 'manifest.json'), path.join(artifact, 'migration-release-manifest.json'));
    process.env.PACKAGED_ARTIFACT = 'true';
    assert.equal(preflight.verifyArtifact(root, path.join(artifact, 'migration-release-manifest.json'), artifact).migrations.length, 1);
  } finally {
    if (previous === undefined) delete process.env.PACKAGED_ARTIFACT; else process.env.PACKAGED_ARTIFACT = previous;
    rmSync(temp, { recursive: true, force: true });
  }
});

test('035 Job template is inert and pins the one-task safety contract', () => {
  const job = readFileSync(path.join(root, 'release', 'cloud-run-jobs', 'sales-tools-prod-test-case-management-v1-035.yaml'), 'utf8');
  assert.match(job, /name: sales-tools-prod-test-case-management-v1-035-migration/);
  assert.match(job, /taskCount: 1/); assert.match(job, /parallelism: 1/); assert.match(job, /maxRetries: 0/);
  assert.match(job, /MIGRATION_035_IMMUTABLE_IMAGE_DIGEST_REQUIRED/);
  assert.doesNotMatch(job, /sha256:[a-f0-9]{64}/);
  const preflightJob = readFileSync(path.join(root, 'release', 'cloud-run-jobs', 'sales-tools-prod-test-case-management-v1-035-preflight.yaml'), 'utf8');
  assert.match(preflightJob, /PREFLIGHT_READ_ONLY, value: 'true'/); assert.match(preflightJob, /PACKAGED_ARTIFACT, value: 'true'/);
  assert.match(preflightJob, /taskCount: 1/); assert.match(preflightJob, /parallelism: 1/); assert.match(preflightJob, /maxRetries: 0/);
});

test('035 verifier requires SELECT and INSERT but rejects mutable runtime privileges', () => {
  const good = [{ role_name: 'sales_tools_app', can_select: true, can_insert: true, can_update: false, can_delete: false }];
  assert.deepEqual(verifier.verifyRuntimeRolePrivileges(['sales_tools_app'], good), { applicationRole: 'sales_tools_app', optionalRuntimeRolePresent: false, optionalRuntimeMutationGrants: false });
  assert.throws(() => verifier.verifyRuntimeRolePrivileges([], []), /RUNTIME_ROLE:sales_tools_app/);
  assert.throws(() => verifier.verifyRuntimeRolePrivileges(['sales_tools_app'], [{ ...good[0], can_update: true }]), /RUNTIME_PRIVILEGES:sales_tools_app/);
  assert.deepEqual(verifier.verifyRuntimeRolePrivileges(['sales_tools_app', 'sales_tools_runtime'], [good[0], { role_name: 'sales_tools_runtime', can_select: true, can_insert: true, can_update: true, can_delete: true }]), { applicationRole: 'sales_tools_app', optionalRuntimeRolePresent: true, optionalRuntimeMutationGrants: true });
});
