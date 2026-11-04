import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { createPool } from '../src/db/pool';
import { databaseRuntime } from '../src/runtime/runtimeConfig';

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
