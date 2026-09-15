// Disposable local Docker evidence only. Never deploys or connects to Cloud SQL.
const {spawnSync} = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
function docker(...args) {
  const r = spawnSync('docker', args, {encoding:'utf8', maxBuffer:20*1024*1024});
  if (r.status !== 0) throw Error(`Docker ${args[0]} failed: ${r.stderr}`);
  return r.stdout.trim();
}
const pg = 'diagnosis-readiness-pg', runtime = 'diagnosis-readiness-runtime';
assert.equal(docker('inspect', '--format', '{{index .Config.Labels "purpose"}}', pg), 'diagnosis-readiness');
const env = {DB_HOST:'127.0.0.1', DB_NAME:'readiness', DB_USER:'postgres', DB_PASSWORD:'disposable-readiness-only'};
const envArgs = values => Object.entries(values).flatMap(([k,v]) => ['-e', `${k}=${v}`]);
const migration = () => docker('run','--rm','--network',`container:${pg}`,...envArgs(env),'diagnosis-readiness:migration');
const rerun = migration();
const skipped = rerun.split('\n').filter(s => s.includes('migration_skipped')).length;
assert.ok(skipped > 0, 'expected existing migrations to be skipped on rerun');
console.log(JSON.stringify({event:'migration_artifact_rerun',skipped}));
const psql = (db, sql) => docker('exec', pg, 'psql','-v','ON_ERROR_STOP=1','-U','postgres','-d',db,'-Atc',sql);
const expectedMigrations = Number(psql('readiness','SELECT count(*) FROM schema_migrations'));
assert.equal(skipped, expectedMigrations);
psql('readiness', "CREATE TABLE IF NOT EXISTS readiness_restore_marker(value text); TRUNCATE readiness_restore_marker; INSERT INTO readiness_restore_marker VALUES ('synthetic-only');");
docker('exec',pg,'pg_dump','-U','postgres','-d','readiness','-Fc','-f','/tmp/readiness-rehearsal.dump');
docker('exec',pg,'dropdb','-U','postgres','--if-exists','readiness_restore');
docker('exec',pg,'createdb','-U','postgres','readiness_restore');
docker('exec',pg,'pg_restore','-U','postgres','--exit-on-error','-d','readiness_restore','/tmp/readiness-rehearsal.dump');
assert.equal(psql('readiness_restore','SELECT value FROM readiness_restore_marker'), 'synthetic-only');
assert.equal(Number(psql('readiness_restore','SELECT count(*) FROM schema_migrations')), expectedMigrations);
const triggers = "SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal";
assert.equal(psql('readiness_restore',triggers),psql('readiness',triggers));
console.log(JSON.stringify({event:'local_backup_restore_verified',ledger:expectedMigrations,triggers:Number(psql('readiness_restore',triggers)),customerData:false}));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'readiness-runtime-'));
let started = false;
(async () => {
 try {
  docker('run','-d','--name',runtime,'--label','purpose=diagnosis-readiness','--network',`container:${pg}`,...envArgs({...env,DB_NAME:'readiness_restore',EXPECTED_MIGRATIONS:String(expectedMigrations),SMTP_HOST:'127.0.0.1',SMTP_PASSWORD:'synthetic-only',SMTP_USER:'synthetic',SMTP_FROM:'synthetic@example.test',DIAGNOSTIC_NOTIFY_EMAIL:'synthetic@example.test',GOOGLE_OAUTH_CLIENT_ID:'synthetic',GOOGLE_OAUTH_CLIENT_SECRET:'synthetic-only',STAFF_JWT_SECRET:'synthetic-readiness-signing-key-only-123456',PORTAL_BASE_URL:'https://example.test'}),'diagnosis-readiness:runtime'); started=true;
  const probe = `const assert=require('node:assert/strict'),fs=require('node:fs'); (async()=>{
    assert.equal(process.getuid(),1000);assert.match(process.version,/^v22\\./);
    assert.equal(fs.existsSync('/app/node_modules/ts-node'),false);assert.equal(fs.existsSync('/app/.env'),false);assert.equal(fs.existsSync('/app/migrations'),false);
    for(const [url,status] of [['/healthz',200],['/auth/login',302],['/it-management-diagnosis.html',200],['/admin/it-management-diagnosis-detail.html',302],['/api/admin/it-management-diagnosis/cases',401]]){const r=await fetch('http://127.0.0.1:8080'+url,{redirect:'manual'});assert.equal(r.status,status,url);}
    const pool=new (require('/app/node_modules/pg').Pool)({host:process.env.DB_HOST,user:process.env.DB_USER,database:process.env.DB_NAME,password:process.env.DB_PASSWORD});assert.equal((await pool.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n,Number(process.env.EXPECTED_MIGRATIONS));await pool.end();
    console.log(JSON.stringify({event:'runtime_smoke_pass',node:process.version,uid:process.getuid(),restoredDatabase:true,aiKeyConfigured:!!process.env.ANTHROPIC_API_KEY}));
  })().catch(error=>{console.error(JSON.stringify({event:'runtime_probe_failed',code:error.code,message:error.message}));process.exitCode=1;});`;
  fs.writeFileSync(path.join(tmp,'probe.cjs'),probe);docker('cp',path.join(tmp,'probe.cjs'),`${runtime}:/tmp/probe.cjs`);
  let result;
  for(let attempt=0;attempt<30;attempt++) {try{result=docker('exec',runtime,'node','/tmp/probe.cjs');break;}catch(error){if(attempt===29)throw error;await new Promise(r=>setTimeout(r,500));}}
  console.log(result);
  const logs=docker('logs',runtime);assert.doesNotMatch(logs,/synthetic-readiness-signing|disposable-readiness-only|synthetic-only|staff_oauth_state=|set-cookie/);
  console.log(JSON.stringify({event:'runtime_log_synthetic_secret_check',result:'PASS'}));
 } finally {
  if(started) {assert.equal(docker('inspect','--format','{{index .Config.Labels "purpose"}}',runtime),'diagnosis-readiness');docker('rm','-f',runtime);}
  fs.rmSync(tmp,{recursive:true});
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
