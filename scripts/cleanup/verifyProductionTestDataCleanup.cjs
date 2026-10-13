/* Read-only post-cleanup verifier. Baseline totals are supplied from the approved preflight evidence. */
const path=require('node:path');const {Pool}=require('pg');
const {readManifest,verifyLedger,assert,fail}=require('./productionTestDataCleanupContract.cjs');
async function count(client,sql,values=[]){return Number((await client.query(sql,values)).rows[0].count);}
async function verify(client,manifest,baseline={},options={}){
 const identity=(await client.query("SELECT current_database() AS database,current_setting('server_version') AS version,current_setting('transaction_read_only') AS read_only")).rows[0];
 assert((options.syntheticIdentity===true||(identity.database==='sales_tools'&&/^16\./.test(identity.version)))&&identity.read_only==='on','IDENTITY');
 const ledgerCount=await verifyLedger(client),v1=manifest.historical_v1_case_ids,vs1=manifest.vs1_case_ids,initiative=manifest.preserve.marketing_initiative_ids;
 assert(await count(client,'SELECT count(*) FROM diagnosis_cases WHERE id=ANY($1::uuid[])',[v1])===0,'V1_CASE_REMAINS');
 assert(await count(client,'SELECT count(*) FROM it_management_diagnosis_case_v2 WHERE id=ANY($1::uuid[])',[vs1])===0,'VS1_CASE_REMAINS');
 assert(await count(client,'SELECT count(*) FROM company WHERE id=ANY($1::uuid[])',[manifest.related_ids.company_ids])===0,'COMPANY_REMAINS');
 assert(await count(client,'SELECT count(*) FROM contact WHERE id=ANY($1::uuid[])',[manifest.related_ids.contact_ids])===0,'CONTACT_REMAINS');
 assert(await count(client,'SELECT count(*) FROM sales_activity WHERE id=ANY($1::uuid[])',[manifest.related_ids.sales_activity_ids])===0,'SALES_ACTIVITY_REMAINS');
 assert(await count(client,'SELECT count(*) FROM diagnosis_reports WHERE id=ANY($1::uuid[])',[manifest.related_ids.report_ids])===0,'REPORT_REMAINS');
 assert(await count(client,'SELECT count(*) FROM marketing_initiative WHERE initiative_id=ANY($1::uuid[])',[initiative])===1,'INITIATIVE_MISSING');
 const initiativeMatches=await count(client,`SELECT count(*) FROM sales_activity s JOIN marketing_initiative i ON i.initiative_id=ANY($1::uuid[]) AND s.selected_service=i.service_key AND s.utm_source IS NOT DISTINCT FROM i.utm_source AND s.utm_medium IS NOT DISTINCT FROM i.utm_medium AND s.utm_campaign IS NOT DISTINCT FROM i.utm_campaign AND s.utm_content IS NOT DISTINCT FROM i.utm_content AND s.utm_term IS NOT DISTINCT FROM i.utm_term`,[initiative]);
 assert(initiativeMatches===0,'INITIATIVE_KPI_NOT_ZERO');
 const triggerRows=(await client.query("SELECT tgname,tgenabled FROM pg_trigger WHERE NOT tgisinternal AND tgname=ANY($1::text[])",[require('./runProductionTestDataCleanup.cjs').TRIGGERS.map(([,trigger])=>trigger)])).rows;
 assert(triggerRows.length===require('./runProductionTestDataCleanup.cjs').TRIGGERS.length&&triggerRows.every(row=>row.tgenabled==='O'),'TRIGGERS_NOT_ENABLED');
 for(const [label,{sql,expected}] of Object.entries(baseline)){assert(await count(client,sql)===expected,`OUTSIDE_BASELINE:${label}`);}
 return {database:identity.database,serverVersion:identity.version,ledgerCount,initiativeMatches,triggersEnabled:triggerRows.length};
}
async function main(){if(process.env.CLEANUP_VERIFY_READ_ONLY!=='true')fail('READ_ONLY_ENV');for(const key of ['DB_NAME','DB_MIGRATION_USER','DB_MIGRATION_PASSWORD'])if(!process.env[key])fail(`MISSING_${key}`);const {manifest,manifestSha256}=readManifest(path.resolve(process.argv[2]||'cleanup-manifests/production-test-data-cleanup-20261013.json'));const pool=new Pool({host:process.env.DB_SOCKET_PATH||process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||5432),database:process.env.DB_NAME,user:process.env.DB_MIGRATION_USER,password:process.env.DB_MIGRATION_PASSWORD,max:1,connectionTimeoutMillis:10000});const client=await pool.connect();try{await client.query('BEGIN READ ONLY');const result=await verify(client,manifest);console.log(JSON.stringify({event:'production_test_data_cleanup_verify_passed',manifestSha256,...result}));await client.query('ROLLBACK');}catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}finally{client.release();await pool.end();}}
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({event:'production_test_data_cleanup_verify_failed',reason:error.message}));process.exitCode=1;});
module.exports={verify};
