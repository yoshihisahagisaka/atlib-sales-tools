import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Pool } from 'pg';
import { runMigrations } from '../src/db/migrate';

const root = path.resolve(__dirname, '..');
const config = { host: '127.0.0.1', port: 55437, database: 'sales_tools', user: 'sales_tools_migration', password: 'rehearsal-only', max: 2 };
const verifier = require('../scripts/migration/verifyMarketingInitiativeProduction.cjs');
const builder = require('../scripts/migration/buildMarketingInitiativeReleaseArtifact.cjs');
const preflight = require('../scripts/migration/preflightMarketingInitiativeProduction.cjs');
const manifestPath = path.join(root, 'migration-allowlists', 'production-marketing-initiative-v1-034.json');

test('PostgreSQL 16 rehearsal applies 034 once, skips rerun, and satisfies verifier', {
  skip: process.env.RUN_MARKETING_INITIATIVE_PG !== '1' ? 'BLOCKED_EXTERNAL: disposable PostgreSQL 16 required' : false,
  timeout: 180_000,
}, async () => {
  const pool = new Pool(config); const baseline = fs.mkdtempSync(path.join(os.tmpdir(), 'marketing-034-baseline-')); const target = fs.mkdtempSync(path.join(os.tmpdir(), 'marketing-034-target-')); const release = fs.mkdtempSync(path.join(os.tmpdir(), 'marketing-034-release-'));
  try {
    for (const filename of fs.readdirSync(path.join(root, 'migrations')).filter(name => /^\d+_[a-z0-9_]+\.sql$/.test(name))) {
      const number = Number(filename.slice(0, 3));
      if (number <= 33) fs.copyFileSync(path.join(root, 'migrations', filename), path.join(baseline, filename));
      if (number === 34) fs.copyFileSync(path.join(root, 'migrations', filename), path.join(target, filename));
    }
    await runMigrations(pool, baseline);
    const identity = (await pool.query("SELECT current_setting('server_version') AS version")).rows[0]; assert.match(identity.version, /^16\./);
    const artifact = path.join(release, 'artifact'); const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); builder.build(root, manifestPath, artifact, head); const manifest = preflight.verifyArtifact(root, manifestPath, artifact);
    const preflightClient = await pool.connect(); try { await preflightClient.query('BEGIN READ ONLY'); const result = await preflight.collect(preflightClient, manifest); assert.equal(result.database, 'sales_tools'); await preflightClient.query('ROLLBACK'); } finally { preflightClient.release(); }
    const before = await pool.query("SELECT count(*)::int AS count,array_agg(column_name ORDER BY ordinal_position) AS columns FROM information_schema.columns WHERE table_schema='public' AND table_name='sales_activity'");
    const first: object[] = []; await runMigrations(pool, target, event => first.push(event));
    assert.deepEqual(first, [{ event: 'migration_applied', filename: '034_marketing_initiative_v1.sql' }]);
    const second: object[] = []; await runMigrations(pool, target, event => second.push(event));
    assert.deepEqual(second, [{ event: 'migration_skipped', filename: '034_marketing_initiative_v1.sql' }]);
    const after = await pool.query("SELECT count(*)::int AS count,array_agg(column_name ORDER BY ordinal_position) AS columns FROM information_schema.columns WHERE table_schema='public' AND table_name='sales_activity'"); assert.deepEqual(after.rows, before.rows);
    const values = ['00000000-0000-4000-8000-000000000001','Rehearsal','IT_KAIZEN','source','medium','campaign','content',null,'operator','operator'];
    await pool.query(`INSERT INTO marketing_initiative(initiative_id,initiative_name,service_key,utm_source,utm_medium,utm_campaign,utm_content,utm_term,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, values);
    await assert.rejects(pool.query(`INSERT INTO marketing_initiative(initiative_id,initiative_name,service_key,utm_source,utm_medium,utm_campaign,utm_content,utm_term,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, ['00000000-0000-4000-8000-000000000002', ...values.slice(1)]), error => (error as { code?: string }).code === '23505');
    const client = await pool.connect(); try { await client.query('BEGIN READ ONLY'); const result = await verifier.collect(client); assert.equal(result.nullsNotDistinct, true); assert.equal(result.runtimePrivileges, true); await client.query('ROLLBACK'); } finally { client.release(); }
  } finally { await pool.end(); fs.rmSync(baseline, { recursive: true, force: true }); fs.rmSync(target, { recursive: true, force: true }); fs.rmSync(release, { recursive: true, force: true }); }
});
