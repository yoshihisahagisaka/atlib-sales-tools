const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/admin/secumie-web.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'public/admin/secumie-web.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'src/server.ts'), 'utf8');

class FakeElement {
  constructor(tag = 'div') {
    this.tag = tag;
    this.value = '';
    this.textContent = '';
    this.disabled = false;
    this.hidden = false;
    this.dataset = {};
    this.children = [];
    this.events = {};
  }
  addEventListener(name, callback) { this.events[name] = callback; }
  appendChild(item) { this.children.push(item); return item; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  setAttribute(name, value) { this[name] = value; }
  reset() { /* form reset is not used in diagnosis contract */ }
  click() { this.clicked = true; }
  remove() { this.removed = true; }
  focus() { this.focused = true; }
  scrollIntoView() {}
}

function harness(fetchMock, confirm = () => true) {
  const ids = [...html.matchAll(/\bid="([a-z-]+)"/g)].map(match => match[1]);
  const elements = Object.fromEntries(ids.map(id => [id, new FakeElement()]));
  const downloads = [];
  const documentListeners = {};
  const document = {
    addEventListener(name, callback) { documentListeners[name] = callback; },
    getElementById(id) { assert.ok(elements[id], `missing element: ${id}`); return elements[id]; },
    createElement(tag) { return new FakeElement(tag); },
    body: { appendChild(item) { downloads.push(item); } },
  };
  class FakeURL extends URL {
    static createObjectURL() { return 'blob:test-pdf'; }
    static revokeObjectURL() {}
  }
  vm.runInNewContext(source, {
    document,
    fetch: fetchMock,
    URL: FakeURL,
    URLSearchParams,
    window: { confirm, setTimeout: callback => callback() },
  });
  const fire = (id, action = 'submit') => elements[id].events[action]({ preventDefault() {} });
  const pageReady = () => documentListeners.DOMContentLoaded?.();
  return { elements, downloads, fire, pageReady };
}

test('SECU:MIE Web admin is served only behind existing staff gate', () => {
  assert.match(server, /app\.use\('\/admin', \.\.\.adminAuthGate, express\.static/);
  assert.match(server, /app\.use\('\/api\/admin\/web-security-check', \.\.\.adminAuthGate/);
  assert.match(html, /<script src="\/admin\/secumie-web\.js" defer><\/script>/);
  assert.match(html, /現在は暫定メール受付/);
  assert.match(html, /PDFの送付はスタッフが行います/);
  assert.ok(html.indexOf('aria-labelledby="requests-title"') < html.indexOf('aria-labelledby="diagnosis-title"'));
  assert.match(source, /DOMContentLoaded/);
  assert.doesNotMatch(source, /\b(localStorage|sessionStorage|indexedDB|innerHTML|document\.cookie)\b/);
});

test('new page loads the existing list automatically; disconnected mode keeps manual WSC usable', async () => {
  const calls = [];
  const ui = harness(async (url) => { calls.push(url); return { status: 404, ok: false }; });
  ui.pageReady();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^\/api\/admin\/secumie-web\/v1\/requests\?/);
  assert.equal(ui.elements['request-results'].hidden, true);
  assert.match(ui.elements['intake-sync-state'].textContent, /管理一覧は未接続/);
  assert.equal(ui.elements['diagnose-button'].disabled, false);
});

test('empty connected list never renders an invalid 1–0 range', async () => {
  const ui = harness(async () => ({ status: 200, ok: true, json: async () => ({ items: [] }) }));
  ui.pageReady();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.elements['page-label'].textContent, '該当なし');
  assert.match(ui.elements['intake-sync-state'].textContent, /申込一覧に接続/);
});

test('manual intake uses the existing authenticated WSC PDF API and browser download', async () => {
  const calls = [];
  const ui = harness(async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      headers: { get: key => key === 'content-type' ? 'application/pdf' : "attachment; filename*=UTF-8''report.pdf" },
      blob: async () => new Blob(['%PDF-test'], { type: 'application/pdf' }),
    };
  });
  ui.elements.company.value = '検証株式会社';
  ui.elements['target-url'].value = 'https://example.jp/';
  await ui.fire('diagnosis-form');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/admin/web-security-check/diagnose');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(calls[0].options.body), { name: '検証株式会社', url: 'https://example.jp/' });
  assert.equal(ui.downloads.length, 1);
  assert.equal(ui.downloads[0].download, 'report.pdf');
  assert.equal(ui.downloads[0].clicked, true);
  assert.match(ui.elements['diagnosis-state'].textContent, /別途送信/);
});

