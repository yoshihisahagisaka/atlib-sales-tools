import { Pool, PoolClient } from 'pg';
import { shutdownCloudSqlProxy } from './cloudSqlProxyShutdown';

const TARGET_DATABASE = 'secumie_insight_staging';
const TARGET_CONFIRMATION = 'msp-zabbix:asia-northeast1:secumie-sg-shared-staging-db/secumie_insight_staging';
const MIGRATION_ROLE = 'secumie_migration_staging';
const expectedRoles = [
  { name: 'secumie_otp_staging', connectionLimit: 6 },
  { name: 'secumie_pira_staging', connectionLimit: 6 },
  { name: 'secumie_admin_staging', connectionLimit: 40 },
  { name: MIGRATION_ROLE, connectionLimit: 1 },
  { name: 'secumie_maintenance_staging', connectionLimit: 1 },
] as const;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`SECU_RECOVERY_CONFIG_MISSING: ${name}`);
  return value;
}

async function identifier(client: PoolClient): Promise<string> {
  const result = await client.query<{ identifier: string }>("SELECT format('%I', current_user) AS identifier");
  const value = result.rows[0]?.identifier;
  if (!value) throw new Error('SECU_RECOVERY_ADMIN_IDENTITY_MISSING');
  return value;
}

async function assertRoles(client: PoolClient): Promise<void> {
  const roles = await client.query<{
    rolname: string; rolcanlogin: boolean; rolconnlimit: number; rolsuper: boolean; rolcreatedb: boolean;
    rolcreaterole: boolean; rolinherit: boolean; rolreplication: boolean; rolbypassrls: boolean;
  }>(`SELECT rolname, rolcanlogin, rolconnlimit, rolsuper, rolcreatedb, rolcreaterole,
      rolinherit, rolreplication, rolbypassrls
    FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname`, [expectedRoles.map((role) => role.name)]);
  if (roles.rowCount !== expectedRoles.length) throw new Error('SECU_RECOVERY_ROLE_SET_MISMATCH');
  for (const expected of expectedRoles) {
    const actual = roles.rows.find((role) => role.rolname === expected.name);
    if (!actual || !actual.rolcanlogin || actual.rolconnlimit !== expected.connectionLimit || actual.rolsuper
      || actual.rolcreatedb || actual.rolcreaterole || actual.rolinherit || actual.rolreplication || actual.rolbypassrls) {
      throw new Error('SECU_RECOVERY_ROLE_ATTRIBUTE_MISMATCH');
    }
  }
  const unexpected = await client.query(`SELECT rolname FROM pg_roles
    WHERE rolname LIKE 'secumie\\_%\\_staging' ESCAPE '\\'
      AND NOT (rolname=ANY($1::text[]))`, [expectedRoles.map((role) => role.name)]);
  if (unexpected.rowCount) throw new Error('SECU_RECOVERY_UNEXPECTED_ROLE');
}

