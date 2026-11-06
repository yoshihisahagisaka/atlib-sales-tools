import { Pool, PoolClient } from 'pg';
import { shutdownCloudSqlProxy } from './cloudSqlProxyShutdown';

const TARGET_DATABASE = 'secumie_insight_staging';
const TARGET_CONFIRMATION = 'msp-zabbix:asia-northeast1:secumie-sg-shared-staging-db/secumie_insight_staging';
const APPROVED_APPLICATION_BUDGET = 78;
const roles = [
  { name: 'secumie_otp_staging', passwordEnv: 'SECU_OTP_DB_PASSWORD', connectionLimit: 6 },
  { name: 'secumie_pira_staging', passwordEnv: 'SECU_PIRA_DB_PASSWORD', connectionLimit: 6 },
  { name: 'secumie_admin_staging', passwordEnv: 'SECU_ADMIN_DB_PASSWORD', connectionLimit: 40 },
  { name: 'secumie_migration_staging', passwordEnv: 'SECU_MIGRATION_DB_PASSWORD', connectionLimit: 1 },
  { name: 'secumie_maintenance_staging', passwordEnv: 'SECU_MAINTENANCE_DB_PASSWORD', connectionLimit: 1 },
] as const;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`SECU_BOOTSTRAP_CONFIG_MISSING: ${name}`);
  return value;
}

export function evaluateConnectionCapacity(input: {
  maxConnections: number;
  superuserReserved: number;
  reserved: number;
  observedConnections: number;
}) {
  const reserve = Math.max(
    10,
    Math.ceil(input.maxConnections * 0.20),
    input.superuserReserved + input.reserved + 5,
    input.observedConnections + 5,
  );
  const applicationAvailable = input.maxConnections - reserve;
  return { ...input, reserve, applicationAvailable, required: APPROVED_APPLICATION_BUDGET, pass: applicationAvailable >= APPROVED_APPLICATION_BUDGET };
}

async function quotedLiteral(client: PoolClient, value: string): Promise<string> {
  const result = await client.query<{ literal: string }>('SELECT format(\'%L\', $1::text) AS literal', [value]);
  const literal = result.rows[0]?.literal;
  if (!literal) throw new Error('SECU_BOOTSTRAP_QUOTING_FAILED');
  return literal;
}

