/* Read-only post-apply verifier for 033. It never writes or re-runs migrations. */
const {Pool}=require('pg');
const fail=(message)=>{throw Error(`DESIGN_V2_RELEASE_VERIFY_FAILED:${message}`)};
const expected=['027_free_diagnosis_rule_based_v1.sql','028_free_diagnosis_current_design_v1_phase1_draft.sql','029_vs1_report_feedback_shared_artifacts.sql','030_sales_activity_marketing_attribution.sql','031_public_customer_self_submission.sql','032_sales_activity_referral_person_name.sql','033_free_diagnosis_design_v2_persistence.sql'];
const tables=['it_management_diagnosis_original_survey_snapshot_v2','it_management_diagnosis_current_state_revision_v2','it_management_diagnosis_analysis_result_v2','it_management_diagnosis_generated_narrative_v2','it_management_diagnosis_human_edited_narrative_v2'];
const triggers=['original_survey_snapshot_v2_immutable','current_state_revision_v2_immutable','analysis_result_v2_immutable','generated_narrative_v2_immutable','human_edited_narrative_v2_immutable'];
const assert=(value,label)=>{if(!value)fail(label);};
async function run(){
 if(process.env.VERIFY_READ_ONLY!=='true')fail('VERIFY_READ_ONLY_ENV');for(const key of ['DB_NAME','DB_MIGRATION_USER','DB_MIGRATION_PASSWORD'])if(!process.env[key])fail(`MISSING_${key}`);
 const pool=new Pool({host:process.env.DB_SOCKET_PATH||process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT??5432),database:process.env.DB_NAME,user:process.env.DB_MIGRATION_USER,password:process.env.DB_MIGRATION_PASSWORD,max:1,connectionTimeoutMillis:10000});const client=await pool.connect();
 try{await client.query('BEGIN READ ONLY');const rows=(sql,values=[])=>client.query(sql,values).then(result=>result.rows);const id=(await rows("SELECT current_database() AS database,current_setting('server_version') AS version,current_setting('transaction_read_only') AS read_only"))[0];assert(id.database==='sales_tools'&&/^16\./.test(id.version)&&id.read_only==='on','IDENTITY');
  const ledger=await rows('SELECT filename,count(*)::int AS count FROM schema_migrations GROUP BY filename');const counts=new Map(ledger.map(row=>[row.filename,Number(row.count)]));for(const filename of expected)assert(counts.get(filename)===1,`LEDGER:${filename}`);assert(!ledger.some(row=>{const m=/^(\d+)_/.exec(row.filename);return m&&Number(m[1])>33;}),'UNEXPECTED_MIGRATION');
  const actualTables=await rows("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1::text[])",[tables]);assert(actualTables.length===tables.length,'TABLES');const actualTriggers=await rows("SELECT tgname FROM pg_trigger WHERE tgrelid=ANY($1::regclass[]) AND NOT tgisinternal",[tables]);for(const trigger of triggers)assert(actualTriggers.some(row=>row.tgname===trigger),`APPEND_ONLY_TRIGGER:${trigger}`);
  const privileges=await rows("SELECT c.relname AS table_name,has_table_privilege('sales_tools_app',c.oid,'SELECT,INSERT') AS app_read_insert FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY($1::text[])",[tables]);assert(privileges.length===tables.length&&privileges.every(row=>row.app_read_insert),'RUNTIME_PRIVILEGES');
  console.log(JSON.stringify({event:'design_v2_release_verify_passed',tables:actualTables.map(row=>row.table_name).sort(),runtimePrivileges:privileges.map(row=>row.table_name).sort()}));await client.query('ROLLBACK');
 }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}finally{client.release();await pool.end();}
}
if(require.main===module)run().catch(error=>{console.error(JSON.stringify({event:'design_v2_release_verify_failed',reason:error.message}));process.exitCode=1;});
module.exports={expected,tables,triggers};
