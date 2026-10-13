/* Read-only post-apply verifier for Marketing Initiative migration 034. */
const { Pool } = require('pg');

const fail = message => { throw Error(`MARKETING_INITIATIVE_RELEASE_VERIFY_FAILED:${message}`); };
const assert = (value, label) => { if (!value) fail(label); };
const expected = [
  '027_free_diagnosis_rule_based_v1.sql', '028_free_diagnosis_current_design_v1_phase1_draft.sql',
  '029_vs1_report_feedback_shared_artifacts.sql', '030_sales_activity_marketing_attribution.sql',
  '031_public_customer_self_submission.sql', '032_sales_activity_referral_person_name.sql',
  '033_free_diagnosis_design_v2_persistence.sql', '034_marketing_initiative_v1.sql',
];

function verifyRuntimeRolePrivileges(roleNames, privilegeRows) {
  const roles = new Set(roleNames);
  assert(roles.has('sales_tools_app'), 'RUNTIME_ROLE:sales_tools_app');
  const requiredRoles = ['sales_tools_app'];
  if (roles.has('sales_tools_runtime')) requiredRoles.push('sales_tools_runtime');
  const privileges = new Map(privilegeRows.map(row => [row.role_name, row]));
  for (const role of requiredRoles) {
    const row = privileges.get(role);
    assert(row?.can_select && row?.can_insert && row?.can_update, `RUNTIME_PRIVILEGES:${role}`);
  }
  return { applicationRole: 'sales_tools_app', optionalRuntimeRolePresent: roles.has('sales_tools_runtime') };
}

async function collect(client) {
  const rows = (sql, values = []) => client.query(sql, values).then(result => result.rows);
  const id = (await rows("SELECT current_database() AS database,current_setting('server_version') AS version,current_setting('transaction_read_only') AS read_only"))[0];
  assert(id.database === 'sales_tools' && /^16\./.test(id.version) && id.read_only === 'on', 'IDENTITY');
  const ledger = await rows('SELECT filename,count(*)::int AS count FROM schema_migrations GROUP BY filename');
  const counts = new Map(ledger.map(row => [row.filename, Number(row.count)]));
  for (const filename of expected) assert(counts.get(filename) === 1, `LEDGER:${filename}`);
  assert(!ledger.some(row => { const match = /^(\d+)_/.exec(row.filename); return match && Number(match[1]) > 34; }), 'UNEXPECTED_MIGRATION');
  const table = (await rows("SELECT c.relname,pg_get_userbyid(c.relowner) AS owner FROM pg_class c WHERE c.oid='marketing_initiative'::regclass"))[0];
  assert(table?.owner === 'sales_tools_migration', 'TABLE_OWNER');
  const columns = await rows("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='marketing_initiative'");
  for (const name of ['initiative_id', 'initiative_name', 'service_key', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'is_active', 'created_by', 'updated_by', 'created_at', 'updated_at']) assert(columns.some(row => row.column_name === name), `COLUMN:${name}`);
  const constraints = await rows("SELECT conname,contype FROM pg_constraint WHERE conrelid='marketing_initiative'::regclass");
  for (const name of ['marketing_initiative_pkey', 'marketing_initiative_has_utm', 'marketing_initiative_utm_values', 'marketing_initiative_service_utm_unique']) assert(constraints.some(row => row.conname === name), `CONSTRAINT:${name}`);
  const unique = (await rows("SELECT indisunique,indnullsnotdistinct FROM pg_index WHERE indexrelid='marketing_initiative_service_utm_unique'::regclass"))[0];
  assert(unique?.indisunique && unique?.indnullsnotdistinct, 'NULLS_NOT_DISTINCT');
  const roleRows = await rows("SELECT rolname FROM pg_roles WHERE rolname=ANY($1::text[])", [['sales_tools_app', 'sales_tools_runtime']]);
  const roleNames = roleRows.map(row => row.rolname);
  const privilegeRows = await rows("SELECT role_name,has_table_privilege(role_name,'marketing_initiative','SELECT') AS can_select,has_table_privilege(role_name,'marketing_initiative','INSERT') AS can_insert,has_table_privilege(role_name,'marketing_initiative','UPDATE') AS can_update FROM unnest($1::text[]) role_name", [roleNames]);
  const runtimeRoles = verifyRuntimeRolePrivileges(roleNames, privilegeRows);
  const activity = (await rows('SELECT count(*)::bigint AS count FROM sales_activity'))[0];
  return { database: id.database, serverVersion: id.version, table: 'marketing_initiative', salesActivityCount: String(activity.count), runtimePrivileges: true, ...runtimeRoles, nullsNotDistinct: true };
}

async function run() {
  if (process.env.VERIFY_READ_ONLY !== 'true') fail('VERIFY_READ_ONLY_ENV');
  for (const key of ['DB_NAME', 'DB_MIGRATION_USER', 'DB_MIGRATION_PASSWORD']) if (!process.env[key]) fail(`MISSING_${key}`);
  const pool = new Pool({ host: process.env.DB_SOCKET_PATH || process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT ?? 5432), database: process.env.DB_NAME, user: process.env.DB_MIGRATION_USER, password: process.env.DB_MIGRATION_PASSWORD, max: 1, connectionTimeoutMillis: 10000 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    console.log(JSON.stringify({ event: 'marketing_initiative_release_verify_passed', ...await collect(client) }));
    await client.query('ROLLBACK');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally { client.release(); await pool.end(); }
}

if (require.main === module) run().catch(error => { console.error(JSON.stringify({ event: 'marketing_initiative_release_verify_failed', reason: error.message })); process.exitCode = 1; });
module.exports = { expected, verifyRuntimeRolePrivileges, collect };
