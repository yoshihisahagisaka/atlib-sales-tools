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
  const document = {
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
  return { elements, downloads, fire };
}

test('SECU:MIE Web admin is served only behind existing staff gate', () => {
  assert.match(server, /app\.use\('\/admin', \.\.\.adminAuthGate, express\.static/);
  assert.match(server, /app\.use\('\/api\/admin\/web-security-check', \.\.\.adminAuthGate/);
  assert.match(html, /<script src="\/admin\/secumie-web\.js" defer><\/script>/);
  assert.match(html, /現在は暫定メール受付/);
  assert.match(html, /送付と対応履歴の記録は自動実行されません/);
  assert.doesNotMatch(source, /\b(localStorage|sessionStorage|indexedDB|innerHTML|document\.cookie)\b/);
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
