import { expect, test } from '@playwright/test';
import cookieParser from 'cookie-parser';
import express from 'express';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createIpRateLimiter } from '../src/middleware/rateLimit';
import { requireStaffAuth } from '../src/middleware/staffAuth';
import { StaffAuthService } from '../src/services/staffAuthService';

let server: Server;
let baseUrl: string;
let sessionToken: string;

test.beforeAll(async () => {
  const auth = new StaffAuthService('disposable-admin-portal-test-key');
  sessionToken = auth.issueSessionToken({ email: 'portal-test@atlib.jp' });
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(cookieParser());
  app.get('/api/admin/portal-kpis', requireStaffAuth(auth), (req, res) => {
    if (req.get('referer')?.includes('simulateKpiFailure=1')) {
      res.status(503).json({ error: 'PORTAL_KPI_UNAVAILABLE' });
      return;
    }
    res.json({
      period: { kind: 'FISCAL_YEAR', fiscalYear: 2026, timeZone: 'Asia/Tokyo', from: '2026-02-01T00:00:00+09:00', toExclusive: '2027-02-01T00:00:00+09:00' },
      common: { acceptedCount: { value: null, status: 'PARTIAL' } },
      services: { IT_KAIZEN: { status: 'AVAILABLE', acceptedCount: { value: 12, status: 'AVAILABLE' } }, BUSINESS_KAIZEN: { status: 'UNCONNECTED' } },
    });
  });
  app.use('/admin', createIpRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 300 }), requireStaffAuth(auth), express.static(path.resolve(__dirname, '../public/admin')));
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test('admin portal is staff-only, factual, accessible, and responsive', async ({ context, page, request }) => {
  const denied = await request.get(`${baseUrl}/admin/`, { maxRedirects: 0 });
  expect(denied.status()).toBe(302);
  expect(denied.headers().location).toContain('/auth/login?returnTo=');

  await context.addCookies([{ name: 'staff_session', value: sessionToken, url: baseUrl, httpOnly: true, sameSite: 'Lax' }]);
  await page.goto(`${baseUrl}/admin/?companyName=%3Cscript%3Ealert(1)%3C%2Fscript%3E`);
  await expect(page).toHaveTitle('Sales Tools | atLIB Admin');
  await expect(page.getByRole('heading', { level: 1, name: 'Sales Tools' })).toBeVisible();
  await expect(page.getByRole('link', { name: '本文へ移動' })).toHaveAttribute('href', '#main-content');
  await expect(page.getByRole('heading', { level: 2, name: '共通ダッシュボード' })).toBeVisible();
  await expect(page.getByText('表示可能な共通KPIはまだありません')).toBeVisible();
  await expect(page.getByText('0件', { exact: true })).toHaveCount(0);
  await expect(page.getByText('12件', { exact: true })).toBeVisible();
  await expect(page.getByText('会計年度：2026年2月1日〜2027年1月31日')).toBeVisible();
  await expect(page.locator('script')).toHaveCount(1);
  await expect(page.locator('script')).toHaveAttribute('src', '/admin/admin-portal.js');
  await expect(page.getByText('<script>alert(1)</script>')).toHaveCount(0);

  const links = [
    ['共通顧客管理', '/admin/sales-customers.html'],
    ['マーケティング施策管理', '/admin/marketing-initiatives.html'],
    ['IT経営KAIZEN管理', '/admin/free-diagnosis-v1.html'],
    ['業務KAIZEN管理', '/admin/business-web-consultation-leads.html'],
  ] as const;
  for (const [name, href] of links) {
    await expect(page.getByRole('link', { name: new RegExp(name) }).last()).toHaveAttribute('href', href);
  }

  expect(await page.locator('body').evaluate(body => body.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const headingLevels = await page.locator('h1,h2,h3').evaluateAll(nodes => nodes.map(node => Number(node.tagName.slice(1))));
  expect(headingLevels[0]).toBe(1);
  expect(headingLevels.filter(level => level === 1)).toHaveLength(1);
  for (let index = 1; index < headingLevels.length; index += 1) expect(headingLevels[index]! - headingLevels[index - 1]!).toBeLessThanOrEqual(1);
});

test('admin portal distinguishes KPI retrieval failure from zero', async ({ context, page }) => {
  await context.addCookies([{ name: 'staff_session', value: sessionToken, url: baseUrl, httpOnly: true, sameSite: 'Lax' }]);
  await page.goto(`${baseUrl}/admin/?simulateKpiFailure=1`);
  await expect(page.getByText('無料診断受付件数')).toBeVisible();
  await expect(page.getByText('—', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('取得できませんでした')).toBeVisible();
  await expect(page.getByText('0件', { exact: true })).toHaveCount(0);
  await expect(page.getByText('表示可能な共通KPIはまだありません')).toBeVisible();
  await expect(page.getByText('サービスKPI：未連携')).toBeVisible();
});
