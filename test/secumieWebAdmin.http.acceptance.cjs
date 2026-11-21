'use strict';

// Offline HTTP acceptance: real Express staff gate, WSC engine and Chromium PDF.
// Synthetic session and diagnosis only. No Google OAuth callback, DB or external network.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { StaffAuthService } = require('../dist/services/staffAuthService');
const { requireStaffAuth } = require('../dist/middleware/staffAuth');
const { createIpRateLimiter } = require('../dist/middleware/rateLimit');
const { WscSalesService } = require('../dist/services/wscSalesService');
const { createAdminWebSecurityCheckRouter } = require('../dist/routes/adminWebSecurityCheck');

const diagnosis = {
  schemaVersion: '2.0',
  targetUrl: 'https://example.org/',
  checkedAt: '2026-10-29T00:00:00.000Z',
  mailDomain: 'example.org',
  http: { status: 'OK', headers: {
    'Strict-Transport-Security': 'max-age=100',
    'Content-Security-Policy': null,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': null,
  }},
  tls: { status: 'VALIDATED', policyErrors: 'None',
    negotiatedProtocol: 'Tls13', notAfter: '2027-10-29T00:00:00.000Z' },
  dns: {
    spf: { lookupStatus: 'FOUND', records: ['v=spf1 -all'], recordCount: 1 },
    dmarc: { lookupStatus: 'NO_RECORD', records: [], recordCount: 0 },
  },
};
let server;
let base;
let cookie;
let probes = 0;
let reports = 0;
const postData = JSON.stringify({ name: '検証株式会社', url: 'https://example.org/' });
const headers = { 'content-type': 'application/json' };
const request = (pathName, init={}) => fetch(base + pathName, { redirect: 'manual', ...init });

test.before(async () => {
  const auth = new StaffAuthService('synthetic-test-key-not-a-production-secret-64-characters-long');
  const wsc = new WscSalesService({
    lookup: async () => [{ address: '93.184.216.34' }],
    resolveTxt: async () => [],
    networkExchange: async input => {
      probes += 1;
      assert.equal(input.ip, '93.184.216.34');
      return { diagnosis };
    },
  });
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use('/api/admin/web-security-check', express.json({ limit: '2mb' }));
  app.use(express.json());
  app.use(cookieParser());
  const authGate = [
    createIpRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 300 }),
    requireStaffAuth(auth),
  ];
  app.use('/api/admin/web-security-check', ...authGate, createAdminWebSecurityCheckRouter(wsc));
  app.use('/admin', ...authGate, express.static(path.resolve(__dirname, '../public/admin')));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  cookie = 'staff_session=' + auth.issueSessionToken({ email: 'synthetic-staff@atlib.jp' });
});
test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
});

test('unauthenticated admin HTML and JS redirect without leaking content', async () => {
  for (const route of ['/admin/secumie-web.html', '/admin/secumie-web.js']) {
    const response = await request(route);
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /^\/auth\/login\?returnTo=/);
    assert.equal((await response.text()).includes('SECU:MIE Web｜受付・診断管理'), false);
  }
});

test('unauthenticated WSC PDF API is HTTP 401 with no probe', async () => {
  const response = await request('/api/admin/web-security-check/diagnose', {
    method: 'POST', headers, body: postData,
  });
  assert.equal(response.status, 401);
  assert.equal(probes, 0);
});

test('valid synthetic staff cookie serves protected admin HTML and JS', async () => {
  const page = await request('/admin/secumie-web.html', { headers: { cookie } });
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type') || '', /text\/html/);
  assert.match(await page.text(), /SECU:MIE Web｜受付・診断管理/);
  const script = await request('/admin/secumie-web.js', { headers: { cookie } });
  assert.equal(script.status, 200);
  assert.match(await script.text(), /\/api\/admin\/web-security-check\/diagnose/);
});

test('authenticated HTTP POST renders actual WSC PDF through Chromium', async () => {
  const response = await request('/api/admin/web-security-check/diagnose', {
    method: 'POST', headers: { ...headers, cookie }, body: postData,
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /^application\/pdf/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-disposition') || '', /^attachment; filename\*=UTF-8''/);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.ok(bytes.length > 4000, 'PDF must not be empty');
  assert.equal(probes, 1);
  reports += 1;
});

test('non-HTTPS target is rejected before a second DNS probe or PDF', async () => {
  const response = await request('/api/admin/web-security-check/diagnose', {
    method: 'POST', headers: { ...headers, cookie },
    body: JSON.stringify({ name: '検証株式会社', url: 'http://example.org/' }),
  });
  assert.equal(response.status, 422);
  assert.equal(probes, 1);
});

test('malformed request is rejected before a second probe or PDF', async () => {
  const response = await request('/api/admin/web-security-check/diagnose', {
    method: 'POST', headers: { ...headers, cookie },
    body: JSON.stringify({ name: '', url: 'https://example.org/' }),
  });
  assert.equal(response.status, 400);
  assert.equal(probes, 1);
  assert.equal(reports, 1);
});
