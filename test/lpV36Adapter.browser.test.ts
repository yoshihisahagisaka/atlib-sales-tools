import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { after, test } from 'node:test';
import { chromium } from 'playwright';

const corporateRoot = 'C:/atlib/atlib-corporate-site-deploy/public';
const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://local');
  const requestPath = url.pathname;
  const relative = requestPath === '/' || requestPath === '/it-management-kaizen/' ? 'it-management-kaizen/index.html' : requestPath.replace(/^\//, '');
  const file = path.resolve(corporateRoot, relative);
  if (!file.startsWith(path.resolve(corporateRoot)) || !fs.existsSync(file)) { res.statusCode = 404; res.end(); return; }
  const contents = fs.readFileSync(file, 'utf8');
  res.end(relative === 'it-management-kaizen/index.html' && !url.searchParams.has('gate-off') ? contents.replace('<html', '<html data-diagnosis-public-submission-enabled="true"') : contents);
});
const ready = new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
after(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });

test('v36 adapter is keyboard-usable on desktop/mobile and never exposes its token to the submit payload', async () => {
  await ready;
  const port = (server.address() as import('node:net').AddressInfo).port;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  let body = ''; let idempotencyKey = '';
  await page.route('https://sales.atlib.jp/api/it-management-diagnosis/cases', async route => {
    body = route.request().postData() ?? ''; idempotencyKey = await route.request().headerValue('idempotency-key') ?? '';
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: '00000000-0000-0000-0000-000000000001', access_token: 'a'.repeat(43) }) });
  });
  await page.goto(`http://127.0.0.1:${port}/it-management-kaizen/`);
  await page.locator('[data-apply-open]').first().click();
  await page.locator('[name=company]').fill('Fixture Co'); await page.locator('[name=name]').fill('Fixture User');
  await page.locator('[name=email]').fill('fixture@example.test'); await page.locator('[name=phone]').fill('03-0000-0000');
  await page.locator('[type=checkbox]').check(); await page.keyboard.press('Tab');
  await page.locator('[type=submit]').press('Enter');
  await page.locator('.apply36-success').waitFor();
  assert.match(idempotencyKey, /^[A-Za-z0-9_-]{16,128}$/); assert.doesNotMatch(body, /access_token|aaaaaaaa/);
  const href = await page.locator('.apply36-next').getAttribute('href'); assert.match(href ?? '', /^https:\/\/sales\.atlib\.jp\/it-management-diagnosis\.html#case=/);
  const retryPage = await browser.newPage({ viewport: { width: 1280, height: 900 } }); let attempts = 0; const retryKeys: string[] = [];
  await retryPage.route('https://sales.atlib.jp/api/it-management-diagnosis/cases', async route => { retryKeys.push(await route.request().headerValue('idempotency-key') ?? ''); attempts++; return route.fulfill({ status: attempts === 1 ? 500 : 201, contentType: 'application/json', body: attempts === 1 ? JSON.stringify({ error: 'fixture failure' }) : JSON.stringify({ id: '00000000-0000-0000-0000-000000000002', access_token: 'b'.repeat(43) }) }); });
  await retryPage.goto(`http://127.0.0.1:${port}/it-management-kaizen/`); await retryPage.locator('[data-apply-open]').first().click();
  await retryPage.locator('[name=company]').fill('Retry Co'); await retryPage.locator('[name=name]').fill('Retry User'); await retryPage.locator('[name=email]').fill('retry@example.test'); await retryPage.locator('[name=phone]').fill('03-0000-0001'); await retryPage.locator('[type=checkbox]').check();
  await retryPage.locator('[type=submit]').click(); await retryPage.locator('.apply36-error').waitFor(); await retryPage.locator('[type=submit]').click(); await retryPage.locator('.apply36-success').waitFor();
  assert.deepEqual(retryKeys.length, 2); assert.equal(retryKeys[0], retryKeys[1]);
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`http://127.0.0.1:${port}/it-management-kaizen/`); await mobile.locator('[data-apply-open]').first().click();
  await mobile.keyboard.press('Tab'); await mobile.keyboard.press('Tab'); assert.equal(await mobile.locator('[name=company]').evaluate(el => el.ownerDocument.activeElement === el), true);
  await browser.close();
});

test('v36 keeps public submission fail-closed until its release gate is enabled', async () => {
  await ready;
  const port = (server.address() as import('node:net').AddressInfo).port;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let apiCalls = 0;
  await page.route('https://sales.atlib.jp/api/it-management-diagnosis/cases', async route => { apiCalls++; await route.abort(); });
  await page.goto(`http://127.0.0.1:${port}/it-management-kaizen/?gate-off`);
  await page.locator('[data-apply-open]').first().click();
  await page.locator('[name=company]').fill('Fixture Co');
  await page.locator('[name=name]').fill('Fixture User');
  await page.locator('[name=email]').fill('fixture@example.test');
  await page.locator('[name=phone]').fill('03-0000-0000');
  assert.equal(await page.locator('[type=submit]').isDisabled(), true);
  assert.match(await page.locator('.apply35-notice').innerText(), /公開受付は現在準備中/);
  assert.equal(await page.locator('.review').count(), 0);
  assert.equal(apiCalls, 0);
  await browser.close();
});
