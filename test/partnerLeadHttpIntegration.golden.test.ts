import assert from 'node:assert/strict';
import {test} from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import {createInfraVisionPartnerLeadRouter} from '../src/routes/infravisionPartnerLead';
import {createWebDevelopmentPartnerLeadRouter} from '../src/routes/webDevelopmentPartnerLead';
import {createAdminInfraVisionPartnerLeadRouter} from '../src/routes/adminInfraVisionPartnerLead';
import {createAdminWebDevelopmentPartnerLeadRouter} from '../src/routes/adminWebDevelopmentPartnerLead';
import {requireStaffAuth} from '../src/middleware/staffAuth';
import {StaffAuthService} from '../src/services/staffAuthService';

async function fixture(){
  const app=express(),auth=new StaffAuthService('test-key'),rows:any[]=[];
  const repo={insert:async(v:any)=>{rows.push(v);return `lead-${rows.length}`},list:async()=>rows,updateStatus:async()=>true};
  const mailer={sendInfraVisionPartnerLeadNotification:async()=>{},sendInfraVisionPartnerLeadThanks:async()=>{},sendWebDevelopmentPartnerLeadNotification:async()=>{},sendWebDevelopmentPartnerLeadThanks:async()=>{}};
  const config={portalBaseUrl:'https://sales.example.test',diagnosticNotifyEmail:'staff@example.test',slack:{}};
  app.use(express.json());app.use(cookieParser());
  app.use('/api/infravision-partner-leads',createInfraVisionPartnerLeadRouter(repo as never,mailer as never,config as never));
  app.use('/api/web-development-partner-leads',createWebDevelopmentPartnerLeadRouter(repo as never,mailer as never,config as never));
  app.use('/api/admin/infravision-partner-leads',requireStaffAuth(auth),createAdminInfraVisionPartnerLeadRouter(repo as never));
  app.use('/api/admin/web-development-partner-leads',requireStaffAuth(auth),createAdminWebDevelopmentPartnerLeadRouter(repo as never));
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const port=(server.address() as any).port;
  return {base:`http://127.0.0.1:${port}`,cookie:`staff_session=${auth.issueSessionToken({email:'admin@example.test'})}`,rows,close:()=>new Promise<void>(r=>server.close(()=>r()))};
}
test('partner public APIs validate, persist without external mail, and preserve CORS',async()=>{const x=await fixture();try{
  assert.equal((await fetch(`${x.base}/api/infravision-partner-leads`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,400);
  const i=await fetch(`${x.base}/api/infravision-partner-leads`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({companyName:'I',contactName:'C',email:'i@example.test'})});
  assert.equal(i.status,201);assert.equal(i.headers.get('access-control-allow-origin'),'https://www.atlib.jp');
  const w=await fetch(`${x.base}/api/web-development-partner-leads`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({companyName:'W',contactName:'C',email:'w@example.test',consultationType:'new-site'})});
  assert.equal(w.status,201);assert.equal(x.rows[1].consultationType,'new-site');
}finally{await x.close();}});
test('partner admin APIs require staff auth and validate status updates',async()=>{const x=await fixture();try{
  assert.equal((await fetch(`${x.base}/api/admin/infravision-partner-leads`)).status,401);
  const h={Cookie:x.cookie};
  assert.equal((await fetch(`${x.base}/api/admin/infravision-partner-leads`,{headers:h})).status,200);
  assert.equal((await fetch(`${x.base}/api/admin/web-development-partner-leads/lead-1/status`,{method:'PATCH',headers:{...h,'content-type':'application/json'},body:JSON.stringify({status:'invalid'})})).status,400);
  assert.equal((await fetch(`${x.base}/api/admin/web-development-partner-leads/lead-1/status`,{method:'PATCH',headers:{...h,'content-type':'application/json'},body:JSON.stringify({status:'scheduled'})})).status,204);
}finally{await x.close();}});
