'use strict';
// Read-only, explicit target only. Never reads .env or a general DATABASE_URL.
const fs=require('node:fs'),crypto=require('node:crypto');
async function main(){
 const target=process.env.PIRA_READONLY_DB_URL,expected=process.env.PIRA_EXPECTED_DATABASE;
 if(!target||!expected){console.log(JSON.stringify({status:'SKIP',reason:'explicit read-only DB target not configured'}));process.exitCode=3;return;}
 const {Client}=require('pg');const client=new Client({connectionString:target,connectionTimeoutMillis:5000,application_name:'pira-phase1-readonly-preflight'});
 try{await client.connect();await client.query('BEGIN READ ONLY');await client.query("SET LOCAL statement_timeout='15s'");
  const identity=(await client.query('SELECT current_database() AS database,current_user AS role,current_setting(\'transaction_read_only\') AS read_only')).rows[0];
  if(identity.database!==expected||identity.read_only!=='on')throw Error('TARGET_OR_READONLY_MISMATCH');
  const tables=(await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name IN ('company','contact','estimates','schema_migrations') OR table_name LIKE 'pira_%') ORDER BY table_name")).rows;
  const result={status:'READ_ONLY',identity,tables};
  if(tables.some(t=>t.table_name==='schema_migrations'))result.ledger=(await client.query('SELECT filename,applied_at FROM schema_migrations ORDER BY filename')).rows;
  if(tables.some(t=>t.table_name==='company'))result.companyCounts=(await client.query("SELECT count(*)::int AS total, count(*) FILTER(WHERE corporate_number IS NULL OR trim(corporate_number)='')::int AS missing_number FROM company")).rows[0];
  if(tables.some(t=>t.table_name==='company'))result.duplicateNumberGroups=(await client.query("SELECT count(*)::int AS groups FROM (SELECT regexp_replace(corporate_number,'[^0-9]','','g') AS normalized FROM company WHERE corporate_number IS NOT NULL GROUP BY normalized HAVING length(regexp_replace(corporate_number,'[^0-9]','','g'))=13 AND count(*)>1) d")).rows[0];
  result.columns=(await client.query("SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND (table_name IN ('company','contact','estimates','schema_migrations') OR table_name LIKE 'pira_%') ORDER BY table_name,ordinal_position")).rows;
  result.constraints=(await client.query("SELECT c.relname AS table_name,con.conname,pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND (c.relname IN ('company','contact','estimates') OR c.relname LIKE 'pira_%') ORDER BY c.relname,con.conname")).rows;
  result.acl=(await client.query("SELECT table_name,grantee,privilege_type FROM information_schema.table_privileges WHERE table_schema='public' AND (table_name IN ('company','contact','estimates') OR table_name LIKE 'pira_%') ORDER BY table_name,grantee,privilege_type")).rows;
  result.draftSha256=crypto.createHash('sha256').update(fs.readFileSync(require.resolve('../../docs/pira-phase1-schema.draft.sql'))).digest('hex');
  await client.query('ROLLBACK');console.log(JSON.stringify(result,null,2));
 }catch{try{await client.query('ROLLBACK');}catch{}console.error(JSON.stringify({status:'FAILED',reason:'PREFLIGHT_FAILED_NO_SECRETS_LOGGED'}));process.exitCode=1;}finally{await client.end();}
}
main().catch(()=>{console.error(JSON.stringify({status:'FAILED',reason:'PREFLIGHT_START_FAILED'}));process.exitCode=1;});
