import { Pool, type PoolConfig } from 'pg';
import { shutdownCloudSqlProxy } from './cloudSqlProxyShutdown';
import {
  evaluateProductionConnectionCapacity,
  assertProductionInstance,
  SECU_PRODUCTION_DATABASE,
  SECU_PRODUCTION_MIGRATIONS,
  SECU_PRODUCTION_ROLES,
  SECU_PRODUCTION_TARGET,
} from './secumieProductionContract';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`SECU_PRODUCTION_ACCEPTANCE_CONFIG_MISSING: ${name}`);
  return value;
}
function config(user: string, password: string): PoolConfig {
  return { host: required('DB_BOOTSTRAP_HOST'), port: Number(process.env.DB_BOOTSTRAP_PORT ?? 5432), database: SECU_PRODUCTION_DATABASE, user, password, max: 1, connectionTimeoutMillis: 10_000, application_name: `secumie-production-acceptance-${user}` };
}
async function denied(promise: Promise<unknown>): Promise<void> {
  try { await promise; } catch (error) { if ((error as { code?: string }).code === '42501') return; throw error; }
  throw new Error('SECU_PRODUCTION_ACCEPTANCE_EXPECTED_DENIAL_MISSING');
}

export async function validateSecumieProduction(): Promise<void> {
  assertProductionInstance(process.env.SECU_CLOUD_SQL_INSTANCE);
  if (required('SECU_PRODUCTION_ACCEPTANCE_TARGET_CONFIRMATION') !== SECU_PRODUCTION_TARGET) {
    throw new Error('SECU_PRODUCTION_ACCEPTANCE_TARGET_CONFIRMATION_MISMATCH');
  }
  const bootstrapUser = required('DB_BOOTSTRAP_USER');
  const bootstrap = new Pool(config(bootstrapUser, required('DB_BOOTSTRAP_PASSWORD')));
  try {
    const identity = (await bootstrap.query<{ database: string; version: string; owner: string; max_connections: string; superuser_reserved: string; reserved: string; observed: string }>(`SELECT current_database() AS database,current_setting('server_version') AS version,pg_get_userbyid(d.datdba) AS owner,
      current_setting('max_connections') AS max_connections,current_setting('superuser_reserved_connections') AS superuser_reserved,
      COALESCE(NULLIF(current_setting('reserved_connections',true),''),'0') AS reserved,
      (SELECT count(*)::text FROM pg_stat_activity) AS observed FROM pg_database d WHERE d.datname=current_database()`)).rows[0];
    if (!identity || identity.database !== SECU_PRODUCTION_DATABASE || !identity.version.startsWith('16.') || identity.owner !== bootstrapUser) {
      throw new Error('SECU_PRODUCTION_ACCEPTANCE_DATABASE_IDENTITY_MISMATCH');
    }
    const capacity = evaluateProductionConnectionCapacity({ maxConnections:Number(identity.max_connections),superuserReserved:Number(identity.superuser_reserved),reserved:Number(identity.reserved),observedConnections:Number(identity.observed) });
    if (!capacity.pass) throw new Error('SECU_PRODUCTION_ACCEPTANCE_CAPACITY_INSUFFICIENT');
    const roleState = await bootstrap.query<{ rolname:string;rolcanlogin:boolean;rolconnlimit:number;rolsuper:boolean;rolcreatedb:boolean;rolcreaterole:boolean;rolinherit:boolean;rolreplication:boolean;rolbypassrls:boolean }>(`SELECT rolname,rolcanlogin,rolconnlimit,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname`,[SECU_PRODUCTION_ROLES.map(role=>role.name)]);
    for (const expected of SECU_PRODUCTION_ROLES) {
      const role=roleState.rows.find(row=>row.rolname===expected.name);
      if (!role || !role.rolcanlogin || role.rolconnlimit!==expected.connectionLimit || role.rolsuper || role.rolcreatedb || role.rolcreaterole || role.rolinherit || role.rolreplication || role.rolbypassrls) throw new Error('SECU_PRODUCTION_ACCEPTANCE_ROLE_ATTRIBUTE_MISMATCH');
    }
    const membership=await bootstrap.query(`SELECT 1 FROM pg_auth_members am JOIN pg_roles granted ON granted.oid=am.roleid JOIN pg_roles member_role ON member_role.oid=am.member WHERE granted.rolname=ANY($1::text[]) OR member_role.rolname=ANY($1::text[])`,[SECU_PRODUCTION_ROLES.map(role=>role.name)]);
    if (membership.rowCount) throw new Error('SECU_PRODUCTION_ACCEPTANCE_UNEXPECTED_MEMBERSHIP');
    const owners=await bootstrap.query<{kind:string;object_count:string;correct_owner_count:string}>(`SELECT 'schema' AS kind,count(*)::text AS object_count,count(*) FILTER (WHERE pg_get_userbyid(nspowner)='secumie_migration_prod')::text AS correct_owner_count FROM pg_namespace WHERE nspname IN ('public_auth','pira','secumie_deployment')
      UNION ALL SELECT 'table',count(*)::text,count(*) FILTER (WHERE tableowner='secumie_migration_prod')::text FROM pg_tables WHERE schemaname IN ('public_auth','pira')
      UNION ALL SELECT 'function',count(*)::text,count(*) FILTER (WHERE pg_get_userbyid(proowner)='secumie_migration_prod')::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public_auth','pira','secumie_deployment')`);
    if (owners.rows.some(row=>Number(row.object_count)===0 || row.object_count!==row.correct_owner_count)) throw new Error('SECU_PRODUCTION_ACCEPTANCE_OWNER_MISMATCH');

    const otp=new Pool(config('secumie_otp_prod',required('SECU_OTP_DB_PASSWORD')));
    try { const client=await otp.connect(); try { await client.query('BEGIN'); await client.query("INSERT INTO public_auth.otp_send_locks(service_id,email_protected) VALUES('acceptance','synthetic-production@example.invalid')"); } finally { await client.query('ROLLBACK'); client.release(); } await denied(otp.query('SELECT * FROM pira.pira_submission')); await denied(otp.query('CREATE TABLE public.acceptance_forbidden(id integer)')); } finally { await otp.end(); }
    const pira=new Pool(config('secumie_pira_prod',required('SECU_PIRA_DB_PASSWORD')));
    try { await pira.query('SELECT count(*) FROM pira.pira_initiative'); await denied(pira.query('SELECT * FROM public_auth.otp_challenges')); } finally { await pira.end(); }
    const admin=new Pool(config('secumie_admin_prod',required('SECU_ADMIN_DB_PASSWORD')));
    try { const client=await admin.connect(); try { await client.query('BEGIN'); await client.query("INSERT INTO pira.pira_export_audit(actor_subject,filter_snapshot,format,result_count,success,initiative_ids) VALUES('synthetic-production-acceptance','{}','CSV',0,true,'[]')"); } finally { await client.query('ROLLBACK'); client.release(); } await denied(admin.query('UPDATE pira.pira_export_audit SET success=false')); await denied(admin.query('DELETE FROM pira.pira_export_audit')); } finally { await admin.end(); }
    const maintenance=new Pool(config('secumie_maintenance_prod',required('SECU_MAINTENANCE_DB_PASSWORD')));
    let retention: {otp:unknown;pira:unknown};
    try { retention={otp:(await maintenance.query('SELECT public_auth.retention_candidates() AS value')).rows[0]?.value??{},pira:(await maintenance.query('SELECT pira.retention_candidates() AS value')).rows[0]?.value??{}}; await denied(maintenance.query('DELETE FROM pira.pira_export_audit')); } finally { await maintenance.end(); }
    const migration=new Pool(config('secumie_migration_prod',required('SECU_MIGRATION_DB_PASSWORD')));
    let ledger:string[]=[]; try { ledger=(await migration.query<{filename:string}>('SELECT filename FROM schema_migrations ORDER BY filename')).rows.map(row=>row.filename); if(JSON.stringify(ledger)!==JSON.stringify(SECU_PRODUCTION_MIGRATIONS)) throw new Error('SECU_PRODUCTION_ACCEPTANCE_LEDGER_MISMATCH'); } finally { await migration.end(); }
    const residues=await bootstrap.query(`SELECT
      (SELECT count(*)::int FROM public_auth.otp_send_locks WHERE email_protected='synthetic-production@example.invalid') AS otp,
      (SELECT count(*)::int FROM pira.pira_export_audit WHERE actor_subject='synthetic-production-acceptance') AS audit`);
    if (residues.rows[0]?.otp!==0 || residues.rows[0]?.audit!==0) throw new Error('SECU_PRODUCTION_ACCEPTANCE_SYNTHETIC_RESIDUE');
    console.log(JSON.stringify({event:'secumie_production_acceptance_completed',database:SECU_PRODUCTION_DATABASE,owner:identity.owner,migrations:ledger,capacity,objects:owners.rows,retentionPreview:retention,syntheticResidue:0}));
  } finally { await bootstrap.end(); }
}

if (require.main===module) validateSecumieProduction()
  .then(async()=>shutdownCloudSqlProxy())
  .catch(async(error:unknown)=>{const code=error instanceof Error&&/^SECU_[A-Z0-9_]+/.test(error.message)?error.message.split(':',1)[0]:'SECU_PRODUCTION_ACCEPTANCE_FAILED';console.error(JSON.stringify({event:'secumie_production_acceptance_failed',code}));try{await shutdownCloudSqlProxy();}catch{console.error(JSON.stringify({event:'secumie_proxy_shutdown_failed'}));}process.exitCode=1;});
