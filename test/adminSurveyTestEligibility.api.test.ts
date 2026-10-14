import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import type { Server } from 'node:http';
import { createStaffSurveyTestEligibilityRouter } from '../src/routes/adminSurveyTestEligibility';

async function requestEligibility(staffEmail?: string, allowlist: ReadonlySet<string> = new Set()) {
  const app = express();
  app.use('/api/admin/it-survey-test', (req, _res, next) => {
    if (staffEmail) req.staffEmail = staffEmail;
    next();
  }, createStaffSurveyTestEligibilityRouter(allowlist));
  const server: Server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('NO_LISTEN_ADDRESS');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/admin/it-survey-test/eligibility`);
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
}

test('no staff identity cannot activate test eligibility', async () => {
  const result = await requestEligibility();
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'STAFF_AUTH_REQUIRED');
});

test('authenticated staff is eligible but unfinished test flow remains disabled', async () => {
  const result = await requestEligibility('staff@atlib.jp', new Set(['staff@atlib.jp']));
  assert.equal(result.status, 200);
  assert.equal(result.body.staffTestEligible, true);
  assert.equal(result.body.surveyTestModeAvailable, false);
});

test('authenticated non-admin staff cannot activate test eligibility', async () => {
  const result = await requestEligibility('other@atlib.jp', new Set(['staff@atlib.jp']));
  assert.equal(result.status, 403);
  assert.equal(result.body.error, 'TEST_CASE_ADMIN_REQUIRED');
});
