import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createFreeDiagnosisRuleBasedV1Harness } from './support/freeDiagnosisRuleBasedV1Harness';

test('staff proxy supports draft save, resume and completion', async ({ page, context }) => {
  const h = await createFreeDiagnosisRuleBasedV1Harness({ includeDesignV2: true, includeBusinessKaizen: true });
  try {
    const companyId=randomUUID(),contactId=randomUUID(),activityId=randomUUID();
    await h.pool.query(`INSERT INTO company(id,name,created_by_user_id,owner_user_id) VALUES($1,'Browser Company','seed','owner@atlib.jp')`,[companyId]);
    await h.pool.query(`INSERT INTO contact(id,company_id,name) VALUES($1,$2,'Browser Contact')`,[contactId,companyId]);
    await h.pool.query(`INSERT INTO sales_activity(id,company_id,primary_contact_id,selected_service,created_by_user_id,owner_user_id) VALUES($1,$2,$3,'BUSINESS_WEB','seed','owner@atlib.jp')`,[activityId,companyId,contactId]);
    await context.addCookies([{name:'staff_session',value:h.staffCookie.split('=')[1]!,url:h.url,httpOnly:true,sameSite:'Lax'}]);
    const url=`${h.url}/admin/business-kaizen-proxy.html?salesActivityId=${activityId}`;
    await page.goto(url);await expect(page.locator('.question')).toHaveCount(15);await expect(page.getByText('Browser Company')).toBeVisible();
    await page.locator('input[name="Q01"][value="MANAGER"]').check();await page.locator('input[name="Q02"][value="SMOOTH_WORKFLOW"]').check();await page.getByRole('button',{name:'下書き保存'}).click();await expect(page.getByText(/revision 2/)).toBeVisible();
    await page.reload();await expect(page.locator('input[name="Q01"][value="MANAGER"]')).toBeChecked();await expect(page.getByText('保存済みの下書きを再開しました。')).toBeVisible();
    const values:Record<string,string|string[]>={Q01:'MANAGER',Q02:['FIT_FOR_BUSINESS','SMOOTH_WORKFLOW','SHARED_INFORMATION'],Q03:'CONDITIONAL',Q04:'2',Q05:'2',Q06:'2',Q07:'3',Q08:'1',Q09:'2',Q10:'2',Q11:'1',Q12:['LOW_CODE_NO_CODE'],Q13:'3',Q14:'3',Q15:'CONNECTED'};
    for(const [id,value] of Object.entries(values)){for(const item of Array.isArray(value)?value:[value])await page.locator(`input[name="${id}"][value="${item}"]`).check()}
    await page.locator('#purpose').check();await page.locator('#privacy').check();await page.getByRole('button',{name:'回答を確定'}).click();await expect(page.getByText('診断を確定しました。')).toBeVisible();await expect(page.locator('#result')).toContainText('"direction": "BC"');
  } finally { await h.close(); }
});
