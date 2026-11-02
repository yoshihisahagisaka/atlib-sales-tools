import { Pool, type PoolClient } from 'pg';
import { maintenancePoolConfig } from './secumieDbOperationsConfig';

type Counts = Record<string, number>;
async function candidates(client: Pool | PoolClient, referenceAt: Date) {
  const otp = await client.query<{ counts: Counts }>('SELECT public_auth.retention_candidates($1) AS counts', [referenceAt]);
  const pira = await client.query<{ counts: Counts }>('SELECT pira.retention_candidates($1) AS counts', [referenceAt]);
  return { otp: otp.rows[0]?.counts ?? {}, pira: pira.rows[0]?.counts ?? {} };
}

export async function runSecumieRetention(): Promise<void> {
  const referenceAt = process.env.RETENTION_REFERENCE_AT ? new Date(process.env.RETENTION_REFERENCE_AT) : new Date();
  if (Number.isNaN(referenceAt.getTime())) throw new Error('Invalid RETENTION_REFERENCE_AT');
  const execute = process.env.RETENTION_EXECUTE === 'true';
  const pool = new Pool(maintenancePoolConfig());
  try {
    const before = await candidates(pool, referenceAt);
    if (!execute) {
      console.log(JSON.stringify({ event: 'secumie_retention_preview', referenceAt: referenceAt.toISOString(), candidates: before }));
      return;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const otp = await client.query<{ counts: Counts }>('SELECT public_auth.purge_retained_data($1) AS counts', [referenceAt]);
      const pira = await client.query<{ counts: Counts }>('SELECT pira.purge_retained_data($1) AS counts', [referenceAt]);
      await client.query('COMMIT');
      console.log(JSON.stringify({ event: 'secumie_retention_completed', referenceAt: referenceAt.toISOString(), candidates: before, deleted: { otp: otp.rows[0]?.counts ?? {}, pira: pira.rows[0]?.counts ?? {} } }));
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  } finally { await pool.end(); }
}

if (require.main === module) runSecumieRetention().catch(error => {
  console.error(JSON.stringify({ event: 'secumie_retention_failed', error: error instanceof Error ? error.message : 'unknown' }));
  process.exitCode = 1;
});
