import type { Config } from '../config';
import { loadDatabaseConfig } from '../config';
import { createPool } from './pool';
import { verifyDeletionPostTickReconciliation, type ReconciliationWindow } from './deletionPostTickReconciliationVerifier';

type VerifierPool = Parameters<typeof verifyDeletionPostTickReconciliation>[0] & { end(): Promise<void> };
type Dependencies = { loadDatabaseConfig(): Promise<Config['db']>; createPool(config: { db: Config['db'] }): VerifierPool; environment: NodeJS.ProcessEnv; stdout: Pick<NodeJS.WriteStream, 'write'> };
function windowFrom(environment: NodeJS.ProcessEnv): ReconciliationWindow {
  const start_utc=environment.DELETION_RECONCILIATION_WINDOW_START_UTC;
  const end_utc=environment.DELETION_RECONCILIATION_WINDOW_END_UTC;
  if (!start_utc || !end_utc) throw new Error('DELETION_POST_TICK_RECONCILIATION_FAILED');
  return { start_utc, end_utc };
}
/** Runtime role only; window bounds are mandatory so a post-tick result cannot be mistaken for a baseline. */
export async function runDeletionPostTickReconciliationVerifierCli(deps: Dependencies = { loadDatabaseConfig, createPool, environment:process.env, stdout:process.stdout }): Promise<void> {
  const window=windowFrom(deps.environment);
  const pool=deps.createPool({db:await deps.loadDatabaseConfig()});
  try { deps.stdout.write(`${JSON.stringify(await verifyDeletionPostTickReconciliation(pool,window))}\n`); } finally { await pool.end(); }
}
if(require.main===module) runDeletionPostTickReconciliationVerifierCli().catch(()=>{process.stderr.write('DELETION_POST_TICK_RECONCILIATION_FAILED\n');process.exitCode=1;});
