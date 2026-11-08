import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Pool } from 'pg';
import { recoverSecumieInsightStaging } from '../src/db/recoverSecumieInsightStagingCli';
import { runSecumieStagingMigration } from '../src/db/runSecumieStagingMigrationCli';

const port = Number(process.env.SECUMIE_PREP_PG_PORT ?? '55437');
const superuser = { host: '127.0.0.1', port, database: 'postgres', user: 'otp_test', password: 'otp_test' };
const bootstrap = { ...superuser, user: 'secumie_recovery_bootstrap', password: 'recovery-bootstrap-password-32-bytes' };
const database = 'secumie_insight_staging';
const roles = [
  ['secumie_otp_staging', 6], ['secumie_pira_staging', 6], ['secumie_admin_staging', 40],
  ['secumie_migration_staging', 1], ['secumie_maintenance_staging', 1],
] as const;
const passwords = {
  secumie_otp_staging: 'otp-recovery-password-32-bytes-01',
  secumie_pira_staging: 'pira-recovery-password-32-bytes-02',
  secumie_admin_staging: 'admin-recovery-password-32-bytes-03',
  secumie_migration_staging: 'migration-recovery-password-32-bytes-04',
  secumie_maintenance_staging: 'maintenance-recovery-password-32-bytes-05',
};