export async function recoverSecumieInsightStaging(): Promise<void> {
  if (required('SECU_RECOVERY_TARGET_CONFIRMATION') !== TARGET_CONFIRMATION) {
    throw new Error('SECU_RECOVERY_TARGET_CONFIRMATION_MISMATCH');
  }
  const connection = {
    host: required('DB_BOOTSTRAP_HOST'),
    port: Number(process.env.DB_BOOTSTRAP_PORT ?? '5432'),
    user: required('DB_BOOTSTRAP_USER'),
    password: required('DB_BOOTSTRAP_PASSWORD'),
    max: 1,
    connectionTimeoutMillis: 10_000,
  };
  const admin = new Pool({ ...connection, database: 'postgres', application_name: 'secumie-staging-recovery' });
  let bootstrapIdentifier = '';
  try {
    const client = await admin.connect();
    try {
      const identity = await client.query<{ database: string; version: string; createdb: boolean; superuser: boolean }>(
        `SELECT current_database() AS database, current_setting('server_version') AS version,
          r.rolcreatedb AS createdb, r.rolsuper AS superuser FROM pg_roles r WHERE r.rolname=current_user`,
      );
      const current = identity.rows[0];
      if (current?.database !== 'postgres' || !current.version.startsWith('16.') || !current.createdb || current.superuser) {
        throw new Error('SECU_RECOVERY_SERVER_IDENTITY_MISMATCH');
      }
      await assertRoles(client);
      const database = await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [TARGET_DATABASE]);
      if (database.rowCount) throw new Error('SECU_RECOVERY_DATABASE_ALREADY_EXISTS');
      const membership = await client.query(`SELECT 1 FROM pg_auth_members am
        JOIN pg_roles granted ON granted.oid=am.roleid
        JOIN pg_roles member_role ON member_role.oid=am.member
        WHERE granted.rolname=$1 AND member_role.rolname=current_user`, [MIGRATION_ROLE]);
      if (membership.rowCount) throw new Error('SECU_RECOVERY_UNEXPECTED_MEMBERSHIP');
      bootstrapIdentifier = await identifier(client);
      await client.query(`CREATE DATABASE ${TARGET_DATABASE}`);
    } finally {
      client.release();
    }
  } finally {
    await admin.end();
  }

  const target = new Pool({ ...connection, database: TARGET_DATABASE, application_name: 'secumie-staging-recovery-finalize' });
  try {
    const targetClient = await target.connect();
    try {
      await targetClient.query('BEGIN');
      try {
        await targetClient.query(`REVOKE CONNECT, TEMPORARY ON DATABASE ${TARGET_DATABASE} FROM PUBLIC`);
        await targetClient.query(`GRANT CONNECT ON DATABASE ${TARGET_DATABASE} TO ${expectedRoles.map((role) => role.name).join(', ')}`);
        await targetClient.query(`GRANT CREATE ON DATABASE ${TARGET_DATABASE} TO ${MIGRATION_ROLE}`);
        await targetClient.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
        await targetClient.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${MIGRATION_ROLE}`);
        await targetClient.query('COMMIT');
      } catch (error) {
        await targetClient.query('ROLLBACK');
        throw error;
      }
      const verification = await targetClient.query<{
        owner: string; public_database_access: boolean; public_schema_access: boolean;
        role_connect_count: string; migration_create: boolean; migration_schema_usage: boolean; migration_schema_create: boolean;
      }>(`SELECT
        pg_get_userbyid(d.datdba) AS owner,
        EXISTS (SELECT 1 FROM aclexplode(COALESCE(d.datacl, acldefault('d', d.datdba))) a
          WHERE a.grantee=0 AND a.privilege_type IN ('CONNECT','TEMPORARY')) AS public_database_access,
        EXISTS (SELECT 1 FROM aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a
          WHERE a.grantee=0 AND a.privilege_type IN ('USAGE','CREATE')) AS public_schema_access,
        (SELECT count(*)::text FROM unnest($1::text[]) role_name
          WHERE has_database_privilege(role_name, $2, 'CONNECT')) AS role_connect_count,
        has_database_privilege($3, $2, 'CREATE') AS migration_create,
        has_schema_privilege($3, 'public', 'USAGE') AS migration_schema_usage,
        has_schema_privilege($3, 'public', 'CREATE') AS migration_schema_create
      FROM pg_database d JOIN pg_namespace n ON n.nspname='public' WHERE d.datname=$2`,
      [expectedRoles.map((role) => role.name), TARGET_DATABASE, MIGRATION_ROLE]);
      const row = verification.rows[0];
      if (!row || row.owner !== required('DB_BOOTSTRAP_USER') || row.public_database_access || row.public_schema_access
        || Number(row.role_connect_count) !== expectedRoles.length || !row.migration_create
        || !row.migration_schema_usage || !row.migration_schema_create) {
        throw new Error('SECU_RECOVERY_POSTCONDITION_FAILED');
      }
    } finally {
      targetClient.release();
    }
  } finally {
    await target.end();
  }
  console.log(JSON.stringify({ event: 'secumie_recovery_completed', database: TARGET_DATABASE, owner: required('DB_BOOTSTRAP_USER') }));
}

if (require.main === module) {
  recoverSecumieInsightStaging()
    .then(async () => shutdownCloudSqlProxy())
    .catch(async (error: unknown) => {
      const code = error instanceof Error && /^SECU_[A-Z0-9_]+/.test(error.message)
        ? error.message.split(':', 1)[0]
        : 'SECU_RECOVERY_FAILED';
      console.error(JSON.stringify({ event: 'secumie_recovery_failed', code }));
      try { await shutdownCloudSqlProxy(); } catch { console.error(JSON.stringify({ event: 'secumie_proxy_shutdown_failed' })); }
      process.exitCode = 1;
    });
}
