import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Pool } from 'pg';
import { bootstrapSecumieInsightProduction } from '../src/db/bootstrapSecumieInsightProductionCli';
import { runSecumieProductionMigration } from '../src/db/runSecumieProductionMigrationCli';
import { validateSecumieProduction } from '../src/db/validateSecumieProductionCli';
import { SECU_PRODUCTION_MIGRATIONS, SECU_PRODUCTION_ROLES, SECU_PRODUCTION_TARGET } from '../src/db/secumieProductionContract';

const port=Number(process.env.SECUMIE_PREP_PG_PORT??'55437');
const bootstrapUser='otp_test';
const originalPassword='otp_test';
const bootstrapPassword='production-bootstrap-local-password-32-min';
const adminConnection={host:'127.0.0.1',port,user:bootstrapUser,password:bootstrapPassword};
const controlConnection={host:'127.0.0.1',port,user:'postgres',password:'postgres'};
const database='secumie_insight';
const passwords={
  secumie_otp_prod:'production-otp-local-password-32-min-01',
  secumie_pira_prod:'production-pira-local-password-32-min-02',
  secumie_admin_prod:'production-admin-local-password-32-min-03',
  secumie_migration_prod:'production-migration-local-password-32-04',
  secumie_maintenance_prod:'production-maintenance-password-32-05',
};

function configureEnvironment(){
  Object.assign(process.env,{
    SECU_PRODUCTION_BOOTSTRAP_TARGET_CONFIRMATION:SECU_PRODUCTION_TARGET,
    SECU_PRODUCTION_MIGRATION_TARGET_CONFIRMATION:SECU_PRODUCTION_TARGET,
    SECU_PRODUCTION_ACCEPTANCE_TARGET_CONFIRMATION:SECU_PRODUCTION_TARGET,
    SECU_CLOUD_SQL_INSTANCE:'msp-zabbix:asia-northeast1:secumie-sg-shared-prod-db',
    DB_BOOTSTRAP_HOST:'127.0.0.1',DB_BOOTSTRAP_PORT:String(port),DB_BOOTSTRAP_USER:bootstrapUser,DB_BOOTSTRAP_PASSWORD:bootstrapPassword,
    DB_HOST:'127.0.0.1',DB_PORT:String(port),DB_NAME:database,
    DB_MIGRATION_USER:'secumie_migration_prod',DB_MIGRATION_PASSWORD:passwords.secumie_migration_prod,
    SECU_OTP_DB_PASSWORD:passwords.secumie_otp_prod,SECU_PIRA_DB_PASSWORD:passwords.secumie_pira_prod,
    SECU_ADMIN_DB_PASSWORD:passwords.secumie_admin_prod,SECU_MIGRATION_DB_PASSWORD:passwords.secumie_migration_prod,
    SECU_MAINTENANCE_DB_PASSWORD:passwords.secumie_maintenance_prod,
    OTP_DB_ROLE:'secumie_otp_prod',PIRA_DB_ROLE:'secumie_pira_prod',PIRA_ADMIN_DB_ROLE:'secumie_admin_prod',SECU_MAINTENANCE_DB_ROLE:'secumie_maintenance_prod',
  });
}
async function targetState(){
  const pool=new Pool({...controlConnection,database:'postgres'});
  try{return {database:Number((await pool.query('SELECT count(*)::int AS count FROM pg_database WHERE datname=$1',[database])).rows[0].count),roles:Number((await pool.query('SELECT count(*)::int AS count FROM pg_roles WHERE rolname=ANY($1::text[])',[SECU_PRODUCTION_ROLES.map(role=>role.name)])).rows[0].count)};}finally{await pool.end();}
}

test.before(async()=>{
  const pool=new Pool({...controlConnection,database:'postgres'});
  await pool.query(`ALTER ROLE ${bootstrapUser} NOSUPERUSER CREATEDB CREATEROLE PASSWORD '${bootstrapPassword}'`);
  await pool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',[database]);
  await pool.query(`DROP DATABASE IF EXISTS ${database}`);
  for(const role of SECU_PRODUCTION_ROLES) await pool.query(`DROP ROLE IF EXISTS ${role.name}`);
  await pool.end();configureEnvironment();
});

