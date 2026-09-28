import type { Config } from '../config';
import { loadDatabaseConfig } from '../config';
import { createPool } from './pool';
import { DeletionReconciliationPermissionDiagnosticError, type DeletionReconciliationPermissionPhase, verifyDeletionReconciliationPermissions } from './deletionReconciliationPermissionVerifier';

type VerifierPool = Parameters<typeof verifyDeletionReconciliationPermissions>[0] & { end(): Promise<void> };
type Dependencies = { loadDatabaseConfig(): Promise<Config['db']>; createPool(config: { db: Config['db'] }): VerifierPool; stdout: Pick<NodeJS.WriteStream, 'write'>; stderr: Pick<NodeJS.WriteStream, 'write'> };

export async function runDeletionReconciliationPermissionVerifierCli(deps: Dependencies = { loadDatabaseConfig, createPool, stdout: process.stdout, stderr: process.stderr }): Promise<void> {
  let phase: DeletionReconciliationPermissionPhase = 'CONNECT';
  let pool: VerifierPool | undefined;
  let failure: unknown;
  try {
    phase = 'CONNECT'; pool = deps.createPool({ db: await deps.loadDatabaseConfig() });
    deps.stdout.write(`${JSON.stringify(await verifyDeletionReconciliationPermissions(pool))}\n`);
  } catch (error) {
    const safePhase = error instanceof DeletionReconciliationPermissionDiagnosticError ? error.phase : phase;
    deps.stderr.write(`DELETION_RECONCILIATION_PERMISSION_DIAGNOSTIC_FAILED:${safePhase}\n`);
    failure = error;
  } finally {
    if (pool) try { await pool.end(); } catch {
      if (!failure) { deps.stderr.write('DELETION_RECONCILIATION_PERMISSION_DIAGNOSTIC_FAILED:POOL_CLOSE\n'); failure = new DeletionReconciliationPermissionDiagnosticError('POOL_CLOSE'); }
    }
  }
  if (failure) throw failure;
}

if (require.main === module) runDeletionReconciliationPermissionVerifierCli().catch(() => { process.exitCode = 1; });
