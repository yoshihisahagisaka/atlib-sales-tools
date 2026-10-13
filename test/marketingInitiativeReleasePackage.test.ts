import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(__dirname, '..');
const builder = require('../scripts/migration/buildMarketingInitiativeReleaseArtifact.cjs');
const preflight = require('../scripts/migration/preflightMarketingInitiativeProduction.cjs');
const manifestPath = path.join(root, 'migration-allowlists', 'production-marketing-initiative-v1-034.json');
const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

test('034 manifest fixes the one-file Git identity and denies migration execution', () => {
  const manifest = builder.readManifest(root, manifestPath);
  assert.equal(manifest.application_rc_sha, '694988aaa03683676226f504c53a06108d625f31');
  assert.deepEqual(manifest.migrations.map((entry: any) => entry.filename), ['034_marketing_initiative_v1.sql']);
  assert.equal(manifest.migrations[0].byte_count, 2020);
  assert.equal(manifest.migrations[0].sha256, '2cbca86347a36b5a06f2372ff7d3c88f1ed29fd2f2f52df1ac03b3175d34715d');
  assert.equal(manifest.release_decision.migration_execution_authorized, false);
});

test('034 artifact contains only reviewed SQL bytes and passes layout verification', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'marketing-initiative-034-'));
  try {
    const artifact = path.join(temp, 'artifact'); builder.build(root, manifestPath, artifact, head);
    assert.deepEqual(readdirSync(path.join(artifact, 'migrations')), ['034_marketing_initiative_v1.sql']);
    const expected = execFileSync('git', ['-C', root, 'show', '694988aaa03683676226f504c53a06108d625f31:migrations/034_marketing_initiative_v1.sql']);
    assert.deepEqual(readFileSync(path.join(artifact, 'migrations', '034_marketing_initiative_v1.sql')), expected);
    assert.equal(preflight.verifyArtifact(root, manifestPath, artifact).migrations.length, 1);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('034 artifact verification fails closed on SQL tampering', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'marketing-initiative-034-'));
  try {
    const artifact = path.join(temp, 'artifact'); builder.build(root, manifestPath, artifact, head);
    const sql = path.join(artifact, 'migrations', '034_marketing_initiative_v1.sql');
    writeFileSync(sql, Buffer.concat([readFileSync(sql), Buffer.from('-- changed\n')]));
    assert.throws(() => preflight.verifyArtifact(root, manifestPath, artifact), /ARTIFACT_SQL_BYTES/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('034 Job template is inert and pins the one-task migration safety contract', () => {
  const job = readFileSync(path.join(root, 'release', 'cloud-run-jobs', 'sales-tools-prod-marketing-initiative-v1-034.yaml'), 'utf8');
  assert.match(job, /name: sales-tools-prod-marketing-initiative-v1-034-migration/);
  assert.match(job, /taskCount: 1/); assert.match(job, /parallelism: 1/); assert.match(job, /maxRetries: 0/);
  assert.match(job, /MIGRATION_034_IMMUTABLE_IMAGE_DIGEST_REQUIRED/);
  assert.match(job, /sales-tools-production-migration-db-password/);
  assert.doesNotMatch(job, /sha256:[a-f0-9]{64}/);
});
