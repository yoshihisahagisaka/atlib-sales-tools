/// <reference lib="dom" />
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(`http://127.0.0.1:${address.port}/pira/pira-e2.html`);
    assert.equal(await page.evaluate(() => window.publicAuthTurnstileToken?.()), 'ha-review');
    assert.match(await page.locator('.ha-review-notice').textContent() ?? '', /246810/);
    const productionHtml = await readFile(path.resolve(__dirname, '../prototypes/pira-union-diagnosis-v2/pira-e2.html'), 'utf8');
    assert.doesNotMatch(productionHtml, /こちらは動作確認用の画面です/);
    await page.fill('#email', 'reviewer@example.test');
    await page.click('#send');
    await page.waitForSelector('#code-screen:not([hidden])');
    await page.fill('#code', HA_REVIEW_CODE);
    await page.click('#verify');
    await page.waitForSelector('#success-screen:not([hidden])');
    await page.click('#auth-start');
    await page.waitForSelector('#pira-form');
    assert.equal(await page.locator('[name=verifiedEmail]').getAttribute('readonly'), '');
    const consent = await page.locator('#pira-form').textContent();
    assert.match(consent ?? '', /atLIBが取得情報を独自の営業活動に利用することはありません/);
    const screenshots = path.resolve(__dirname, '../.pira-ha-review/screenshots');
    await mkdir(screenshots, { recursive: true });
    await page.screenshot({ path: path.join(screenshots, 'ha1-pc.png'), fullPage: true });
    for (const viewport of [{ width: 768, height: 1024 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    }
    await page.screenshot({ path: path.join(screenshots, 'ha1-smartphone.png'), fullPage: true });
    await page.fill('[name=companyName]', 'レビュー用テスト株式会社');
    await page.fill('[name=contactName]', 'テスト担当者');
    await page.fill('[name=websiteUrl]', 'https://example.test');
    await page.fill('[name=unionName]', 'レビュー用組合');
    await page.fill('[name=address]', '東京都テスト区');
    assert.equal(await page.locator('[name=accepted]').count(), 0);
    await page.getByRole('button', { name: '同意して診断に進む' }).click();
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
