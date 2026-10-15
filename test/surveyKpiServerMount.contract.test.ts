import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const server = readFileSync(join(__dirname,'../src/server.ts'),'utf8');
const publicRoute = readFileSync(join(__dirname,'../src/routes/publicSurveyCounter.ts'),'utf8');
const adminRoute = readFileSync(join(__dirname,'../src/routes/adminSurveyKpiSummary.ts'),'utf8');

test('new survey KPI routes are disabled unless explicitly enabled',()=>{
  assert.match(server,/process\.env\.IT_SURVEY_KPI_ENABLED === 'true'/);
  assert.match(server,/IT_SURVEY_KPI_COVERAGE_START_REQUIRED/);
  assert.match(server,/INVALID_IT_SURVEY_KPI_COVERAGE_START/);
});
test('public counter uses existing intake flag and rate limiter',()=>{
  assert.match(server,/createPublicSurveyCounterRouter\(surveyMonthlyCounterRepo, config\.publicIntakeEnabled\)/);
  assert.match(publicRoute,/createIpRateLimiter/);
});
test('admin KPI summary route is behind existing staff gate',()=>{
  assert.match(server,/\.\.\.adminAuthGate, createAdminSurveyKpiSummaryRouter/);
  assert.match(adminRoute,/Cache-Control/);
});
