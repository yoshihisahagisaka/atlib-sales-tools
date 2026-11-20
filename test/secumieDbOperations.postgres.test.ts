import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { Pool } from 'pg';
import { configureSecumieDbRoles } from '../src/db/configureSecumieDbRolesCli';
import { runSecumieRetention } from '../src/db/secumieRetentionCli';
import { PostgresOtpReservationRepo } from '../src/publicAuth/postgresOtpReservationRepo';
import { PiraIntakeService } from '../src/piraIntake/piraIntakeService';
import { PiraAdminRepo } from '../src/piraAdmin/piraAdminRepo';

const root = path.resolve(__dirname, '..');
const port = 55437;
const ownerConfig = { host: '127.0.0.1', port, user: 'otp_test', password: 'otp_test' };
const database = 'secumie_dbops_test';
const roles = { otp: 'secumie_test_otp', pira: 'secumie_test_pira', admin: 'secumie_test_admin', maintenance: 'secumie_test_maintenance' };
const passwords = { otp: 'otp-test-password', pira: 'pira-test-password', admin: 'admin-test-password', maintenance: 'maintenance-test-password' };
let owner: Pool;
let otp: Pool; let pira: Pool; let admin: Pool; let maintenance: Pool;
const referenceAt = new Date('2026-11-02T00:00:00.000Z');

async function rejects(pool: Pool, sql: string) { await assert.rejects(pool.query(sql), /permission denied/); }
async function captureLog(work: () => Promise<void>) { const output: string[]=[]; const original=console.log; console.log=(...values: unknown[])=>output.push(values.join(' ')); try { await work(); } finally { console.log=original; } return output.map(value=>JSON.parse(value)); }

test.before(async () => {
  const bootstrap = new Pool({ ...ownerConfig, database: 'postgres' });
  await bootstrap.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [database]);
  await bootstrap.query(`DROP DATABASE IF EXISTS ${database}`);
  for (const role of Object.values(roles)) await bootstrap.query(`DROP ROLE IF EXISTS ${role}`);
  for (const [key, role] of Object.entries(roles) as Array<[keyof typeof roles,string]>) await bootstrap.query(`CREATE ROLE ${role} LOGIN PASSWORD '${passwords[key]}'`);
  await bootstrap.query(`CREATE DATABASE ${database}`);
  await bootstrap.end();

  owner = new Pool({ ...ownerConfig, database });
  for (const migration of ['037_public_service_otp.sql','038_pira_public_intake.sql','039_pira_admin_export.sql','040_pira_export_audit_retention.sql','041_secumie_db_operations.sql']) {
    await owner.query(readFileSync(path.join(root, 'migrations', migration), 'utf8'));
  }
  Object.assign(process.env, { DB_NAME:database,DB_HOST:'127.0.0.1',DB_PORT:String(port),DB_MIGRATION_USER:'otp_test',DB_MIGRATION_PASSWORD:'otp_test',OTP_DB_ROLE:roles.otp,PIRA_DB_ROLE:roles.pira,PIRA_ADMIN_DB_ROLE:roles.admin,SECU_MAINTENANCE_DB_ROLE:roles.maintenance });
  const configured = await captureLog(configureSecumieDbRoles);
  assert.equal(configured[0]?.event,'secumie_db_roles_configured');
  otp = new Pool({ ...ownerConfig, database, user: roles.otp, password: passwords.otp });
  pira = new Pool({ ...ownerConfig, database, user: roles.pira, password: passwords.pira });
  admin = new Pool({ ...ownerConfig, database, user: roles.admin, password: passwords.admin });
  maintenance = new Pool({ ...ownerConfig, database, user: roles.maintenance, password: passwords.maintenance });
});

