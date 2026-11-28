// Real installed runtime, synthetic transport and loopback only. No DB/SMTP.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync,spawnSync}=require('node:child_process');
const express=require('/app/node_modules/express'),cookieParser=require('/app/node_modules/cookie-parser');
const {WscSalesService,renderWscPdf}=require('/app/dist/services/wscSalesService.js');
const {createAdminWebSecurityCheckRouter}=require('/app/dist/routes/adminWebSecurityCheck.js');
const {StaffAuthService}=require('/app/dist/services/staffAuthService.js');
const {requireStaffAuth}=require('/app/dist/middleware/staffAuth.js');
const serverCode=fs.readFileSync('/app/dist/server.js','utf8');
assert.match(serverCode,/app\.use\(['"]\/api\/admin\/web-security-check['"],\s*\.\.\.adminAuthGate,/);
assert.equal(require('/app/node_modules/zod/package.json').version,'4.6.7');
assert.equal(require('/app/node_modules/nodemailer/package.json').version,'10.6.1');
const now='2026-11-28T16:57:00.842Z';
const diagnosis={schemaVersion:'2.0',targetUrl:'https://example.org/',checkedAt:now,mailDomain:'example.org',
 http:{status:'OK',statusCode:200,headers:{'Strict-Transport-Security':'max-age=31536000','Content-Security-Policy':"default-src 'self'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'}},
 tls:{status:'VALIDATED',policyErrors:'None',negotiatedProtocol:'TLSv1.3',notAfter:'2027-01-01T00:00:00.000Z'},
 dns:{spf:{lookupStatus:'FOUND',records:['v=spf1 -all'],recordCount:1,checkedDomain:'example.org'},dmarc:{lookupStatus:'FOUND',records:['v=DMARC1; p=none'],recordCount:1,tags:{p:'none'},effectivePolicy:'none',checkedDomain:'example.org',policyDomain:'example.org',policyTag:'p'}}};
let calls=0,html='';
const service=new WscSalesService({lookup:async()=>[{address:'93.184.216.34'}],resolveTxt:async()=>[],networkExchange:async input=>{calls++;assert.equal(input.ip,'93.184.216.34');return {diagnosis};},renderPdf:async value=>{html=value;return renderWscPdf(value);}});
function pdfCheck(b,label){
 assert.ok(Buffer.isBuffer(b)&&b.length>10000,label+' PDF too small');
 assert.equal(b.subarray(0,5).toString(),'%PDF-');
 const pageCount=(b.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;
 assert.ok(pageCount>=4&&pageCount<=12,label+' invalid page count '+pageCount);
 return pageCount;
}
async function main(){
 const auth=new StaffAuthService('synthetic-only-'.repeat(4)),token=auth.issueSessionToken({email:'synthetic@example.invalid'});
 const app=express();app.use(express.json({limit:'2mb'}));app.use(cookieParser());
 app.use('/api/admin/web-security-check',requireStaffAuth(auth),createAdminWebSecurityCheckRouter(service));
 const server=app.listen(0,'127.0.0.1');
 try{
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)});
  const url='http://127.0.0.1:'+server.address().port+'/api/admin/web-security-check';
  const post=(route,body,cookie)=>fetch(url+route,{method:'POST',headers:{'content-type':'application/json',...(cookie?{cookie:'staff_session='+cookie}:{})},body:JSON.stringify(body)});
  const input={name:'検証株式会社',url:'https://example.org/'};
  assert.equal((await post('/diagnose',input)).status,401);
  assert.equal((await post('/diagnose',input,'invalid')).status,401);assert.equal(calls,0);
  assert.equal((await post('/diagnose',{name:'',url:input.url},token)).status,400);
  assert.equal((await post('/diagnose',{...input,url:'http://example.org/'},token)).status,422);assert.equal(calls,0);
  const csv=await post('/csv-validate',{source:'\uFEFF企業名,本店所在地,URL\n"検証,株式会社",,https://example.org/\nURLなし,,\n'},token);
  assert.equal(csv.status,200);const parsed=await csv.json();assert.equal(parsed.companies.length,1);assert.equal(parsed.companies[0].name,'検証,株式会社');assert.equal(parsed.errors.length,1);
  const response=await post('/diagnose',input,token);
  assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/^application\/pdf/);
  assert.match(response.headers.get('content-disposition'),/attachment; filename\*=UTF-8''/);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  const bytes=Buffer.from(await response.arrayBuffer());pdfCheck(bytes,'staff HTTP');assert.equal(calls,1);
  assert.match(html,/検証株式会社 御中/);assert.match(html,/通信の暗号化ができています/);assert.match(html,/2026年11月29日 01:57/);assert.match(html,/確認をおすすめします/);
  assert.doesNotMatch(html,/内部デザインレビュー用|原値：|data-finding-id/);
  console.log('STAFF_AUTH_CSV_REAL_PDF_HTTP=PASS');
 }finally{await new Promise(resolve=>server.close(resolve));}
 const dir=process.argv[2],names=fs.readdirSync(dir).filter(x=>x.endsWith('.html')).sort();assert.equal(names.length,29);
 const haveText=spawnSync('pdftotext',['-v'],{stdio:'ignore'}).status===0;
 for(const name of names){
  const h=fs.readFileSync(path.join(dir,name),'utf8');
  assert.doesNotMatch(h,/原値：|data-finding-id|内部デザインレビュー用/);
  const b=await renderWscPdf(h),pages=pdfCheck(b,name);
  if(haveText){
   const printed=execFileSync('pdftotext',['-raw','-','-'],{input:b,encoding:'utf8'}).normalize('NFKC').replace(/\s+/gu,'');
   assert.match(printed,/検証株式会社御中/);assert.match(printed,/2026年11月29日01:57/);
  }
  console.log('STAFF_PRINT_PASS='+name+'; PAGES='+pages);
 }
 console.log('STAFF_CHROMIUM_PDFS=29; PDF_TEXT_EXTRACTION='+String(haveText)+'; STAFF_PDF_GENERATION=PASS');
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
