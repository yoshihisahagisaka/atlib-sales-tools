import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { loadDatabaseConfig } from '../config';
import { shutdownCloudSqlProxy } from './cloudSqlProxyShutdown';
import { configureSecumieDbRoles } from './configureSecumieDbRolesCli';
import { runMigrations } from './migrate';
import { createPool } from './pool';
import { assertProductionInstance, SECU_PRODUCTION_DATABASE, SECU_PRODUCTION_MIGRATIONS, SECU_PRODUCTION_TARGET } from './secumieProductionContract';

export async function runSecumieProductionMigration(): Promise<void> {
  assertProductionInstance(process.env.SECU_CLOUD_SQL_INSTANCE);
  if (process.env.SECU_PRODUCTION_MIGRATION_TARGET_CONFIRMATION !== SECU_PRODUCTION_TARGET) {
    throw new Error('SECU_PRODUCTION_MIGRATION_TARGET_CONFIRMATION_MISMATCH');
  }
  if (process.env.DB_NAME !== SECU_PRODUCTION_DATABASE) throw new Error('SECU_PRODUCTION_MIGRATION_DATABASE_MISMATCH');
  if (process.env.DB_MIGRATION_USER !== 'secumie_migration_prod') throw new Error('SECU_PRODUCTION_MIGRATION_ROLE_MISMATCH');
  const directory = path.resolve(process.env.MIGRATIONS_DIR ?? '/app/migrations-secumie');
  const manifest = path.resolve(process.env.MIGRATION_MANIFEST ?? '/app/migration-manifests/secumie-insight-production-037-041.json');
  const verifier = path.resolve(process.env.MIGRATION_VERIFIER ?? '/app/scripts/readiness/verifySecumieMigrationManifest.cjs');
  execFileSync(process.execPath, [verifier, manifest, directory, 'true'], { stdio: 'inherit' });
  const pool = createPool({ db: await loadDatabaseConfig('migration') }, { max: 1 });
  try {
    const identity = await pool.query<{ database: string; version: string }>("SELECT current_database() AS database,current_setting('server_version') AS version");
    if (identity.rows[0]?.database !== SECU_PRODUCTION_DATABASE || !identity.rows[0]?.version.startsWith('16.')) {
      throw new Error('SECU_PRODUCTION_MIGRATION_SERVER_IDENTITY_MISMATCH');
    }
    const existingLedger = await pool.query("SELECT to_regclass('public.schema_migrations') AS ledger");
    if (existingLedger.rows[0]?.ledger) throw new Error('SECU_PRODUCTION_MIGRATION_LEDGER_ALREADY_EXISTS');
    await runMigrations(pool, directory, event => console.log(JSON.stringify(event)));
    const ledger = await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations ORDER BY filename');
    if (JSON.stringify(ledger.rows.map(row => row.filename)) !== JSON.stringify(SECU_PRODUCTION_MIGRATIONS)) {
      throw new Error('SECU_PRODUCTION_MIGRATION_LEDGER_MISMATCH');
    }
  } finally { await pool.end(); }
  await configureSecumieDbRoles();
  console.log(JSON.stringify({ event: 'secumie_production_migration_completed', migrations: SECU_PRODUCTION_MIGRATIONS.length }));
}

if (require.main === module) runSecumieProductionMigration()
  .then(async () => shutdownCloudSqlProxy())
  .catch(async (error: unknown) => {
    const code = error instanceof Error && /^SECU_[A-Z0-9_]+/.test(error.message) ? error.message.split(':',1)[0] : 'SECU_PRODUCTION_MIGRATION_FAILED';
    console.error(JSON.stringify({ event: 'secumie_production_migration_failed', code }));
    try { await shutdownCloudSqlProxy(); } catch { console.error(JSON.stringify({ event: 'secumie_proxy_shutdown_failed' })); }
    process.exitCode = 1;
  });
