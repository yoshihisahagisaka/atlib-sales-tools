import { Pool } from 'pg';
import { check } from './model';
import { required } from './runtimeConfig';
export async function createPiraPool(env:NodeJS.ProcessEnv,role:'pira_core_runtime'|'pira_notifier'='pira_core_runtime'){
  const user=required(env,'PIRA_DB_USER');check(user===role,'PIRA_DEDICATED_ROLE_REQUIRED');
  const max=Number(env.PIRA_DB_POOL_MAX??(role==='pira_notifier'?1:2));check(Number.isInteger(max)&&max>=1&&max<=2,'INVALID_PIRA_POOL');
  // Never falls back to DATABASE_URL or Sales configuration/Secret loaders.
  const host=required(env,'PIRA_DB_HOST');
  const local=env.PIRA_DB_LOCAL_PLAINTEXT==='true';
  check(!local||['127.0.0.1','::1','localhost'].includes(host),'PLAINTEXT_DB_MUST_BE_LOOPBACK');
  const pool=new Pool({host,ssl:host.startsWith('/')||local?undefined:{rejectUnauthorized:true},port:Number(env.PIRA_DB_PORT??5432),database:required(env,'PIRA_DB_NAME'),user,password:required(env,'PIRA_DB_PASSWORD'),max,connectionTimeoutMillis:10000,idleTimeoutMillis:30000});
  pool.on('error',()=>{/* no connection or SQL details logged */});
  try{
    const r=await pool.query("SELECT current_user AS role,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user");const p=r.rows[0];
    check(p?.role===user&&!p.rolsuper&&!p.rolbypassrls&&!p.rolcreatedb&&!p.rolcreaterole,'PIRA_UNSAFE_RUNTIME_ROLE');
    return pool;
  }catch(e){await pool.end();throw e;}
}
