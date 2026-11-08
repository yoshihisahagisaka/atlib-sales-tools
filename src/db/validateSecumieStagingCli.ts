import { Pool, type PoolConfig } from 'pg';
import { shutdownCloudSqlProxy } from './cloudSqlProxyShutdown';

const DATABASE = 'secumie_insight_staging';
const expectedMigrations = [
  '037_public_service_otp.sql',
  '038_pira_public_intake.sql',
  '039_pira_admin_export.sql',
  '040_pira_export_audit_retention.sql',
  '041_secumie_db_operations.sql',
];
const roles = [
  ['secumie_otp_staging', 6],
  ['secumie_pira_staging', 6],
  ['secumie_admin_staging', 40],
  ['secumie_migration_staging', 1],
  ['secumie_maintenance_staging', 1],
] as const;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`SECU_ACCEPTANCE_CONFIG_MISSING: ${name}`);
  return value;
}

function config(user: string, password: string): PoolConfig {
  return {
    host: required('DB_BOOTSTRAP_HOST'),
    port: Number(process.env.DB_BOOTSTRAP_PORT ?? '5432'),
    database: DATABASE,
    user,
    password,
    max: 1,
    connectionTimeoutMillis: 10_000,
    application_name: `secumie-staging-acceptance-${user}`,
  };
}

async function denied(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch (error) {
    if ((error as { code?: string }).code === '42501') return;
    throw error;
  }
  throw new Error('SECU_ACCEPTANCE_EXPECTED_DENIAL_MISSING');
}

