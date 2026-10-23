'use strict';
// Explicit invocation only; web entrypoints never start this worker.
async function main(){
 if(process.env.PIRA_NOTIFY_ENABLED!=='true'){console.log(JSON.stringify({status:'SKIP',reason:'notification delivery not enabled'}));return;}
 const {createPiraPool}=require('../../dist/pira/runtimePool'),{required,httpsOrigin}=require('../../dist/pira/runtimeConfig'),{PgPiraStore}=require('../../dist/pira/pgStore'),{LimitedNoticeReferences}=require('../../dist/pira/salesReferences'),{deliverPiraNotice}=require('../../dist/pira/notifications'),{deliverSlackNotification}=require('../../dist/services/slackNotifier');
 const origins={portal:httpsOrigin(required(process.env,'PIRA_EXTERNAL_ORIGIN')),sales:httpsOrigin(required(process.env,'PIRA_SALES_ORIGIN'))};
 const pool=await createPiraPool(process.env,'pira_notifier');
 try{
  const store=new PgPiraStore(pool,new LimitedNoticeReferences(),true);let email;
  if(process.env.PIRA_EMAIL_ENABLED==='true'){
   const {Mailer}=require('../../dist/services/mailer');const mailer=new Mailer({host:required(process.env,'PIRA_SMTP_HOST'),port:Number(required(process.env,'PIRA_SMTP_PORT')),user:required(process.env,'PIRA_SMTP_USER'),password:required(process.env,'PIRA_SMTP_PASSWORD'),from:required(process.env,'PIRA_SMTP_FROM')});
   email=(address,subject,message)=>mailer.sendPiraNotice(address,subject,message);
  }
  const delivery={slack:process.env.PIRA_SLACK_WEBHOOK_URL?message=>deliverSlackNotification(process.env.PIRA_SLACK_WEBHOOK_URL,message):undefined,email};
  const notices=await store.transaction('pira-phase1-business',tx=>tx.list('outbox'));const counts={};
  for(const n of notices.filter(n=>['pending','sending'].includes(n.data.state)).slice(0,100)){try{const state=await deliverPiraNotice(store,n.id,delivery,origins);counts[state]=(counts[state]||0)+1;}catch{counts.failed=(counts.failed||0)+1;}}
  console.log(JSON.stringify({status:'COMPLETE',counts}));
 }finally{await pool.end();}
}
main().catch(()=>{console.error(JSON.stringify({status:'FAILED',reason:'PIRA_WORKER_FAILED'}));process.exitCode=1;});