test('manual intake blocks non-HTTPS targets before diagnosis', async () => {
  let called = false;
  const ui = harness(async () => { called = true; });
  ui.elements.company.value = '検証株式会社';
  ui.elements['target-url'].value = 'http://example.jp/';
  await ui.fire('diagnosis-form');
  assert.equal(called, false);
  assert.equal(ui.elements['diagnosis-state'].dataset.kind, 'error');
});

test('missing DB API is explicit and does not affect the manual flow', async () => {
  const calls = [];
  const ui = harness(async url => { calls.push(url); return { status: 404, ok: false }; });
  await ui.fire('filter-form');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^\/api\/admin\/secumie-web\/v1\/requests\?/);
  assert.match(ui.elements['list-state'].textContent, /専用受付APIはまだ/);
  assert.equal(ui.elements['request-results'].hidden, true);
});

test('future DB rows populate report form; submission state needs explicit confirmation', async () => {
  const calls = [];
  const item = {
    intakeId: '00000000-0000-4000-8000-000000000001',
    receiptId: 'SMW-100',
    receivedAt: '2026-11-19T01:00:00Z',
    companyName: '<script>alert(1)</script>',
    unionName: '検証組合',
    websiteUrl: 'https://example.jp/',
    contactEmail: 'case@example.jp',
    status: 'RECEIVED',
  };
  const ui = harness(async (url, options) => {
    calls.push({ url, options });
    if (options?.method === 'PATCH') return { ok: true, status: 200 };
    return { ok: true, status: 200, json: async () => ({ items: [item] }) };
  }, () => false);
  await ui.fire('filter-form');
  await new Promise(resolve => setImmediate(resolve));
  const row = ui.elements['request-rows'].children[0];
  assert.equal(row.children[1].textContent, '<script>alert(1)</script>\n検証組合');
  await row.children[4].children[0].events.click();
  assert.equal(ui.elements.company.value, item.companyName);
  assert.equal(ui.elements['target-url'].value, item.websiteUrl);
  const [select, button] = row.children[5].children[0].children;
  select.value = 'SUBMITTED';
  await button.events.click();
  assert.equal(calls.length, 1, 'declined confirmation must not PATCH submission status');
});

test('future DB status is PATCHed only with the selected enum value', async () => {
  const calls = [];
  const item = {
    intakeId: '00000000-0000-4000-8000-000000000001',
    companyName: '検証株式会社',
    websiteUrl: 'https://example.jp/',
    status: 'RECEIVED',
  };
  const ui = harness(async (url, options) => {
    calls.push({ url, options });
    if (options?.method === 'PATCH') return { ok: true, status: 200 };
    return { ok: true, status: 200, json: async () => ({ items: [item] }) };
  });
  await ui.fire('filter-form');
  await new Promise(resolve => setImmediate(resolve));
  const row = ui.elements['request-rows'].children[0];
  const [select, save] = row.children[5].children[0].children;
  select.value = 'IN_PROGRESS';
  await save.events.click();
  assert.equal(calls.length, 3, 'GET, PATCH, refreshed GET');
  assert.equal(calls[1].url, `/api/admin/secumie-web/v1/requests/${item.intakeId}/status`);
  assert.equal(calls[1].options.method, 'PATCH');
  assert.equal(calls[1].options.headers['X-Secumie-Staff-Command'], '1');
  assert.deepEqual(JSON.parse(calls[1].options.body), { status: 'IN_PROGRESS' });
});

test('unexpected HTML response never becomes a downloaded PDF', async () => {
  const ui = harness(async () => ({
    status: 200,
    ok: true,
    headers: { get: () => 'text/html' },
    blob: async () => new Blob(['<html>login</html>']),
  }));
  ui.elements.company.value = '検証株式会社';
  ui.elements['target-url'].value = 'https://example.jp/';
  await ui.fire('diagnosis-form');
  assert.equal(ui.downloads.length, 0);
  assert.match(ui.elements['diagnosis-state'].textContent, /PDFを受信できませんでした/);
});

