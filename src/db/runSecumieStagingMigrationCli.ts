import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { loadDatabaseConfig } from '../config';
import { shutdownCloudSqlProxy } from './cloudSqlProxyShutdown';
import { configureSecumieDbRoles } from './configureSecumieDbRolesCli';
import { runMigrations } from './migrate';
import { createPool } from './pool';

const confirmation = 'msp-zabbix:asia-northeast1:secumie-sg-shared-staging-db/secumie_insight_staging';
const expectedLedger = ['037_public_service_otp.sql','038_pira_public_intake.sql','039_pira_admin_export.sql','040_pira_export_audit_retention.sql','041_secumie_db_operations.sql'];

export async function runSecumieStagingMigration(): Promise<void> {
  if (process.env.SECU_MIGRATION_TARGET_CONFIRMATION !== confirmation) throw new Error('SECU_MIGRATION_TARGET_CONFIRMATION_MISMATCH');
  if (process.env.DB_NAME !== 'secumie_insight_staging') throw new Error('SECU_MIGRATION_DATABASE_MISMATCH');
  const directory = path.resolve(process.env.MIGRATIONS_DIR ?? '/app/migrations-secumie');
  const manifest = path.resolve(process.env.MIGRATION_MANIFEST ?? '/app/migration-manifests/secumie-insight-staging-037-041.json');
  const verifier = path.resolve(process.env.MIGRATION_VERIFIER ?? '/app/scripts/readiness/verifySecumieMigrationManifest.cjs');
  execFileSync(process.execPath, [verifier, manifest, directory, 'true'], { stdio: 'inherit' });

  const pool = createPool({ db: await loadDatabaseConfig('migration') }, { max: 1 });
  try {
    const identity = await pool.query<{ database: string; version: string }>("SELECT current_database() AS database,current_setting('server_version') AS version");
    if (identity.rows[0]?.database !== 'secumie_insight_staging' || !identity.rows[0]?.version.startsWith('16.')) {
      throw new Error('SECU_MIGRATION_SERVER_IDENTITY_MISMATCH');
    }
    await runMigrations(pool, directory, (event) => console.log(JSON.stringify(event)));
    const ledger = await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations ORDER BY filename');
    if (JSON.stringify(ledger.rows.map((row) => row.filename)) !== JSON.stringify(expectedLedger)) {
      throw new Error('SECU_MIGRATION_LEDGER_MISMATCH');
    }
  } finally {
    await pool.end();
  }
  await configureSecumieDbRoles();
  console.log(JSON.stringify({ event: 'secumie_staging_migration_completed', migrations: expectedLedger.length }));
}

if (require.main === module) {
  runSecumieStagingMigration()
    .then(async () => shutdownCloudSqlProxy())
    .catch(async (error: unknown) => {
      const code = error instanceof Error && /^SECU_[A-Z0-9_]+/.test(error.message)
        ? error.message.split(':', 1)[0]
        : 'SECU_MIGRATION_FAILED';
      console.error(JSON.stringify({ event: 'secumie_staging_migration_failed', code }));
      try { await shutdownCloudSqlProxy(); } catch { console.error(JSON.stringify({ event: 'secumie_proxy_shutdown_failed' })); }
      process.exitCode = 1;
    });
}
