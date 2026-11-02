/// <reference lib="dom" />
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { chromium } from 'playwright';
import { createPiraHa2Review } from '../scripts/piraHa2ReviewServer';

test('HA-2 administrator and viewer can review the real E3 admin UI', { timeout: 90_000 }, async () => {
  const root = path.resolve(__dirname, '..');
  const { app, pool } = await createPiraHa2Review(root, 'pira_ha2_review_test');
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('HA-2 test server did not start');
  const base = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const output = path.join(root, '.pira-ha2-review', 'test-downloads');
  await fs.mkdir(output, { recursive: true });
  try {
    const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
    await page.goto(`${base}/__ha/login?role=admin`);
    await page.waitForSelector('#items tr');
    assert.equal(await page.title(), 'SECU Insight受付管理');
    assert.equal(await page.locator('h1').innerText(), 'SECU Insight受付管理');
    assert.equal(await page.locator('#items tr').count(), 6);
    assert.match(await page.locator('.ha2-review').innerText(), /現在の権限: 管理者/);
    assert.match(await page.locator('#items').innerText(), /国連協/);
    assert.match(await page.locator('#items').innerText(), /一般向け/);
    assert.match(await page.locator('#items').innerText(), /SECU:MIE Insight 一般向け/);
    assert.match(await page.locator('#items').innerText(), /受付済み/);
    assert.match(await page.locator('#items').innerText(), /診断中/);
    assert.match(await page.locator('#items').innerText(), /診断完了/);
    assert.match(await page.locator('#items').innerText(), /利用不可/);
    assert.match(await page.locator('#items').innerText(), /利用可/);
    assert.equal(await page.locator('#export-toolbar').isVisible(), true);
    assert.equal((await page.locator('body').innerText()).includes('診断回答・診断結果・PDFは保存・表示しません。'), false);
    assert.equal((await page.locator('body').innerText()).includes('出力ファイルには営業利用可否を含めません。'), false);
    await page.screenshot({ path: path.join(output, 'ha2-admin-list.png'), fullPage: true });

    await page.selectOption('[name=initiativeCode]', 'pira-union');
    await page.selectOption('[name=initiativeKind]', 'UNION');
    await page.selectOption('[name=state]', 'COMPLETED');
    await page.fill('[name=companyName]', '青空');
    await page.fill('[name=from]', '2026-10-01');
    await page.fill('[name=to]', '2026-11-03');
    await page.click('#filters button');
    await page.waitForFunction(() => document.querySelectorAll('#items tr').length === 1);
    assert.match(await page.locator('#items').innerText(), /青空物流株式会社/);
    await page.locator('#items tr').click();
    await page.waitForSelector('#detail[open]');
    const detail = await page.locator('#detail').innerText();
    assert.match(detail, /企業情報/);
    assert.match(detail, /診断受付情報/);
    assert.match(detail, /認証済みメールアドレス/);
    assert.match(detail, /営業利用可否/);
    assert.match(detail, /PIRA-UNION-CONSENT-V1.0/);
    assert.doesNotMatch(detail, /submission_id|receipt_id|sales_use_allowed/);
    await page.screenshot({ path: path.join(output, 'ha2-admin-detail.png'), fullPage: true });
    await page.click('#close');

    await page.goto(`${base}/__ha/login?role=admin`);
    await page.waitForSelector('#items tr');
    const csvEvent = page.waitForEvent('download');
    await page.click('#csv');
    const csvDownload = await csvEvent;
    const csvPath = path.join(output, 'pira-submissions.csv');
    await csvDownload.saveAs(csvPath);
    const csv = await fs.readFile(csvPath);
    assert.deepEqual([...csv.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.match(csv.toString('utf8'), /青空物流株式会社/);

    const xlsxEvent = page.waitForEvent('download');
    await page.click('#xlsx');
    const xlsxDownload = await xlsxEvent;
    const xlsxPath = path.join(output, 'pira-submissions.xlsx');
    await xlsxDownload.saveAs(xlsxPath);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(xlsxPath);
    assert.equal(workbook.worksheets[0]?.rowCount, 7);
    assert.equal(workbook.worksheets[0]?.columnCount, 11);

    await page.getByRole('link', { name: '閲覧者へ切替' }).click();
    await page.waitForSelector('#items tr');
    assert.match(await page.locator('.ha2-review').innerText(), /現在の権限: 閲覧者/);
    assert.equal(await page.locator('#export-toolbar').isVisible(), false);
    const viewerExport = await page.evaluate(async () => {
      const response = await fetch('/api/admin/pira/v1/exports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ format: 'CSV', filters: {} }) });
      return { status: response.status, body: await response.json() };
    });
    assert.equal(viewerExport.status, 403);
    assert.equal(viewerExport.body.error.code, 'PIRA_ADMIN_REQUIRED');
  } finally {
    await browser.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.end();
  }
});
