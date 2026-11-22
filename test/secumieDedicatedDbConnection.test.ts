import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { createPool } from '../src/db/pool';
import { AssemblyAdminService } from '../src/secumieWeb/assemblyAdminService';
import { AssemblyIntakeService } from '../src/secumieWeb/assemblyIntakeService';
import { loadSecumieWebAdminDatabaseConfig } from '../src/config';
import { databaseRuntime, secumieWebDatabaseRuntime } from '../src/runtime/runtimeConfig';

const connectionString = process.env.SECUMIE_TEST_POSTGRES_URL;
const integration = connectionString ? test : test.skip;

test('createPool preserves the Sales Tools default and accepts bounded dedicated options', async () => {
  const config = { db: { host:'127.0.0.1', port:1, name:'unused', user:'unused', password:'unused' } };
  const business = createPool(config);
  const dedicated = createPool(config, { max:2, idleTimeoutMillis:1234, connectionTimeoutMillis:5678 });
  try {
    assert.equal(business.options.max, 5);
    assert.equal(business.options.idleTimeoutMillis, 10_000);
    assert.equal(dedicated.options.max, 2);
    assert.equal(dedicated.options.idleTimeoutMillis, 1234);
    assert.equal(dedicated.options.connectionTimeoutMillis, 5678);
    assert.throws(() => createPool(config,{max:0}),/positive integer/);
  } finally {
    await Promise.all([business.end(),dedicated.end()]);
  }
});

test('OTP and PIRA runtime pools default to two and reject a larger budget', async () => {
  const before={...process.env};
  let pool:Pool|undefined;
  try{
    Object.assign(process.env,{DB_NAME:'unused',DB_USER:'unused',DB_PASSWORD:'unused',DB_HOST:'127.0.0.1',DB_PORT:'1'});
    delete process.env.DB_POOL_MAX;
    pool=await databaseRuntime();
    assert.equal(pool.options.max,2);
    await pool.end(); pool=undefined;
    process.env.DB_POOL_MAX='3';
    await assert.rejects(databaseRuntime(),/DB_POOL_MAX/);
  }finally{
    await pool?.end();
    for(const name of Object.keys(process.env))if(!(name in before))delete process.env[name];
    Object.assign(process.env,before);
  }
});

test('dedicated OTP/PIRA runtime rejects missing DB_PASSWORD before the Sales Tools secret fallback', async () => {
  const before={...process.env};
  try {
    Object.assign(process.env,{DB_NAME:'secumie_insight',DB_USER:'secumie_otp_prod',DB_HOST:'127.0.0.1',DB_PORT:'1'});
    delete process.env.DB_PASSWORD;
    await assert.rejects(databaseRuntime(), /Missing required runtime configuration: DB_PASSWORD/);
    process.env.DB_PASSWORD='   ';
    await assert.rejects(databaseRuntime(), /Missing required runtime configuration: DB_PASSWORD/);
  } finally {
    for(const name of Object.keys(process.env))if(!(name in before))delete process.env[name];
    Object.assign(process.env,before);
  }
});

