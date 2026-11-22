const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const localFiles = {
  '/admin/secumie-web.html': ['public/admin/secumie-web.html', 'text/html; charset=utf-8'],
  '/admin/secumie-web.js': ['public/admin/secumie-web.js', 'application/javascript; charset=utf-8'],
  '/css/style.css': ['public/css/style.css', 'text/css; charset=utf-8'],
};

const pdfResponse = {
  status: 200,
  contentType: 'application/pdf',
  headers: { 'content-disposition': "attachment; filename*=UTF-8''Secumie-test.pdf" },
  body: Buffer.from('%PDF-1.4\n1 0 obj <</Type /Catalog>> endobj\n%%EOF\n'),
};

let server;
let browser;
let pageUrl;
let browserUnavailable;

function requireBrowser(context) {
  if (!browser) {
    context.skip(`Chromium cannot run in this environment: ${browserUnavailable || 'unknown cause'}`);
    return false;
  }
  return true;
}

test.before(async () => {
  server = http.createServer((req, res) => {
    const [relative, contentType] = localFiles[new URL(req.url, 'http://127.0.0.1').pathname] || [];
    if (!relative) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store' });
    res.end(fs.readFileSync(path.join(root, relative)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  pageUrl = `http://127.0.0.1:${server.address().port}/admin/secumie-web.html`;
  try {
    // Let Playwright select chromium-headless-shell when only-shell was installed.
    // Forcing chromium.executablePath() would incorrectly select the absent full browser.
    const launchOptions = { headless: true, args: ['--no-sandbox'] };
    if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
    browser = await chromium.launch(launchOptions);
  } catch (error) {
    // CI without a browser may SKIP, but the container acceptance gate must fail closed.
    if (process.env.REQUIRE_BROWSER === '1') throw error;
    browserUnavailable = error instanceof Error ? error.message.split('\n')[0] : 'launch failed';
  }
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

test('desktop: generates and downloads a PDF with existing API payload', async t => {
  if (!requireBrowser(t)) return;
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  let payload;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/admin/web-security-check/diagnose', route => {
    payload = route.request().postDataJSON();
    return route.fulfill(pdfResponse);
  });
  await page.goto(pageUrl);
  await page.locator('#company').fill('テスト株式会社');
  await page.locator('#target-url').fill('https://example.jp/');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '診断を実行してPDFを保存' }).click();
  const download = await downloadEvent;
  assert.deepEqual(payload, { name: 'テスト株式会社', url: 'https://example.jp/' });
  assert.equal(download.suggestedFilename(), 'Secumie-test.pdf');
  assert.match(await page.locator('#diagnosis-state').innerText(), /別途送信/);
  assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);
  assert.deepEqual(errors, []);
  await context.close();
});

test('mobile: no page-wide overflow and missing DB route leaves manual diagnosis usable', async t => {
  if (!requireBrowser(t)) return;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.route('**/api/admin/secumie-web/v1/requests?**', route => route.fulfill({ status: 404, body: 'Not Found' }));
  await page.goto(pageUrl);
  // List-first page must detect missing Web DB without an extra user click.
  await page.getByText(/専用受付APIはまだ/).waitFor();
  assert.equal(await page.locator('#diagnose-button').isVisible(), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
  await context.close();
});

test('future DB: text-only applicant rendering, prefill, and explicit status PATCH', async t => {
  if (!requireBrowser(t)) return;
  const context = await browser.newContext();
  const page = await context.newPage();
  const target = '<img src=x onerror=alert(1)>';
  const changes = [];
  await page.route('**/api/admin/secumie-web/v1/requests?**', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ items: [{
      intakeId: '00000000-0000-4000-8000-000000000001', receiptId: 'SMW-42',
      companyName: target, unionName: 'テスト協同組合', websiteUrl: 'https://example.jp/',
      contactName: 'テスト担当', contactEmail: 'case@example.jp', status: 'RECEIVED',
    }] }),
  }));
  await page.route('**/api/admin/secumie-web/v1/requests/*/status', route => {
    changes.push(route.request().postDataJSON());
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'IN_PROGRESS' }) });
  });
  await page.goto(pageUrl);
  // Automatically display pending applications when staff open the page.
  await page.locator('#request-rows tr').waitFor();
  assert.equal(await page.locator('#request-rows img').count(), 0);
  assert.match(await page.locator('#request-rows').innerText(), /<img src=x onerror=alert\(1\)>/);
  await page.getByRole('button', { name: '診断に反映' }).click();
  assert.equal(await page.locator('#company').inputValue(), target);
  assert.equal(await page.locator('#target-url').inputValue(), 'https://example.jp/');
  await page.locator('#request-rows select').selectOption('IN_PROGRESS');
  await page.getByRole('button', { name: '更新' }).click();
  await page.getByText(/件を表示中/).waitFor();
  assert.deepEqual(changes, [{ status: 'IN_PROGRESS' }]);
  await context.close();
});

test('submit status is not patched when staff declines confirmation', async t => {
  if (!requireBrowser(t)) return;
  const context = await browser.newContext();
  const page = await context.newPage();
  let patches = 0;
  await page.route('**/api/admin/secumie-web/v1/requests?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [{ intakeId: '00000000-0000-4000-8000-000000000001', companyName: 'テスト', websiteUrl: 'https://example.jp/', status: 'IN_PROGRESS' }] }) }));
  await page.route('**/api/admin/secumie-web/v1/requests/*/status', route => { patches += 1; return route.fulfill({ status: 200 }); });
  page.on('dialog', dialog => dialog.dismiss());
  await page.goto(pageUrl);
  // Application list loads as soon as the page opens.
  await page.locator('#request-rows tr').waitFor();
  await page.locator('#request-rows select').selectOption('SUBMITTED');
  await page.getByRole('button', { name: '更新' }).click();
  assert.equal(patches, 0);
  await context.close();
});
