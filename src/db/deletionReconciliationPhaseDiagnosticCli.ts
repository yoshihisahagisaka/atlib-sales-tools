import type { Config } from '../config';
import { loadDatabaseConfig } from '../config';
import { createPool } from './pool';
import { validateDeletionPostTickWindow, type ReconciliationWindow } from './deletionPostTickReconciliationVerifier';
import { DeletionReconciliationPhaseDiagnosticError, diagnoseDeletionReconciliationPhase, type DeletionReconciliationPhase } from './deletionReconciliationPhaseDiagnostic';

type Pool = Parameters<typeof diagnoseDeletionReconciliationPhase>[0] & { end(): Promise<void> };
type Dependencies = { loadDatabaseConfig(): Promise<Config['db']>; createPool(config: { db: Config['db'] }): Pool; environment: NodeJS.ProcessEnv; now(): Date; stdout: Pick<NodeJS.WriteStream, 'write'>; stderr: Pick<NodeJS.WriteStream, 'write'> };

function windowFrom(environment: NodeJS.ProcessEnv, now: Date): ReconciliationWindow {
  const start_utc = environment.DELETION_RECONCILIATION_WINDOW_START_UTC;
  const end_utc = environment.DELETION_RECONCILIATION_WINDOW_END_UTC;
  if (!start_utc || !end_utc) throw new DeletionReconciliationPhaseDiagnosticError('CONNECT');
  return validateDeletionPostTickWindow({ start_utc, end_utc }, now);
}

/** Runtime-role-only and phase-only: no aggregate values or database errors are emitted. */
export async function runDeletionReconciliationPhaseDiagnosticCli(deps: Dependencies = { loadDatabaseConfig, createPool, environment: process.env, now: () => new Date(), stdout: process.stdout, stderr: process.stderr }): Promise<void> {
  let phase: DeletionReconciliationPhase = 'CONNECT'; let pool: Pool | undefined; let failure: unknown;
  try {
    const window = windowFrom(deps.environment, deps.now());
    phase = 'CONNECT'; pool = deps.createPool({ db: await deps.loadDatabaseConfig() });
    const last_successful_phase = await diagnoseDeletionReconciliationPhase(pool, window);
    deps.stdout.write(`${JSON.stringify({ schema: 'phase_only', outcome: 'SUCCESS', last_successful_phase })}\n`);
  } catch (error) {
    const safePhase = error instanceof DeletionReconciliationPhaseDiagnosticError ? error.phase : phase;
    deps.stderr.write(`DELETION_RECONCILIATION_PHASE_DIAGNOSTIC_FAILED:${safePhase}\n`); failure = error;
  } finally {
    if (pool) try { await pool.end(); } catch {
      if (!failure) { deps.stderr.write('DELETION_RECONCILIATION_PHASE_DIAGNOSTIC_FAILED:POOL_CLOSE\n'); failure = new DeletionReconciliationPhaseDiagnosticError('POOL_CLOSE'); }
    }
  }
  if (failure) throw failure;
}

if (require.main === module) runDeletionReconciliationPhaseDiagnosticCli().catch(() => { process.exitCode = 1; });
