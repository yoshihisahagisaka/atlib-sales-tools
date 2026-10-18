'use strict';
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
// Synthetic UI fixture only. No DB, external auth, live HTTP backend or external network.
async function main(){
 const browser=await chromium.launch({headless:true});let checks=0;
 try{for(const internal of [true,false])for(const width of [1280,390]){
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const aid='11111111-1111-4111-8111-111111111111',cid='22222222-2222-4222-8222-222222222222',tid='33333333-3333-4333-8333-333333333333';
  const affiliation={id:'affiliation',associationId:aid,companyId:cid,associationName:'検証用組合',companyName:'検証用企業',data:{active:true,contactName:'担当者'}};
  await page.route('https://pira.example.test/**',async route=>{
   const u=new URL(route.request().url());let file;
   if(u.pathname==='/admin/pira.html')file='public/admin/pira.html';else if(u.pathname==='/pira/')file='public/pira/index.html';
   else if(u.pathname==='/pira-assets/base.css')file='public/admin/partner-leads.css';else if(u.pathname.startsWith('/pira-assets/'))file='public'+u.pathname;
   if(file)return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(path.join(__dirname,'..',file),'utf8')});
   let body=[];if(u.pathname.endsWith('/session'))body={csrf:'synthetic-fixture-csrf',actor:{internal},memberships:[{associationId:internal?aid:null,companyId:internal?null:cid,associationName:'検証用組合',companyName:'検証用企業',data:{role:internal?'atlib_admin':'company_admin'}}]};
   else if(u.pathname.endsWith('/association'))body=[{id:aid,data:{name:'検証用組合'}}];
   else if(u.pathname.endsWith('/affiliation'))body=[affiliation];
   else if(u.pathname.endsWith('/terms'))body=[{id:tid,associationId:aid,data:{label:'検証用条件',service:'SEND',conditions:'検証用',baseMonthlyYen:1,unitMonthlyYen:1}}];
   else if(u.pathname.endsWith('/application'))body=[{id:'synthetic-application',associationId:aid,companyId:cid,companyName:'<img src=x onerror=alert(1)>',data:{number:'検証用申込',state:'SUBMITTED',service:'SEND'}}];
   await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('https://pira.example.test'+(internal?'/admin/pira.html':'/pira/'));await page.getByRole('status').filter({hasText:'読み込みました'}).waitFor();
  assert.equal(await page.locator('#list img').count(),0);assert.ok((await page.locator('#list').innerText()).includes('<img'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(!internal){assert.equal(await page.locator('#setup').count(),0);assert.equal(await page.locator('#applyFields select[name=associationId] option').innerText(),'検証用組合');assert.equal(await page.locator('#applyFields [name=companyId]').getAttribute('readonly'),'');}
  assert.deepEqual(errors,[]);checks++;await page.close();
 }}finally{await browser.close();}
 console.log(JSON.stringify({status:'PASS',checks,mode:'synthetic route-mocked browser, desktop/mobile, internal/company'}));
}
main().catch(e=>{console.error(JSON.stringify({status:'FAILED',reason:e.message}));process.exitCode=1;});
