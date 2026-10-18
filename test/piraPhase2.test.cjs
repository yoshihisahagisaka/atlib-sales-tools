'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
// Retain and execute Phase 1 acceptance tests; only fixture exports were added there.
const {withFixture,server,config,actor}=require('./piraPhase1.test.cjs');
const {createCore}=require('../dist/pira/core'),{createPortal}=require('../dist/pira/portal');
const {mountPira}=require('../dist/pira/mount'),{issueExternalSession}=require('../dist/pira/auth');
const {allowedPath}=require('../dist/pira/boundary'),{portalConfig}=require('../dist/pira/runtimeConfig');
const {LimitedSalesReferences}=require('../dist/pira/salesReferences'),{SalesCompanyCommands}=require('../dist/pira/salesCommands');
const {deliverPiraNotice}=require('../dist/pira/notifications');
const express=require('express'),cookieParser=require('cookie-parser');
const callers={portal:{subject:'101',email:'portal@example.test'},sales:{subject:'202',email:'sales@example.test'}};
const verify=async token=>{if(!['portal','sales'].includes(token))throw Error('invalid');return callers[token];};
const salesOrigin='https://sales.example.test';
const cookie=a=>'pira_session='+issueExternalSession(config.sessionSecret,a,'csrf-fixture-00000000000000000');
function transportFor(core,kind='portal',capture=[]){return async r=>{
 capture.push(r);return server(core,async(url,inject)=>{const res=await inject(url+r.path,{method:r.method,headers:{...r.headers,authorization:'Bearer '+kind},body:r.body});
 return {status:res.status,body:await res.text(),headers:{location:res.headers.get('location')},cookies:[].concat(res.headers.get('set-cookie')||[])};});
};}
function core(h){return createCore(h.svc,config,salesOrigin,callers,verify);}

