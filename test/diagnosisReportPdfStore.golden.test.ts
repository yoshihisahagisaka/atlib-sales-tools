import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reportPdfObjectKey, reportPdfSha256 } from '../src/services/diagnosisReportPdfArtifact';
import { GcsDiagnosisReportPdfStore } from '../src/services/diagnosisReportPdfStore';

const identity = {
  caseId: '11111111-1111-4111-8111-111111111111',
  reportId: '22222222-2222-4222-8222-222222222222',
  version: 1,
};
const pdf = Buffer.from('%PDF-1.4\napproved report');
const objectKey = reportPdfObjectKey(identity);
const auth = { getAccessToken: async () => 'test-token' };

function mockFetch(
  handler: (url: string, init: RequestInit) => Promise<Response>,
): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (input, init) =>
    handler(String(input), init ?? {});
  return () => { globalThis.fetch = original; };
}

test('initial upload uses create-only precondition', async () => {
  let uploadCount = 0;
  const restore = mockFetch(async (url, init) => {
    uploadCount += 1;
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('ifGenerationMatch'), '0');
    assert.equal(parsed.searchParams.get('name'), objectKey);
    assert.equal(init.method, 'POST');
    assert.equal(new Headers(init.headers).get('Content-Type'), 'application/pdf');
    return new Response('{}', { status: 200 });
  });

  try {
    const store = new GcsDiagnosisReportPdfStore('test-bucket', auth as never);
    const saved = await store.putImmutable(identity, pdf);
    assert.equal(uploadCount, 1);
    assert.deepEqual(saved, {
      objectKey,
      sha256: reportPdfSha256(pdf),
      sizeBytes: pdf.length,
    });
  } finally {
    restore();
  }
});

test('412 accepts identical existing PDF after hash verification', async () => {
  let requests = 0;
  const restore = mockFetch(async (_url, init) => {
    requests += 1;
    if (init.method === 'POST') {
      return new Response('', { status: 412 });
    }
    return new Response(new Uint8Array(pdf), { status: 200 });
  });

  try {
    const store = new GcsDiagnosisReportPdfStore('test-bucket', auth as never);
    const saved = await store.putImmutable(identity, pdf);
    assert.equal(saved.sha256, reportPdfSha256(pdf));
    assert.equal(requests, 2);
  } finally {
    restore();
  }
});

test('412 rejects different existing PDF', async () => {
  const restore = mockFetch(async (_url, init) =>
    init.method === 'POST'
      ? new Response('', { status: 412 })
      : new Response(new Uint8Array(Buffer.from('%PDF-1.4\ndifferent')), { status: 200 }),
  );

  try {
    const store = new GcsDiagnosisReportPdfStore('test-bucket', auth as never);
    await assert.rejects(
      store.putImmutable(identity, pdf),
      /DIAGNOSIS_REPORT_PDF_GCS_HASH_MISMATCH/,
    );
  } finally {
    restore();
  }
});

test('read rejects PDF whose hash differs from DB metadata', async () => {
  const restore = mockFetch(async () =>
    new Response(new Uint8Array(Buffer.from('%PDF-1.4\ntampered')), { status: 200 }),
  );

  try {
    const store = new GcsDiagnosisReportPdfStore('test-bucket', auth as never);
    await assert.rejects(
      store.getVerified(objectKey, reportPdfSha256(pdf)),
      /DIAGNOSIS_REPORT_PDF_GCS_HASH_MISMATCH/,
    );
  } finally {
    restore();
  }
});

test('missing bucket is rejected', () => {
  assert.throws(
    () => new GcsDiagnosisReportPdfStore('', auth as never),
    /DIAGNOSIS_REPORT_PDF_BUCKET_REQUIRED/,
  );
});

test('readExisting returns verified metadata without uploading', async () => {
  let requests = 0;
  const restore = mockFetch(async (url, init) => {
    requests += 1;
    assert.notEqual(init.method, 'POST');
    assert.equal(new URL(url).searchParams.get('alt'), 'media');
    assert.ok(url.includes(encodeURIComponent(objectKey)));
    return new Response(new Uint8Array(pdf), { status: 200 });
  });

  try {
    const store = new GcsDiagnosisReportPdfStore('test-bucket', auth as never);
    const existing = await store.readExisting(identity);
    assert.ok(existing);
    assert.deepEqual(existing.pdf, pdf);
    assert.deepEqual(existing.stored, {
      objectKey,
      sha256: reportPdfSha256(pdf),
      sizeBytes: pdf.length,
    });
    assert.equal(requests, 1);
  } finally {
    restore();
  }
});

test('readExisting returns null when object does not exist', async () => {
  const restore = mockFetch(async () =>
    new Response('', { status: 404 }),
  );

  try {
    const store = new GcsDiagnosisReportPdfStore('test-bucket', auth as never);
    assert.equal(await store.readExisting(identity), null);
  } finally {
    restore();
  }
});

test('readExisting rejects non-PDF object data', async () => {
  const restore = mockFetch(async () =>
    new Response(new Uint8Array(Buffer.from('not a PDF')), { status: 200 }),
  );

  try {
    const store = new GcsDiagnosisReportPdfStore('test-bucket', auth as never);
    await assert.rejects(
      store.readExisting(identity),
      /PDF_ARTIFACT_INVALID|PDF_INVALID|PDF/,
    );
  } finally {
    restore();
  }
});