import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(__dirname, '..');
const verifier = path.join(root, 'scripts', 'readiness', 'verifySecumieMigrationManifest.cjs');
const manifest = path.join(root, 'migration-manifests', 'secumie-insight-staging-037-041.json');
const expected = [
  '037_public_service_otp.sql',
  '038_pira_public_intake.sql',
  '039_pira_admin_export.sql',
  '040_pira_export_audit_retention.sql',
  '041_secumie_db_operations.sql',
];

function isolatedMigrations(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'secumie-migrations-'));
  for (const filename of expected) copyFileSync(path.join(root, 'migrations', filename), path.join(directory, filename));
  return directory;
}

test('the staging artifact contains exactly migrations 037-041 with approved hashes', () => {
  const directory = isolatedMigrations();
  const output = execFileSync(process.execPath, [verifier, manifest, directory, 'true'], { encoding: 'utf8' });
  const result = JSON.parse(output);
  assert.equal(result.event, 'secumie_migration_manifest_verified');
  assert.deepEqual(result.filenames, expected);
});

test('tampering and adding migrations fail before a database connection is possible', () => {
  const tampered = isolatedMigrations();
  writeFileSync(path.join(tampered, expected[0]!), `${readFileSync(path.join(tampered, expected[0]!), 'utf8')}\n-- tampered\n`);
  const tamperedResult = spawnSync(process.execPath, [verifier, manifest, tampered, 'true'], { encoding: 'utf8' });
  assert.notEqual(tamperedResult.status, 0);
  assert.match(tamperedResult.stderr, /SHA-256 mismatch/);

  const extra = isolatedMigrations();
  writeFileSync(path.join(extra, '001_forbidden.sql'), 'SELECT 1;\n');
  const extraResult = spawnSync(process.execPath, [verifier, manifest, extra, 'true'], { encoding: 'utf8' });
  assert.notEqual(extraResult.status, 0);
  assert.match(extraResult.stderr, /outside 037-041/);
});

test('bootstrap fails closed before opening a pool when the target confirmation is absent', () => {
  const script = [
    "require('ts-node/register');",
    "require('./src/db/bootstrapSecumieInsightStagingCli').bootstrapSecumieInsightStaging()",
    ".then(()=>process.exit(9)).catch(error=>{process.stdout.write(error.message);process.exit(0)})",
  ].join('');
  const output = execFileSync(process.execPath, ['-e', script], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, SECU_BOOTSTRAP_TARGET_CONFIRMATION: '' },
  });
  assert.match(output, /SECU_BOOTSTRAP_CONFIG_MISSING/);
});
