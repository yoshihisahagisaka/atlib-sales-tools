import { test, expect } from '@playwright/test';
import express from 'express';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { Pool } from 'pg';
import { PostgresOtpReservationRepo } from '../src/publicAuth/postgresOtpReservationRepo';
import { PublicOtpApiService } from '../src/publicAuth/publicOtpApiService';
import { createPublicAuthPageRouter } from '../src/routes/publicAuthPage';
import { createPublicOtpRouter } from '../src/routes/publicOtp';

const pool = new Pool({ host: '127.0.0.1', port: 55437, database: 'otp_test_final', user: 'otp_test', password: 'otp_test' });
const sent: string[] = []; const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const origins: string[] = []; const brands = new Map([['pira', { id: 'pira', name: 'PIRA', origins }]]);
const auth = new PublicOtpApiService(new PostgresOtpReservationRepo(pool), { sendOtp: async (_to, _name, code) => { sent.push(code); } }, { verify: async () => true }, brands, 'ui-test-hmac', () => new Date(), { issuer: 'http://local.test', activeKid: 'test', keys: [{ kid: 'test', privateKey: keys.privateKey.export({ type: 'pkcs1', format: 'pem' }).toString(), publicKey: keys.publicKey.export({ type: 'pkcs1', format: 'pem' }).toString() }] });
const app = express(); app.set('trust proxy', true); app.use(express.json()); app.use(createPublicAuthPageRouter(path.resolve(__dirname, '../public/public-service-auth.html'), new Map([['127.0.0.1', { serviceId: 'pira', apiBase: '', intakeStartUrl: '/intake' }]]))); app.use('/v1/otp', createPublicOtpRouter(auth)); app.use(express.static(path.resolve(__dirname, '../public')));
const server = app.listen(0, '127.0.0.1'); let base = '';

test.beforeAll(async () => { if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; origins.push(base); });
test.beforeEach(async () => { sent.length = 0; await pool.query('TRUNCATE public_auth.otp_challenges, public_auth.otp_send_reservations, public_auth.otp_send_locks, public_auth.otp_send_events, public_auth.otp_sessions'); });
test.afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); });

test('email, OTP, JWT, and diagnosis-start flow stays in browser memory', async ({ page }) => {
  await page.addInitScript(() => { (window as any).publicAuthTurnstileToken = () => 'test-turnstile'; (window as any).publicAuthIntakeAdapter = async (value: any) => { (window as any).__intake = value; }; });
  await page.goto(base); await expect(page.getByRole('heading', { name: 'メールアドレスの確認' })).toBeVisible();
  await page.locator('#email').fill('person@example.test'); await page.getByRole('button', { name: '認証コードを送信する' }).click();
  await expect(page.getByRole('heading', { name: '認証コードの入力' })).toBeVisible(); await expect.poll(() => sent.length).toBe(1);
  await page.locator('#code').fill(sent[0]!); await page.getByRole('button', { name: '確認して進む' }).click();
  await expect(page.getByRole('heading', { name: 'メールアドレスの確認が完了しました' })).toBeVisible();
  await page.getByRole('button', { name: '診断を開始する' }).click();
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__intake?.token))).toBe(true);
  const persisted = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, url: location.href }));
  expect(persisted.local).toBe(0); expect(persisted.session).toBe(0); expect(persisted.url).not.toContain('token');
  await page.reload(); await expect(page.getByRole('heading', { name: 'メールアドレスの確認' })).toBeVisible();
});

test('email change invalidates the prior challenge and returns to email input', async ({ page }) => {
  await page.addInitScript(() => { (window as any).publicAuthTurnstileToken = () => 'test-turnstile'; });
  await page.goto(base); await page.locator('#email').fill('change@example.test'); await page.getByRole('button', { name: '認証コードを送信する' }).click(); await expect.poll(() => sent.length).toBe(1);
  await page.getByRole('button', { name: 'メールアドレスを変更する' }).click(); await expect(page.getByRole('heading', { name: 'メールアドレスの確認' })).toBeVisible();
  const { rows } = await pool.query<{ invalidated_at: Date | null }>('SELECT invalidated_at FROM public_auth.otp_challenges'); expect(rows[0]?.invalidated_at).not.toBeNull();
});
