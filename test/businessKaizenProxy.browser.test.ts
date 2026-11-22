import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createFreeDiagnosisRuleBasedV1Harness } from './support/freeDiagnosisRuleBasedV1Harness';

test('staff proxy controls Q02, prevents duplicate writes, resumes and renders a safe result', async ({ page, context }) => {
  const h = await createFreeDiagnosisRuleBasedV1Harness({ includeDesignV2: true, includeBusinessKaizen: true });
  try {
    const companyId=randomUUID(),contactId=randomUUID(),activityId=randomUUID();
    await h.pool.query(`INSERT INTO company(id,name,created_by_user_id,owner_user_id) VALUES($1,'Browser Company','seed','owner@atlib.jp')`,[companyId]);
    await h.pool.query(`INSERT INTO contact(id,company_id,name) VALUES($1,$2,'Browser Contact')`,[contactId,companyId]);
    await h.pool.query(`INSERT INTO sales_activity(id,company_id,primary_contact_id,selected_service,created_by_user_id,owner_user_id) VALUES($1,$2,$3,'BUSINESS_WEB','seed','owner@atlib.jp')`,[activityId,companyId,contactId]);
    await context.addCookies([{name:'staff_session',value:h.staffCookie.split('=')[1]!,url:h.url,httpOnly:true,sameSite:'Lax'}]);
    let saves=0,completions=0;
    page.on('request',request=>{if(request.url().includes('/draft-answers'))saves++;if(request.url().endsWith('/complete'))completions++;});
    await page.route('**/draft-answers',async route=>{await new Promise(resolve=>setTimeout(resolve,150));await route.continue();});
    await page.route('**/complete',async route=>{await new Promise(resolve=>setTimeout(resolve,150));await route.continue();});
    const url=`${h.url}/admin/business-kaizen-proxy.html?salesActivityId=${activityId}`;
    await page.goto(url);await expect(page.locator('.question')).toHaveCount(15);await expect(page.getByText('Browser Company')).toBeVisible();

    const q02=(value:string)=>page.locator(`input[name="Q02"][value="${value}"]`);
    await q02('UNKNOWN').check();await q02('SMOOTH_WORKFLOW').check();await expect(q02('UNKNOWN')).not.toBeChecked();
    await q02('FIT_FOR_BUSINESS').check();await q02('SHARED_INFORMATION').check();await q02('TRANSFERABLE_WORK').click();
    await expect(q02('TRANSFERABLE_WORK')).not.toBeChecked();await expect(page.locator('#q02-feedback')).toContainText('3つまで');
    await q02('UNKNOWN').check();await expect(q02('SMOOTH_WORKFLOW')).not.toBeChecked();await expect(q02('FIT_FOR_BUSINESS')).not.toBeChecked();
    await q02('FIT_FOR_BUSINESS').check();await q02('SMOOTH_WORKFLOW').check();await q02('SHARED_INFORMATION').check();
    await page.locator('input[name="Q01"][value="MANAGER"]').check();
    await page.locator('#save').evaluate((button:HTMLElement)=>{button.click();button.click();});
    await expect(page.locator('#save')).toBeDisabled();await expect(page.getByText(/revision 2/)).toBeVisible();expect(saves).toBe(1);

    await page.reload();await expect(page.locator('input[name="Q01"][value="MANAGER"]')).toBeChecked();
    for(const value of ['FIT_FOR_BUSINESS','SMOOTH_WORKFLOW','SHARED_INFORMATION'])await expect(q02(value)).toBeChecked();
    await q02('TRANSFERABLE_WORK').click();await expect(q02('TRANSFERABLE_WORK')).not.toBeChecked();await expect(page.locator('#q02-feedback')).toContainText('3つまで');

    const values:Record<string,string|string[]>={Q01:'MANAGER',Q02:['FIT_FOR_BUSINESS','SMOOTH_WORKFLOW','SHARED_INFORMATION'],Q03:'CONDITIONAL',Q04:'2',Q05:'2',Q06:'2',Q07:'3',Q08:'1',Q09:'2',Q10:'2',Q11:'1',Q12:['LOW_CODE_NO_CODE'],Q13:'3',Q14:'3',Q15:'CONNECTED'};
    for(const [id,value] of Object.entries(values))for(const item of Array.isArray(value)?value:[value])await page.locator(`input[name="${id}"][value="${item}"]`).check();
    await page.locator('#purpose').check();await page.locator('#privacy').check();
    await page.locator('#complete').evaluate((button:HTMLElement)=>{button.click();button.click();});
    await expect(page.locator('#save')).toBeDisabled();await expect(page.locator('#complete')).toBeDisabled();
    await expect(page.getByText('診断を確定しました。')).toBeVisible();expect(saves).toBe(2);expect(completions).toBe(1);
    await expect(page.locator('#result')).toContainText('診断結果の説明');await expect(page.locator('#result')).toContainText('確認できた事実');await expect(page.locator('#result')).toContainText('6観点');
    await expect(page.locator('#result')).toContainText('業務の流れと情報のつながりを整理');await expect(page.locator('#result')).toContainText('level: LARGE');await expect(page.locator('#result')).toContainText('coverage: HIGH');
    await expect(page.locator('#result')).not.toContainText('"direction"');await expect(page.locator('#result')).not.toContainText('{');
  } finally { await h.close(); }
});