export async function validateSecumieStaging(): Promise<void> {
  const bootstrapUser = required('DB_BOOTSTRAP_USER');
  const bootstrap = new Pool(config(bootstrapUser, required('DB_BOOTSTRAP_PASSWORD')));
  try {
    const identity = await bootstrap.query<{
      database: string; owner: string; max_connections: string; observed_connections: string;
    }>(`SELECT current_database() AS database, pg_get_userbyid(d.datdba) AS owner,
        current_setting('max_connections') AS max_connections,
        (SELECT count(*)::text FROM pg_stat_activity) AS observed_connections
      FROM pg_database d WHERE d.datname=current_database()`);
    const current = identity.rows[0];
    if (!current || current.database !== DATABASE || current.owner !== bootstrapUser) {
      throw new Error('SECU_ACCEPTANCE_DATABASE_IDENTITY_MISMATCH');
    }
    const available = Number(current.max_connections) - Math.max(10, Math.ceil(Number(current.max_connections) * 0.2));
    if (available < 78) throw new Error('SECU_ACCEPTANCE_CAPACITY_INSUFFICIENT');

    const ledger = await bootstrap.query<{ filename: string }>('SELECT filename FROM schema_migrations ORDER BY filename');
    if (JSON.stringify(ledger.rows.map(row => row.filename)) !== JSON.stringify(expectedMigrations)) {
      throw new Error('SECU_ACCEPTANCE_LEDGER_MISMATCH');
    }
    const roleState = await bootstrap.query<{
      rolname: string; rolcanlogin: boolean; rolconnlimit: number; rolsuper: boolean; rolcreatedb: boolean;
      rolcreaterole: boolean; rolinherit: boolean; rolreplication: boolean; rolbypassrls: boolean;
    }>(`SELECT rolname,rolcanlogin,rolconnlimit,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls
      FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname`, [roles.map(([name]) => name)]);
    for (const [name, limit] of roles) {
      const role = roleState.rows.find(row => row.rolname === name);
      if (!role || !role.rolcanlogin || role.rolconnlimit !== limit || role.rolsuper || role.rolcreatedb
        || role.rolcreaterole || role.rolinherit || role.rolreplication || role.rolbypassrls) {
        throw new Error('SECU_ACCEPTANCE_ROLE_ATTRIBUTE_MISMATCH');
      }
    }
    const membership = await bootstrap.query(`SELECT 1 FROM pg_auth_members am
      JOIN pg_roles granted ON granted.oid=am.roleid JOIN pg_roles member_role ON member_role.oid=am.member
      WHERE granted.rolname=ANY($1::text[]) OR member_role.rolname=ANY($1::text[])`, [roles.map(([name]) => name)]);
    if (membership.rowCount) throw new Error('SECU_ACCEPTANCE_UNEXPECTED_MEMBERSHIP');

    const owners = await bootstrap.query<{ kind: string; object_count: string; correct_owner_count: string }>(`SELECT 'schema' AS kind,count(*)::text AS object_count,
        count(*) FILTER (WHERE pg_get_userbyid(nspowner)='secumie_migration_staging')::text AS correct_owner_count
      FROM pg_namespace WHERE nspname IN ('public_auth','pira','secumie_deployment')
      UNION ALL SELECT 'table',count(*)::text,count(*) FILTER (WHERE tableowner='secumie_migration_staging')::text
      FROM pg_tables WHERE schemaname IN ('public_auth','pira')
      UNION ALL SELECT 'function',count(*)::text,count(*) FILTER (WHERE pg_get_userbyid(proowner)='secumie_migration_staging')::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN ('public_auth','pira','secumie_deployment')`);
    if (owners.rows.some(row => Number(row.object_count) === 0 || row.object_count !== row.correct_owner_count)) {
      throw new Error('SECU_ACCEPTANCE_OWNER_MISMATCH');
    }

    const otp = new Pool(config('secumie_otp_staging', required('SECU_OTP_DB_PASSWORD')));
    try {
      await otp.query('BEGIN');
      await otp.query("INSERT INTO public_auth.otp_send_locks(service_id,email_protected) VALUES('acceptance','synthetic@example.invalid')");
      await otp.query('ROLLBACK');
      await denied(otp.query('SELECT * FROM pira.pira_submission'));
      await denied(otp.query('CREATE TABLE public.acceptance_forbidden(id integer)'));
    } finally { await otp.end(); }

    const pira = new Pool(config('secumie_pira_staging', required('SECU_PIRA_DB_PASSWORD')));
    try {
      await pira.query('SELECT count(*) FROM pira.pira_initiative');
      await denied(pira.query('SELECT * FROM public_auth.otp_challenges'));
    } finally { await pira.end(); }

    const admin = new Pool(config('secumie_admin_staging', required('SECU_ADMIN_DB_PASSWORD')));
    try {
      await admin.query('BEGIN');
      await admin.query("INSERT INTO pira.pira_export_audit(actor_subject,filter_snapshot,format,result_count,success,initiative_ids) VALUES('synthetic-acceptance','{}','CSV',0,true,'[]')");
      await admin.query('ROLLBACK');
      await denied(admin.query('UPDATE pira.pira_export_audit SET success=false'));
      await denied(admin.query('DELETE FROM pira.pira_export_audit'));
    } finally { await admin.end(); }

    const maintenance = new Pool(config('secumie_maintenance_staging', required('SECU_MAINTENANCE_DB_PASSWORD')));
    let retention: { otp: unknown; pira: unknown };
    try {
      const otpCandidates = await maintenance.query('SELECT public_auth.retention_candidates() AS value');
      const piraCandidates = await maintenance.query('SELECT pira.retention_candidates() AS value');
      retention = { otp: otpCandidates.rows[0]?.value ?? {}, pira: piraCandidates.rows[0]?.value ?? {} };
      await denied(maintenance.query('DELETE FROM pira.pira_export_audit'));
    } finally { await maintenance.end(); }

    const migration = new Pool(config('secumie_migration_staging', required('SECU_MIGRATION_DB_PASSWORD')));
    try {
      const migrationLedger = await migration.query('SELECT count(*)::int AS count FROM schema_migrations');
      if (migrationLedger.rows[0]?.count !== 5) throw new Error('SECU_ACCEPTANCE_MIGRATION_LEDGER_UNREADABLE');
    } finally { await migration.end(); }

    console.log(JSON.stringify({
      event: 'secumie_staging_acceptance_completed',
      database: DATABASE,
      owner: current.owner,
      migrations: ledger.rowCount,
      capacity: { maxConnections: Number(current.max_connections), observedConnections: Number(current.observed_connections), available, required: 78 },
      objects: owners.rows,
      retentionPreview: retention,
    }));
  } finally {
    await bootstrap.end();
  }
}

if (require.main === module) {
  validateSecumieStaging()
    .then(async () => shutdownCloudSqlProxy())
    .catch(async (error: unknown) => {
      const code = error instanceof Error && /^SECU_[A-Z0-9_]+/.test(error.message)
        ? error.message.split(':', 1)[0]
        : 'SECU_ACCEPTANCE_FAILED';
      console.error(JSON.stringify({ event: 'secumie_staging_acceptance_failed', code }));
      try { await shutdownCloudSqlProxy(); } catch { console.error(JSON.stringify({ event: 'secumie_proxy_shutdown_failed' })); }
      process.exitCode = 1;
    });
}
