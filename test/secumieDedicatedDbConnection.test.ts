import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { createPool } from '../src/db/pool';
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
