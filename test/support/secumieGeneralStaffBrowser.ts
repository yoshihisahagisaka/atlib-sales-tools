import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {requireStaffAuth} from '../../src/middleware/staffAuth';
import {StaffAuthService} from '../../src/services/staffAuthService';
import {createAdminSecumieGeneralRouter} from '../../src/routes/adminSecumieGeneral';
import type {SecumieGeneralAdminRepo} from '../../src/services/secumieGeneralAdminRepo';

export async function exerciseGeneralStaffBrowser(repo:SecumieGeneralAdminRepo,webId:string,insightId:string){
 const auth=new StaffAuthService('synthetic-only-staff-session-key-000000000000');
 const app=express();
 app.use(express.json());app.use(cookieParser());
 app.use('/api/admin/secumie-general/v1',requireStaffAuth(auth),createAdminSecumieGeneralRouter(repo));
 app.use('/admin',requireStaffAuth(auth),express.static(path.resolve('public/admin')));
 app.use('/css',express.static(path.resolve('public/css')));
 const server=app.listen(0,'127.0.0.1');
 await new Promise<void>(resolve=>server.once('listening',resolve));
 try{
  const addr=server.address();assert.ok(addr&&typeof addr==='object');const base='http://127.0.0.1:'+addr.port;
  const api=base+'/api/admin/secumie-general/v1/leads',url=base+'/admin/secumie-general-leads.html';
  assert.equal((await fetch(api)).status,401);
  assert.equal((await fetch(api,{headers:{Cookie:'staff_session=invalid'}})).status,401);
  const unauthorized=await fetch(url,{redirect:'manual'});assert.equal(unauthorized.status,302);
  assert.match(unauthorized.headers.get('location')??'',/^\/auth\/login/);
  const browser=await chromium.launch({headless:true});
  try{
   const context=await browser.newContext({viewport:{width:1440,height:1000}});
   try{
    await context.addCookies([{name:'staff_session',value:auth.issueSessionToken({email:'staff@example.invalid'}),url:base,httpOnly:true,sameSite:'Lax'}]);
    const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('dialog',d=>d.accept());
    await page.goto(url);
    await page.waitForFunction("document.querySelectorAll('#rows tr').length===2");
    const evidence=process.env.SECUMIE_STAFF_REVIEW_DIR;
    if(evidence){mkdirSync(evidence,{recursive:true});await page.screenshot({path:path.join(evidence,'staff-list.png'),fullPage:true});}
    await page.locator('#rows tr').filter({hasText:'https://example.org/'}).getByRole('button',{name:'詳細'}).click();
    await page.locator('#group-info').getByText('紐づけ先：',{exact:false}).waitFor();
    await page.locator('#search-company').click();
    await page.locator('#company-candidates').getByRole('button',{name:'同一企業として紐づけ'}).click();
    await page.locator('#related-leads').getByRole('button',{name:/Insight/}).waitFor();
    await page.locator('#sales-status').selectOption('WON');
    await page.locator('#staff-note').fill('synthetic browser shared sales');
    await page.locator('#sales-form button[type=submit]').click();
    await page.getByText('保存しました',{exact:true}).waitFor();
    assert.equal((await repo.detail('WEB',webId))?.sales_status,'WON');
    assert.equal((await repo.detail('INSIGHT',insightId))?.staff_note,'synthetic browser shared sales');
    await page.locator('#related-leads').getByRole('button',{name:/Insight/}).click();
    await page.locator('#detail-title').getByText('Insight',{exact:false}).waitFor();
    await page.locator('#result-summary').getByText('T01',{exact:true}).waitFor();
    await page.locator('#result-history summary').waitFor();
    assert.equal(await page.locator('#sales-status').inputValue(),'WON');
    if(evidence)await page.screenshot({path:path.join(evidence,'staff-insight-detail.png'),fullPage:true});
    await page.locator('#unlink-company').click();
    await page.locator('#group-info').getByText('未紐づけ',{exact:false}).waitFor();
    assert.equal((await repo.detail('INSIGHT',insightId))?.company_group_id,null);
    assert.equal((await repo.detail('INSIGHT',insightId))?.sales_status,'NEW');
    assert.equal((await repo.detail('WEB',webId))?.sales_status,'WON');
    assert.deepEqual(errors,[]);
   }finally{await context.close();}
  }finally{await browser.close();}
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
