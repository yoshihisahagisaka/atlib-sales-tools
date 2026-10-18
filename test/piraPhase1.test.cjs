const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const express=require('express'),cookieParser=require('cookie-parser');
const {PgPiraStore}=require('../dist/pira/pgStore');
const {PiraService}=require('../dist/pira/service');
const {row,staffId,key}=require('../dist/pira/model');
const {piraApi,piraErrors}=require('../dist/pira/routes');
const {externalGate,issueExternalSession,externalActor,externalAuthRouter}=require('../dist/pira/auth');
const {deliverPiraNotice}=require('../dist/pira/notifications');
const {mountPira}=require('../dist/pira/mount');
const {deliverSlackNotification,sendSlackNotification}=require('../dist/services/slackNotifier');
const actor={id:staffId('fixture-admin@atlib.jp'),internal:true};
const config={origin:'https://pira.example.test',sessionSecret:'test-only-pira-secret-00000000000000000000000',clientId:'fixture-client',clientSecret:'fixture-only',production:false};

// Embedded PostgreSQL WASM, in memory only. Not a real PostgreSQL server or Production.
// One connection queue simulates pool checkout. Advisory lock SQL is inspected but not
// executed: cross-process locking, runtime-role ACL and real PG concurrency remain gated.
async function fixture(){
 const db=new PGlite();await db.exec('CREATE TABLE company(id UUID PRIMARY KEY,name TEXT NOT NULL,corporate_number TEXT,created_by_user_id TEXT NOT NULL,owner_user_id TEXT NOT NULL); CREATE TABLE estimates(id UUID PRIMARY KEY,status TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL)');
 await db.exec(fs.readFileSync(require.resolve('../docs/pira-phase1-schema.draft.sql'),'utf8'));
 let tail=Promise.resolve();const queries=[];
 const pool={connect:async()=>{const previous=tail;let release;tail=new Promise(r=>release=r);await previous;return{
  query:async(sql,args)=>{queries.push(sql);if(sql.startsWith('SELECT pg_advisory_xact_lock'))return{rows:[],rowCount:1};const r=await db.query(sql,args);return{...r,rowCount:r.affectedRows??r.rows.length};},release};}};
 const store=new PgPiraStore(pool),svc=new PiraService(store,()=> '2026-10-18T11:00:00.000Z');
 await store.transaction('bootstrap',async tx=>{await tx.save('principal',row({email:'fixture-admin@atlib.jp',active:true,internal:true},null,null,actor.id));await tx.save('membership',row({principalId:actor.id,role:'atlib_admin',active:true},null,null,key('bootstrap')));});
 const a=await svc.saveAssociation(actor,{name:'組合A',email:'union-a@example.test',contactName:'担当A'}),b=await svc.saveAssociation(actor,{name:'組合B',email:'union-b@example.test',contactName:'担当B'});
 const company=await svc.resolveCompany(actor,{associationId:a.id,name:'利用企業A',verifiedReference:'verified-fixture-a',evidence:'synthetic fixture proof',contactName:'担当',contactEmail:'customer@example.test'});
 const companyB=await svc.resolveCompany(actor,{associationId:b.id,name:'利用企業B',verifiedReference:'verified-fixture-b',evidence:'synthetic fixture proof',contactName:'担当',contactEmail:'customer-b@example.test'});
 for(const m of [{email:'customer@example.test',role:'company_admin',companyId:company.companyId},{email:'union-a@example.test',role:'association_admin',associationId:a.id},{email:'union-a-staff@example.test',role:'association_staff',associationId:a.id},{email:'union-b@example.test',role:'association_admin',associationId:b.id}])await svc.grant(actor,m);
 const customer=await svc.bindGoogle('https://accounts.google.com','fixture-customer-sub','customer@example.test');
 const union=await svc.bindGoogle('https://accounts.google.com','fixture-union-sub','union-a@example.test');
 const staff=await svc.bindGoogle('https://accounts.google.com','fixture-staff-sub','union-a-staff@example.test');
 const other=await svc.bindGoogle('https://accounts.google.com','fixture-other-sub','union-b@example.test');
 const terms=await svc.approveTerms(actor,{associationId:a.id,service:'SEND',label:'fixture-only offer',baseMonthlyYen:3500,unitMonthlyYen:300,initialYen:0,minQuantity:1,maxQuantity:100,conditions:'テスト条件。実価格ではありません。'});
 const input={associationId:a.id,companyId:company.companyId,termsId:terms.id,quantity:5,requestId:'submit-fixture',acceptedTerms:true};
 return{db,svc,store,queries,a,b,company,companyB,customer,union,staff,other,terms,input,close:()=>db.close()};
}
async function withFixture(fn){const h=await fixture();try{await fn(h);}finally{await h.close();}}
// Sandbox denies loopback connect (EACCES). Exercise real Express/Node request and response
// objects without a listening socket. This is not a network or browser E2E test.
async function server(app,fn){
 const {Duplex}=require('node:stream'),{IncomingMessage,ServerResponse}=require('node:http');
 const inject=async(url,options={})=>new Promise((resolve,reject)=>{
  const socket=new Duplex({read(){},write(_chunk,_enc,cb){cb();}});socket.remoteAddress='127.0.0.1';
  const q=new IncomingMessage(socket),u=new URL(url);q.method=options.method||'GET';q.url=u.pathname+u.search;q.headers=Object.fromEntries(Object.entries(options.headers||{}).map(([k,v])=>[k.toLowerCase(),v]));q.headers.host=u.host;
  if(options.body)q.headers['content-length']=String(Buffer.byteLength(options.body));
  // Parsed-body adapter: stream parsing is outside this socket-free HTTP harness.
  if(options.body){q.body=JSON.parse(options.body);q._body=true;}
  const s=new ServerResponse(q);s.assignSocket(socket);const chunks=[];const write=s.write.bind(s),end=s.end.bind(s);
  s.write=(chunk,...args)=>{if(chunk)chunks.push(Buffer.from(chunk));return write(chunk,...args);};s.end=(chunk,...args)=>{if(chunk)chunks.push(Buffer.from(chunk));return end(chunk,...args);};
  const timeout=setTimeout(()=>reject(Error('in-process request timed out: '+q.method+' '+q.url)),5000);
  s.on('finish',()=>{clearTimeout(timeout);const body=Buffer.concat(chunks).toString();resolve({status:s.statusCode,headers:{get:k=>s.getHeader(k)},json:async()=>JSON.parse(body),text:async()=>body});});s.on('error',reject);
  app(q,s);if(options.body)q.push(options.body);q.push(null);
 });
 return fn('http://fixture.test',inject);
}
const rejects=(fn,code)=>assert.rejects(fn,e=>e.code===code);

