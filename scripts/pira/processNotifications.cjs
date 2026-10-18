'use strict';
// Explicit invocation only. No cron/Cloud resource or automatic web-worker startup.
async function main(){
 if(process.env.PIRA_NOTIFY_ENABLED!=='true'){console.log(JSON.stringify({status:'SKIP',reason:'notification delivery not enabled'}));return;}
 const {loadConfig}=require('../../dist/config'),{createPool}=require('../../dist/db/pool'),{PgPiraStore}=require('../../dist/pira/pgStore'),{deliverPiraNotice}=require('../../dist/pira/notifications'),{deliverSlackNotification}=require('../../dist/services/slackNotifier'),{Mailer}=require('../../dist/services/mailer');
 const config=await loadConfig(),pool=createPool(config),store=new PgPiraStore(pool),mailer=new Mailer(config.smtp);
 try{const notices=await store.transaction('pira-phase1-business',tx=>tx.list('outbox'));
  const delivery={slack:process.env.PIRA_SLACK_WEBHOOK_URL?message=>deliverSlackNotification(process.env.PIRA_SLACK_WEBHOOK_URL,message):undefined,email:(address,subject,message)=>mailer.sendPiraNotice(address,subject,message)};
  const counts={sent:0,pending:0,dead:0,deferred:0,unconfigured:0,failed:0};
  for(const n of notices.filter(n=>['pending','sending'].includes(n.data.state)).slice(0,100)){try{const state=await deliverPiraNotice(store,n.id,delivery,new URL(config.portalBaseUrl).origin);counts[state]=(counts[state]||0)+1;}catch{counts.failed++;}}
  console.log(JSON.stringify({status:'COMPLETE',counts}));
 }finally{await pool.end();}
}
main().catch(()=>{console.error(JSON.stringify({status:'FAILED',reason:'PIRA_WORKER_FAILED'}));process.exitCode=1;});
