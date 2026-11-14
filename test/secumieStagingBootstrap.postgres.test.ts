import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Pool } from 'pg';
import { bootstrapSecumieInsightStaging } from '../src/db/bootstrapSecumieInsightStagingCli';
import { runSecumieStagingMigration } from '../src/db/runSecumieStagingMigrationCli';

const port = Number(process.env.SECUMIE_PREP_PG_PORT ?? '55437');
const bootstrapOwner = { host: '127.0.0.1', port, user: 'otp_test', password: 'otp_test' };
const owner = { ...bootstrapOwner, password: 'bootstrap-local-password-32-bytes-minimum' };
const database = 'secumie_insight_staging';
const roles = ['secumie_otp_staging','secumie_pira_staging','secumie_admin_staging','secumie_migration_staging','secumie_maintenance_staging'];
const rolePasswords = {
  secumie_otp_staging:'otp-local-password-32-bytes-minimum-01',
  secumie_pira_staging:'pira-local-password-32-bytes-minimum-02',
  secumie_admin_staging:'admin-local-password-32-bytes-minimum-03',
  secumie_migration_staging:'migration-local-password-32-bytes-minimum-04',
  secumie_maintenance_staging:'maintenance-local-password-32-bytes-min-05',
};

test.before(async () => {
  const pool = new Pool({ ...bootstrapOwner, database: 'postgres' });
  await pool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [database]);
  await pool.query(`DROP DATABASE IF EXISTS ${database}`);
  for (const role of roles) await pool.query(`DROP ROLE IF EXISTS ${role}`);
  await pool.query("ALTER ROLE otp_test PASSWORD 'bootstrap-local-password-32-bytes-minimum'");
  await pool.end();
});

test('bootstrap creates one isolated database and five non-elevated, bounded roles', async () => {
  Object.assign(process.env, {
    SECU_BOOTSTRAP_TARGET_CONFIRMATION:'msp-zabbix:asia-northeast1:secumie-sg-shared-staging-db/secumie_insight_staging',
    DB_BOOTSTRAP_HOST:'127.0.0.1', DB_BOOTSTRAP_PORT:String(port), DB_BOOTSTRAP_USER:owner.user, DB_BOOTSTRAP_PASSWORD:owner.password,
    SECU_OTP_DB_PASSWORD:rolePasswords.secumie_otp_staging, SECU_PIRA_DB_PASSWORD:rolePasswords.secumie_pira_staging,
    SECU_ADMIN_DB_PASSWORD:rolePasswords.secumie_admin_staging, SECU_MIGRATION_DB_PASSWORD:rolePasswords.secumie_migration_staging,
    SECU_MAINTENANCE_DB_PASSWORD:rolePasswords.secumie_maintenance_staging,
  });
  await bootstrapSecumieInsightStaging();
  const pool = new Pool({ ...owner, database:'postgres' });
  const result = await pool.query(`SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolconnlimit FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname`,[roles]);
  assert.equal(result.rowCount,5);
  assert.ok(result.rows.every((row) => !row.rolsuper && !row.rolcreatedb && !row.rolcreaterole && !row.rolreplication && !row.rolbypassrls));
  assert.deepEqual(Object.fromEntries(result.rows.map((row) => [row.rolname,row.rolconnlimit])), {
    secumie_admin_staging:40,secumie_maintenance_staging:1,secumie_migration_staging:1,secumie_otp_staging:6,secumie_pira_staging:6,
  });
  const databaseResult = await pool.query("SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1",[database]);
  assert.equal(databaseResult.rows[0].owner,'secumie_migration_staging');
  await pool.end();
});

test('the execution artifact applies only 037-041 and configures runtime boundaries', async () => {
  const root = path.resolve(__dirname, '..');
  const migrations = mkdtempSync(path.join(os.tmpdir(), 'secumie-staging-lifecycle-'));
  const filenames = ['037_public_service_otp.sql','038_pira_public_intake.sql','039_pira_admin_export.sql','040_pira_export_audit_retention.sql','041_secumie_db_operations.sql'];
  for (const filename of filenames) copyFileSync(path.join(root,'migrations',filename),path.join(migrations,filename));
  Object.assign(process.env, {
    DB_HOST:'127.0.0.1', DB_PORT:String(port), DB_NAME:database,
    DB_MIGRATION_USER:'secumie_migration_staging', DB_MIGRATION_PASSWORD:rolePasswords.secumie_migration_staging,
    OTP_DB_ROLE:'secumie_otp_staging', PIRA_DB_ROLE:'secumie_pira_staging', PIRA_ADMIN_DB_ROLE:'secumie_admin_staging', SECU_MAINTENANCE_DB_ROLE:'secumie_maintenance_staging',
    MIGRATIONS_DIR:migrations,
    MIGRATION_MANIFEST:path.join(root,'migration-manifests','secumie-insight-staging-037-041.json'),
    MIGRATION_VERIFIER:path.join(root,'scripts','readiness','verifySecumieMigrationManifest.cjs'),
    SECU_MIGRATION_TARGET_CONFIRMATION:'msp-zabbix:asia-northeast1:secumie-sg-shared-staging-db/secumie_insight_staging',
  });
  delete process.env.CLOUD_SQL_PROXY_ADMIN_URL;
  await runSecumieStagingMigration();
  const migration = new Pool({ ...owner, database, user:'secumie_migration_staging', password:rolePasswords.secumie_migration_staging });
  const ledger = await migration.query('SELECT filename FROM schema_migrations ORDER BY filename');
  assert.deepEqual(ledger.rows.map((row) => row.filename),filenames);
  await migration.end();
  const otp = new Pool({ ...owner, database, user:'secumie_otp_staging', password:rolePasswords.secumie_otp_staging });
  await otp.query("INSERT INTO public_auth.otp_send_locks(service_id,email_protected) VALUES('pira-union','lifecycle@example.test')");
  await assert.rejects(otp.query('SELECT * FROM pira.pira_submission'),/permission denied/);
  await otp.end();
});

test.after(async () => {
  const pool = new Pool({ ...owner, database:'postgres' });
  await pool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [database]);
  await pool.query(`DROP DATABASE IF EXISTS ${database}`);
  for (const role of roles) await pool.query(`DROP ROLE IF EXISTS ${role}`);
  await pool.query("ALTER ROLE otp_test PASSWORD 'otp_test'");
  await pool.end();
});
