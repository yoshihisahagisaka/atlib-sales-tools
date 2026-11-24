import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';
import { BusinessKaizenAnonymousKpiService, type TurnstileVerifier } from '../src/services/businessKaizenAnonymousKpiService';
import { createBusinessKaizenAnonymousEventsRouter } from '../src/routes/businessKaizenAnonymousEvents';
import { createAdminBusinessKaizenAnonymousKpiRouter } from '../src/routes/adminBusinessKaizenAnonymousKpi';
import { StaffAuthService } from '../src/services/staffAuthService';
import { requireStaffAuth } from '../src/middleware/staffAuth';
import { safeAccessRequest } from '../src/middleware/diagnosisLogging';

async function harness(now = new Date('2026-01-31T15:00:00.000Z')) {
  const db = new PGlite(); await db.waitReady;
  const root = path.resolve(__dirname,'..');
  await db.exec(fs.readFileSync(path.join(root,'migrations/034_marketing_initiative_v1.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(root,'migrations/UNNUMBERED_business_kaizen_anonymous_kpi_daily.sql'),'utf8').replace(/DO \$\$[\s\S]*?END\n\$\$;/g,''));
  let tail=Promise.resolve();
  const acquire=async()=>{const previous=tail;let release!:()=>void;tail=new Promise<void>(resolve=>{release=resolve});await previous;return release};
  const pool={query:async(sql:string,params?:unknown[])=>{const release=await acquire();try{return await db.query(sql,params)}finally{release()}},connect:async()=>{const release=await acquire();return{query:(sql:string,params?:unknown[])=>db.query(sql,params),release}}} as unknown as Pool;
  const used=new Set<string>();
  const verifier:TurnstileVerifier=async token=>{
    if(token==='siteverify-down')throw new Error('unavailable');
    if(token==='expired'||used.has(token))return{success:false};
    used.add(token);
    const [action,hostname='service.atlib.jp']=token.split('|');
    return{success:true,action,hostname};
  };
  const config={enabled:true,secret:'test-only',environment:'TEST' as const,allowedOrigins:['https://service.atlib.jp','https://test.example'],allowedHostnames:['service.atlib.jp','test.example']};
  const service=new BusinessKaizenAnonymousKpiService(pool,config,verifier,()=>now);
  const auth=new StaffAuthService('anonymous-kpi-test-key-not-production');
  const cookie=`staff_session=${auth.issueSessionToken({email:'staff@atlib.jp'})}`;
  const app=express();app.use(express.json());app.use(cookieParser());
  app.use('/api/public/business-kaizen/anonymous-events',createBusinessKaizenAnonymousEventsRouter(service));
  app.use('/api/admin/business-kaizen/anonymous-kpis',requireStaffAuth(auth),createAdminBusinessKaizenAnonymousKpiRouter(service));
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return{db,pool,service,url,cookie,close:async()=>{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await db.close()}};
}
const post=(h:any,body:unknown,origin='https://service.atlib.jp')=>fetch(`${h.url}/api/public/business-kaizen/anonymous-events`,{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)});

test('anonymous KPI accepts only verified events, classifies UTM and stores no raw unknown value',async()=>{
  const h=await harness();try{
    await h.pool.query(`INSERT INTO marketing_initiative(initiative_id,initiative_name,service_key,utm_source,utm_medium,utm_campaign,created_by,updated_by) VALUES('00000000-0000-4000-8000-000000000001','approved','BUSINESS_WEB','google','cpc','spring','staff','staff')`);
    assert.equal((await post(h,{eventType:'diagnosis_start',turnstileToken:'diagnosis_start',utmSource:' google ',utmMedium:'cpc',utmCampaign:'spring'})).status,202);
    assert.equal((await post(h,{eventType:'diagnosis_complete',turnstileToken:'diagnosis_complete',utmSource:'attacker-raw'})).status,202);
    assert.equal((await post(h,{eventType:'diagnosis_complete',turnstileToken:'diagnosis_complete|test.example'},'https://test.example')).status,202);
    const rows=(await h.pool.query(`SELECT event_type,utm_classification,utm_source,utm_medium,utm_campaign,event_count FROM business_kaizen_anonymous_kpi_daily ORDER BY event_type,utm_classification`)).rows;
    assert.deepEqual(rows.map((row:any)=>[row.event_type,row.utm_classification,row.utm_source,row.utm_medium,row.utm_campaign,Number(row.event_count)]),[
      ['diagnosis_complete','OTHER',null,null,null,1],['diagnosis_complete','UNATTRIBUTED',null,null,null,1],
      ['diagnosis_start','REGISTERED','google','cpc','spring',1],
    ]);
    assert.equal(JSON.stringify(rows).includes('attacker-raw'),false);
    const columns=(await h.pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='business_kaizen_anonymous_kpi_daily'`)).rows.map((r:any)=>r.column_name);
    for(const forbidden of ['email','company_name','answers','diagnosis_id','lead_id','session_id','fingerprint','ip'])assert.equal(columns.includes(forbidden),false);
  }finally{await h.close()}
});

test('anonymous KPI rejects strict extras, wrong action/origin/hostname, replay, expiry and verification outage',async()=>{
  const h=await harness();try{
    assert.equal((await post(h,{eventType:'diagnosis_start',turnstileToken:'diagnosis_complete'})).status,403);
    assert.equal((await post(h,{eventType:'diagnosis_start',turnstileToken:'diagnosis_start|evil.example'})).status,403);
    assert.equal((await post(h,{eventType:'diagnosis_start',turnstileToken:'origin-token'},'https://evil.example')).status,403);
    assert.equal((await post(h,{eventType:'diagnosis_start',turnstileToken:'expired'})).status,403);
    assert.equal((await post(h,{eventType:'diagnosis_start',turnstileToken:'diagnosis_start'})).status,202);
    assert.equal((await post(h,{eventType:'diagnosis_start',turnstileToken:'diagnosis_start'})).status,403);
    const first=await post(h,{eventType:'diagnosis_start',turnstileToken:'replay'});assert.equal(first.status,403); // action mismatch consumes it.
    assert.equal((await post(h,{eventType:'diagnosis_start',turnstileToken:'replay'})).status,403);
    assert.equal((await post(h,{eventType:'diagnosis_start',turnstileToken:'siteverify-down'})).status,503);
    assert.equal((await post(h,{eventType:'diagnosis_start',turnstileToken:'diagnosis_start|service.atlib.jp',email:'pii@example.test'})).status,400);
    assert.equal(Number((await h.pool.query(`SELECT sum(event_count) n FROM business_kaizen_anonymous_kpi_daily`)).rows[0].n),1);
  }finally{await h.close()}
});

test('anonymous KPI atomically increments and staff read API observes JST/fiscal boundaries',async()=>{
  const h=await harness();try{
    const calls=Array.from({length:8},(_,index)=>post(h,{eventType:'diagnosis_start',turnstileToken:`diagnosis_start|service.atlib.jp`}));
    // The verifier models one-use tokens by token value, so direct service calls use distinct opaque tokens with a common action outcome.
    await Promise.all(calls); // only the first identical token is accepted.
    for(let index=0;index<7;index++){
      const token=`unique-${index}`;
      const service=new BusinessKaizenAnonymousKpiService(h.pool,h.service.config,async()=>({success:true,action:'diagnosis_start',hostname:'service.atlib.jp'}),()=>new Date('2026-01-31T15:00:00Z'));
      assert.equal(await service.receive({eventType:'diagnosis_start',turnstileToken:token},'https://service.atlib.jp'),'RECORDED');
    }
    assert.equal(Number((await h.pool.query(`SELECT event_count FROM business_kaizen_anonymous_kpi_daily WHERE event_type='diagnosis_start'`)).rows[0].event_count),8);
    assert.equal((await fetch(`${h.url}/api/admin/business-kaizen/anonymous-kpis?fiscalYear=2026`)).status,401);
    const response=await fetch(`${h.url}/api/admin/business-kaizen/anonymous-kpis?fiscalYear=2026&environment=TEST`,{headers:{cookie:h.cookie}});
    assert.equal(response.status,200);const body=await response.json() as any;
    assert.equal(body.period.from,'2026-02-01');assert.equal(body.period.to,'2027-01-31');
    assert.equal(body.items[0].diagnosisStartCount,8);assert.equal(body.items[0].eventCountRatio,0);
    assert.match(body.ratioMeaning,/not a person-level conversion rate/);
  }finally{await h.close()}
});

test('disabled anonymous KPI fails closed without affecting process startup',async()=>{
  const h=await harness();try{
    const disabled=new BusinessKaizenAnonymousKpiService(h.pool,{...h.service.config,enabled:false});
    assert.equal(await disabled.receive({eventType:'diagnosis_start',turnstileToken:'unused'},'https://service.atlib.jp'),'DISABLED');
    assert.equal(Number((await h.pool.query(`SELECT count(*) n FROM business_kaizen_anonymous_kpi_daily`)).rows[0].n),0);
  }finally{await h.close()}
});

test('anonymous KPI keeps Production and Test aggregates separate',async()=>{
  const h=await harness();try{
    const verify=async()=>({success:true,action:'diagnosis_complete',hostname:'service.atlib.jp'});
    const production=new BusinessKaizenAnonymousKpiService(h.pool,{...h.service.config,environment:'PRODUCTION',allowedOrigins:['https://service.atlib.jp'],allowedHostnames:['service.atlib.jp']},verify,()=>new Date('2026-02-10T00:00:00Z'));
    const testing=new BusinessKaizenAnonymousKpiService(h.pool,{...h.service.config,environment:'TEST',allowedOrigins:['https://service.atlib.jp'],allowedHostnames:['service.atlib.jp']},verify,()=>new Date('2026-02-10T00:00:00Z'));
    await production.receive({eventType:'diagnosis_complete',turnstileToken:'prod'},'https://service.atlib.jp');
    await testing.receive({eventType:'diagnosis_complete',turnstileToken:'test'},'https://service.atlib.jp');
    const prod=await production.read({from:'2026-02-01',to:'2026-02-28',environment:'PRODUCTION'});
    const testOnly=await production.read({from:'2026-02-01',to:'2026-02-28',environment:'TEST'});
    assert.equal(prod.items.length,1);assert.equal(prod.items[0]!.diagnosisCompleteCount,1);
    assert.equal(testOnly.items.length,1);assert.equal(testOnly.items[0]!.diagnosisCompleteCount,1);
    assert.notEqual(prod.items[0]!.environment,testOnly.items[0]!.environment);
  }finally{await h.close()}
});

test('anonymous KPI access log serializer omits IP and never sees body secrets',()=>{
  const serialized=safeAccessRequest({id:'request',method:'POST',url:'/api/public/business-kaizen/anonymous-events?ignored=yes',remoteAddress:'203.0.113.10'});
  assert.deepEqual(serialized,{id:'request',method:'POST',url:'/api/public/business-kaizen/anonymous-events'});
  assert.equal(JSON.stringify(serialized).includes('203.0.113.10'),false);
});
