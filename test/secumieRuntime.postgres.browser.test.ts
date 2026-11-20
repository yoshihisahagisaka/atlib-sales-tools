/// <reference lib="dom" />
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { Pool } from 'pg';
import { chromium } from 'playwright';
import { createPublicOtpRuntime } from '../src/runtime/publicOtpRuntime';
import { createPiraPublicRuntime } from '../src/runtime/piraPublicRuntime';

const root = path.resolve(__dirname, '..');
const otpPool = new Pool({ host: '127.0.0.1', port: 55437, database: 'otp_test_final', user: 'otp_test', password: 'otp_test' });
const piraPool = new Pool({ host: '127.0.0.1', port: 55437, database: 'pira_e1_test', user: 'otp_test', password: 'otp_test' });
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwtKey = { kid: 'runtime-test', privateKey: keys.privateKey.export({ type: 'pkcs1', format: 'pem' }).toString(), publicKey: keys.publicKey.export({ type: 'pkcs1', format: 'pem' }).toString() };
let server: ReturnType<express.Express['listen']> | undefined;
let base = '';
let otpCode = '';

test.before(async () => {
  await otpPool.query('DROP SCHEMA IF EXISTS public_auth CASCADE');
  await otpPool.query(readFileSync(path.join(root, 'migrations/037_public_service_otp.sql'), 'utf8'));
  await piraPool.query('DROP SCHEMA IF EXISTS pira CASCADE');
  await piraPool.query(readFileSync(path.join(root, 'migrations/038_pira_public_intake.sql'), 'utf8'));
  await piraPool.query("INSERT INTO pira.pira_initiative(initiative_code,initiative_kind,display_name) VALUES('pira-union','UNION','国連協'),('pira-general','GENERAL','一般向け')");

  const gateway = express();
  server = gateway.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server!.once('listening', resolve));
  const address = server.address() as AddressInfo;
  base = `http://127.0.0.1:${address.port}`;
  gateway.use(createPublicOtpRuntime({
    pool: otpPool,
    mailer: { sendPublicServiceOtp: async (_to, _service, code) => { otpCode = code; } },
    turnstileSecret: 'not-used-in-test', turnstile: { verify: async () => true }, hmacKey: 'runtime-test-hmac-key-at-least-32-bytes',
    jwt: { issuer: `${base}/issuer`, activeKid: jwtKey.kid, keys: [jwtKey] },
    brands: new Map([['pira-union', { id: 'pira-union', name: 'SECU:MIE Insight', origins: [base] }]]),
  }));
  gateway.use(createPiraPublicRuntime({
    pool: piraPool, issuer: `${base}/issuer`, jwksUrl: `${base}/.well-known/jwks.json`, unionHost: '127.0.0.1', generalHost: 'www.atlib.jp',
    unionInitiativeCode: 'pira-union', generalInitiativeCode: 'pira-general', generalEnabled: false, turnstileSiteKey: 'runtime-test-site-key',
    publicAuthScriptPath: path.join(root, 'public/public-service-auth.js'), prototypeDir: path.join(root, 'prototypes/pira-union-diagnosis-v2'),
  }));
});

test('production runtime serves secured UNION flow through OTP, intake, report, and COMPLETED', { timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript("window.publicAuthTurnstileToken=()=> 'runtime-test';");
    const response = await page.goto(base, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.status(), 200);
    assert.match(response?.headers()['content-security-policy'] ?? '', /challenges\.cloudflare\.com/);
    assert.equal(response?.headers()['x-content-type-options'], 'nosniff');
    await page.fill('#email', 'runtime@example.test');
    const sent = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname === '/v1/otp/challenges');
    await page.click('#send');
    const sendResponse = await sent;
    assert.equal(sendResponse.status(), 201, `OTP send failed: ${await sendResponse.text()}`);
    await page.waitForSelector('#code-screen:not([hidden])');
    assert.match(otpCode, /^\d{6}$/);
    await page.fill('#code', otpCode);
    await page.click('#verify');
    await page.waitForSelector('#success-screen:not([hidden])');
    await page.click('#auth-start');
    await page.waitForSelector('#pira-form');
    for (const [name, value] of [['companyName','Runtime株式会社'],['contactName','担当者'],['websiteUrl','https://example.test'],['unionName','国連協'],['address','東京都']] as const) await page.fill(`[name=${name}]`, value);
    await page.getByRole('button', { name: '同意して診断に進む' }).click();
    await page.waitForSelector('.v7-public-question');
    for (let index = 0; index < 12; index += 1) {
      await page.locator('[data-answer]').first().click();
      const next = page.locator('#next');
      const complete = (await next.textContent())?.includes('結果を見る');
      await next.click();
      if (complete) break;
    }
    await page.waitForSelector('.v7-prototype');
    let state: string | undefined;
    for (let attempt = 0; attempt < 40 && state !== 'COMPLETED'; attempt += 1) {
      state = (await piraPool.query("SELECT state FROM pira.pira_submission WHERE verified_email='runtime@example.test'")).rows[0]?.state;
      if (state !== 'COMPLETED') await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(state, 'COMPLETED');
    const columns = await piraPool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='pira' AND table_name='pira_submission' AND column_name IN ('answers','report','pdf','c_mode_result')");
    assert.equal(columns.rowCount, 0);
  } finally { await browser.close(); }
});

test('runtime fails closed for unknown host, disabled GENERAL, and malformed JWT', async () => {
  assert.equal((await fetch(`${base}/security-check/`, { headers: { host: 'www.atlib.jp' } })).status, 404);
  assert.equal((await fetch(`${base}/admin/pira/`)).status, 404);
  const contract = await fetch(`${base}/api/public/pira/v1/intake-contract`, { headers: { 'x-forwarded-host': 'unknown.example' } });
  assert.equal(contract.status, 404);
  const bad = await fetch(`${base}/api/public/pira/v1/submissions`, { method: 'POST', headers: { host: '127.0.0.1', 'content-type': 'application/json', authorization: 'Bearer invalid' }, body: '{}' });
  assert.notEqual(bad.status, 201);
});

test.after(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await Promise.all([otpPool.end(), piraPool.end()]);
});

declare global { interface Window { publicAuthTurnstileToken?: () => string; } }
