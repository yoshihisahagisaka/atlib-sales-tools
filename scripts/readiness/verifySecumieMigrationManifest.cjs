'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function fail(message) {
  throw new Error(`SECU_MIGRATION_MANIFEST_INVALID: ${message}`);
}

function canonicalMigrationBytes(content) {
  return Buffer.from(content.toString('utf8').replace(/\r?\n/g, '\r\n'), 'utf8');
}

function verify(manifestPath, migrationsDirectory, strict = true) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.database !== 'secumie_insight_staging') fail('unexpected manifest target');
  if (!Array.isArray(manifest.migrations) || manifest.migrations.length !== 5) fail('exactly five migrations are required');

  const expectedNames = [
    '037_public_service_otp.sql',
    '038_pira_public_intake.sql',
    '039_pira_admin_export.sql',
    '040_pira_export_audit_retention.sql',
    '041_secumie_db_operations.sql',
  ];
  const names = manifest.migrations.map((entry) => entry.filename);
  if (JSON.stringify(names) !== JSON.stringify(expectedNames)) fail('migration order or filename differs from 037-041 allowlist');

  for (const entry of manifest.migrations) {
    if (!/^[0-9a-f]{64}$/.test(entry.sha256)) fail(`invalid SHA-256 for ${entry.filename}`);
    const content = fs.readFileSync(path.join(migrationsDirectory, entry.filename));
    const actual = crypto.createHash('sha256').update(canonicalMigrationBytes(content)).digest('hex');
    if (actual !== entry.sha256) fail(`SHA-256 mismatch for ${entry.filename}`);
  }

  if (strict) {
    const actualNames = fs.readdirSync(migrationsDirectory)
      .filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name))
      .sort();
    if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) fail('artifact contains migrations outside 037-041');
  }
  return { database: manifest.database, count: names.length, filenames: names };
}

if (require.main === module) {
  const [manifestPath, migrationsDirectory, strictValue = 'true'] = process.argv.slice(2);
  if (!manifestPath || !migrationsDirectory) fail('usage: verifySecumieMigrationManifest.cjs <manifest> <directory> [strict]');
  const result = verify(path.resolve(manifestPath), path.resolve(migrationsDirectory), strictValue !== 'false');
  process.stdout.write(`${JSON.stringify({ event: 'secumie_migration_manifest_verified', ...result })}\n`);
}

module.exports = { canonicalMigrationBytes, verify };
