import '../src/middleware/staffAuth';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createAdminSecumieGeneralRouter } from '../src/routes/adminSecumieGeneral';
import type { SecumieGeneralAdminRepo } from '../src/services/secumieGeneralAdminRepo';

test('general lead admin staff gate, service boundary, strict filters and mutation',async()=>{
 const calls:unknown[]=[];
 const repo:Pick<SecumieGeneralAdminRepo,'list'|'detail'|'updateSales'|'linkCompany'|'unlinkCompany'>={
  async list(p){calls.push(p);return {items:[],total:0,summary:{received:0,completed:0,consultations:0,new_leads:0,web_completed:0,insight_completed:0}};},
  async detail(kind,id){calls.push({kind,id});return null;},
  async updateSales(kind,id,input){calls.push({kind,id,input});return true;},
  async linkCompany(kind,id,input){calls.push({kind,id,input});return {groupId:id};},
  async unlinkCompany(kind,id,actor){calls.push({kind,id,actor});return true;}
 };
 const app=express();app.use(express.json());app.use((req,_res,next)=>{if(req.get('x-test-staff')==='1')req.staffEmail='synthetic@example.invalid';next();});app.use('/leads-admin',createAdminSecumieGeneralRouter(repo));
 const server=app.listen(0,'127.0.0.1');
 await new Promise<void>((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
 try{
  const addr=server.address();assert.ok(addr&&typeof addr==='object');
  const base='http://127.0.0.1:'+addr.port+'/leads-admin/leads';
  const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const staff={'x-test-staff':'1'};
  assert.equal((await fetch(base+'?kind=WEB')).status,401);
  assert.equal((await fetch(base+'?kind=UNION',{headers:staff})).status,400);
  assert.equal((await fetch(base+'?kind=WEB&limit=101',{headers:staff})).status,400);
  assert.equal((await fetch(base+'?kind=INSIGHT',{headers:staff})).status,200);
  assert.deepEqual(calls[0],{kind:'INSIGHT',limit:50,offset:0});
  assert.equal((await fetch(base+'/WEB/'+id,{headers:staff})).status,404);
  const url=base+'/WEB/'+id+'/sales';
  const payload=JSON.stringify({status:'CONTACTED',note:'synthetic'});
  assert.equal((await fetch(url,{method:'PATCH',headers:{...staff,'content-type':'application/json'},body:payload})).status,403);
  assert.equal((await fetch(url,{method:'PATCH',headers:{...staff,'content-type':'application/json','x-secumie-staff-command':'1'},body:payload})).status,204);
  assert.deepEqual(calls[2],{kind:'WEB',id,input:{status:'CONTACTED',note:'synthetic',actor:'synthetic@example.invalid'}});
  assert.equal((await fetch(base,{headers:staff})).status,200);
  assert.deepEqual(calls[3],{limit:50,offset:0});
  assert.equal(calls.length,4);
  const link=base+'/WEB/'+id+'/company-link',targetId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const headers={...staff,'content-type':'application/json','x-secumie-staff-command':'1'};
  assert.equal((await fetch(link,{method:'POST',headers,body:JSON.stringify({targetKind:'INSIGHT',targetId,confirmed:false})})).status,400);
  assert.equal((await fetch(link,{method:'POST',headers:{...staff,'content-type':'application/json'},body:JSON.stringify({targetKind:'INSIGHT',targetId,confirmed:true})})).status,403);
  assert.equal((await fetch(link,{method:'POST',headers,body:JSON.stringify({targetKind:'INSIGHT',targetId,confirmed:true})})).status,200);
  assert.deepEqual(calls[4],{kind:'WEB',id,input:{targetKind:'INSIGHT',targetId,actor:'synthetic@example.invalid'}});
  assert.equal((await fetch(link,{method:'DELETE',headers,body:JSON.stringify({confirmed:true})})).status,204);
  assert.deepEqual(calls[5],{kind:'WEB',id,actor:'synthetic@example.invalid'});
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});


test('one general management entry with both service filters and row-scoped details',async()=>{
 const {readFileSync,existsSync}=await import('node:fs');
 const html=readFileSync('public/admin/secumie-general-leads.html','utf8');
 assert.match(html,/name="kind"/);assert.match(html,/value="WEB"/);assert.match(html,/value="INSIGHT"/);
 assert.match(html,/id="web_completed"/);assert.match(html,/id="insight_completed"/);
 const script=readFileSync('public/admin/secumie-general-leads.js','utf8');
 assert.match(script,/detail\(x.kind,x.id\)/);
 assert.match(script,/kind=activeKind/);
 assert.equal(existsSync('public/admin/secumie-web-leads.html'),false);
 assert.equal(existsSync('public/admin/secumie-insight-leads.html'),false);
});


test('general lead database credentials are scoped by role and environment',async()=>{
 const {loadGeneralLeadDatabaseConfig}=await import('../src/config');
 const env={SECUMIE_GENERAL_DB_NAME:'secumie_general_staging',SECUMIE_GENERAL_DB_USER:'secumie_general_writer_staging',SECUMIE_GENERAL_DB_PASSWORD:'synthetic-writer',SECUMIE_GENERAL_DB_STAFF_USER:'secumie_general_staff_staging',SECUMIE_GENERAL_DB_STAFF_PASSWORD:'synthetic-staff'};
 assert.equal(loadGeneralLeadDatabaseConfig('writer',env).user,'secumie_general_writer_staging');
 assert.equal(loadGeneralLeadDatabaseConfig('staff',env).user,'secumie_general_staff_staging');
 assert.throws(()=>loadGeneralLeadDatabaseConfig('staff',{...env,SECUMIE_GENERAL_DB_STAFF_USER:env.SECUMIE_GENERAL_DB_USER}),/ROLE_MISMATCH/);
 assert.throws(()=>loadGeneralLeadDatabaseConfig('writer',{...env,SECUMIE_GENERAL_DB_NAME:'secumie_insight_staging'}),/NAME_MISMATCH/);
 assert.throws(()=>loadGeneralLeadDatabaseConfig('staff',{...env,SECUMIE_GENERAL_DB_PORT:'0'}),/PORT_INVALID/);
});
