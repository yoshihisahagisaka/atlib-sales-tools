/*
 * Runs only against a disposable localhost PostgreSQL 16 service.
 * It does not build an image, alter the draft manifest, or contact Cloud SQL.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Pool } = require('pg');

const SQL_NAME = /^\d+_[a-z0-9_]+\.sql$/;
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const ISOLATED_PORT = 55437;
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const quoteIdent = value => `"${value.replaceAll('"', '""')}"`;
const fail = message => { throw new Error(`ISOLATED_MIGRATION_REHEARSAL_INVALID:${message}`); };
// Defaults reproduce the original P2-10/019-023 rehearsal exactly when unset. Set these
// three to rehearse a different manifest (e.g. a future 024-only candidate) without
// touching the P2-10 manifest, its evidence, or this file's default behavior.
const MANIFEST_FILENAME = process.env.ISOLATED_ALLOWLIST_MANIFEST || 'staging-p2-10.candidate.json';
const BASE_CUTOFF = Number(process.env.ISOLATED_ALLOWLIST_BASE_CUTOFF || 18);
const EXPECTED_LEDGER_COUNT = Number(process.env.ISOLATED_ALLOWLIST_EXPECTED_LEDGER_COUNT || 26);

function loadFixture(root) {
  const manifestPath = path.join(root, 'migration-allowlists', MANIFEST_FILENAME);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!['DRAFT_LEDGER_EVIDENCE_VERIFIED_REHEARSAL_PENDING', 'APPROVED_FOR_ARTIFACT_GENERATION'].includes(manifest.status) || typeof manifest.artifact_generation?.permitted !== 'boolean') fail('MANIFEST_STATUS');
  const ledgerPath = path.resolve(root, manifest.ledger_source?.snapshot_path || '');
  if (!fs.existsSync(ledgerPath) || sha256(ledgerPath) !== manifest.ledger_source?.original_json_sha256) fail('LEDGER_HASH');
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  if (!Array.isArray(ledger) || ledger.length !== manifest.ledger_source?.entry_count || !ledger.every(row => typeof row.filename === 'string' && typeof row.applied_at === 'string')) fail('LEDGER_SHAPE');
  const allSql = fs.readdirSync(path.join(root, 'migrations')).filter(file => SQL_NAME.test(file)).sort();
  const allowlist = manifest.migrations.map(entry => {
    const file = path.join(root, 'migrations', entry.filename);
    if (!SQL_NAME.test(entry.filename) || !fs.existsSync(file) || sha256(file) !== entry.sha256) fail(`SQL_HASH:${entry.filename}`);
    return entry.filename;
  }).sort();
  if (new Set(allowlist).size !== allowlist.length || allowlist.join('\n') !== [...manifest.expected_unapplied_filenames].sort().join('\n')) fail('ALLOWLIST_FILENAMES');
  const base = allSql.filter(filename => Number(filename.slice(0, filename.indexOf('_'))) <= BASE_CUTOFF);
  if (base.length === 0 || base.some(filename => !SQL_NAME.test(filename))) fail('BASE_SQL');
  return { manifest, ledger, allowlist, base };
}

function copySql(root, names, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const name of names) fs.copyFileSync(path.join(root, 'migrations', name), path.join(destination, name));
}

function configFromEnv(database, user, password) {
  return { host: process.env.ISOLATED_PG_HOST, port: Number(process.env.ISOLATED_PG_PORT || 5432), database, user, password };
}

async function seedLedger(pool, ledger) {
  await pool.query('TRUNCATE schema_migrations');
  for (const row of ledger) await pool.query('INSERT INTO schema_migrations(filename, applied_at) VALUES($1, $2::timestamptz)', [row.filename, row.applied_at]);
}

async function migrate(pool, directory) {
  const { runMigrations } = require(path.join(process.cwd(), 'dist', 'db', 'migrate.js'));
  const events = [];
  await runMigrations(pool, directory, event => events.push(event));
  return events;
}

async function createDatabase(admin, name, owner) {
  await admin.query(`CREATE DATABASE ${quoteIdent(name)} OWNER ${quoteIdent(owner)}`);
}

async function verifyRoleSeparation(migrationPool, runtimePool, runtimeUser) {
  await migrationPool.query('GRANT USAGE ON SCHEMA public TO ' + quoteIdent(runtimeUser));
  await migrationPool.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ' + quoteIdent(runtimeUser));
  await runtimePool.query('SELECT count(*) FROM web_development_partner_leads');
  await assert.rejects(runtimePool.query('CREATE TABLE runtime_must_not_own_ddl(id integer)'), error => error?.code === '42501');
}

async function run(root) {
  if (process.env.RUN_ISOLATED_MIGRATION_REHEARSAL !== '1') fail('EXPLICIT_OPT_IN_REQUIRED');
  if (process.env.ISOLATED_PG_REHEARSAL !== 'p2-12') fail('REHEARSAL_ID_REQUIRED');
  if (!LOCAL_HOSTS.has(process.env.ISOLATED_PG_HOST || '')) fail('LOCALHOST_ONLY');
  if (Number(process.env.ISOLATED_PG_PORT) !== ISOLATED_PORT) fail('RESERVED_PORT_REQUIRED');
  const fixture = loadFixture(root);
  const suffix = crypto.randomBytes(6).toString('hex');
  const adminUser = process.env.ISOLATED_PG_ADMIN_USER || 'postgres';
  const adminPassword = process.env.ISOLATED_PG_ADMIN_PASSWORD || 'postgres';
  const migrationUser = `migration_rehearsal_${suffix}`;
  const runtimeUser = `runtime_rehearsal_${suffix}`;
  const emptyDb = `allowlist_empty_${suffix}`;
  const seededDb = `allowlist_seeded_${suffix}`;
  const migrationPassword = `migration-only-${suffix}`;
  const runtimePassword = `runtime-only-${suffix}`;
  const admin = new Pool(configFromEnv('postgres', adminUser, adminPassword));
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'allowlist-pg16-'));
  const baseDir = path.join(temporary, 'base');
  const allowlistDir = path.join(temporary, 'allowlist');
  const failureDir = path.join(temporary, 'failure');
  let emptyMigration;
  let seededMigration;
  let runtimePool;
  try {
    copySql(root, fixture.base, baseDir);
    copySql(root, fixture.allowlist, allowlistDir);
    copySql(root, fixture.allowlist, failureDir);
    fs.writeFileSync(path.join(failureDir, '999_rehearsal_rollback.sql'), 'CREATE TABLE rehearsal_rollback_marker(id integer); SELECT 1/0;');
    await admin.query(`CREATE ROLE ${quoteIdent(migrationUser)} LOGIN PASSWORD '${migrationPassword}'`);
    await admin.query(`CREATE ROLE ${quoteIdent(runtimeUser)} LOGIN PASSWORD '${runtimePassword}'`);
    await createDatabase(admin, emptyDb, migrationUser);
    await createDatabase(admin, seededDb, migrationUser);
    emptyMigration = new Pool(configFromEnv(emptyDb, migrationUser, migrationPassword));
    seededMigration = new Pool(configFromEnv(seededDb, migrationUser, migrationPassword));
    await migrate(emptyMigration, baseDir);
    const emptyEvents = await migrate(emptyMigration, allowlistDir);
    assert.deepEqual(emptyEvents.filter(event => event.event === 'migration_applied').map(event => event.filename), fixture.allowlist);
    await migrate(seededMigration, baseDir);
    await seedLedger(seededMigration, fixture.ledger);
    const seededEvents = await migrate(seededMigration, allowlistDir);
    assert.deepEqual(seededEvents.filter(event => event.event === 'migration_applied').map(event => event.filename), fixture.allowlist);
    assert.equal(Number((await seededMigration.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count), EXPECTED_LEDGER_COUNT);
    const actualLedger = (await seededMigration.query('SELECT filename FROM schema_migrations ORDER BY filename')).rows.map(row => row.filename);
    assert.deepEqual(actualLedger, [...new Set([...fixture.ledger.map(row => row.filename), ...fixture.allowlist])].sort());
    assert.equal(Number((await seededMigration.query("SELECT count(*)::int AS count FROM schema_migrations WHERE filename='017_customer_fit_checks.sql'")).rows[0].count), 1);
    const skippedEvents = await migrate(seededMigration, allowlistDir);
    assert.deepEqual(skippedEvents.filter(event => event.event === 'migration_skipped').map(event => event.filename), fixture.allowlist);
    await assert.rejects(migrate(seededMigration, failureDir));
    assert.equal((await seededMigration.query("SELECT to_regclass('public.rehearsal_rollback_marker') AS name")).rows[0].name, null);
    assert.equal(Number((await seededMigration.query("SELECT count(*)::int AS count FROM schema_migrations WHERE filename='999_rehearsal_rollback.sql'")).rows[0].count), 0);
    runtimePool = new Pool(configFromEnv(seededDb, runtimeUser, runtimePassword));
    await verifyRoleSeparation(seededMigration, runtimePool, runtimeUser);
    const evidence = { event: 'isolated_postgres16_allowlist_rehearsal_pass', executed_at: new Date().toISOString(), database_kind: 'disposable', postgres_major: 16, ledger_entries: fixture.ledger.length, allowlist: fixture.allowlist, customer_data: false };
    if (process.env.ISOLATED_REHEARSAL_EVIDENCE_PATH) fs.writeFileSync(process.env.ISOLATED_REHEARSAL_EVIDENCE_PATH, JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence));
  } finally {
    await runtimePool?.end();
    await emptyMigration?.end();
    await seededMigration?.end();
    try { await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(emptyDb)}`); } catch {}
    try { await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(seededDb)}`); } catch {}
    try { await admin.query(`DROP ROLE IF EXISTS ${quoteIdent(migrationUser)}`); } catch {}
    try { await admin.query(`DROP ROLE IF EXISTS ${quoteIdent(runtimeUser)}`); } catch {}
    await admin.end();
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

if (require.main === module) run(process.cwd()).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { loadFixture };
