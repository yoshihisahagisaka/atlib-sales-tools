import { check } from './model';
export function required(env:NodeJS.ProcessEnv,name:string){const v=env[name];check(v&&v.trim()===v,'PIRA_CONFIGURATION_REQUIRED');return v;}
export function httpsOrigin(value:string){const u=new URL(value);check(u.origin===value&&u.protocol==='https:'&&!u.username&&!u.password,'INVALID_PIRA_ORIGIN');return value;}
export function portalConfig(env:NodeJS.ProcessEnv){
  // A portal must fail closed if accidentally given privileged runtime configuration.
  for(const k of Object.keys(env))check(!/^(DATABASE_URL|GOOGLE_APPLICATION_CREDENTIALS|PGPASSWORD|PGUSER|PGHOST|PGDATABASE|DB_|STAFF_|PIRA_DB_|PIRA_SESSION_SECRET|PIRA_GOOGLE_CLIENT_SECRET|PIRA_SLACK_WEBHOOK_URL|PIRA_SMTP_|SMTP_)/.test(k),'PRIVILEGED_PORTAL_CONFIGURATION');
  return {origin:httpsOrigin(required(env,'PIRA_EXTERNAL_ORIGIN')),coreOrigin:httpsOrigin(required(env,'PIRA_CORE_ORIGIN'))};
}
export function coreConfig(env:NodeJS.ProcessEnv){
  const portal={email:required(env,'PIRA_PORTAL_SA_EMAIL'),subject:required(env,'PIRA_PORTAL_SA_SUB')};
  const sales={email:required(env,'PIRA_SALES_SA_EMAIL'),subject:required(env,'PIRA_SALES_SA_SUB')};
  check(portal.email!==sales.email&&portal.subject!==sales.subject,'CALLERS_MUST_DIFFER');
  const sessionSecret=required(env,'PIRA_SESSION_SECRET');check(sessionSecret.length>=32,'INVALID_PIRA_SECRET');
  return {audience:httpsOrigin(required(env,'PIRA_CORE_ORIGIN')),salesOrigin:httpsOrigin(required(env,'PIRA_SALES_ORIGIN')),callers:{portal,sales},auth:{origin:httpsOrigin(required(env,'PIRA_EXTERNAL_ORIGIN')),clientId:required(env,'PIRA_GOOGLE_CLIENT_ID'),clientSecret:required(env,'PIRA_GOOGLE_CLIENT_SECRET'),sessionSecret,production:true}};
}
