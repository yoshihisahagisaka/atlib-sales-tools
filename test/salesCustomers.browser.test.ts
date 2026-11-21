import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createFreeDiagnosisRuleBasedV1Harness } from './support/freeDiagnosisRuleBasedV1Harness';

test('staff-only common customer workflow is safe, responsive, and submits once', async ({ context, page }) => {
  const harness = await createFreeDiagnosisRuleBasedV1Harness({ includeDesignV2: true });
  try {
    await page.goto(`${harness.url}/admin/sales-customers.html`);
    await expect(page).toHaveURL(/\/auth\/login\?returnTo=/);
    await context.addCookies([{ name: 'staff_session', value: harness.staffCookie.slice('staff_session='.length), url: harness.url, httpOnly: true, sameSite: 'Lax' }]);
    await page.goto(`${harness.url}/admin/sales-customers.html`);
    await expect(page.getByRole('heading', { name: '共通顧客管理' })).toBeVisible();

    await page.route('**/api/admin/sales-customers/companies?*', async route => {
      const query = new URL(route.request().url()).searchParams.get('q');
      if (query !== 'Old Search' && query !== 'New Search') { await route.continue(); return; }
      await new Promise(resolve => setTimeout(resolve, query === 'Old Search' ? 250 : 10));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{
        id: query === 'Old Search' ? '00000000-0000-4000-8000-000000000001' : '00000000-0000-4000-8000-000000000002',
        name: query, corporateNumber: null,
      }] }) });
    });
    await page.locator('#company-query').fill('Old Search');
    await page.locator('#company-search').click();
    await page.locator('#company-query').fill('New Search');
    await page.locator('#company-search').click();
    await expect(page.locator('#company-results')).toContainText('New Search');
    await page.waitForTimeout(300);
    await expect(page.locator('#company-results')).not.toContainText('Old Search');
    await page.unroute('**/api/admin/sales-customers/companies?*');

    const unsafeName = `<img src=x onerror=alert(1)> ${randomUUID()}`;
    await page.locator('#company-query').fill(unsafeName);
    await page.locator('#company-search').click();
    await expect(page.locator('#company-search-status')).toContainText('0件');
    await expect(page.locator('#company-create')).toBeEnabled();
    await page.locator('#company-create-details summary').click();
    await page.locator('#company-create').click();
    await expect(page.locator('#company-create-status')).toHaveText('Companyを登録しました。');
    await expect(page.locator('#selected-company')).toContainText(unsafeName);
    await expect(page.locator('#selected-company img')).toHaveCount(0);

    await page.locator('#contact-create-details summary').click();
    await page.locator('#contact-name').fill('Primary Contact');
    await page.locator('#contact-email').fill('primary@example.test');
    await page.locator('#contact-create').click();
    await expect(page.locator('#selected-contact')).toContainText('Primary Contact');

    const secondCompanyName = `Second Company ${randomUUID()}`;
    await page.locator('#company-query').fill(secondCompanyName);
    await page.locator('#company-search').click();
    await expect(page.locator('#company-search-status')).toContainText('0件');
    await page.locator('#company-create').click();
    await expect(page.locator('#selected-contact')).toBeHidden();
    await expect(page.locator('#contact-results')).not.toContainText('Primary Contact');

    await page.locator('#company-query').fill(unsafeName);
    await page.locator('#company-search').click();
    await page.locator('#company-results .choice').filter({ hasText: unsafeName }).click();
    await expect(page.locator('#contact-results')).toContainText('Primary Contact');
    await page.locator('#contact-results .choice').filter({ hasText: 'Primary Contact' }).click();

    await page.locator('input[name="service"][value="BUSINESS_WEB"]').check();
    let activityPosts = 0;
    await page.route('**/api/admin/sales-customers/activities', async route => {
      activityPosts += 1;
      await new Promise(resolve => setTimeout(resolve, 150));
      await route.continue();
    });
    await page.locator('#activity-create').dblclick({ delay: 10 });
    await expect(page.locator('#activity-status')).toContainText('Sales Activityを登録しました。');
    expect(activityPosts).toBe(1);
    await expect(page.locator('#activity-result')).toContainText('Service: BUSINESS_WEB');
    const activities = await harness.pool.query<{ selected_service: string }>('SELECT selected_service FROM sales_activity');
    expect(activities.rows).toHaveLength(1);
    expect(activities.rows[0]?.selected_service).toBe('BUSINESS_WEB');

    expect(await page.locator('body').evaluate(body => body.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await expect(page.getByText('この操作ではサービス固有Caseや診断を開始しません。')).toBeVisible();
  } finally {
    await harness.close();
  }
});
