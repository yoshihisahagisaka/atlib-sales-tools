import assert from 'node:assert/strict';
import test from 'node:test';
import { createMailerOtpAdapter, OtpDeliveryError } from '../src/publicAuth/publicOtpApiService';
import type { Mailer } from '../src/services/mailer';

const adapter = (sendPublicServiceOtp: Mailer['sendPublicServiceOtp']) =>
  createMailerOtpAdapter({ sendPublicServiceOtp } as Mailer);

test('Nodemailer adapter preserves SENT, FAILED, and UNKNOWN delivery classification', async () => {
  let delivered = false;
  await adapter(async () => { delivered = true; }).sendOtp('user@example.test', 'SECU:MIE Insight', '123456');
  assert.equal(delivered, true);

  await assert.rejects(
    adapter(async () => { throw { code: 'EENVELOPE', responseCode: 550 }; }).sendOtp('user@example.test', 'SECU:MIE Insight', '123456'),
    (error: unknown) => error instanceof OtpDeliveryError && error.outcome === 'FAILED',
  );
  await assert.rejects(
    adapter(async () => { throw { code: 'ETIMEDOUT' }; }).sendOtp('user@example.test', 'SECU:MIE Insight', '123456'),
    (error: unknown) => error instanceof OtpDeliveryError && error.outcome === 'UNKNOWN',
  );
});