test('fresh migrations 037-041 and role configuration grant only required runtime access', async () => {
  await assert.rejects(owner.query('SELECT secumie_deployment.configure_roles($1::name,$1::name,$2::name,$3::name)',[roles.otp,roles.admin,roles.maintenance]),/ROLES_MUST_BE_DISTINCT/);
  await otp.query("INSERT INTO public_auth.otp_send_locks(service_id,email_protected) VALUES('pira-union','otp@example.test')");
  assert.equal((await otp.query('SELECT count(*)::int AS count FROM public_auth.otp_send_locks')).rows[0].count, 1);
  await rejects(otp, 'DELETE FROM public_auth.otp_send_locks');
  await rejects(otp, 'SELECT * FROM pira.pira_initiative');

  const initiative = await owner.query("INSERT INTO pira.pira_initiative(initiative_code,initiative_kind,display_name) VALUES('pira-union','UNION','国連協') RETURNING initiative_id");
  const initiativeId = initiative.rows[0].initiative_id;
  await pira.query(`INSERT INTO pira.pira_submission(receipt_id,initiative_id,initiative_kind,company_name,company_name_normalized,contact_name,verified_email,website_url,union_name,address,consent_version,consented_at,sales_use_allowed,idempotency_key,payload_hash) VALUES(gen_random_uuid(),$1,'UNION','企業','企業','担当者','runtime@example.test','https://example.test','国連協','東京都','PIRA-UNION-CONSENT-V1.0',now(),false,gen_random_uuid(),'hash')`, [initiativeId]);
  await pira.query("UPDATE pira.pira_submission SET state='ANSWERING'");
  await rejects(pira, 'DELETE FROM pira.pira_submission');
  await rejects(pira, 'SELECT * FROM public_auth.otp_sessions');

  await admin.query("INSERT INTO pira.pira_initiative(initiative_code,initiative_kind,display_name) VALUES('pira-general','GENERAL','一般向け')");
  await admin.query("INSERT INTO pira.pira_export_audit(actor_subject,filter_snapshot,format,result_count,success,initiative_ids) VALUES('admin','{}','CSV',0,true,'[]')");
  await rejects(admin, 'UPDATE pira.pira_export_audit SET success=false');
  await rejects(admin, 'DELETE FROM pira.pira_export_audit');
  await rejects(admin, 'SELECT * FROM public_auth.otp_sessions');

  await rejects(maintenance, 'SELECT * FROM pira.pira_submission');
  assert.equal(typeof (await maintenance.query('SELECT public_auth.retention_candidates($1) AS value', [referenceAt])).rows[0].value, 'object');
  const functions = await owner.query("SELECT p.proname,p.prosecdef,p.proconfig,has_function_privilege('public',p.oid,'EXECUTE') AS public_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='public_auth' AND p.proname='purge_retained_data') OR (n.nspname='pira' AND p.proname='purge_retained_data') ORDER BY n.nspname");
  assert.equal(functions.rows.length,2);
  assert.ok(functions.rows.every(row => row.prosecdef === true && row.public_execute === false && (row.proconfig.includes('search_path=pg_catalog, public_auth') || row.proconfig.includes('search_path=pg_catalog, pira'))));
});

test('actual OTP, intake, and admin repositories operate with their scoped roles', async () => {
  const now = new Date('2026-11-02T00:00:00.000Z');
  const otpRepo = new PostgresOtpReservationRepo(otp);
  const reserved = await otpRepo.reserve({ id:'repo-reservation',challengeId:'repo-challenge',serviceId:'pira-union',email:'repo@example.test',otpDigest:'aa'.repeat(32),now });
  const lease = await otpRepo.claim(reserved,now); assert.ok(lease);
  assert.equal(await otpRepo.activateChallenge(lease!,now),true);
  const verified = await otpRepo.verifyAndCreateSession({ challengeId:'repo-challenge',serviceId:'pira-union',otpDigest:'aa'.repeat(32),sessionId:'repo-session',sessionDigest:'bb'.repeat(32),now });
  assert.equal(verified.result,'OK'); assert.ok(await otpRepo.activeSession('repo-session','pira-union',now));

  const intake = new PiraIntakeService(pira,false,()=>now);
  const context = { serviceId:'pira-union',initiativeCode:'pira-union',kind:'UNION' as const };
  const claims = { iss:'issuer',aud:'pira-union',sub:'session',jti:'repo-jti-create',iat:1,exp:9_999_999_999,email:'repository@example.test' };
  const created = await intake.create(context,claims,{companyName:'Repository企業',contactName:'担当者',websiteUrl:'https://example.test',unionName:'国連協',address:'東京都',accepted:true,consentVersion:'PIRA-UNION-CONSENT-V1.0',idempotencyKey:'11111111-1111-4111-8111-111111111111'});
  await intake.updateState(context,{...claims,jti:'repo-jti-state'},created.receiptId,'ANSWERING');

  const adminRepo = new PiraAdminRepo(admin);
  assert.ok((await adminRepo.list({limit:20,offset:0})).total >= 1);
  const adminInitiative = await adminRepo.createInitiative({code:'repo-admin',kind:'GENERAL',name:'Repository管理'});
  await adminRepo.setInitiativeActive(adminInitiative.initiative_id,false);
  await adminRepo.audit({actor:'admin@example.test',format:'CSV',filters:{},count:0,success:true,initiativeCodes:[]});
});

