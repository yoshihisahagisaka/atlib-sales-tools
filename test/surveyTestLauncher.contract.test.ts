import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const browser = readFileSync(join(__dirname,'../public/it-management-kaizen/free-diagnosis/app.js'),'utf8');
const launcher = readFileSync(join(__dirname,'../public/admin/it-survey-test-launcher.html'),'utf8');
const server = readFileSync(join(__dirname,'../src/server.ts'),'utf8');
const auth = readFileSync(join(__dirname,'../src/routes/staffAuth.ts'),'utf8');

test('fixed test query directs to protected admin launcher and does not activate public survey', () => {
  assert.match(browser,/searchParams\.get\('test'\) === '1'/);
  assert.match(browser,/\/admin\/it-survey-test-launcher\.html/);
  assert.match(browser,/if \(requestedTestMode\) \{/);
  assert.match(launcher,/テスト実行はまだ有効にしていません/);
});
test('existing admin static is gated and OAuth returnTo accepts admin paths only', () => {
  assert.match(server,/app\.use\('\/admin', \.\.\.adminAuthGate, express\.static/);
  assert.match(auth,/returnToParam\.startsWith\('\/admin\/'\)/);
});