test('company submission, association scope, order and immutable price snapshot persist atomically',()=>withFixture(async h=>{
 const app=await h.svc.submit(h.customer,h.input);assert.equal(app.associationId,h.a.id);
 assert.equal((await h.svc.list(h.union,'application',h.a.id)).length,1);
 await rejects(()=>h.svc.detail(h.other,'application',app.id),'ACCESS_DENIED');
 await rejects(()=>h.svc.confirmOrder(h.staff,app.id,{version:1,requestId:'no'}),'ACCESS_DENIED');
 const o=await h.svc.confirmOrder(h.union,app.id,{version:1,requestId:'order'});
 assert.equal((await h.svc.list(actor,'order'))[0].id,o.id);assert.deepEqual(o.data.snapshot.quantity,5);assert.equal(o.data.snapshot.unitMonthlyYen,300);
 await assert.rejects(h.db.query("UPDATE pira_order SET data='{}' WHERE id=$1",[o.id]),/append-only/);
 await rejects(()=>h.svc.transition(h.customer,app.id,{version:2,action:'cancel',reason:'after order'}),'INVALID_TRANSITION');
 assert.ok(h.queries.some(q=>q.includes('pg_advisory_xact_lock')));
}));
test('parallel order retries produce one order; changed retry and AUTO cannot create another',()=>withFixture(async h=>{
 const a=await h.svc.submit(h.customer,h.input);
 const orders=await Promise.all(Array.from({length:20},()=>h.svc.confirmOrder(h.union,a.id,{version:1,requestId:'same'})));
 assert.equal(new Set(orders.map(o=>o.id)).size,1);assert.equal((await h.svc.list(actor,'order')).length,1);
 await rejects(()=>h.svc.confirmOrder(h.union,a.id,{version:1,requestId:'different'}),'ALREADY_ORDERED');
 await rejects(()=>h.svc.confirmOrder(h.union,a.id,{version:1,requestId:'same',mode:'AUTO'}),'AUTO_NOT_ENABLED');
 assert.equal((await h.db.query("SELECT count(*)::int AS n FROM pira_audit WHERE data->>'action'='order_confirmed'")).rows[0].n,1);
}));
test('submission retry, return/revise/cancel history and stale versions',()=>withFixture(async h=>{
 const a=await h.svc.submit(h.customer,h.input);assert.equal((await h.svc.submit(h.customer,h.input)).id,a.id);
 await rejects(()=>h.svc.submit(h.customer,{...h.input,quantity:6}),'IDEMPOTENCY_CONFLICT');
 const returned=await h.svc.transition(h.staff,a.id,{version:1,action:'return',reason:'数量の確認をお願いします'});assert.equal(returned.data.state,'RETURNED');
 await rejects(()=>h.svc.revise(h.customer,a.id,{version:1,termsId:h.terms.id,quantity:6,acceptedTerms:true}),'VERSION_CONFLICT');
 const revised=await h.svc.revise(h.customer,a.id,{version:2,termsId:h.terms.id,quantity:6,acceptedTerms:true});assert.equal(revised.data.snapshot.quantity,6);
 await h.svc.transition(h.customer,a.id,{version:3,action:'cancel',reason:'不要になりました'});
 const actions=(await h.svc.history(h.union,a.id)).map(r=>r.action);assert.ok(actions.includes('application_return')&&actions.includes('application_revised')&&actions.includes('application_cancel'));
}));
test('company spoofing, association leaks, pending invitations, revoked principals and identity rebinding deny',()=>withFixture(async h=>{
 await rejects(()=>h.svc.submit(h.customer,{...h.input,companyId:h.companyB.companyId}),'ACCESS_DENIED');
 await rejects(()=>h.svc.list(h.customer,'application'),'SCOPE_REQUIRED');
 assert.equal((await h.svc.list(h.customer,'affiliation',h.b.id,h.company.companyId)).length,0);
 await rejects(()=>h.svc.list(h.customer,'terms',h.b.id,h.company.companyId),'AFFILIATION_REQUIRED');
 assert.equal((await h.svc.list(h.customer,'terms',h.a.id,h.company.companyId)).length,1);
 await rejects(()=>h.svc.bindGoogle('https://accounts.google.com','unknown-sub','unknown@example.test'),'INVITATION_REQUIRED');
 await rejects(()=>h.svc.bindGoogle('https://accounts.google.com','different-sub','customer@example.test'),'IDENTITY_MISMATCH');
 await h.svc.grant(actor,{email:'union-a@example.test',role:'association_admin',associationId:h.a.id,active:false});
 await rejects(()=>h.svc.list(h.union,'application',h.a.id),'ACCESS_DENIED');
}));
test('existing companies are reviewed, identity/external mappings dedupe and never onboard',()=>withFixture(async h=>{
 const again=await h.svc.resolveCompany(actor,{associationId:h.a.id,name:'別名',verifiedReference:'verified-fixture-a',evidence:'確認済み',contactName:'担当',contactEmail:'customer@example.test'});assert.equal(again.companyId,h.company.companyId);
 const input={companyId:h.company.companyId,service:'INFRAVISION',environment:'production',externalId:randomUUID(),customerCode:'atlse000001',evidence:'既存UUID/codeを手動照合'};
 await h.svc.linkExternal(actor,input);await h.svc.linkExternal(actor,input);
 await rejects(()=>h.svc.linkExternal(actor,{...input,companyId:h.companyB.companyId}),'EXTERNAL_ID_ALREADY_LINKED');
 await rejects(()=>h.svc.resolveCompany(actor,{associationId:h.a.id,name:'名前のみ',evidence:'名前一致',contactName:'担当',contactEmail:'fixture@example.test'}),'INVALID_INPUT');
 assert.equal((await h.db.query('SELECT count(*)::int AS n FROM company')).rows[0].n,2);
}));
test('InfraVision requires confirmed unchanged estimate; Guard remains explicitly unbillable',()=>withFixture(async h=>{
 const id=randomUUID(),input={associationId:h.a.id,companyId:h.company.companyId,service:'INFRAVISION',estimateId:id,label:'個別見積',baseMonthlyYen:10000,unitMonthlyYen:0,initialYen:50000,minQuantity:1,maxQuantity:1,conditions:'承認条件'};
 await rejects(()=>h.svc.approveTerms(actor,input),'CONFIRMED_ESTIMATE_REQUIRED');
 await h.db.query("INSERT INTO estimates VALUES($1,'confirmed',now())",[id]);const t=await h.svc.approveTerms(actor,input);
 const a=await h.svc.submit(h.customer,{...h.input,requestId:'infra',termsId:t.id,quantity:1});
 await h.db.query("UPDATE estimates SET updated_at=updated_at+interval '1 second' WHERE id=$1",[id]);
 await rejects(()=>h.svc.confirmOrder(h.union,a.id,{version:1,requestId:'infra-order'}),'ESTIMATE_CHANGED');
 const g=await h.svc.approveTerms(actor,{...input,service:'GUARD',estimateId:undefined,companyId:undefined,label:'数量未確定'});
 assert.equal(g.data.billingQuantityConfirmed,false);
}));
test('notification missing config/failure does not lose business; durable retry, no secrets, separate mail and Slack',()=>withFixture(async h=>{
 const a=await h.svc.submit(h.customer,h.input),o=await h.svc.confirmOrder(h.union,a.id,{version:1,requestId:'order'});
 const notices=await h.store.transaction('read',tx=>tx.list('outbox'));assert.equal(notices.length,3);
 const n=notices.find(n=>n.data.destination==='slack');assert.equal(await deliverPiraNotice(h.store,n.id,{},config.origin),'unconfigured');
 let at=Date.now(),messages=[];assert.equal(await deliverPiraNotice(h.store,n.id,{slack:async()=>{throw Error('SECRET must not persist');}},config.origin,()=>at),'pending');
 at+=120000;assert.equal(await deliverPiraNotice(h.store,n.id,{slack:async s=>{messages.push(s);return true;}},config.origin,()=>at),'sent');
 assert.equal(messages.length,1);assert.match(messages[0],/admin\/pira.html/);assert.doesNotMatch(JSON.stringify(await h.store.transaction('read',tx=>tx.get('outbox',n.id))),/SECRET/);
 assert.equal((await h.svc.detail(actor,'application',a.id)).data.state,'ORDERED');assert.equal((await h.svc.detail(actor,'order',o.id)).id,o.id);
 const mail=notices.find(n=>n.data.destination==='association_email');let recipients=[];await deliverPiraNotice(h.store,mail.id,{email:async address=>recipients.push(address)},config.origin,()=>at);assert.deepEqual(recipients,['union-a@example.test']);
}));
test('audit insertion failure rolls back application and outbox; cross-scope FK and fact ACL design',()=>withFixture(async h=>{
 await h.db.exec("CREATE FUNCTION fixture_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture audit unavailable'; END $$; CREATE TRIGGER fixture_fail BEFORE INSERT ON pira_audit FOR EACH ROW EXECUTE FUNCTION fixture_fail_audit()");
 await assert.rejects(h.svc.submit(h.customer,h.input),/fixture audit unavailable/);
 assert.equal((await h.db.query('SELECT count(*)::int AS n FROM pira_application')).rows[0].n,0);assert.equal((await h.db.query('SELECT count(*)::int AS n FROM pira_outbox')).rows[0].n,0);
 await h.db.exec('DROP TRIGGER fixture_fail ON pira_audit');const a=await h.svc.submit(h.customer,h.input);
 await assert.rejects(h.db.query("INSERT INTO pira_order(id,version,association_id,company_id,data) VALUES($1,1,$2,$3,$4)",[randomUUID(),h.b.id,h.companyB.companyId,{applicationId:a.id,approvalMode:'MANUAL',number:'bad'}]),/foreign key/);
}));
test('HTTP auth separates external/staff cookies, denies forged price, CSRF and unauthorized order',()=>withFixture(async h=>{
 const app=express();app.use(express.json(),cookieParser());app.use('/pira/api',externalGate(config,h.svc),piraApi(h.svc,false,config));app.use(piraErrors);
 const csrf='fixture-csrf-0000000000000000000000',cookie='pira_session='+issueExternalSession(config.sessionSecret,h.customer,csrf);
 await server(app,async(url,fetch)=>{
  const post=(path,body,headers={})=>fetch(url+'/pira/api'+path,{method:'POST',headers:{cookie,origin:config.origin,'x-pira-csrf':csrf,'content-type':'application/json',...headers},body:JSON.stringify(body)});
  assert.equal((await fetch(url+'/pira/api/session',{headers:{cookie:'staff_session=fixture'}})).status,401);
  assert.equal((await post('/applications',{...h.input,unitMonthlyYen:1})).status,400);
  assert.equal((await post('/applications',h.input,{origin:'https://evil.example.test'})).status,403);
  const r=await post('/applications',h.input);assert.equal(r.status,201);const a=await r.json();
  assert.equal((await post('/applications/'+a.id+'/order',{version:1,requestId:'forged'})).status,403);
  assert.equal((await post('/associations',{})).status,404);
 });
 assert.throws(()=>externalActor('different-secret-00000000000000000000',cookie.split('=')[1]),/NOT_AUTHENTICATED/);
}));
test('Google entry reuses PKCE, fixed redirect, nonce; no unauthenticated JIT callback',()=>withFixture(async h=>{
 const app=express();app.use(cookieParser());app.use('/pira/auth',externalAuthRouter(config,h.svc));
 await server(app,async(url,fetch)=>{
  const login=await fetch(url+'/pira/auth/login',{redirect:'manual'});assert.equal(login.status,302);const dest=new URL(login.headers.get('location'));assert.equal(dest.searchParams.get('redirect_uri'),config.origin+'/pira/auth/callback');assert.equal(dest.searchParams.get('code_challenge_method'),'S256');assert.ok(dest.searchParams.get('nonce'));
  assert.equal((await fetch(url+'/pira/auth/callback?code=fixture&state=fixture')).status,403);
 });
}));
test('feature disabled leaves new API and UI closed; shared Slack best-effort compatibility',async()=>{
 const app=express();mountPira(app,{},[],config.origin,'staff-secret',{});await server(app,async(url,fetch)=>{for(const p of ['/api/admin/pira/session','/pira/','/admin/pira.html'])assert.equal((await fetch(url+p)).status,404);});
 assert.equal(await deliverSlackNotification(undefined,'fixture'),false);assert.equal(await sendSlackNotification(undefined,'fixture'),undefined);
});
test('legacy staff gate and estimates remain independent from external PIRA session',async()=>{
 const {StaffAuthService}=require('../dist/services/staffAuthService'),{requireStaffAuth}=require('../dist/middleware/staffAuth'),{createAdminEstimatesRouter}=require('../dist/routes/adminEstimates');
 const auth=new StaffAuthService('fixture-staff-secret-only'),app=express();app.use(cookieParser());mountPira(app,{},[requireStaffAuth(auth)],config.origin,'fixture-staff-secret-only',{});
 app.use('/api/admin/estimates',requireStaffAuth(auth),createAdminEstimatesRouter({list:async()=>({items:[{id:'fixture-estimate',title:'既存見積'}],total:1})}));
 await server(app,async(url,fetch)=>{
  assert.equal((await fetch(url+'/api/admin/estimates')).status,401);
  const external='pira_session='+issueExternalSession(config.sessionSecret,{id:'fixture',internal:false},'fixture-csrf');
  assert.equal((await fetch(url+'/api/admin/estimates',{headers:{cookie:external}})).status,401);
  const r=await fetch(url+'/api/admin/estimates',{headers:{cookie:'staff_session='+auth.issueSessionToken({email:'staff@atlib.jp'})}});assert.equal(r.status,200);assert.equal((await r.json()).items[0].id,'fixture-estimate');
 });
});
for(const name of ['real PostgreSQL concurrent transactions + runtime-role ACL + actual ledger','live Google invitation login + IdP revocation','Slack dedicated webhook + SMTP actual delivery','Production revision/image and real company duplicate preflight'])test(name,{skip:'Requires separately available credentials/environment; no real DB/Cloud/IdP/SMTP action authorized or performed'},()=>{});

module.exports={fixture,withFixture,server,config,actor};
