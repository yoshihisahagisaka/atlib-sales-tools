import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdirSync} from 'node:fs';
import { chromium } from 'playwright';
import { createSecumieGeneralRuntime } from '../src/runtime/secumieGeneralRuntime';
import { ConsultationHandoff, SECUMIE_SCHEDULE_URLS, type ConsultationNotice } from '../src/services/secumieConsultationHandoff';
import { WscHtmlService } from '../src/services/wscHtmlService';

const origin='https://service.atlib.jp';
for(const kind of ['WEB','INSIGHT'] as const) test('general '+kind+' browser diagnosis, print and consultation',async()=>{
 const notices:ConsultationNotice[]=[];
 const root=process.cwd(), insightDir=path.join(root,'prototypes/pira-union-diagnosis-v2');
 const content=require(path.join(insightDir,'v6-content.js'));
 const v6=require(path.join(insightDir,'v6.js'));
 const handoff=new ConsultationHandoff(async n=>{notices.push(n)},SECUMIE_SCHEDULE_URLS[kind],Date.now,7200000,500,answers=>v6.evaluate({answerContractVersion:content.versions.answer,answers}));
 const wsc=new WscHtmlService({technicalHeadings:true,lookup:async()=>[{address:'93.184.216.34'}],networkExchange:async()=>({diagnosis:{schemaVersion:'2.0',targetUrl:'https://example.org/',checkedAt:'2026-11-28T00:00:00Z',mailDomain:'example.org',http:{status:'OK',headers:{'Strict-Transport-Security':null,'Content-Security-Policy':null,'X-Content-Type-Options':'nosniff','X-Frame-Options':null}},tls:{status:'VALIDATED',policyErrors:'None',negotiatedProtocol:'Tls13',notAfter:'2027-10-29T00:00:00Z'},dns:{spf:{lookupStatus:'FOUND',records:['v=spf1 -all'],recordCount:1},dmarc:{lookupStatus:'NO_RECORD',records:[],recordCount:0}}}})});
 const app=createSecumieGeneralRuntime({kind,hostname:'service.atlib.jp',enabled:true,verify:async(token,_ip,action)=>token==='synthetic-token'&&action===(kind==='WEB'?'secumie_web':'secumie_insight'),wsc,handoff,assets:{pageDir:path.join(root,'prototypes/secumie-general'),insightDir,siteKey:'synthetic'}});
 const server=app.listen(0,'127.0.0.1'); await new Promise<void>(resolve=>server.once('listening',resolve));
 const address=server.address();assert.ok(address&&typeof address!=='string');
 const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const evidence=process.env.SECUMIE_REVIEW_DIR;
 if(evidence)mkdirSync(evidence,{recursive:true});
 const capture=async (state:string)=>{
   if(!evidence)return;
   for(const [size,width,height] of [['mobile',390,844],['desktop',1440,1000]] as const){
     await page.setViewportSize({width,height});
     await page.evaluate('document.fonts.ready.then(() => true)');
     await page.screenshot({path:path.join(evidence,kind.toLowerCase()+'-'+state+'-'+size+'.png'),fullPage:true,animations:'disabled'});
   }
   await page.setViewportSize({width:390,height:844});
 };
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.hostname==='challenges.cloudflare.com'){await route.fulfill({contentType:'application/javascript',body:"window.turnstile={getResponse:()=> 'synthetic-token',reset:()=>{}};"});return;}
  if(u.hostname==='timerex.net'){await route.fulfill({contentType:'text/html',body:'synthetic schedule'});return;}
  if(u.origin!==origin){await route.abort();return;}
  const headers:Record<string,string>={...req.headers(),host:'service.atlib.jp'};delete headers['content-length'];
  const http=require('node:http') as typeof import('node:http');
  const response=await new Promise<{status:number;headers:Record<string,string>;body:Buffer}>((resolve,reject)=>{
    const q=http.request({host:'127.0.0.1',port:address.port,path:u.pathname+u.search,method:req.method(),headers},res=>{
      const chunks:Buffer[]=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode??500,headers:Object.fromEntries(Object.entries(res.headers).filter(([k,v])=>typeof v==='string'&&!['connection','transfer-encoding','content-length'].includes(k))) as Record<string,string>,body:Buffer.concat(chunks)}));res.on('error',reject);
    });q.on('error',reject);q.end(req.postDataBuffer()??undefined);
  });await route.fulfill(response);
 });
 await page.goto(origin+'/secumie-'+kind.toLowerCase()+'/');
 assert.equal(await page.locator('#secumie-guide .aio-faq details').count(),6);
 await page.locator('#secumie-guide .aio-faq summary').first().click();
 assert.equal(await page.locator('#secumie-guide .aio-faq details[open]').count(),1);
 assert.equal(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),true,'public guide must fit mobile viewport');
 await page.locator('#secumie-guide .aio-faq summary').first().click();
 await capture('01-guide');
 await page.locator('[data-secumie-open-form]').first().click();
 await capture('02-intake');
 await page.locator('#companyName').fill('Synthetic Company');
 await page.locator('#registeredAddress').fill('Tokyo');
 if(kind==='WEB')await page.locator('#targetUrl').fill('https://example.org/');
 await page.locator('#general-form button[type=submit]').click();
 if(kind==='WEB'){
  await page.locator('#web-result').waitFor({state:'visible'});
  await page.frameLocator('#report-frame').locator('body').getByText('クリックジャック対策',{exact:false}).first().waitFor();
  await page.locator('#print-result').waitFor({state:'visible'});
 }else{
  for(let i=0;i<8;i++){await page.locator('[data-answer]').first().click();await page.locator('#next').click();}
  await page.locator('#v7-print').waitFor({state:'visible'});
 }
 if(kind==='INSIGHT')assert.equal(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),true,'Insight result must fit mobile viewport');
 await capture('03-result');
 if(evidence){
   if(kind==='WEB'){
     const frame=page.frameLocator('#report-frame');
     const html=await frame.locator('html').evaluate(e=>e.outerHTML);
     const printPage=await browser.newPage();
     try{await printPage.route('**/*',route=>route.abort());await printPage.setContent('<!doctype html>'+html);await printPage.pdf({path:path.join(evidence,'web-report.pdf'),format:'A4',printBackground:true,preferCSSPageSize:true});}finally{await printPage.close();}
   }else await page.pdf({path:path.join(evidence,'insight-report.pdf'),format:'A4',printBackground:true,preferCSSPageSize:true});
 }
 await page.locator('.consult-guide-trigger').first().click();
 await page.locator('#consultation-guide').waitFor({state:'visible'});
 if(kind==='WEB')assert.equal(await page.evaluate("Boolean(document.querySelector('#consultation-guide').compareDocumentPosition(document.querySelector('body > footer')) & Node.DOCUMENT_POSITION_FOLLOWING) && document.querySelector('body > main').hidden"),true,'WEB consultation must precede footer and hide inactive main');
 await capture('04-consult-guide');
 await page.locator('#consult-back').click();
 await page.locator('.consult-guide-trigger').first().click();
 await page.locator('#consult-apply').click();
 assert.match(await page.locator('#consult-company').innerText(),/Synthetic Company/);
 await capture('05-consult-form');
 await page.locator('#consult-name').fill('Synthetic Person');
 await page.locator('#consult-email').fill('synthetic@example.org');
 await page.locator('#consult-phone').fill('000');
 await page.locator('[name=consent]').check();
 await Promise.all([page.waitForURL(SECUMIE_SCHEDULE_URLS[kind]),page.locator('#consultation-form button[type=submit]').click()]);
 assert.equal(notices.length,1);assert.equal(notices[0]?.companyName,'Synthetic Company');assert.equal(notices[0]?.kind,kind);assert.deepEqual(errors,[]);
 }finally{await browser.close();handoff.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
