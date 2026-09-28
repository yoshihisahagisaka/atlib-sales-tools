import type { Config } from '../config';
import { loadDatabaseConfig } from '../config';
import { createPool } from './pool';
import { verifyDeletionReadiness } from './deletionReadinessVerifier';

type VerifierPool = Parameters<typeof verifyDeletionReadiness>[0] & { end(): Promise<void> };
type Dependencies = { loadDatabaseConfig(): Promise<Config['db']>; createPool(config: { db: Config['db'] }): VerifierPool; stdout: Pick<NodeJS.WriteStream, 'write'> };

/** Runtime role only; this verifier intentionally never loads migration configuration. */
export async function runDeletionReadinessVerifierCli(deps: Dependencies = { loadDatabaseConfig, createPool, stdout: process.stdout }): Promise<void> {
  const pool = deps.createPool({ db: await deps.loadDatabaseConfig() });
  try { deps.stdout.write(`${JSON.stringify(await verifyDeletionReadiness(pool))}\n`); } finally { await pool.end(); }
}
if (require.main === module) runDeletionReadinessVerifierCli().catch(() => { process.stderr.write('DELETION_READINESS_VERIFICATION_FAILED\n'); process.exitCode = 1; });