export async function bootstrapSecumieInsightStaging(): Promise<void> {
  if (required('SECU_BOOTSTRAP_TARGET_CONFIRMATION') !== TARGET_CONFIRMATION) {
    throw new Error('SECU_BOOTSTRAP_TARGET_CONFIRMATION_MISMATCH');
  }
  const rolePasswords = new Map(roles.map((role) => [role.name, required(role.passwordEnv)]));
  if ([...rolePasswords.values()].some((password) => password.length < 32) || new Set(rolePasswords.values()).size !== roles.length) {
    throw new Error('SECU_BOOTSTRAP_ROLE_PASSWORD_POLICY_FAILED');
  }
  const bootstrapPassword = required('DB_BOOTSTRAP_PASSWORD');
  if (bootstrapPassword.length < 32) throw new Error('SECU_BOOTSTRAP_ADMIN_PASSWORD_POLICY_FAILED');
  const pool = new Pool({
    host: required('DB_BOOTSTRAP_HOST'),
    port: Number(process.env.DB_BOOTSTRAP_PORT ?? '5432'),
    database: 'postgres',
    user: required('DB_BOOTSTRAP_USER'),
    password: bootstrapPassword,
    max: 1,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    application_name: 'secumie-insight-staging-bootstrap',
  });

  try {
    const client = await pool.connect();
    try {
      const identity = await client.query<{ database: string; version: string; read_only: string }>(
        "SELECT current_database() AS database, current_setting('server_version') AS version, current_setting('transaction_read_only') AS read_only",
      );
      if (identity.rows[0]?.database !== 'postgres' || !identity.rows[0]?.version.startsWith('16.')) {
        throw new Error('SECU_BOOTSTRAP_SERVER_IDENTITY_MISMATCH');
      }
      const capacityResult = await client.query<{
        max_connections: string;
        superuser_reserved: string;
        reserved: string;
        observed_connections: string;
      }>(`SELECT
        current_setting('max_connections') AS max_connections,
        current_setting('superuser_reserved_connections') AS superuser_reserved,
        COALESCE(current_setting('reserved_connections', true), '0') AS reserved,
        (SELECT count(*)::text FROM pg_stat_activity) AS observed_connections`);
      const capacity = evaluateConnectionCapacity({
        maxConnections: Number(capacityResult.rows[0]?.max_connections),
        superuserReserved: Number(capacityResult.rows[0]?.superuser_reserved),
        reserved: Number(capacityResult.rows[0]?.reserved),
        observedConnections: Number(capacityResult.rows[0]?.observed_connections),
      });
      if (Object.values(capacity).some((value) => typeof value === 'number' && !Number.isFinite(value))) {
        throw new Error('SECU_BOOTSTRAP_CAPACITY_READ_FAILED');
      }
      console.log(JSON.stringify({ event: 'secumie_bootstrap_capacity_gate', ...capacity }));
      if (!capacity.pass) throw new Error('SECU_BOOTSTRAP_CONNECTION_CAPACITY_INSUFFICIENT');
      const existingDatabase = await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [TARGET_DATABASE]);
      const existingRoles = await client.query('SELECT rolname FROM pg_roles WHERE rolname=ANY($1::text[])', [roles.map((role) => role.name)]);
      if (existingDatabase.rowCount || existingRoles.rowCount) throw new Error('SECU_BOOTSTRAP_TARGET_ALREADY_EXISTS');

      await client.query('BEGIN');
      try {
        for (const role of roles) {
          const password = await quotedLiteral(client, rolePasswords.get(role.name)!);
          await client.query(`CREATE ROLE ${role.name} LOGIN PASSWORD ${password} CONNECTION LIMIT ${role.connectionLimit} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }

      await client.query(`CREATE DATABASE ${TARGET_DATABASE} OWNER secumie_migration_staging`);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }

  const target = new Pool({
    host: required('DB_BOOTSTRAP_HOST'),
    port: Number(process.env.DB_BOOTSTRAP_PORT ?? '5432'),
    database: TARGET_DATABASE,
    user: required('DB_BOOTSTRAP_USER'),
    password: bootstrapPassword,
    max: 1,
    connectionTimeoutMillis: 10_000,
    application_name: 'secumie-insight-staging-bootstrap-finalize',
  });
  try {
    const currentUser = await target.query<{ identifier: string }>("SELECT format('%I', current_user) AS identifier");
    const bootstrapIdentifier = currentUser.rows[0]?.identifier;
    if (!bootstrapIdentifier) throw new Error('SECU_BOOTSTRAP_ADMIN_IDENTITY_MISSING');
    await target.query('REVOKE CONNECT, TEMPORARY ON DATABASE secumie_insight_staging FROM PUBLIC');
    await target.query(`GRANT CONNECT ON DATABASE secumie_insight_staging TO ${bootstrapIdentifier}, ${roles.map((role) => role.name).join(', ')}`);
  } finally {
    await target.end();
  }
  console.log(JSON.stringify({ event: 'secumie_bootstrap_completed', database: TARGET_DATABASE, roleCount: roles.length }));
}

if (require.main === module) {
  bootstrapSecumieInsightStaging()
    .then(async () => shutdownCloudSqlProxy())
    .catch(async (error: unknown) => {
      const code = error instanceof Error && /^SECU_[A-Z0-9_]+/.test(error.message)
        ? error.message.split(':', 1)[0]
        : 'SECU_BOOTSTRAP_FAILED';
      console.error(JSON.stringify({ event: 'secumie_bootstrap_failed', code }));
      try { await shutdownCloudSqlProxy(); } catch { console.error(JSON.stringify({ event: 'secumie_proxy_shutdown_failed' })); }
      process.exitCode = 1;
    });
}