test.before(async () => {
  const pool = new Pool(superuser);
  await pool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [database]);
  await pool.query(`DROP DATABASE IF EXISTS ${database}`);
  for (const [role] of roles) await pool.query(`DROP ROLE IF EXISTS ${role}`);
  await pool.query('DROP ROLE IF EXISTS secumie_recovery_bootstrap');
  await pool.query(`CREATE ROLE secumie_recovery_bootstrap LOGIN CREATEDB CREATEROLE PASSWORD 'recovery-bootstrap-password-32-bytes'`);
  for (const [role, limit] of roles) {
    await pool.query(`CREATE ROLE ${role} LOGIN PASSWORD '${passwords[role]}' CONNECTION LIMIT ${limit} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
  }
  await pool.end();
});

test('owner-postgres recovery and migrations 037-041 preserve the role boundary', async () => {
  Object.assign(process.env, {
    SECU_BOOTSTRAP_TARGET_CONFIRMATION: 'msp-zabbix:asia-northeast1:secumie-sg-shared-staging-db/secumie_insight_staging',
    DB_BOOTSTRAP_HOST: '127.0.0.1', DB_BOOTSTRAP_PORT: String(port),
    DB_BOOTSTRAP_USER: bootstrap.user, DB_BOOTSTRAP_PASSWORD: bootstrap.password,
  });
  delete process.env.CLOUD_SQL_PROXY_ADMIN_URL;
  await recoverSecumieInsightStaging();

  const root = path.resolve(__dirname, '..');
  const migrations = mkdtempSync(path.join(os.tmpdir(), 'secumie-recovery-migrations-'));
  const filenames = ['037_public_service_otp.sql','038_pira_public_intake.sql','039_pira_admin_export.sql','040_pira_export_audit_retention.sql','041_secumie_db_operations.sql'];
  for (const filename of filenames) copyFileSync(path.join(root, 'migrations', filename), path.join(migrations, filename));
  Object.assign(process.env, {
    DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: database,
    DB_MIGRATION_USER: 'secumie_migration_staging', DB_MIGRATION_PASSWORD: passwords.secumie_migration_staging,
    OTP_DB_ROLE: 'secumie_otp_staging', PIRA_DB_ROLE: 'secumie_pira_staging',
    PIRA_ADMIN_DB_ROLE: 'secumie_admin_staging', SECU_MAINTENANCE_DB_ROLE: 'secumie_maintenance_staging',
    MIGRATIONS_DIR: migrations,
    MIGRATION_MANIFEST: path.join(root, 'migration-manifests', 'secumie-insight-staging-037-041.json'),
    MIGRATION_VERIFIER: path.join(root, 'scripts', 'readiness', 'verifySecumieMigrationManifest.cjs'),
    SECU_MIGRATION_TARGET_CONFIRMATION: 'msp-zabbix:asia-northeast1:secumie-sg-shared-staging-db/secumie_insight_staging',
  });
  await runSecumieStagingMigration();

  const admin = new Pool({ ...superuser, database });
  const db = await admin.query("SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1", [database]);
  assert.equal(db.rows[0]?.owner, bootstrap.user);
  const boundary = await admin.query(`SELECT
    EXISTS (SELECT 1 FROM pg_database d, LATERAL aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba))) a
      WHERE d.datname=$1 AND a.grantee=0 AND a.privilege_type IN ('CONNECT','TEMPORARY')) AS public_database_access,
    EXISTS (SELECT 1 FROM pg_namespace n, LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a
      WHERE n.nspname='public' AND a.grantee=0 AND a.privilege_type IN ('USAGE','CREATE')) AS public_schema_access,
    has_database_privilege('secumie_migration_staging',$1,'CREATE') AS migration_database_create,
    has_schema_privilege('secumie_migration_staging','public','USAGE') AS migration_schema_usage,
    has_schema_privilege('secumie_migration_staging','public','CREATE') AS migration_schema_create`, [database]);
  assert.deepEqual(boundary.rows[0], {
    public_database_access: false, public_schema_access: false, migration_database_create: true,
    migration_schema_usage: true, migration_schema_create: true,
  });
  const roleState = await admin.query(`SELECT rolname,rolcanlogin,rolconnlimit,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls,
      has_database_privilege(rolname,$1,'CONNECT') AS can_connect,
      has_database_privilege(rolname,$1,'CREATE') AS can_create_database,
      has_schema_privilege(rolname,'public','CREATE') AS can_create_public
    FROM pg_roles WHERE rolname=ANY($2::text[]) ORDER BY rolname`, [database, roles.map(([role]) => role)]);
  assert.ok(roleState.rows.every((row) => row.rolcanlogin && !row.rolsuper && !row.rolcreatedb && !row.rolcreaterole
    && !row.rolinherit && !row.rolreplication && !row.rolbypassrls && row.can_connect));
  assert.ok(roleState.rows.filter((row) => row.rolname !== 'secumie_migration_staging')
    .every((row) => !row.can_create_database && !row.can_create_public));
  const membership = await admin.query(`SELECT 1 FROM pg_auth_members am
    JOIN pg_roles granted ON granted.oid=am.roleid JOIN pg_roles member_role ON member_role.oid=am.member
    WHERE granted.rolname='secumie_migration_staging' AND member_role.rolname=$1`, [bootstrap.user]);
  assert.equal(membership.rowCount, 0);
  await admin.end();

  const migration = new Pool({ ...bootstrap, database, user: 'secumie_migration_staging', password: passwords.secumie_migration_staging });
  const ledger = await migration.query('SELECT filename FROM schema_migrations ORDER BY filename');
  assert.deepEqual(ledger.rows.map((row) => row.filename), filenames);
  await migration.end();

  const otp = new Pool({ ...bootstrap, database, user: 'secumie_otp_staging', password: passwords.secumie_otp_staging });
  await otp.query("INSERT INTO public_auth.otp_send_locks(service_id,email_protected) VALUES('pira-union','recovery@example.test')");
  await assert.rejects(otp.query('SELECT * FROM pira.pira_submission'), /permission denied/);
  await assert.rejects(otp.query('CREATE TABLE public.forbidden_table(id integer)'), /permission denied/);
  await otp.end();

  const pira = new Pool({ ...bootstrap, database, user: 'secumie_pira_staging', password: passwords.secumie_pira_staging });
  await assert.rejects(pira.query('SELECT * FROM public_auth.otp_challenges'), /permission denied/);
  await pira.end();
});

test('recovery refuses an unexpected role attribute before database creation', async () => {
  const pool = new Pool(superuser);
  await pool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [database]);
  await pool.query(`DROP DATABASE ${database}`);
  await pool.query('ALTER ROLE secumie_otp_staging CONNECTION LIMIT 7');
  await pool.end();
  await assert.rejects(recoverSecumieInsightStaging(), /SECU_RECOVERY_ROLE_ATTRIBUTE_MISMATCH/);
  const verify = new Pool(superuser);
  const db = await verify.query('SELECT 1 FROM pg_database WHERE datname=$1', [database]);
  assert.equal(db.rowCount, 0);
  await verify.query('ALTER ROLE secumie_otp_staging CONNECTION LIMIT 6');
  await verify.end();
});

test.after(async () => {
  const pool = new Pool(superuser);
  await pool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [database]);
  await pool.query(`DROP DATABASE IF EXISTS ${database}`);
  for (const [role] of roles) await pool.query(`DROP ROLE IF EXISTS ${role}`);
  await pool.query('DROP ROLE IF EXISTS secumie_recovery_bootstrap');
  await pool.end();
});
