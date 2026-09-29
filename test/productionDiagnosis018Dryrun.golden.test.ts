import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { runMigrations } from '../src/db/migrate';

/**
 * Informational dry-run only. PGlite is not PostgreSQL 16 and this is not the
 * Canonical-required isolated rehearsal (docs/staging-migration-allowlist-rehearsal.md);
 * it does not authorize production migration. It seeds a disposable database with the
 * exact production ledger (8 rows, from migration-allowlists/evidence/
 * production-diagnosis-018-ledger-4v8bd.json) and runs the real migrations/ directory
 * against it, to sanity-check filename-sorted apply order, skip behavior, and
 * partial-failure safety for the 18-file production-diagnosis-018 manifest before any
 * real PostgreSQL 16 rehearsal is arranged.
 */
const root = path.resolve(__dirname, '..');
const productionLedger: { filename: string; applied_at: string }[] = JSON.parse(
  fs.readFileSync(path.join(root, 'migration-allowlists/evidence/production-diagnosis-018-ledger-4v8bd.json'), 'utf8'),
);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'migration-allowlists/production-diagnosis-018.candidate.json'), 'utf8'));
const expected: string[] = manifest.expected_unapplied_filenames;

function makePool(db: PGlite) {
  // PGlite's query() uses the extended/prepared-statement protocol (one statement
  // only); migration files are multi-statement scripts, which only exec() supports.
  // runMigrations() never binds params on a multi-statement call, so this is safe.
  const run = (sql: string, params?: unknown[]) => (params ? db.query(sql, params) : db.exec(sql));
  return {
    query: run,
    connect: async () => ({ query: run, release: () => {} }),
  } as unknown as Pool;
}

test('seeded with the exact production 8-row ledger, the real migrations dir applies exactly the 18 manifest files in filename order and skips the rest', async () => {
  const db = new PGlite();
  await db.waitReady;
  const pool = makePool(db);
  await db.query('CREATE TABLE schema_migrations(filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  for (const row of productionLedger) await db.query('INSERT INTO schema_migrations(filename, applied_at) VALUES($1, $2::timestamptz)', [row.filename, row.applied_at]);

  const events: { event: string; filename: string }[] = [];
  await runMigrations(pool, path.join(root, 'migrations'), event => events.push(event as { event: string; filename: string }));

  const applied = events.filter(e => e.event === 'migration_applied').map(e => e.filename);
  const skipped = events.filter(e => e.event === 'migration_skipped').map(e => e.filename);

  assert.deepEqual(applied, [...expected].sort());
  assert.deepEqual(skipped.sort(), productionLedger.map(r => r.filename).sort());

  const finalLedger = (await db.query<{ filename: string }>('SELECT filename FROM schema_migrations ORDER BY filename')).rows.map(r => r.filename);
  assert.equal(finalLedger.length, 26);
  assert.deepEqual(finalLedger, [...new Set([...productionLedger.map(r => r.filename), ...expected])].sort());

  // Re-running against the now-26-row ledger must skip everything: idempotent re-run.
  const secondRun: { event: string; filename: string }[] = [];
  await runMigrations(pool, path.join(root, 'migrations'), event => secondRun.push(event as { event: string; filename: string }));
  assert.equal(secondRun.filter(e => e.event === 'migration_applied').length, 0);
  assert.equal(secondRun.filter(e => e.event === 'migration_skipped').length, 26);

  await db.close();
});

test('a mid-batch failure leaves only earlier files applied, and the failing file itself is not recorded', async () => {
  const db = new PGlite();
  await db.waitReady;
  const pool = makePool(db);
  await db.query('CREATE TABLE schema_migrations(filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  for (const row of productionLedger) await db.query('INSERT INTO schema_migrations(filename, applied_at) VALUES($1, $2::timestamptz)', [row.filename, row.applied_at]);

  // A disposable copy of the migrations dir with one manifest file corrupted into a
  // syntax error partway through the batch (007 is foundational; corrupt 010, which is
  // mid-batch and depends on 007/008/009 already having applied successfully).
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'diagnosis018-failure-'));
  for (const filename of fs.readdirSync(path.join(root, 'migrations'))) {
    if (!/^\d+_[a-z0-9_]+\.sql$/.test(filename)) continue;
    fs.copyFileSync(path.join(root, 'migrations', filename), path.join(temporary, filename));
  }
  fs.appendFileSync(path.join(temporary, '010_it_management_diagnosis_human_review.sql'), '\nSELECT 1/0;\n');

  const events: { event: string; filename: string }[] = [];
  await assert.rejects(runMigrations(pool, temporary, event => events.push(event as { event: string; filename: string })));

  const applied = events.filter(e => e.event === 'migration_applied').map(e => e.filename);
  const failed = events.filter(e => e.event === 'migration_failed').map(e => e.filename);
  assert.deepEqual(applied, ['006_kaizen_assessments.sql', '007_it_management_diagnosis.sql', '008_it_management_diagnosis_preparation.sql', '009_it_management_diagnosis_workspace.sql']);
  assert.deepEqual(failed, ['010_it_management_diagnosis_human_review.sql']);

  const finalLedger = (await db.query<{ filename: string }>('SELECT filename FROM schema_migrations ORDER BY filename')).rows.map(r => r.filename);
  assert.equal(finalLedger.length, 8 + 4); // 8 production baseline + the 4 that applied before the injected failure
  assert.ok(!finalLedger.includes('010_it_management_diagnosis_human_review.sql'));
  assert.ok(!finalLedger.includes('011_it_management_diagnosis_report_feedback.sql')); // never attempted

  fs.rmSync(temporary, { recursive: true, force: true });
  await db.close();
});
