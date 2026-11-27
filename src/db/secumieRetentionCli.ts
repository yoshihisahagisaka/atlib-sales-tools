import { Pool, type PoolClient } from 'pg';
import { maintenancePoolConfig } from './secumieDbOperationsConfig';

type Counts = Record<string, number>;
async function candidates(client: Pool | PoolClient, referenceAt?: Date) {
  const otp = await client.query<{ counts: Counts }>(referenceAt ? 'SELECT public_auth.retention_candidates($1) AS counts' : 'SELECT public_auth.retention_candidates() AS counts', referenceAt ? [referenceAt] : []);
  const pira = await client.query<{ counts: Counts }>(referenceAt ? 'SELECT pira.retention_candidates($1) AS counts' : 'SELECT pira.retention_candidates() AS counts', referenceAt ? [referenceAt] : []);
  return { otp: otp.rows[0]?.counts ?? {}, pira: pira.rows[0]?.counts ?? {} };
}

export async function runSecumieRetention(): Promise<void> {
  const referenceAt = process.env.RETENTION_REFERENCE_AT ? new Date(process.env.RETENTION_REFERENCE_AT) : undefined;
  if (referenceAt && Number.isNaN(referenceAt.getTime())) throw new Error('Invalid RETENTION_REFERENCE_AT');
  const execute = process.env.RETENTION_EXECUTE === 'true';
  const pool = new Pool(maintenancePoolConfig());
  try {
    const before = await candidates(pool, referenceAt);
    if (!execute) {
      console.log(JSON.stringify({ event: 'secumie_retention_preview', referenceAt: referenceAt?.toISOString() ?? 'database_clock', candidates: before }));
      return;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const otp = await client.query<{ counts: Counts }>(referenceAt ? 'SELECT public_auth.purge_retained_data($1) AS counts' : 'SELECT public_auth.purge_retained_data() AS counts', referenceAt ? [referenceAt] : []);
      const pira = await client.query<{ counts: Counts }>(referenceAt ? 'SELECT pira.purge_retained_data($1) AS counts' : 'SELECT pira.purge_retained_data() AS counts', referenceAt ? [referenceAt] : []);
      await client.query('COMMIT');
      console.log(JSON.stringify({ event: 'secumie_retention_completed', referenceAt: referenceAt?.toISOString() ?? 'database_clock', candidates: before, deleted: { otp: otp.rows[0]?.counts ?? {}, pira: pira.rows[0]?.counts ?? {} } }));
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  } finally { await pool.end(); }
}

if (require.main === module) runSecumieRetention().catch(error => {
  console.error(JSON.stringify({ event: 'secumie_retention_failed', error: error instanceof Error ? error.message : 'unknown' }));
  process.exitCode = 1;
});
