import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { WscSalesService } from '../src/services/wscSalesService';

const diagnosis = {
  schemaVersion: '2.0', targetUrl: 'https://example.org/', checkedAt: '2026-10-29T00:00:00.000Z', mailDomain: 'example.org',
  http: { status: 'OK', headers: { 'Strict-Transport-Security': 'max-age=100', 'Content-Security-Policy': null, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': null } },
  tls: { status: 'VALIDATED', policyErrors: 'None', negotiatedProtocol: 'Tls13', notAfter: '2027-10-29T00:00:00.000Z' },
  dns: { spf: { lookupStatus: 'FOUND', records: ['v=spf1 -all'], recordCount: 1 }, dmarc: { lookupStatus: 'NO_RECORD', records: [], recordCount: 0 } },
};

test('uses the completed WSC evaluator and renderer through a synthetic safe transport', async () => {
  let rendered = '';
  const service = new WscSalesService({
    lookup: async () => [{ address: '93.184.216.34' }],
    resolveTxt: async () => [],
    networkExchange: async input => { assert.equal(input.ip, '93.184.216.34'); return { diagnosis }; },
    renderPdf: async html => { rendered = html; return Buffer.from('synthetic-pdf'); },
  });
  const result = await service.diagnose({ name: '検証株式会社', url: 'https://example.org/', executor: 'staff@atlib.jp' });
  assert.equal(result.filename, '検証株式会社_Webセキュリティ診断レポート.pdf');
  assert.deepEqual(result.pdf, Buffer.from('synthetic-pdf'));
  assert.match(rendered, /通信の暗号化ができています/);
  assert.match(rendered, /検証株式会社 御中/);
  assert.match(rendered, /Webサイトのファイルが悪用され、閲覧した人のパソコンで不正なプログラムが動いたり、情報を盗まれたりするおそれがあります。/);
  assert.match(rendered, /<span class="warning-icon" aria-hidden="true">⚠<\/span>追加確認推奨/);
  assert.match(rendered, /診断結果を、これからの対策につなげるために/);
  assert.doesNotMatch(rendered, /原値：|RFC 8446|MDN CSP|data-finding-id/);
});

test('rejects a non-HTTPS target before transport', async () => {
  const service = new WscSalesService({ renderPdf: async () => Buffer.alloc(0) });
  await assert.rejects(() => service.diagnose({ name: '検証', url: 'http://example.org/', executor: 'staff@atlib.jp' }), /WSC_URL_HTTPS_REQUIRED/);
});

test('reuses the WSC CSV parser for BOM, quoted fields, and invalid rows', async () => {
  type ParsedCsv = { companies: Array<{ name: string; headOffice: string; url: string }>; errors: Array<{ row: number; code: string }> };
  type CsvModule = { parseCompaniesCsv(source: string): ParsedCsv };
  const nativeImport = Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<CsvModule>;
  const csv = await nativeImport(pathToFileURL(path.resolve(process.cwd(), 'src/wsc/vendor/tools/wsc-phase2a/csv.mjs')).href);
  const result = csv.parseCompaniesCsv('\uFEFF企業名,本店所在地,URL\n"検証,株式会社",,https://example.org/\nURLなし,,\n');
  assert.equal(result.companies.length, 1);
  assert.equal(result.companies[0]?.name, '検証,株式会社');
  assert.equal(result.companies[0]?.headOffice, '');
  assert.equal(result.errors[0]?.row, 3);
  assert.equal(result.errors[0]?.code, 'CSV_REQUIRED_VALUE_MISSING');
});
