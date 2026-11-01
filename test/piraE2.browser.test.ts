/// <reference lib="dom" />
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { chromium, type Page } from 'playwright';

const root = path.resolve(__dirname, '..');
const step = (name: string) => console.log(`E2_STEP:${name}`);
let server: ReturnType<express.Express['listen']>;
let base = '';
let states: string[] = [];

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(root, 'public')));
  app.use('/pira', express.static(path.join(root, 'prototypes/pira-union-diagnosis-v2')));
  app.post('/v1/otp/challenges', (_request, response) => response.status(201).json({ challengeId: 'c', resendAt: new Date().toISOString() }));
  app.post('/v1/otp/challenges/c/verify', (_request, response) => response.json({ sessionId: 's', sessionToken: 't' }));
  app.post('/v1/otp/sessions/s/tokens', (_request, response) => response.json({ token: `test-${randomUUID()}` }));
  app.get('/api/public/pira/v1/intake-contract', (_request, response) => response.json({ initiativeCode: 'pira-union', initiativeKind: 'UNION', consent: { version: 'PIRA-UNION-CONSENT-V1.0' } }));
  app.post('/api/public/pira/v1/submissions', (_request, response) => {
    step('SUBMISSION_CREATED');
    response.status(201).json({ receiptId: '11111111-1111-4111-8111-111111111111' });
  });
  app.post('/api/public/pira/v1/submissions/:id/state', (request, response) => {
    states.push(request.body.state);
    step(request.body.state === 'ANSWERING' ? 'ANSWERING_CONFIRMED' : 'COMPLETED_CONFIRMED');
    response.json({});
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not start');
  base = `http://127.0.0.1:${address.port}`;
});

function observePage(page: Page, pageErrors: string[], requestFailures: string[]) {
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => requestFailures.push(`${request.method()} ${new URL(request.url()).pathname}: ${request.failure()?.errorText ?? 'unknown'}`));
}