test('fixed retention windows delete only expired data and rerun safely', async () => {
  await owner.query('TRUNCATE public_auth.otp_challenges,public_auth.otp_send_reservations,public_auth.otp_send_locks,public_auth.otp_send_events,public_auth.otp_sessions,public_auth.otp_auth_audit');
  const old24 = new Date(referenceAt.getTime() - 25 * 60 * 60_000); const recent24 = new Date(referenceAt.getTime() - 23 * 60 * 60_000);
  const old30 = new Date(referenceAt.getTime() - 31 * 24 * 60 * 60_000); const recent30 = new Date(referenceAt.getTime() - 29 * 24 * 60 * 60_000);
  for (const [id, at] of [['old',old24],['recent',recent24]] as const) {
    await owner.query("INSERT INTO public_auth.otp_send_reservations(reservation_id,service_id,email_protected,otp_digest,status,challenge_id,reserved_at,lease_until) VALUES($1,'pira-union',$2,'digest','SENT',$3,$4,$4)", [`reservation-${id}`,`${id}@example.test`,`challenge-${id}`,at]);
    await owner.query("INSERT INTO public_auth.otp_challenges(challenge_id,reservation_id,service_id,email_protected,otp_digest,expires_at,resend_not_before,created_at) VALUES($1,$2,'pira-union',$3,'digest',$4,$4,$4)", [`challenge-${id}`,`reservation-${id}`,`${id}@example.test`,at]);
    await owner.query("INSERT INTO public_auth.otp_sessions(session_id,service_id,email_protected,token_digest,expires_at,created_at) VALUES($1,'pira-union',$2,$3,$4,$4)", [`session-${id}`,`${id}@example.test`,`token-${id}`,at]);
    await owner.query("INSERT INTO public_auth.otp_send_events(event_id,service_id,email_protected,sent_at) VALUES($1,'pira-union',$2,$3)", [`event-${id}`,`${id}@example.test`,at]);
  }
  await owner.query("INSERT INTO public_auth.otp_auth_audit(event_id,service_id,result_code,occurred_at) VALUES('audit-old','pira-union','OK',$1),('audit-recent','pira-union','OK',$2)", [old30,recent30]);

  const initiativeId = (await owner.query("SELECT initiative_id FROM pira.pira_initiative WHERE initiative_code='pira-union'")).rows[0].initiative_id;
  for (const [id, received, expires] of [['old',new Date('2024-11-01T00:00:00Z'),old24],['recent',new Date('2024-11-03T00:00:00Z'),new Date('2026-11-03T00:00:00Z')]] as const) {
    const submission = await owner.query(`INSERT INTO pira.pira_submission(receipt_id,initiative_id,initiative_kind,company_name,company_name_normalized,contact_name,verified_email,website_url,union_name,address,consent_version,consented_at,sales_use_allowed,received_at,idempotency_key,payload_hash) VALUES(gen_random_uuid(),$1,'UNION',$2,$2,'担当者',$3,'https://example.test','国連協','東京都','PIRA-UNION-CONSENT-V1.0',$4,false,$4,gen_random_uuid(),'hash') RETURNING submission_id`, [initiativeId,`企業-${id}`,`${id}@example.test`,received]);
    await owner.query("INSERT INTO pira.pira_consumed_jti(jti,submission_id,operation,expires_at) VALUES($1,$2,'CREATE_SUBMISSION',$3)", [`jti-${id}`,submission.rows[0].submission_id,expires]);
  }
  await owner.query("INSERT INTO pira.pira_export_audit(actor_subject,exported_at,filter_snapshot,format,result_count,success,initiative_ids) VALUES('admin',$1,'{}','CSV',0,true,'[]'),('admin',$2,'{}','CSV',0,true,'[]')", [new Date('2023-11-01T00:00:00Z'),new Date('2023-11-03T00:00:00Z')]);

  const otpCandidates = (await maintenance.query('SELECT public_auth.retention_candidates($1) AS value',[referenceAt])).rows[0].value;
  const piraCandidates = (await maintenance.query('SELECT pira.retention_candidates($1) AS value',[referenceAt])).rows[0].value;
  assert.equal(Number(otpCandidates.challenges),1); assert.equal(Number(otpCandidates.securityAudit),1);
  assert.equal(Number(piraCandidates.submissions),1); assert.equal(Number(piraCandidates.exportAudits),1);
  Object.assign(process.env,{DB_NAME:database,DB_MAINTENANCE_HOST:'127.0.0.1',DB_MAINTENANCE_PORT:String(port),DB_MAINTENANCE_USER:roles.maintenance,DB_MAINTENANCE_PASSWORD:passwords.maintenance,RETENTION_REFERENCE_AT:referenceAt.toISOString(),RETENTION_EXECUTE:'false'});
  const preview = await captureLog(runSecumieRetention);
  assert.equal(preview[0]?.event,'secumie_retention_preview'); assert.equal(Number(preview[0]?.candidates.otp.challenges),1);
  process.env.RETENTION_EXECUTE='true';
  const completed = await captureLog(runSecumieRetention);
  assert.equal(completed[0]?.event,'secumie_retention_completed');
  assert.equal(Number(completed[0]?.deleted.otp.challenges),1); assert.equal(Number(completed[0]?.deleted.pira.submissions),1); assert.equal(Number(completed[0]?.deleted.pira.exportAudits),1);
  assert.equal((await owner.query("SELECT count(*)::int AS count FROM public_auth.otp_challenges WHERE challenge_id='challenge-recent'")).rows[0].count,1);
  assert.equal((await owner.query("SELECT count(*)::int AS count FROM pira.pira_submission WHERE company_name='企業-recent'")).rows[0].count,1);
  const rerun = await captureLog(runSecumieRetention);
  assert.deepEqual(rerun[0]?.deleted.otp,{challenges:0,reservations:0,sessions:0,sendEvents:0,securityAudit:0,sendLocks:0});
  assert.deepEqual(rerun[0]?.deleted.pira,{submissions:0,consumedJti:0,exportAudits:0});
});

