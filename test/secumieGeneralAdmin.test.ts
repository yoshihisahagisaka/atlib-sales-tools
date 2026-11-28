import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createAdminSecumieGeneralRouter } from '../src/routes/adminSecumieGeneral';
import type { SecumieGeneralAdminRepo } from '../src/services/secumieGeneralAdminRepo';

test('general lead admin staff gate, service boundary, strict filters and mutation',async()=>{
 const calls:unknown[]=[];
 const repo:Pick<SecumieGeneralAdminRepo,'list'|'detail'|'updateSales'>={
  async list(p){calls.push(p);return {items:[],total:0,summary:{received:0,completed:0,consultations:0,new_leads:0}};},
  async detail(kind,id){calls.push({kind,id});return null;},
  async updateSales(kind,id,input){calls.push({kind,id,input});return true;}
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
  assert.equal(calls.length,3);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});


test('independent WEB and Insight management pages have fixed service identity',async()=>{
 const {readFileSync,existsSync}=await import('node:fs');
 for(const [page,kind] of [['secumie-web-leads.html','WEB'],['secumie-insight-leads.html','INSIGHT']]){
  const html=readFileSync('public/admin/'+page,'utf8');
  assert.ok(html.includes('data-service="'+kind+'"'));
  assert.doesNotMatch(html,/id="tab-(web|insight)"|href="\?kind=/);
 }
 const script=readFileSync('public/admin/secumie-general-leads.js','utf8');
 assert.match(script,/document\.body\.dataset\.service/);
 assert.doesNotMatch(script,/location\.search/);
 assert.equal(existsSync('public/admin/secumie-general-leads.html'),false);
});