test('Web admin reuses the dedicated pool but never falls back to the business or Insight database', async () => {
  const previous = { ...process.env };
  const vars = [
    'SECUMIE_WEB_DB_NAME', 'SECUMIE_WEB_DB_ADMIN_USER', 'SECUMIE_WEB_DB_ADMIN_PASSWORD',
    'SECUMIE_WEB_DB_HOST', 'SECUMIE_WEB_DB_PORT', 'SECUMIE_WEB_DB_SOCKET_PATH',
  ];
  let webPool: Pool | undefined;
  try {
    for (const name of vars) delete process.env[name];
    assert.equal(loadSecumieWebAdminDatabaseConfig(), null, 'missing config must leave Web API disconnected');

    process.env.SECUMIE_WEB_DB_NAME = 'secumie_web';
    assert.throws(loadSecumieWebAdminDatabaseConfig, /Incomplete.*Web admin/);

    Object.assign(process.env, {
      DB_NAME: 'sales_tools',
      DB_USER: 'sales_runtime',
      SECUMIE_DB_NAME: 'secumie_insight',
      SECUMIE_DB_ADMIN_USER: 'secumie_insight_admin',
      SECUMIE_WEB_DB_NAME: 'secumie_web',
      SECUMIE_WEB_DB_ADMIN_USER: 'secumie_web_admin',
      SECUMIE_WEB_DB_ADMIN_PASSWORD: 'test-only-secret',
      SECUMIE_WEB_DB_SOCKET_PATH: '/cloudsql/synthetic-instance',
    });
    const database = loadSecumieWebAdminDatabaseConfig();
    assert.ok(database);
    assert.equal(database.name, 'secumie_web');
    assert.equal(database.user, 'secumie_web_admin');
    assert.equal(database.socketPath, '/cloudsql/synthetic-instance');
    webPool = createPool({ db: database }, { max: 2 });
    assert.equal(webPool.options.max, 2);
    assert.equal(webPool.options.database, 'secumie_web');
    assert.equal(webPool.options.user, 'secumie_web_admin');
    assert.equal(webPool.totalCount, 0, 'a configured but idle pool must not query a DB');

    process.env.SECUMIE_WEB_DB_NAME = 'secumie_insight';
    assert.throws(loadSecumieWebAdminDatabaseConfig, /must be isolated/);
    process.env.SECUMIE_WEB_DB_NAME = 'sales_tools';
    assert.throws(loadSecumieWebAdminDatabaseConfig, /must be isolated/);
    process.env.SECUMIE_WEB_DB_NAME = 'secumie_web';
    process.env.SECUMIE_WEB_DB_ADMIN_USER = 'secumie_insight_admin';
    assert.throws(loadSecumieWebAdminDatabaseConfig, /must be isolated/);
    delete process.env.SECUMIE_DB_NAME;
    process.env.SECUMIE_WEB_DB_NAME = 'secumie_insight';
    process.env.SECUMIE_WEB_DB_ADMIN_USER = 'secumie_web_admin';
    assert.throws(loadSecumieWebAdminDatabaseConfig, /must be isolated/);
    process.env.SECUMIE_WEB_DB_NAME = 'secumie_web';
    process.env.SECUMIE_WEB_DB_USER = 'secumie_web_runtime';
    process.env.SECUMIE_WEB_DB_ADMIN_USER = 'secumie_web_runtime';
    assert.throws(loadSecumieWebAdminDatabaseConfig, /must be isolated/);
  } finally {
    await webPool?.end();
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});

test('Sales Tools mounts the Web request API only when the separate Web database is configured', () => {
  const server = readFileSync(path.resolve(__dirname, '../src/server.ts'), 'utf8');
  assert.match(server, /const secumieWebPool = webAdminDb/);
  assert.match(server, /new AssemblyAdminService\(secumieWebPool\)/);
  assert.match(server, /if \(assemblyAdminService\) app\.use\('\/api\/admin\/secumie-web\/v1'/);
  assert.doesNotMatch(server, /new AssemblyAdminService\(secumiePool\)/);
});

test('Web public intake uses a Web-only runtime role, never the Insight OTP/PIRA pool', async () => {
  const before = { ...process.env };
  let pool: Pool | undefined;
  try {
    for (const key of ['SECUMIE_WEB_DB_NAME', 'SECUMIE_WEB_DB_USER', 'SECUMIE_WEB_DB_PASSWORD',
      'SECUMIE_WEB_DB_HOST', 'SECUMIE_WEB_DB_PORT', 'SECUMIE_WEB_DB_SOCKET_PATH']) {
      delete process.env[key];
    }
    await assert.rejects(async () => secumieWebDatabaseRuntime(), /SECUMIE_WEB_DB_NAME/);
    Object.assign(process.env, {
      DB_NAME: 'secumie_insight', DB_USER: 'secumie_otp_runtime', DB_PASSWORD: 'synthetic-otp-secret',
      SECUMIE_WEB_DB_NAME: 'secumie_web_staging',
      SECUMIE_WEB_DB_USER: 'secumie_web_runtime',
      SECUMIE_WEB_DB_PASSWORD: 'synthetic-web-secret',
      SECUMIE_WEB_DB_SOCKET_PATH: '/cloudsql/synthetic-web-instance',
    });
    pool = secumieWebDatabaseRuntime();
    assert.equal(pool.options.database, 'secumie_web_staging');
    assert.equal(pool.options.user, 'secumie_web_runtime');
    assert.equal(pool.options.max, 2);
    assert.equal(pool.options.password, 'synthetic-web-secret');
    assert.equal(pool.totalCount, 0, 'pool construction must not access a live database');
    process.env.SECUMIE_WEB_DB_NAME = 'secumie_insight';
    assert.throws(secumieWebDatabaseRuntime, /isolated Web database/);
    process.env.SECUMIE_WEB_DB_NAME = 'secumie_web_staging';
    process.env.SECUMIE_WEB_DB_USER = 'secumie_otp_runtime';
    assert.throws(secumieWebDatabaseRuntime, /isolated Web database/);
    process.env.SECUMIE_WEB_DB_USER = 'secumie_web_runtime';
    process.env.SECUMIE_WEB_DB_PASSWORD = '';
    assert.throws(secumieWebDatabaseRuntime, /SECUMIE_WEB_DB_PASSWORD/);
  } finally {
    await pool?.end();
    for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key];
    Object.assign(process.env, before);
  }
});

integration('Web intake and staff status update work on isolated synthetic PostgreSQL 16 only', { timeout: 30_000 }, async () => {
  const suffix = randomBytes(5).toString('hex');
  const database = 'secumie_web_test_' + suffix;
  const runtimeRole = 'secumie_web_runtime_' + suffix;
  const staffRole = 'secumie_web_staff_' + suffix;
  const admin = new Pool({ connectionString, max: 1 });
  let web: Pool | undefined, runtime: Pool | undefined, staff: Pool | undefined;
  try {
    // A disposable database inside the CI PostgreSQL service. Never connect to Cloud SQL.
    await admin.query('CREATE DATABASE "' + database + '"');
    const url = new URL(connectionString!);
    url.pathname = '/' + database;
    web = new Pool({ connectionString: url.toString(), max: 2 });
    const draftSql = readFileSync(path.resolve(__dirname, '../design/secumie-web/assembly-intake.draft.sql'), 'utf8');
    await web.query(draftSql); // Synthetic rehearsal only; not an approved migration.
    // Rehearse least privilege with ephemeral LOGIN roles, not the postgres owner.
    // These GRANTs are candidates pending the Web canonical / migration approval.
    await admin.query(`CREATE ROLE "${runtimeRole}" LOGIN PASSWORD 'synthetic-runtime-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
    await admin.query(`CREATE ROLE "${staffRole}" LOGIN PASSWORD 'synthetic-staff-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
    await web.query(`REVOKE ALL ON SCHEMA secumie_web FROM PUBLIC;
      GRANT USAGE ON SCHEMA secumie_web TO "${runtimeRole}", "${staffRole}";
      GRANT SELECT ON secumie_web.assembly_union_master TO "${runtimeRole}";
      GRANT SELECT, INSERT ON secumie_web.assembly_intake TO "${runtimeRole}";
      GRANT INSERT ON secumie_web.assembly_consumed_jti,
        secumie_web.assembly_notification_outbox,
        secumie_web.assembly_status_history TO "${runtimeRole}";
      GRANT SELECT, UPDATE(request_status, updated_at) ON secumie_web.assembly_intake TO "${staffRole}";
      GRANT INSERT, SELECT ON secumie_web.assembly_status_history TO "${staffRole}";`);
    const runtimeUrl = new URL(url);
    runtimeUrl.username = runtimeRole;
    runtimeUrl.password = 'synthetic-runtime-only';
    const staffUrl = new URL(url);
    staffUrl.username = staffRole;
    staffUrl.password = 'synthetic-staff-only';
    runtime = new Pool({ connectionString: runtimeUrl.toString(), max: 2 });
    staff = new Pool({ connectionString: staffUrl.toString(), max: 2 });
    await web.query(
      "INSERT INTO secumie_web.assembly_union_master(union_id,official_name,source_version) VALUES('test-union','検証組合','synthetic-v1')"
    );
    const intake = new AssemblyIntakeService(runtime, {
      code: 'synthetic', organizerName: 'synthetic-org', consentVersion: 'synthetic-v1',
    });
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: 'https://synthetic.example', aud: 'secumie-web-assembly',
      sub: 'synthetic-session', jti: 'synthetic-jti', iat: now, exp: now + 300,
      email: 'test@example.jp',
    };
    const request = {
      unionId: 'test-union', companyName: '検証株式会社', registeredAddress: '東京都',
      websiteUrl: 'https://example.jp/', contactName: '合成担当',
      contactPhone: '0000000000', consentVersion: 'synthetic-v1',
      accepted: true as const, idempotencyKey: '00000000-0000-4000-8000-000000000002',
    };
    await assert.rejects(
      intake.create(claims, { ...request, websiteUrl: 'https://user:password@example.jp/' }),
      /INVALID_URL/,
    );
    await assert.rejects(
      intake.create({ ...claims, email: 'not-an-email' }, request),
      /JWT_INVALID/,
    );
    const created = await intake.create(claims, request);
    assert.equal(created.replayed, false);
    assert.match(created.receiptId, /^SMW-[0-9]{8}-[A-F0-9]{8}$/);
    const replay = await intake.create(claims, request);
    assert.deepEqual(replay, { receiptId: created.receiptId, replayed: true });
    await assert.rejects(
      intake.create(claims, { ...request, idempotencyKey: '00000000-0000-4000-8000-000000000003' }),
      /JWT_REPLAYED/,
      'the same one-use JWT must not create another intake under a new idempotency key',
    );
    await assert.rejects(
      intake.create(claims, { ...request, companyName: '別会社' }),
      /IDEMPOTENCY_CONFLICT/,
    );
    const receipt = await staff.query<{ intake_id: string }>(
      'SELECT intake_id FROM secumie_web.assembly_intake WHERE receipt_number=$1',
      [created.receiptId],
    );
    assert.equal(receipt.rows.length, 1);
    const intakeId = receipt.rows[0]!.intake_id;
    const service = new AssemblyAdminService(staff);
    const items = await service.list({ status: 'RECEIVED', companyName: '検証', unionName: '組合', limit: 50, offset: 0 });
    assert.equal(items.length, 1);
    assert.equal(items[0].intakeId, intakeId);
    assert.equal(items[0].companyName, '検証株式会社');
    assert.equal(items[0].status, 'RECEIVED');
    const updated = await service.changeStatus(intakeId, 'IN_PROGRESS', 'synthetic-staff@atlib.jp');
    assert.deepEqual(updated, { status: 'IN_PROGRESS', unchanged: false });
    assert.equal((await service.list({ status: 'IN_PROGRESS' })).length, 1);
    const history = await staff.query(
      'SELECT from_status, to_status, changed_by FROM secumie_web.assembly_status_history WHERE intake_id=$1',
      [intakeId]
    );
    assert.equal(history.rows.length, 2, 'initial intake and staff update are both audited');
    assert.ok(history.rows.some(row => row.from_status === null
      && row.to_status === 'RECEIVED' && row.changed_by === 'system'));
    assert.ok(history.rows.some(row => row.from_status === 'RECEIVED'
      && row.to_status === 'IN_PROGRESS'
      && row.changed_by === 'synthetic-staff@atlib.jp'));
    await assert.rejects(
      runtime.query("UPDATE secumie_web.assembly_intake SET request_status='CANCELLED' WHERE intake_id=$1", [intakeId]),
      /permission denied/, 'public runtime must not change staff-owned status',
    );
    await assert.rejects(
      staff.query("DELETE FROM secumie_web.assembly_intake WHERE intake_id=$1", [intakeId]),
      /permission denied/, 'staff role must not remove received requests',
    );
    assert.equal((await staff.query("SELECT request_status FROM secumie_web.assembly_intake WHERE intake_id=$1", [intakeId])).rows[0].request_status, 'IN_PROGRESS');
  } finally {
    await Promise.allSettled([runtime?.end(), staff?.end(), web?.end()].filter(Boolean) as Promise<void>[]);
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1', [database]);
    await admin.query('DROP DATABASE IF EXISTS "' + database + '"');
    await admin.query('DROP ROLE IF EXISTS "' + runtimeRole + '", "' + staffRole + '"');
    await admin.end();
  }
});

integration('PostgreSQL 16 keeps the business and SECU pools isolated, lazy and bounded', { timeout:30_000 }, async () => {
  const suffix = randomBytes(5).toString('hex');
  const businessDb = `secumie_business_${suffix}`;
  const secumieDb = `secumie_admin_${suffix}`;
  const admin = new Pool({ connectionString, max:1 });
  const parsed = new URL(connectionString!);
  const base = {
    host:parsed.hostname, port:Number(parsed.port || 5432),
    user:decodeURIComponent(parsed.username), password:decodeURIComponent(parsed.password),
  };
  let business:Pool|undefined,secumie:Pool|undefined,bad:Pool|undefined;
  const connections = async (database:string) => Number((await admin.query(
    'SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [database],
  )).rows[0].count);
  try {
    await admin.query(`CREATE DATABASE ${businessDb}`);
    await admin.query(`CREATE DATABASE ${secumieDb}`);
    business=createPool({db:{...base,name:businessDb}},{max:5,idleTimeoutMillis:100});
    secumie=createPool({db:{...base,name:secumieDb}},{max:2,idleTimeoutMillis:100});
    bad=createPool({db:{...base,name:`missing_${suffix}`}},{max:2,idleTimeoutMillis:100,connectionTimeoutMillis:500});

    assert.equal(await connections(secumieDb),0,'pool construction must not open a connection');
    assert.equal((await business.query('SELECT current_database() AS name')).rows[0].name,businessDb);
    assert.equal((await secumie.query('SELECT current_database() AS name')).rows[0].name,secumieDb);

    const slow=Array.from({length:6},()=>secumie!.query('SELECT pg_sleep(0.25)'));
    await new Promise(resolve=>setTimeout(resolve,75));
    assert.ok(await connections(secumieDb)<=2,'SECU pool exceeded max=2');
    await Promise.all(slow);

    await assert.rejects(bad.query('SELECT 1'));
    assert.equal((await business.query('SELECT 1 AS ok')).rows[0].ok,1,'SECU failure affected business pool');

    await new Promise(resolve=>setTimeout(resolve,250));
    assert.equal(await connections(secumieDb),0,'idle SECU connections were not released');
  } finally {
    await Promise.allSettled([business?.end(),secumie?.end(),bad?.end()].filter(Boolean) as Promise<void>[]);
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=ANY($1)',[[businessDb,secumieDb]]);
    await admin.query(`DROP DATABASE IF EXISTS ${businessDb}`);
    await admin.query(`DROP DATABASE IF EXISTS ${secumieDb}`);
    await admin.end();
  }
});