test('database rejects future deletion references and past references cannot shorten retention', async () => {
  const future = new Date(Date.now()+24*60*60_000);
  await assert.rejects(maintenance.query('SELECT public_auth.purge_retained_data($1)',[future]),/REFERENCE_AT_INVALID/);
  await assert.rejects(maintenance.query('SELECT pira.purge_retained_data($1)',[future]),/REFERENCE_AT_INVALID/);
  process.env.RETENTION_REFERENCE_AT=future.toISOString(); process.env.RETENTION_EXECUTE='true';
  await assert.rejects(runSecumieRetention(),/REFERENCE_AT_INVALID/);
  await assert.rejects(owner.query('SELECT pira.purge_export_audit_before($1)',[future]),/RETENTION_NOT_REACHED/);
  await assert.rejects(maintenance.query('SELECT pira.purge_export_audit_before($1)',[new Date('2020-01-01')]),/permission denied/);
  const pastReference = new Date('2026-10-01T00:00:00.000Z');
  process.env.RETENTION_REFERENCE_AT=pastReference.toISOString();
  const protectedAt = new Date('2026-09-30T12:00:00.000Z');
  await owner.query("INSERT INTO public_auth.otp_sessions(session_id,service_id,email_protected,token_digest,expires_at,created_at) VALUES('past-protected','pira-union','protected@example.test','digest',$1,$1)",[protectedAt]);
  const result = (await maintenance.query('SELECT public_auth.purge_retained_data($1) AS value',[pastReference])).rows[0].value;
  assert.equal(Number(result.sessions),0);
  assert.equal((await owner.query("SELECT count(*)::int AS count FROM public_auth.otp_sessions WHERE session_id='past-protected'")).rows[0].count,1);
});

test.after(async () => {
  await Promise.all([otp?.end(),pira?.end(),admin?.end(),maintenance?.end(),owner?.end()]);
  const bootstrap = new Pool({ ...ownerConfig, database: 'postgres' });
  await bootstrap.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [database]);
  await bootstrap.query(`DROP DATABASE IF EXISTS ${database}`);
  for (const role of Object.values(roles)) await bootstrap.query(`DROP ROLE IF EXISTS ${role}`);
  await bootstrap.end();
});
