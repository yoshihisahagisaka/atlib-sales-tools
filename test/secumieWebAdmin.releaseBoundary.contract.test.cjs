'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('staff UI and original WSC API stay behind existing login gate', () => {
  const server = read('src/server.ts');
  const ui = read('public/admin/secumie-web.js');
  assert.match(server, /app\.use\('\/admin', \.\.\.adminAuthGate, express\.static/);
  assert.match(server, /app\.use\('\/api\/admin\/web-security-check', \.\.\.adminAuthGate/);
  assert.match(server, /if \(webRequests\) app\.use\('\/api\/admin\/secumie-web\/v1'/);
  assert.match(ui, /fetch\('\/api\/admin\/web-security-check\/diagnose'/);
  assert.match(ui, /select\.value === 'SUBMITTED' && !window\.confirm\(/);
  assert.doesNotMatch(ui, /localStorage|sessionStorage|indexedDB|innerHTML|document\.cookie/);
});

test('corporate mirror only registers accepted signed requests and preserves email fallback', () => {
  const server = read('src/server.ts');
  const route = read('src/routes/internalSecumieWebMirror.ts');
  assert.match(server, /if \(mirrorSecret && !webRequests\) throw new Error/);
  assert.match(route, /createHmac\('sha256'/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /recordCorporateEmailIntake/);
  assert.match(read('public/admin/secumie-web.js'), /response\.status === 404/);
});

test('one database, two tables, two login roles; no future public intake infrastructure', () => {
  const sql = read('design/secumie-web/migrations/001_secumie_web_intake_staging.sql');
  const service = read('src/secumieWeb/assemblyAdminService.ts');
  const items = fs.readdirSync(path.join(root, 'design/secumie-web/migrations'));
  assert.deepEqual(items, ['001_secumie_web_intake_staging.sql']);
  assert.equal((sql.match(/CREATE TABLE secumie_web\./g) || []).length, 2);
  assert.doesNotMatch(sql, /REVOKE CONNECT, TEMPORARY ON DATABASE/, 'DB owner, not migration role, manages ACL');
  assert.match(sql, /information_sharing_enabled = false/);
  assert.match(sql, /pg_auth_members/);
  assert.doesNotMatch(sql, /assembly_union_master|assembly_consumed_jti|assembly_notification_outbox|secumie_web_runtime_staging/);
  assert.doesNotMatch(service, /assembly_union_master|assembly_consumed_jti|assembly_notification_outbox/);
});

test('release remains unapproved while current source is not reconciled with deployed image', () => {
  const record = read('docs/secumie-web-admin-interim.md');
  assert.match(record, /Production No-Go/);
  assert.match(record, /SECURITY_NO_GO/);
  assert.match(record, /sales-tools-bks-20261122040419/);
  assert.match(record, /未作成/);
});

test('Cloud Build upload ignores local npm cache without excluding app sources', () => {
  const ignore = read('.gcloudignore');
  assert.match(ignore, /^\.npm-cache\/$/m);
  assert.match(ignore, /^node_modules\/$/m);
  assert.match(ignore, /^\.git\/$/m);
  assert.doesNotMatch(ignore, /^\s*(?:Dockerfile|package(?:-lock)?\.json|src\/|public\/)\s*$/m);
  for (const file of ['Dockerfile','package.json','package-lock.json','src/server.ts','public/admin/secumie-web.html']) {
    assert.ok(fs.existsSync(path.join(root, file)), `Cloud Build source missing: ${file}`);
  }
});
