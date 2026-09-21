import type { Config } from '../config';
import { loadDatabaseConfig } from '../config';
import { createPool } from './pool';
import { verifyMigrationLedger } from './migrationLedgerVerifier';

type VerifierPool = Parameters<typeof verifyMigrationLedger>[0] & { end(): Promise<void> };
type CliDependencies = {
  loadDatabaseConfig(): Promise<Config['db']>;
  createPool(config: { db: Config['db'] }): VerifierPool;
  stdout: Pick<NodeJS.WriteStream, 'write'>;
};

export async function runMigrationLedgerVerifierCli(deps: CliDependencies = { loadDatabaseConfig, createPool, stdout: process.stdout }): Promise<void> {
  // Reuses the DB configuration path used by the migration artifact, without
  // importing or invoking its migration runner.
  const pool = deps.createPool({ db: await deps.loadDatabaseConfig() });
  try {
    const ledger = await verifyMigrationLedger(pool);
    deps.stdout.write(`${JSON.stringify(ledger)}\n`);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigrationLedgerVerifierCli().catch(() => {
    process.stderr.write('MIGRATION_LEDGER_VERIFICATION_FAILED\n');
    process.exitCode = 1;
  });
}
