import { test, expect } from '@playwright/test';
import { createDiagnosisHarness } from './support/diagnosisHarness';
import { completedCase } from './support/preparationFixtures';

let h: Awaited<ReturnType<typeof createDiagnosisHarness>>;

test.beforeAll(async () => {
  h = await createDiagnosisHarness();
});

test.afterAll(async () => {
  await h?.close();
});

test.beforeEach(async ({ context }) => {
  await context.addCookies([{
    name: 'staff_session',
    value: h.staffCookie.slice('staff_session='.length),
    url: h.url,
    httpOnly: true,
    sameSite: 'Lax',
  }]);
});

test('他の設問の未保存入力は、1設問を保存しても消えない', async ({ page }) => {
  const c = await completedCase(h);

  await page.goto(
    `${h.url}/admin/it-management-diagnosis-hearing.html?id=${c.id}`
  );

  await expect(page.locator('#hearing-questions section')).toHaveCount(10);

  const first = page.locator('#hearing-questions section').nth(0);
  const second = page.locator('#hearing-questions section').nth(1);

  await second.getByLabel('顧客の発言原文').fill(
    '別設問に入力中の未保存発言'
  );

  await first.getByLabel('顧客の発言原文').fill(
    '最初の設問で確認した発言'
  );

  await first.getByRole('button', { name: '記録を保存' }).click();

  await expect(page.locator('#hearing-status')).toContainText(
    '保存しました'
  );

  await expect(
    page.locator('#hearing-questions section')
      .nth(1)
      .getByLabel('顧客の発言原文')
  ).toHaveValue('別設問に入力中の未保存発言');
});
test('保存成功後の再取得失敗を保存失敗と表示しない', async ({ page }) => {
  const c = await completedCase(h);

  await page.goto(
    `${h.url}/admin/it-management-diagnosis-hearing.html?id=${c.id}`
  );

  const first = page.locator('#hearing-questions section').first();
  await expect(first.getByRole('button', { name: '記録を保存' })).toBeVisible();

  await first.getByLabel('顧客の発言原文').fill(
    '保存済みだが再取得に失敗する発言'
  );

  let failedGetCount = 0;

  await page.route(
    '**/api/admin/it-management-diagnosis/cases/*/hearing',
    async route => {
      if (route.request().method() === 'GET' && failedGetCount === 0) {
        failedGetCount++;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'テスト用の再取得失敗' }),
        });
        return;
      }
      await route.continue();
    }
  );

  await first.getByRole('button', { name: '記録を保存' }).click();

  await expect(page.locator('#hearing-status')).toHaveText(
    '保存済み・画面更新失敗'
  );

  await expect(first.getByRole('status')).toContainText(
    '保存は完了しましたが、画面更新に失敗しました。'
  );

  await expect(first.getByRole('button', { name: '記録を保存' }))
    .toBeDisabled();

  await expect(first.getByLabel('顧客の発言原文')).toHaveValue(
    '保存済みだが再取得に失敗する発言'
  );

  expect(failedGetCount).toBe(1);

  await page.unrouteAll({ behavior: 'wait' });

  const response = await page.request.get(
    `${h.url}/api/admin/it-management-diagnosis/cases/${c.id}/hearing`,
    {
      headers: {
        Cookie: h.staffCookie,
        'X-Diagnosis-Command': '1',
      },
    }
  );

  expect(response.ok()).toBeTruthy();

  const data = await response.json();
  expect(data.hearing.some(
    (record: { statement: string }) =>
      record.statement === '保存済みだが再取得に失敗する発言'
  )).toBeTruthy();
});
test('初回記録と訂正履歴を保持し元のWeb回答を変更しない', async ({ page }) => {
  const c = await completedCase(h);
  const endpoint =
    `${h.url}/api/admin/it-management-diagnosis/cases/${c.id}/hearing`;

  const getRecords = async () => {
    const response = await page.request.get(endpoint, {
      headers: {
        Cookie: h.staffCookie,
        'X-Diagnosis-Command': '1',
      },
    });
    expect(response.ok()).toBeTruthy();
    return response.json();
  };

  const before = await getRecords();

  await page.goto(
    `${h.url}/admin/it-management-diagnosis-hearing.html?id=${c.id}`
  );

  const first = page.locator('#hearing-questions section').first();

  await first.getByLabel('顧客の発言原文').fill('初回ヒアリングでの発言');
  await first.getByLabel('未確認事項・次回確認すること')
    .fill('担当者への追加確認が必要');

  await first.getByRole('button', { name: '記録を保存' }).click();

  await expect(first.getByRole('button', { name: '訂正を保存' }))
    .toBeVisible();

  const afterCreate = await getRecords();
  expect(afterCreate.hearing).toHaveLength(1);
  expect(afterCreate.hearing[0].version).toBe(1);
  expect(afterCreate.hearing[0].statement)
    .toBe('初回ヒアリングでの発言');

  // 訂正理由がない場合、保存させない。
  await first.getByLabel('顧客の発言原文')
    .fill('訂正後の顧客発言');

  await first.getByRole('button', { name: '訂正を保存' }).click();

  await expect(first.getByRole('status'))
    .toContainText('訂正理由を入力してください。');

  await first.getByLabel('訂正理由（必須）')
    .fill('録音内容との照合により発言を訂正');

  await first.getByRole('button', { name: '訂正を保存' }).click();

  await expect(first.getByRole('status'))
    .toContainText('保存済み v2');

  const afterCorrection = await getRecords();

  expect(afterCorrection.hearing).toHaveLength(1);
  expect(afterCorrection.hearing[0].version).toBe(2);
  expect(afterCorrection.hearing[0].statement)
    .toBe('訂正後の顧客発言');

  // ヒアリング記録の追加・訂正で元のWeb回答を変更しない。
  expect(afterCorrection.originalResponses)
    .toEqual(before.originalResponses);

  const history = first.locator('details.hearing-history');
  await history.locator('summary').click();

  await expect(history).toContainText('v1 / CREATE');
  await expect(history).toContainText('v2 / CORRECT');
  await expect(history).toContainText('録音内容との照合により発言を訂正');
  await expect(history).toContainText('初回ヒアリングでの発言');
  await expect(history).toContainText('訂正後の顧客発言');
});