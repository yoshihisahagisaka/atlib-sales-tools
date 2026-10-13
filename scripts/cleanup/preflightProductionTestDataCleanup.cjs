/* Production-safe read-only gate. It never derives targets from names or timestamps. */
const path = require('node:path');
const { Pool } = require('pg');
const { readManifest, assertPreconditions, fail } = require('./productionTestDataCleanupContract.cjs');

async function run() {
  if (process.env.CLEANUP_PREFLIGHT_READ_ONLY !== 'true') fail('READ_ONLY_ENV');
  for (const key of ['DB_NAME','DB_MIGRATION_USER','DB_MIGRATION_PASSWORD']) if (!process.env[key]) fail(`MISSING_${key}`);
  const manifestPath = path.resolve(process.argv[2] || 'cleanup-manifests/production-test-data-cleanup-20261013.json');
  const { manifest, manifestSha256 } = readManifest(manifestPath);
  const pool = new Pool({host:process.env.DB_SOCKET_PATH||process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||5432),database:process.env.DB_NAME,user:process.env.DB_MIGRATION_USER,password:process.env.DB_MIGRATION_PASSWORD,max:1,connectionTimeoutMillis:10000});
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query('SET TRANSACTION READ ONLY');
    const result = await assertPreconditions(client, manifest, {requireReadOnly:true});
    console.log(JSON.stringify({event:'production_test_data_cleanup_preflight_passed',manifestSha256,database:result.identity.database,serverVersion:result.identity.version,ledgerCount:result.ledgerCount,counts:result.counts}));
    await client.query('ROLLBACK');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally { client.release(); await pool.end(); }
}
if (require.main === module) run().catch(error => { console.error(JSON.stringify({event:'production_test_data_cleanup_preflight_failed',reason:error.message})); process.exitCode=1; });