test('wrong environment and insufficient capacity stop before DDL',async()=>{
  process.env.SECU_CLOUD_SQL_INSTANCE='msp-zabbix:asia-northeast1:secumie-sg-shared-staging-db';
  await assert.rejects(bootstrapSecumieInsightProduction(),/INSTANCE_MISMATCH/);
  assert.deepEqual(await targetState(),{database:0,roles:0});
  process.env.SECU_CLOUD_SQL_INSTANCE='msp-zabbix:asia-northeast1:secumie-sg-shared-prod-db';
  process.env.SECU_PRODUCTION_BOOTSTRAP_TARGET_CONFIRMATION='msp-zabbix:asia-northeast1:secumie-sg-shared-staging-db/secumie_insight_staging';
  await assert.rejects(bootstrapSecumieInsightProduction(),/TARGET_CONFIRMATION_MISMATCH/);
  assert.deepEqual(await targetState(),{database:0,roles:0});
  process.env.SECU_PRODUCTION_BOOTSTRAP_TARGET_CONFIRMATION=SECU_PRODUCTION_TARGET;
  await assert.rejects(bootstrapSecumieInsightProduction(input=>({...input,reserve:input.maxConnections,applicationAvailable:0,required:78,pass:false})),/CAPACITY_INSUFFICIENT/);
  assert.deepEqual(await targetState(),{database:0,roles:0});
});

test('production bootstrap, migrations, acceptance and duplicate guards pass',async()=>{
  const logs:string[]=[];const originalLog=console.log;console.log=(...values:unknown[])=>logs.push(values.join(' '));
  try{
    await bootstrapSecumieInsightProduction();
    await assert.rejects(bootstrapSecumieInsightProduction(),/TARGET_ALREADY_EXISTS/);
    const control=new Pool({...controlConnection,database:'postgres'});
    try { for(const role of SECU_PRODUCTION_ROLES) await control.query(`REVOKE ${role.name} FROM ${bootstrapUser}`); } finally { await control.end(); }
    const root=path.resolve(__dirname,'..');const migrations=mkdtempSync(path.join(os.tmpdir(),'secumie-production-lifecycle-'));
    for(const filename of SECU_PRODUCTION_MIGRATIONS) copyFileSync(path.join(root,'migrations',filename),path.join(migrations,filename));
    Object.assign(process.env,{MIGRATIONS_DIR:migrations,MIGRATION_MANIFEST:path.join(root,'migration-manifests','secumie-insight-production-037-041.json'),MIGRATION_VERIFIER:path.join(root,'scripts','readiness','verifySecumieMigrationManifest.cjs')});
    delete process.env.CLOUD_SQL_PROXY_ADMIN_URL;
    await runSecumieProductionMigration();
    await assert.rejects(runSecumieProductionMigration(),/LEDGER_ALREADY_EXISTS/);
    const bootstrap=new Pool({...adminConnection,database});
    try {
      const schemaAccess=await bootstrap.query<{has_usage:boolean}>("SELECT has_schema_privilege(current_user,'public_auth','USAGE') AS has_usage");
      assert.equal(schemaAccess.rows[0]?.has_usage,false);
      await assert.rejects(bootstrap.query("SELECT count(*) FROM public_auth.otp_send_locks WHERE email_protected='synthetic-production@example.invalid'"),error=>(error as {code?:string}).code==='42501');
      await assert.rejects(bootstrap.query("SELECT count(*) FROM pira.pira_export_audit WHERE actor_subject='synthetic-production-acceptance'"),error=>(error as {code?:string}).code==='42501');
    }finally{await bootstrap.end();}
    await validateSecumieProduction();
    const otp=new Pool({...adminConnection,database,user:'secumie_otp_prod',password:passwords.secumie_otp_prod});
    const admin=new Pool({...adminConnection,database,user:'secumie_admin_prod',password:passwords.secumie_admin_prod});
    try{
      assert.equal(Number((await otp.query("SELECT count(*) AS count FROM public_auth.otp_send_locks WHERE email_protected='synthetic-production@example.invalid'")).rows[0].count),0);
      assert.equal(Number((await admin.query("SELECT count(*) AS count FROM pira.pira_export_audit WHERE actor_subject='synthetic-production-acceptance'")).rows[0].count),0);
    }finally{await Promise.all([otp.end(),admin.end()]);}
  }finally{console.log=originalLog;}
  assert.ok(logs.some(line=>line.includes('secumie_production_bootstrap_completed')));
  assert.ok(logs.some(line=>line.includes('secumie_production_migration_completed')));
  assert.ok(logs.some(line=>line.includes('secumie_production_acceptance_completed')));
  for(const password of Object.values(passwords)) assert.ok(logs.every(line=>!line.includes(password)));
  assert.ok(logs.every(line=>!line.includes(bootstrapPassword)));
});

test.after(async()=>{
  const pool=new Pool({...controlConnection,database:'postgres'});
  await pool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',[database]);
  await pool.query(`DROP DATABASE IF EXISTS ${database}`);
  for(const role of SECU_PRODUCTION_ROLES) await pool.query(`DROP ROLE IF EXISTS ${role.name}`);
  await pool.query(`ALTER ROLE ${bootstrapUser} SUPERUSER CREATEDB CREATEROLE PASSWORD '${originalPassword}'`);
  await pool.end();
});
