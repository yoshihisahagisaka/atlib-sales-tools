import type { Config } from '../config';
import { loadDatabaseConfig } from '../config';
import { createPool } from './pool';
import { verifyAiExecutionQueueReadiness } from './aiExecutionQueueReadinessVerifier';

type VerifierPool = Parameters<typeof verifyAiExecutionQueueReadiness>[0] & { end(): Promise<void> };
type CliDependencies = {
  loadDatabaseConfig(): Promise<Config['db']>;
  createPool(config: { db: Config['db'] }): VerifierPool;
  stdout: Pick<NodeJS.WriteStream, 'write'>;
};

/** Runtime role only: loadDatabaseConfig() deliberately uses no migration argument. */
export async function runAiExecutionQueueReadinessVerifierCli(deps: CliDependencies = { loadDatabaseConfig, createPool, stdout: process.stdout }): Promise<void> {
  const pool = deps.createPool({ db: await deps.loadDatabaseConfig() });
  try { deps.stdout.write(`${JSON.stringify(await verifyAiExecutionQueueReadiness(pool))}\n`); }
  finally { await pool.end(); }
}

if (require.main === module) {
  runAiExecutionQueueReadinessVerifierCli().catch(() => {
    process.stderr.write('AI_EXECUTION_QUEUE_READINESS_VERIFICATION_FAILED\n');
    process.exitCode = 1;
  });
}
