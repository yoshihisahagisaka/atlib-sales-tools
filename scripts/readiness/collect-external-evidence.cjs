// Read-only controlled-pilot external evidence collector.
// It never changes Cloud resources and never prints Secret values or customer data.
const {spawnSync}=require('node:child_process');

function required(name){
  const value=(process.env[name]||'').trim();
  if(!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function runJson(args){
  const r=spawnSync('gcloud',[...args,'--format=json'],{encoding:'utf8',maxBuffer:20*1024*1024});
  if(r.status!==0){
    const code=(r.stderr||'GCLOUD_COMMAND_FAILED').trim().slice(0,240);
    throw new Error(code);
  }
  return JSON.parse(r.stdout||'null');
}
function runValue(args){
  const r=spawnSync('gcloud',args,{encoding:'utf8',maxBuffer:2*1024*1024});
  if(r.status!==0) throw new Error((r.stderr||'GCLOUD_COMMAND_FAILED').trim().slice(0,240));
  return (r.stdout||'').trim();
}
function pick(obj,path,fallback=null){
  let cur=obj;
  for(const key of path.split('.')){if(cur==null||typeof cur!=='object'||!(key in cur))return fallback;cur=cur[key];}
  return cur;
}
function bool(v){return v===true||v==='true';}

const project=required('GCP_PROJECT_ID');
const sqlInstance=required('CONTROLLED_PILOT_CLOUD_SQL_INSTANCE');
const runService=required('CONTROLLED_PILOT_CLOUD_RUN_SERVICE');
const runRegion=required('CONTROLLED_PILOT_CLOUD_RUN_REGION');
const bucket=required('DIAGNOSIS_RECONCILIATION_GCS_BUCKET');

const activeAccount=runValue(['auth','list','--filter=status:ACTIVE','--limit=1','--format=value(account)']);
if(!activeAccount) throw new Error('GCLOUD_ACTIVE_ACCOUNT_REQUIRED');

const sql=runJson(['sql','instances','describe',sqlInstance,'--project',project]);
const backups=runJson(['sql','backups','list','--instance',sqlInstance,'--project',project,'--limit=20']);
const service=runJson(['run','services','describe',runService,'--project',project,'--region',runRegion]);
const bucketInfo=runJson(['storage','buckets','describe',`gs://${bucket}`,'--project',project]);
const secretNames=runValue(['secrets','list','--project',project,'--format=value(name)']).split(/\r?\n/).filter(Boolean);

const backupConfig=pick(sql,'settings.backupConfiguration',{})||{};
const retainedBackups=pick(sql,'settings.backupConfiguration.backupRetentionSettings.retainedBackups',null);
const latestBackup=Array.isArray(backups)&&backups.length?backups
  .filter(b=>String(b.status||'').toUpperCase()==='SUCCESSFUL'||String(b.status||'').toUpperCase()==='SUCCESS')
  .sort((a,b)=>new Date(b.endTime||b.startTime||0)-new Date(a.endTime||a.startTime||0))[0]||null:null;
const annotations=pick(service,'spec.template.metadata.annotations',{})||{};
const serviceAccount=pick(service,'spec.template.spec.serviceAccountName',null);
const latestReadyRevision=pick(service,'status.latestReadyRevisionName',null);
const serviceUrl=pick(service,'status.url',null);
const ingress=pick(service,'metadata.annotations.run.googleapis.com/ingress',pick(service,'spec.template.metadata.annotations.run.googleapis.com/ingress',null));
const cpuThrottling=annotations['run.googleapis.com/cpu-throttling']??null;
const minInstances=annotations['autoscaling.knative.dev/minScale']??pick(service,'metadata.annotations.run.googleapis.com/minScale',null);
const maxInstances=annotations['autoscaling.knative.dev/maxScale']??pick(service,'metadata.annotations.run.googleapis.com/maxScale',null);
const uniformBucketLevelAccess=bool(pick(bucketInfo,'iamConfiguration.uniformBucketLevelAccess.enabled',false));
const bucketVersioning=bool(pick(bucketInfo,'versioning.enabled',false));

const expectedSecrets=['sales-tools-db-password','sales-tools-smtp-password','sales-tools-google-oauth-client-secret','sales-tools-staff-jwt-secret','sales-tools-anthropic-api-key'];
const secretPresence=Object.fromEntries(expectedSecrets.map(name=>[name,secretNames.includes(name)]));

const evidence={
  evidence_version:'ITMGMT-CONTROLLED-PILOT-EXTERNAL-PREFLIGHT-v1',
  observed_at:new Date().toISOString(),
  project,
  operator_account_present:true,
  cloud_sql:{
    instance:sqlInstance,
    database_version:sql.databaseVersion||null,
    automated_backups_enabled:bool(backupConfig.enabled),
    point_in_time_recovery_enabled:bool(backupConfig.pointInTimeRecoveryEnabled),
    retained_backups:retainedBackups,
    latest_successful_backup:latestBackup?{id:latestBackup.id||null,start_time:latestBackup.startTime||null,end_time:latestBackup.endTime||null,type:latestBackup.type||null}:null,
  },
  cloud_run:{
    service:runService,region:runRegion,latest_ready_revision:latestReadyRevision,url:serviceUrl,
    service_account_configured:!!serviceAccount,ingress,cpu_throttling:cpuThrottling,min_instances:minInstances,max_instances:maxInstances,
  },
  deletion_manifest_bucket:{
    bucket,location:bucketInfo.location||null,uniform_bucket_level_access:uniformBucketLevelAccess,versioning_enabled:bucketVersioning,
  },
  secret_manager:{expected_secret_presence:secretPresence},
  interpretation:{
    backup_configuration_observed:true,
    restore_rehearsal_executed:false,
    gcs_manifest_export_readback_executed:false,
    real_anthropic_executed:false,
    real_google_oauth_allowed_disallowed_executed:false,
    monitoring_alert_delivery_executed:false,
    staging_e2e_executed:false,
    pilot_go:false,
  },
};

// Evidence output deliberately excludes Secret values, env vars, customer data and raw service JSON.
console.log(JSON.stringify(evidence,null,2));
