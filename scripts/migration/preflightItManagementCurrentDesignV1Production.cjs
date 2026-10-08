/* Read-only Production gate for the dedicated 028-032 package. It never runs migrations. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Pool}=require('pg');
const {readManifest}=require('./buildItManagementCurrentDesignReleaseArtifact.cjs');
const fail=(message)=>{throw Error(`IT_MANAGEMENT_RELEASE_PREFLIGHT_FAILED:${message}`)};
const args=Object.fromEntries(process.argv.slice(2).flatMap((value,index,all)=>value.startsWith('--')&&all[index+1]?[ [value.slice(2),all[index+1]] ]:[]));
const sha256=(value)=>crypto.createHash('sha256').update(value).digest('hex');
const alteredTables=['diagnosis_insights','insight_sources','hearing_intake_response_v2','hearing_statement_v2','rule_analysis_execution','human_reviews','diagnosis_reports','management_feedback_decisions','it_management_diagnosis_case_v2','sales_activity'];
const requiredTables=['company','contact',...alteredTables];
const requiredConstraints=['insight_sources_source_ref_type_check','it_management_diagnosis_case_v2_status_check'];

function verifyArtifact(root,manifestPath,artifactPath){
 const manifest=readManifest(root,manifestPath),artifactManifest=path.join(artifactPath,'manifest.json'),migrationDir=path.join(artifactPath,'migrations');
 if(!fs.existsSync(artifactManifest)||!fs.existsSync(migrationDir)) fail('ARTIFACT_LAYOUT');
 if(sha256(fs.readFileSync(artifactManifest))!==sha256(fs.readFileSync(manifestPath))) fail('ARTIFACT_MANIFEST_BYTES');
 const names=fs.readdirSync(migrationDir).filter(name=>name.endsWith('.sql')).sort();
 if(names.join('\n')!==manifest.migrations.map(entry=>entry.filename).sort().join('\n')) fail('ARTIFACT_ALLOWLIST');
 for(const entry of manifest.migrations){const bytes=fs.readFileSync(path.join(migrationDir,entry.filename));if(bytes.includes(13)||bytes.length!==entry.byte_count||sha256(bytes)!==entry.sha256)fail(`ARTIFACT_SQL_BYTES:${entry.filename}`)}
 return manifest;
}
function assert(condition,label){if(!condition)fail(label)}
async function collect(client,manifest){
 const scalar=async(sql,values=[])=>{const result=await client.query(sql,values);return result.rows;};
 const identity=(await scalar("SELECT current_database() AS database, current_user AS current_user, current_schema() AS current_schema, current_setting('server_version') AS server_version, current_setting('transaction_read_only') AS transaction_read_only"))[0];
 assert(identity.database===manifest.database,'DATABASE');assert(/^16\./.test(identity.server_version),'POSTGRESQL_16');assert(identity.transaction_read_only==='on','READ_ONLY_TRANSACTION');
 const ledgerRows=await scalar('SELECT filename,count(*)::int AS count FROM schema_migrations GROUP BY filename ORDER BY filename');
 const counts=new Map(ledgerRows.map(row=>[row.filename,Number(row.count)]));
 for(const filename of manifest.baseline.required_applied_once)assert(counts.get(filename)===1,`LEDGER_REQUIRED_ONCE:${filename}`);
 for(const filename of manifest.baseline.required_unapplied)assert(!counts.has(filename),`LEDGER_ALREADY_APPLIED:${filename}`);
 const unexpected=ledgerRows.filter(row=>{const match=/^(\d+)_/.exec(row.filename);return match&&Number(match[1])>manifest.baseline.reject_migration_number_greater_than;});
 assert(unexpected.length===0,'LEDGER_UNEXPECTED_POST_BASELINE');
 const tables=await scalar("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[])",[requiredTables]);
 assert(tables.length===requiredTables.length,'BASELINE_TABLES');
 const constraints=await scalar("SELECT conname FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname = ANY($1::text[])",[requiredConstraints]);
 assert(constraints.length===requiredConstraints.length,'BASELINE_CONSTRAINTS');
 const owners=await scalar("SELECT c.relname AS table_name,pg_get_userbyid(c.relowner) AS owner FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' AND c.relname = ANY($1::text[]) ORDER BY c.relname",[alteredTables]);
 assert(owners.length===alteredTables.length&&owners.every(row=>row.owner==='sales_tools_migration'),'MIGRATION_ROLE_OWNERSHIP');
 const baseline=(await scalar('SELECT count(*)::bigint AS sales_activity_count FROM sales_activity'))[0];
 return {database:identity.database,currentUser:identity.current_user,currentSchema:identity.current_schema,serverVersion:identity.server_version,ledgerCount:ledgerRows.length,salesActivityCount:String(baseline.sales_activity_count),ownedAlterTables:owners.map(row=>row.table_name)};
}
async function run(){
 if(process.env.PREFLIGHT_READ_ONLY!=='true') fail('PREFLIGHT_READ_ONLY_ENV');
 const root=path.resolve(args.root??'.'),manifestPath=path.resolve(root,args.manifest??'migration-allowlists/production-it-management-current-design-v1-028-032.json');
 const artifactPath=path.resolve(args.artifact??'');if(!args.artifact)fail('ARTIFACT_REQUIRED');const manifest=verifyArtifact(root,manifestPath,artifactPath);
 for(const key of ['DB_NAME','DB_USER','DB_PASSWORD'])if(!process.env[key])fail(`MISSING_${key}`);
 const pool=new Pool({host:process.env.DB_SOCKET_PATH||process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT??5432),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,max:1,connectionTimeoutMillis:10000});
 const client=await pool.connect();
 try{await client.query('BEGIN READ ONLY');await client.query('SET TRANSACTION READ ONLY');const result=await collect(client,manifest);await client.query('ROLLBACK');console.log(JSON.stringify({event:'it_management_release_preflight_passed',...result}));}
 catch(error){try{await client.query('ROLLBACK')}catch{};throw error;}
 finally{client.release();await pool.end();}
}
if(require.main===module)run().catch(error=>{console.error(JSON.stringify({event:'it_management_release_preflight_failed',reason:error.message}));process.exitCode=1;});
module.exports={verifyArtifact,collect,alteredTables,requiredTables,requiredConstraints};
