/// <reference lib="dom" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { createPiraHaReviewApp, HA_REVIEW_CODE } from '../scripts/piraHaReviewServer';

test('HA-1 manual review flow reaches the first diagnosis question', { timeout: 60_000 }, async () => {
  const server = createPiraHaReviewApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Review server did not start');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/pira/pira-e2.html`);
    assert.equal(await page.evaluate(() => window.publicAuthTurnstileToken?.()), 'ha-review');
    await page.fill('#email', 'reviewer@example.test');
    await page.click('#send');
    await page.waitForSelector('#code-screen:not([hidden])');
    await page.fill('#code', HA_REVIEW_CODE);
    await page.click('#verify');
    await page.waitForSelector('#success-screen:not([hidden])');
    await page.click('#auth-start');
    await page.waitForSelector('#pira-form');
    const consent = await page.locator('#pira-form').textContent();
    assert.match(consent ?? '', /atLIBが取得情報を独自の営業活動に利用することはありません/);
    await page.fill('[name=companyName]', 'レビュー用テスト株式会社');
    await page.fill('[name=contactName]', 'テスト担当者');
    await page.fill('[name=websiteUrl]', 'https://example.test');
    await page.fill('[name=unionName]', 'レビュー用組合');
    await page.fill('[name=address]', '東京都テスト区');
    await page.check('[name=accepted]');
    await page.click('#pira-form button[type=submit]');
    await page.waitForSelector('.v7-public-start');
    await page.getByRole('button', { name: 'セルフチェックをはじめる' }).click();
    await page.waitForSelector('.v7-public-question');
    const response = await page.request.get(`http://127.0.0.1:${address.port}/__ha/status`);
    const status = await response.json();
    assert.equal(status.otpRequests, 1);
    assert.deepEqual(status.submissions, [['RECEIVED', 'ANSWERING']]);
  } finally {
    await browser.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

declare global {
  interface Window { publicAuthTurnstileToken?: () => string; }
}