test('staging catalog preflight is SELECT-only metadata with no credentials or customer rows', () => {
  const sql = fs.readFileSync(
    path.join(root, 'design/secumie-web/staging-catalog-readonly.sql'), 'utf8');
  const statements = sql.replace(/--[^\n]*/g, '').split(';').map(x => x.trim()).filter(Boolean);
  assert.equal(statements.length, 5, 'Only five existing catalog and aggregate queries are allowed');
  for (const statement of statements) {
    assert.match(statement, /^SELECT\s/i);
    assert.doesNotMatch(statement,
      /\b(?:CREATE|ALTER|DROP|GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE|COPY|EXECUTE|CALL|DO)\b/i);
  }
  assert.match(sql, /current_database\(\)\s*=\s*'postgres'/);
  assert.match(sql, /pg_roles/);
  assert.match(sql, /pg_database/);
  assert.match(sql, /pg_stat_activity/);
  assert.match(sql, /'secumie_web_staging'/);
  assert.doesNotMatch(sql, /\bSELECT\s+\*\s+FROM\s+secumie_web\./i);
});


test('staging migration candidate is hash-pinned and execution is not authorized', () => {
  const crypto = require('node:crypto');
  const pkgDir = path.join(root, 'design/secumie-web');
  const manifest = JSON.parse(fs.readFileSync(path.join(pkgDir, 'staging-migration-candidate.manifest.json'), 'utf8'));
  assert.equal(manifest.status, 'STAGING_CANDIDATE_EXECUTION_NO_GO');
  assert.equal(manifest.database, 'secumie_web_staging');
  assert.equal(manifest.databaseOwner, 'secumie_web_migration_staging');
  assert.equal(manifest.adminRole, 'secumie_web_admin_staging');
  assert.equal(manifest.runtimeRole, 'secumie_web_runtime_staging');
  assert.ok(Object.values(manifest.releaseDecision).every(value => value === false),
    'candidate is not an approval for GCP, DB, migration, or production');
  const items = fs.readdirSync(path.join(pkgDir, 'migrations'));
  assert.deepEqual(items, ['001_secumie_web_intake_staging.sql']);
  assert.equal(manifest.migrations.length, 1);
  assert.equal(manifest.migrations[0].filename, items[0]);
  const bytes = fs.readFileSync(path.join(pkgDir, 'migrations', items[0]));
  assert.equal(bytes.length, manifest.migrations[0].byteCount);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), manifest.migrations[0].sha256);
  assert.equal(bytes.includes(13), false, 'candidate SQL must use LF only');
  const sql = bytes.toString('utf8');
  assert.match(sql, /current_database\(\) <> 'secumie_web_staging'/);
  assert.match(sql, /current_user <> 'secumie_web_migration_staging'/);
  assert.match(sql, /REVOKE CONNECT, TEMPORARY ON DATABASE secumie_web_staging FROM PUBLIC/);
  assert.match(sql, /GRANT CONNECT ON DATABASE secumie_web_staging/);
  assert.doesNotMatch(sql, /^COMMIT;$/m, 'transaction and ledger belong to the existing migration runner');
  const gitBlob = bytes => crypto.createHash('sha1')
    .update(Buffer.from('blob ' + bytes.length + String.fromCharCode(0)))
    .update(bytes).digest('hex');
  assert.equal(gitBlob(fs.readFileSync(path.join(pkgDir, 'assembly-intake.draft.sql'))),
    manifest.sourceDraftBlobIds.ddl);
  assert.equal(gitBlob(fs.readFileSync(path.join(pkgDir, 'staging-role-grants.draft.sql'))),
    manifest.sourceDraftBlobIds.grants);
});

test('bootstrap operator preflight is SELECT-only and migration guard denies role inheritance', () => {
  const sql = fs.readFileSync(
    path.join(root, 'design/secumie-web/staging-bootstrap-operator-readonly.sql'), 'utf8');
  const statements = sql.replace(/--[^\n]*/g, '').split(';').map(value => value.trim()).filter(Boolean);
  assert.equal(statements.length, 1);
  assert.match(statements[0], /^SELECT\s/i);
  assert.doesNotMatch(statements[0],
    /\b(?:CREATE|ALTER|DROP|GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE|COPY|EXECUTE|CALL|DO)\b/i);
  assert.match(sql, /roles\.rolcreatedb/);
  assert.match(sql, /roles\.rolcreaterole/);
  assert.match(sql, /pg_has_role/);
  assert.match(sql, /createrole_self_grant/);
  const candidate = fs.readFileSync(
    path.join(root, 'design/secumie-web/migrations/001_secumie_web_intake_staging.sql'), 'utf8');
  assert.match(candidate, /NOT rolcanlogin/);
  assert.match(candidate, /pg_auth_members/);
  assert.match(candidate, /SECU:MIE_WEB_ROLE_BOUNDARY_STOP/);
});
