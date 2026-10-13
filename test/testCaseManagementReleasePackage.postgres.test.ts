import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Pool } from 'pg';
import { runMigrations } from '../src/db/migrate';
import { MarketingInitiativeRepo } from '../src/services/marketingInitiativeRepo';

const root = path.resolve(__dirname, '..');
const config = { host: process.env.PGHOST ?? '127.0.0.1', port: Number(process.env.PGPORT ?? 55438), database: 'sales_tools', user: 'sales_tools_migration', password: 'rehearsal-only', max: 2 };
const verifier = require('../scripts/migration/verifyTestCaseManagementProduction.cjs');
const builder = require('../scripts/migration/buildTestCaseManagementReleaseArtifact.cjs');
const preflight = require('../scripts/migration/preflightTestCaseManagementProduction.cjs');
const manifestPath = path.join(root, 'migration-allowlists', 'production-test-case-management-v1-035.json');

test('PostgreSQL 16 rehearsal applies 035 once and preserves audit/KPI contracts', {
  skip: process.env.RUN_TEST_CASE_MANAGEMENT_PG !== '1' ? 'BLOCKED_EXTERNAL: disposable PostgreSQL 16 required' : false,
  timeout: 240_000,
}, async () => {
  const pool = new Pool(config); const baseline = fs.mkdtempSync(path.join(os.tmpdir(), 'test-case-035-baseline-')); const target = fs.mkdtempSync(path.join(os.tmpdir(), 'test-case-035-target-')); const release = fs.mkdtempSync(path.join(os.tmpdir(), 'test-case-035-release-'));
  try {
    for (const filename of fs.readdirSync(path.join(root, 'migrations')).filter(name => /^\d+_[a-z0-9_]+\.sql$/.test(name))) {
      const number = Number(filename.slice(0, 3));
      if (number <= 34) fs.copyFileSync(path.join(root, 'migrations', filename), path.join(baseline, filename));
      if (number === 35) fs.copyFileSync(path.join(root, 'migrations', filename), path.join(target, filename));
    }
    await runMigrations(pool, baseline);
    assert.match((await pool.query("SELECT current_setting('server_version') AS version")).rows[0].version, /^16\./);
    const ids = { company: '10000000-0000-4000-8000-000000000001', contact: '10000000-0000-4000-8000-000000000002', activity: '10000000-0000-4000-8000-000000000003', case: '10000000-0000-4000-8000-000000000004', initiative: '10000000-0000-4000-8000-000000000005' };
    await pool.query("INSERT INTO company(id,name,created_by_user_id,owner_user_id) VALUES($1,'Rehearsal Company','operator','operator')", [ids.company]);
    await pool.query("INSERT INTO contact(id,company_id,name) VALUES($1,$2,'Rehearsal Contact')", [ids.contact, ids.company]);
    await pool.query("INSERT INTO sales_activity(id,company_id,primary_contact_id,selected_service,created_by_user_id,owner_user_id,utm_source,utm_campaign) VALUES($1,$2,$3,'IT_KAIZEN','operator','operator','event','test-case-035')", [ids.activity, ids.company, ids.contact]);
    await pool.query("INSERT INTO it_management_diagnosis_case_v2(id,company_id,contact_id,sales_activity_id,status,is_internal_test,created_by_user_id) VALUES($1,$2,$3,$4,'INTAKE_COMPLETED',false,'operator')", [ids.case, ids.company, ids.contact, ids.activity]);
    await pool.query("INSERT INTO marketing_initiative(initiative_id,initiative_name,service_key,utm_source,utm_campaign,created_by,updated_by) VALUES($1,'Rehearsal','IT_KAIZEN','event','test-case-035','operator','operator')", [ids.initiative]);
    const beforeCase = (await pool.query('SELECT * FROM it_management_diagnosis_case_v2 WHERE id=$1', [ids.case])).rows[0];
    const artifact = path.join(release, 'artifact'); const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); builder.build(root, manifestPath, artifact, head); const manifest = preflight.verifyArtifact(root, manifestPath, artifact);
    const preflightClient = await pool.connect(); try { await preflightClient.query('BEGIN READ ONLY'); await preflight.collect(preflightClient, manifest); await preflightClient.query('ROLLBACK'); } finally { preflightClient.release(); }
    const first: object[] = []; await runMigrations(pool, target, event => first.push(event)); assert.deepEqual(first, [{ event: 'migration_applied', filename: '035_it_management_test_case_designation.sql' }]);
    const second: object[] = []; await runMigrations(pool, target, event => second.push(event)); assert.deepEqual(second, [{ event: 'migration_skipped', filename: '035_it_management_test_case_designation.sql' }]);
    assert.deepEqual((await pool.query('SELECT * FROM it_management_diagnosis_case_v2 WHERE id=$1', [ids.case])).rows[0], beforeCase);
    const initiatives = new MarketingInitiativeRepo(pool); assert.equal((await initiatives.list())[0].kpi.applications, 1);
    await pool.query("UPDATE it_management_diagnosis_case_v2 SET is_internal_test=true WHERE id=$1", [ids.case]);
    await pool.query("INSERT INTO it_management_diagnosis_test_case_designation_audit(id,case_id,action,actor_user_id,reason) VALUES('10000000-0000-4000-8000-000000000006',$1,'DESIGNATED','operator','PostgreSQL 16 rehearsal')", [ids.case]);
    assert.equal((await initiatives.list())[0].kpi.applications, 0);
    await pool.query('BEGIN'); await assert.rejects(pool.query("UPDATE it_management_diagnosis_test_case_designation_audit SET reason='mutated' WHERE case_id=$1", [ids.case]), /append-only/); await pool.query('ROLLBACK');
    assert.equal((await pool.query('SELECT reason FROM it_management_diagnosis_test_case_designation_audit WHERE case_id=$1', [ids.case])).rows[0].reason, 'PostgreSQL 16 rehearsal');
    await pool.query("UPDATE it_management_diagnosis_case_v2 SET is_internal_test=false WHERE id=$1", [ids.case]);
    await pool.query("INSERT INTO it_management_diagnosis_test_case_designation_audit(id,case_id,action,actor_user_id,reason) VALUES('10000000-0000-4000-8000-000000000007',$1,'RELEASED','operator','PostgreSQL 16 rehearsal complete')", [ids.case]);
    assert.equal((await initiatives.list())[0].kpi.applications, 1);
    const client = await pool.connect(); try { await client.query('BEGIN READ ONLY'); const result = await verifier.collect(client); assert.equal(result.appendOnlyTrigger, true); assert.equal(result.runtimePrivileges, true); await client.query('ROLLBACK'); } finally { client.release(); }
  } finally { await pool.end(); fs.rmSync(baseline, { recursive: true, force: true }); fs.rmSync(target, { recursive: true, force: true }); fs.rmSync(release, { recursive: true, force: true }); }
});