test('OTP, intake, v7 and completion flow', { timeout: 60_000 }, async () => {
  states = [];
  step('TEST_START');
  let lastStep = 'TEST_START';
  const reached = (name: string) => { lastStep = name; step(name); };
  const browser = await chromium.launch({ headless: true });
  reached('BROWSER_LAUNCHED');
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(10_000);
    page.setDefaultNavigationTimeout(10_000);
    observePage(page, pageErrors, requestFailures);
    await page.addInitScript("window.publicAuthTurnstileToken=()=> 'test';");

    reached('PAGE_GOTO_START');
    const navigation = await page.goto(`${base}/pira/pira-e2.html`, { waitUntil: 'domcontentloaded', timeout: 10_000 });
    console.log(`E2_PAGE_STATUS:${navigation?.status() ?? 'NO_RESPONSE'}`);
    console.log(`E2_PAGE_URL:${new URL(page.url()).pathname}`);
    reached('PAGE_LOADED');
    await page.waitForFunction(() => typeof window.publicAuthTurnstileToken === 'function' && document.querySelector('#email') !== null && document.querySelector('#send') !== null && document.querySelector('#code') !== null, undefined, { timeout: 10_000 });
    const authState = await page.evaluate(() => {
      const send = document.querySelector<HTMLButtonElement>('#send');
      const error = document.querySelector<HTMLElement>('#error');
      const token = window.publicAuthTurnstileToken?.();
      return {
        emailExists: document.querySelector('#email') !== null,
        sendExists: send !== null,
        codeExists: document.querySelector('#code') !== null,
        sendVisible: Boolean(send && send.getClientRects().length),
        sendDisabled: send?.disabled ?? null,
        turnstileFunctionExists: typeof window.publicAuthTurnstileToken === 'function',
        turnstileTokenNonEmpty: typeof token === 'string' && token.length > 0,
        errorVisible: Boolean(error && !error.hidden && error.textContent?.trim()),
        errorText: error?.textContent?.trim() ?? '',
      };
    });
    console.log(`E2_AUTH_STATE:${JSON.stringify(authState)}`);
    reached('AUTH_SCRIPT_READY');

    await page.fill('#email', 'user@example.test', { timeout: 10_000 });
    reached('EMAIL_FILLED');
    const otpRequest = page.waitForRequest((request) => request.method() === 'POST' && new URL(request.url()).pathname === '/v1/otp/challenges', { timeout: 10_000 });
    const otpResponse = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/v1/otp/challenges', { timeout: 10_000 });
    await page.click('#send', { timeout: 10_000 });
    reached('SEND_CLICKED');
    await otpRequest;
    reached('OTP_REQUEST_OBSERVED');
    const response = await otpResponse;
    let responseCode = '';
    if (!response.ok()) {
      const body = (await response.json().catch(() => ({}))) as { error?: { code?: string }; code?: string };
      responseCode = body.error?.code ?? body.code ?? '';
    }
    console.log(`E2_OTP_RESPONSE:status=${response.status()},code=${responseCode || 'NONE'}`);
    reached('OTP_RESPONSE_RECEIVED');
    await page.waitForFunction(() => { const code = document.querySelector<HTMLInputElement>('#code'); return Boolean(code && code.getClientRects().length); }, undefined, { timeout: 10_000 });
    reached('CODE_SCREEN_VISIBLE');
    await page.fill('#code', '123456', { timeout: 10_000 });
    reached('CODE_FILLED');
    const verifyResponse = page.waitForResponse((verify) => verify.request().method() === 'POST' && new URL(verify.url()).pathname.endsWith('/verify'), { timeout: 10_000 });
    await page.click('#verify', { timeout: 10_000 });
    reached('VERIFY_CLICKED');
    assert.equal((await verifyResponse).status(), 200);
    await page.waitForSelector('#success-screen:not([hidden])', { timeout: 10_000 });
    reached('OTP_VERIFIED');

    await page.click('#auth-start', { timeout: 10_000 });
    await page.waitForSelector('#pira-form', { timeout: 10_000 });
    reached('INTAKE_DISPLAYED');
    for (const [selector, value] of [['companyName', 'テスト株式会社'], ['contactName', '担当者'], ['websiteUrl', 'https://example.test'], ['unionName', '国連協'], ['address', '東京都']] as const) await page.fill(`[name=${selector}]`, value, { timeout: 10_000 });
    await page.check('[name=accepted]', { timeout: 10_000 });
    await page.click('#pira-form button', { timeout: 10_000 });
    await page.waitForSelector('.v7-public-start', { timeout: 10_000 });
    reached('V7_START_DISPLAYED');
    await page.getByRole('button', { name: 'セルフチェックをはじめる' }).click({ timeout: 10_000 });
    await page.waitForSelector('.v7-public-question', { timeout: 10_000 });
    reached('QUESTION_STARTED');
    for (let index = 0; index < 12; index += 1) {
      await page.locator('[data-answer]').first().click({ timeout: 10_000 });
      const next = page.locator('#next');
      const last = (await next.textContent())?.includes('結果を見る');
      const completion = last ? page.waitForResponse((stateResponse) => new URL(stateResponse.url()).pathname.endsWith('/state') && stateResponse.request().postData()?.includes('COMPLETED') === true, { timeout: 10_000 }) : undefined;
      await next.click({ timeout: 10_000 });
      if (completion) { assert.equal((await completion).status(), 200); break; }
    }
    await page.waitForSelector('.v7-prototype', { timeout: 10_000 });
    reached('REPORT_DISPLAYED');
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(requestFailures, []);
    assert.deepEqual(states, ['ANSWERING', 'COMPLETED']);
  } catch (error) {
    console.error(`E2_FAILURE:lastStep=${lastStep}`);
    console.error(`E2_PAGE_ERRORS:${JSON.stringify(pageErrors)}`);
    console.error(`E2_REQUEST_FAILURES:${JSON.stringify(requestFailures)}`);
    throw error;
  } finally {
    await browser.close();
    step('BROWSER_CLOSED');
  }
});

test.after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  step('SERVER_CLOSED');
});

declare global {
  interface Window { publicAuthTurnstileToken?: () => string; }
}
