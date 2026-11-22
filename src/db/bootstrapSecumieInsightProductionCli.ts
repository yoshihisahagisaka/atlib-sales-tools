import { Pool, type PoolClient } from 'pg';
import { shutdownCloudSqlProxy } from './cloudSqlProxyShutdown';
import {
  evaluateProductionConnectionCapacity,
  assertProductionInstance,
  SECU_PRODUCTION_DATABASE,
  SECU_PRODUCTION_ROLES,
  SECU_PRODUCTION_TARGET,
} from './secumieProductionContract';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`SECU_PRODUCTION_BOOTSTRAP_CONFIG_MISSING: ${name}`);
  return value;
}

async function quotedLiteral(client: PoolClient, value: string): Promise<string> {
  const result = await client.query<{ literal: string }>("SELECT format('%L', $1::text) AS literal", [value]);
  if (!result.rows[0]?.literal) throw new Error('SECU_PRODUCTION_BOOTSTRAP_QUOTING_FAILED');
  return result.rows[0].literal;
}

export async function bootstrapSecumieInsightProduction(
  capacityEvaluator = evaluateProductionConnectionCapacity,
): Promise<void> {
  assertProductionInstance(process.env.SECU_CLOUD_SQL_INSTANCE);
  if (required('SECU_PRODUCTION_BOOTSTRAP_TARGET_CONFIRMATION') !== SECU_PRODUCTION_TARGET) {
    throw new Error('SECU_PRODUCTION_BOOTSTRAP_TARGET_CONFIRMATION_MISMATCH');
  }
  const rolePasswords = new Map(SECU_PRODUCTION_ROLES.map(role => [role.name, required(role.passwordEnv)]));
  if ([...rolePasswords.values()].some(password => password.length < 32)
      || new Set(rolePasswords.values()).size !== SECU_PRODUCTION_ROLES.length) {
    throw new Error('SECU_PRODUCTION_BOOTSTRAP_ROLE_PASSWORD_POLICY_FAILED');
  }
  const bootstrapPassword = required('DB_BOOTSTRAP_PASSWORD');
  if (bootstrapPassword.length < 32) throw new Error('SECU_PRODUCTION_BOOTSTRAP_ADMIN_PASSWORD_POLICY_FAILED');
  const connection = {
    host: required('DB_BOOTSTRAP_HOST'),
    port: Number(process.env.DB_BOOTSTRAP_PORT ?? '5432'),
    user: required('DB_BOOTSTRAP_USER'),
    password: bootstrapPassword,
    max: 1,
    connectionTimeoutMillis: 10_000,
  };
  const admin = new Pool({ ...connection, database: 'postgres', application_name: 'secumie-insight-production-bootstrap' });
  let bootstrapIdentifier = '';
  try {
    const client = await admin.connect();
    try {
      const identity = await client.query<{ database: string; version: string; identifier: string }>(
        "SELECT current_database() AS database,current_setting('server_version') AS version,format('%I',current_user) AS identifier",
      );
      const current = identity.rows[0];
      if (current?.database !== 'postgres' || !current.version.startsWith('16.') || !current.identifier) {
        throw new Error('SECU_PRODUCTION_BOOTSTRAP_SERVER_IDENTITY_MISMATCH');
      }
      bootstrapIdentifier = current.identifier;
      const capacityRow = (await client.query<{
        max_connections: string; superuser_reserved: string; reserved: string; observed_connections: string;
      }>(`SELECT current_setting('max_connections') AS max_connections,
        current_setting('superuser_reserved_connections') AS superuser_reserved,
        COALESCE(NULLIF(current_setting('reserved_connections',true),''),'0') AS reserved,
        (SELECT count(*)::text FROM pg_stat_activity) AS observed_connections`)).rows[0];
      const capacity = capacityEvaluator({
        maxConnections: Number(capacityRow?.max_connections),
        superuserReserved: Number(capacityRow?.superuser_reserved),
        reserved: Number(capacityRow?.reserved),
        observedConnections: Number(capacityRow?.observed_connections),
      });
      if (Object.values(capacity).some(value => typeof value === 'number' && !Number.isFinite(value))) {
        throw new Error('SECU_PRODUCTION_BOOTSTRAP_CAPACITY_READ_FAILED');
      }
      console.log(JSON.stringify({ event: 'secumie_production_bootstrap_capacity_gate', ...capacity }));
      if (!capacity.pass) throw new Error('SECU_PRODUCTION_BOOTSTRAP_CONNECTION_CAPACITY_INSUFFICIENT');
      const existingDatabase = await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [SECU_PRODUCTION_DATABASE]);
      const existingRoles = await client.query('SELECT rolname FROM pg_roles WHERE rolname=ANY($1::text[])', [SECU_PRODUCTION_ROLES.map(role => role.name)]);
      if (existingDatabase.rowCount || existingRoles.rowCount) throw new Error('SECU_PRODUCTION_BOOTSTRAP_TARGET_ALREADY_EXISTS');

      await client.query('BEGIN');
      try {
        for (const role of SECU_PRODUCTION_ROLES) {
          const password = await quotedLiteral(client, rolePasswords.get(role.name)!);
          await client.query(`CREATE ROLE ${role.name} LOGIN PASSWORD ${password} CONNECTION LIMIT ${role.connectionLimit} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
      await client.query(`CREATE DATABASE ${SECU_PRODUCTION_DATABASE}`);
    } finally { client.release(); }
  } finally { await admin.end(); }

  const target = new Pool({ ...connection, database: SECU_PRODUCTION_DATABASE, application_name: 'secumie-insight-production-bootstrap-finalize' });
  try {
    await target.query('BEGIN');
    try {
      await target.query(`REVOKE CONNECT, TEMPORARY ON DATABASE ${SECU_PRODUCTION_DATABASE} FROM PUBLIC`);
      await target.query(`GRANT CONNECT ON DATABASE ${SECU_PRODUCTION_DATABASE} TO ${SECU_PRODUCTION_ROLES.map(role => role.name).join(', ')}`);
      await target.query(`GRANT CREATE ON DATABASE ${SECU_PRODUCTION_DATABASE} TO secumie_migration_prod`);
      await target.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
      await target.query('GRANT USAGE, CREATE ON SCHEMA public TO secumie_migration_prod');
      await target.query('COMMIT');
    } catch (error) {
      await target.query('ROLLBACK');
      throw error;
    }
    const postcondition = (await target.query<{ owner: string; public_database_access: boolean; public_schema_access: boolean }>(`SELECT
      pg_get_userbyid(d.datdba) AS owner,
      EXISTS (SELECT 1 FROM aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba))) a WHERE a.grantee=0 AND a.privilege_type IN ('CONNECT','TEMPORARY')) AS public_database_access,
      EXISTS (SELECT 1 FROM pg_namespace n, LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='public' AND a.grantee=0 AND a.privilege_type IN ('USAGE','CREATE')) AS public_schema_access
      FROM pg_database d WHERE d.datname=$1`, [SECU_PRODUCTION_DATABASE])).rows[0];
    if (!postcondition || postcondition.owner !== required('DB_BOOTSTRAP_USER')
        || postcondition.public_database_access || postcondition.public_schema_access) {
      throw new Error('SECU_PRODUCTION_BOOTSTRAP_POSTCONDITION_FAILED');
    }
  } finally { await target.end(); }
  console.log(JSON.stringify({ event: 'secumie_production_bootstrap_completed', database: SECU_PRODUCTION_DATABASE, owner: required('DB_BOOTSTRAP_USER'), roleCount: SECU_PRODUCTION_ROLES.length }));
}

if (require.main === module) bootstrapSecumieInsightProduction()
  .then(async () => shutdownCloudSqlProxy())
  .catch(async (error: unknown) => {
    const code = error instanceof Error && /^SECU_[A-Z0-9_]+/.test(error.message) ? error.message.split(':',1)[0] : 'SECU_PRODUCTION_BOOTSTRAP_FAILED';
    console.error(JSON.stringify({ event: 'secumie_production_bootstrap_failed', code }));
    try { await shutdownCloudSqlProxy(); } catch { console.error(JSON.stringify({ event: 'secumie_proxy_shutdown_failed' })); }
    process.exitCode = 1;
  });