test('portal rejects internal routes, generic proxy paths and privileged configuration',async()=>{
 let calls=0;const portal=createPortal(async()=>{calls++;throw Error('must not call');},config.origin);
 await server(portal,async(url,inject)=>{for(const p of ['/api/admin/pira/session','/admin/pira.html','/auth/login','/internal/api/session','/pira/api/records/principal','/pira/api/companies','/pira/api/../../admin'])assert.equal((await inject(url+p)).status,404);});
 assert.equal(calls,0);for(const p of ['/../internal','//internal','/%2e%2e/internal','/applications/a%2forder'])assert.equal(allowedPath('GET',p),false);
 for(const k of ['DATABASE_URL','PIRA_DB_PASSWORD','PIRA_SESSION_SECRET','PIRA_GOOGLE_CLIENT_SECRET','SMTP_PASSWORD','PIRA_SMTP_PASSWORD'])assert.throws(()=>portalConfig({[k]:'fixture'}),/PRIVILEGED_PORTAL_CONFIGURATION/);
});
test('core requires machine auth independently of user cookie; caller cannot switch route or actor channel',()=>withFixture(async h=>{
 await server(core(h),async(url,inject)=>{
  assert.equal((await inject(url+'/external/api/session',{headers:{cookie:cookie(h.customer)}})).status,401);
  assert.equal((await inject(url+'/external/api/session',{headers:{authorization:'Bearer invalid'}})).status,401);
  assert.equal((await inject(url+'/internal/api/session',{headers:{authorization:'Bearer portal','x-pira-staff-email':'fixture-admin@atlib.jp'}})).status,403);
  assert.equal((await inject(url+'/external/api/session',{headers:{authorization:'Bearer sales',cookie:cookie(h.customer)}})).status,403);
  assert.equal((await inject(url+'/external/api/session',{headers:{authorization:'Bearer portal',cookie:'staff_session=fixture'}})).status,401);
  assert.equal((await inject(url+'/internal/api/session',{headers:{authorization:'Bearer sales','x-pira-staff-email':'unregistered@atlib.jp'}})).status,403);
 });
}));
test('portal/core chain preserves scope, CSRF, atomic order snapshot, audit/outbox and idempotency',()=>withFixture(async h=>{
 const captures=[],portal=createPortal(transportFor(core(h),'portal',captures),config.origin);
 await server(portal,async(url,inject)=>{
  const req=(p,body,a=h.customer,extra={})=>inject(url+'/pira/api'+p,{method:body?'POST':'GET',headers:{cookie:cookie(a)+'; staff_session=must-not-forward',origin:config.origin,'x-pira-csrf':'csrf-fixture-00000000000000000','content-type':'application/json',authorization:'Bearer forged','x-pira-staff-email':'fixture-admin@atlib.jp',...extra},body:body?JSON.stringify(body):undefined});
  assert.equal((await req('/session')).status,200);
  assert.equal((await req('/applications',h.input,h.customer,{origin:'https://evil.test'})).status,403);
  assert.equal((await req('/applications',{...h.input,baseMonthlyYen:0})).status,400);
  const response=await req('/applications',h.input);assert.equal(response.status,201);const a=await response.json();
  assert.equal((await req('/applications/'+a.id,undefined,h.other)).status,403);
  assert.equal((await req('/applications',{...h.input,companyId:h.companyB.companyId})).status,403);
  assert.equal((await req('/applications/'+a.id+'/order',{version:1,requestId:'no'},h.staff)).status,403);
  const request={version:1,requestId:'phase2-order'};
  const orders=await Promise.all(Array.from({length:8},()=>req('/applications/'+a.id+'/order',request,h.union)));
  assert.ok(orders.every(r=>r.status===200));const bodies=await Promise.all(orders.map(r=>r.json()));assert.equal(new Set(bodies.map(r=>r.id)).size,1);
  assert.equal(bodies[0].data.snapshot.quantity,5);assert.equal(bodies[0].data.snapshot.unitMonthlyYen,300);
  await assert.rejects(h.db.query("UPDATE pira_order SET data='{}' WHERE id=$1",[bodies[0].id]),/append-only/);
  const audits=await h.db.query("SELECT data FROM pira_audit WHERE data->>'action'='order_confirmed'");assert.equal(audits.rows.length,1);assert.equal(audits.rows[0].data.machine,'101');assert.ok(audits.rows[0].data.requestId);
  assert.equal((await h.db.query('SELECT count(*)::int n FROM pira_outbox')).rows[0].n,3);
 });
 assert.ok(captures.every(r=>r.path.startsWith('/external/')));assert.ok(captures.every(r=>!r.headers['x-pira-staff-email']&&!r.headers.authorization&&!r.headers.cookie?.includes('staff_session')));
}));
test('membership revocation is rechecked through portal/core on each request',()=>withFixture(async h=>{
 const portal=createPortal(transportFor(core(h)),config.origin);await server(portal,async(url,inject)=>{
  const get=()=>inject(url+'/pira/api/session',{headers:{cookie:cookie(h.customer)}});assert.equal((await get()).status,200);
  await h.db.query("UPDATE pira_membership SET data=jsonb_set(data,'{active}','false') WHERE data->>'principalId'=$1",[h.customer.id]);assert.equal((await get()).status,403);
 });
}));
test('Sales staff session stays local; Sales SA context enables atLIB order visibility, not union order approval',()=>withFixture(async h=>{
 const {StaffAuthService}=require('../dist/services/staffAuthService'),{requireStaffAuth}=require('../dist/middleware/staffAuth');
 const auth=new StaffAuthService('fixture-staff-only'),app=express();app.use(cookieParser());app.use(express.json());
 const capture=[];mountPira(app,{},[requireStaffAuth(auth)],salesOrigin,'fixture-staff-only',{PIRA_ENABLED:'true',PIRA_EXTERNAL_ENABLED:'true'},transportFor(core(h),'sales',capture));
 const a=await h.svc.submit(h.customer,h.input);await h.svc.confirmOrder(h.union,a.id,{version:1,requestId:'fixture-order'});
 await server(app,async(url,inject)=>{
  assert.equal((await inject(url+'/pira/')).status,404);
  assert.equal((await inject(url+'/api/admin/pira/session',{headers:{cookie:cookie(h.customer)}})).status,401);
  const staffCookie='staff_session='+auth.issueSessionToken({email:'fixture-admin@atlib.jp'});
  const r=await inject(url+'/api/admin/pira/records/order',{headers:{cookie:staffCookie}});assert.equal(r.status,200);assert.equal((await r.json()).length,1);
  assert.equal((await inject(url+'/api/admin/pira/associations',{method:'POST',headers:{cookie:staffCookie,origin:'https://evil.test','content-type':'application/json'},body:'{}'})).status,403);
 });
 assert.ok(capture.every(r=>!r.headers.cookie));
}));
test('OAuth proxy only relays dedicated cookies and approved redirects',()=>withFixture(async h=>{
 const portal=createPortal(transportFor(core(h)),config.origin);await server(portal,async(url,inject)=>{
  const r=await inject(url+'/pira/auth/login');assert.equal(r.status,302);assert.ok([].concat(r.headers.get('set-cookie')).every(v=>v.startsWith('pira_oauth_state=')));const dest=new URL(r.headers.get('location'));assert.equal(dest.searchParams.get('redirect_uri'),config.origin+'/pira/auth/callback');assert.equal(dest.searchParams.get('code_challenge_method'),'S256');
 });
 const bad=createPortal(async()=>({status:302,body:'',cookies:[],headers:{location:'https://evil.test'}}),config.origin);await server(bad,async(url,inject)=>assert.equal((await inject(url+'/pira/auth/login')).status,502));
}));
test('Sales company creation retries reuse deterministic verified ID; core references reject writes',()=>withFixture(async h=>{
 const pool={connect:async()=>({query:async(s,p)=>s.startsWith('SELECT pg_advisory')?{rows:[]}:h.db.query(s,p),release(){}})};
 const commands=new SalesCompanyCommands(pool);const input={name:'Synthetic new company',verifiedReference:'human-reviewed-fixture',evidence:'fixture'};
 const a=await commands.resolve(input,'fixture-admin@atlib.jp'),b=await commands.resolve(input,'fixture-admin@atlib.jp');assert.equal(a.companyId,b.companyId);
 await assert.rejects(commands.resolve({...input,name:'conflicting retry'},'fixture-admin@atlib.jp'),/COMPANY_RETRY_CONFLICT/);
 await assert.rejects(new LimitedSalesReferences().create(),/SALES_COMPANY_ID_REQUIRED/);
}));
test('limited estimate projection requires human-reviewed company and exact revision',()=>withFixture(async h=>{
 const ddl=fs.readFileSync(path.join(__dirname,'../docs/pira-phase2-reference-acl.draft.sql'),'utf8');await h.db.exec(ddl.slice(0,ddl.indexOf('-- Explicit revocation'))+'COMMIT;');
 const {randomUUID}=require('node:crypto');const id=randomUUID();await h.db.query("INSERT INTO estimates(id,status,updated_at) VALUES($1,'confirmed',now())",[id]);
 const commands=new SalesCompanyCommands({connect:async()=>({query:(s,p)=>h.db.query(s,p),release(){}})});
 await commands.bindEstimate({estimateId:id,companyId:h.company.companyId},'fixture-admin@atlib.jp','reviewed fixture');
 const refs=new LimitedSalesReferences(),client={query:(s,p)=>h.db.query(s,p)};
 assert.ok(await refs.estimate(client,id,h.company.companyId));assert.equal(await refs.estimate(client,id,h.companyB.companyId),null);
 await h.db.query("UPDATE estimates SET updated_at=updated_at+interval '1 second' WHERE id=$1",[id]);assert.equal(await refs.estimate(client,id,h.company.companyId),null);
}));
test('notification failures retain business state and separate portal/Sales links',()=>withFixture(async h=>{
 const a=await h.svc.submit(h.customer,h.input);await h.svc.confirmOrder(h.union,a.id,{version:1,requestId:'notify-order'});
 const notices=(await h.db.query('SELECT id,data FROM pira_outbox')).rows;let messages=[];
 for(const n of notices)await deliverPiraNotice(h.store,n.id,{slack:async m=>{messages.push(m);return false;},email:async(_a,_s,m)=>{messages.push(m);throw Error('fixture failure');}},{portal:config.origin,sales:salesOrigin});
 assert.equal((await h.svc.list(actor,'order')).length,1);assert.equal((await h.db.query("SELECT count(*)::int n FROM pira_outbox WHERE data->>'state'='pending'")).rows[0].n,3);
 assert.ok(messages.some(m=>m.includes(config.origin+'/pira/')));assert.ok(messages.some(m=>m.includes(salesOrigin+'/admin/pira.html')));
}));
test('portal runtime import graph contains no DB, Sales server, staff auth or notification worker',()=>{
 const seen=new Set();function walk(file){file=path.resolve(file);if(seen.has(file))return;seen.add(file);const code=fs.readFileSync(file,'utf8');assert.ok(!/require\(["'](?:pg|.*server|.*pgStore|.*staffAuth|.*mailer|.*notifications)["']\)/.test(code),file);for(const match of code.matchAll(/require\(["'](\.[^"']+)["']\)/g)){const dep=path.resolve(path.dirname(file),match[1]+'.js');if(fs.existsSync(dep))walk(dep);}}
 walk(path.join(__dirname,'../dist/pira/portal.js'));const external=fs.readFileSync(path.join(__dirname,'../public/pira-assets/external.js'),'utf8');assert.ok(!external.includes('/api/admin/'));assert.ok(!external.includes('function setup(){const'));assert.ok(!external.includes('/memberships'));
});
test('notifier repository updates existing outbox without INSERT privilege and denies other business writes',async()=>{
 const {PgPiraStore}=require('../dist/pira/pgStore');const queries=[];
 const pool={connect:async()=>({query:async(sql)=>{queries.push(sql);return{rows:[{id:'notice'}],rowCount:1};},release(){}})};
 const store=new PgPiraStore(pool,new LimitedSalesReferences(),true);
 await store.transaction('fixture',tx=>tx.save('outbox',{id:'notice',version:2,associationId:null,companyId:null,data:{state:'pending'}}));
 assert.ok(queries.some(sql=>sql.startsWith('UPDATE pira_outbox')));assert.ok(!queries.some(sql=>sql.startsWith('INSERT INTO pira_outbox')));
 await assert.rejects(store.transaction('fixture',tx=>tx.save('application',{id:'app',version:1,data:{}})),/NOTIFIER_SCOPE_DENIED/);
});
for(const title of ['Cloud Run IAM/ingress/private VPC route and real SA tokens','real PostgreSQL runtime ACL/advisory locking/ledger/restore','live Google OAuth/PKCE and non-Google user decision','live Slack and SMTP delivery'])test('UNVERIFIED: '+title,{skip:'Local mocks/PGlite only; no real Cloud/DB/OAuth/notification action'},()=>{});
