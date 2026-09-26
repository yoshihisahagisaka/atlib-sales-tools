import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DiagnosisReportPdfRepo, type PdfArtifactRow } from '../src/services/diagnosisReportPdfRepo';
import { reportPdfObjectKey } from '../src/services/diagnosisReportPdfArtifact';

const identity = {
  caseId: '11111111-1111-4111-8111-111111111111',
  reportId: '22222222-2222-4222-8222-222222222222',
  version: 1,
};

function artifact(status: PdfArtifactRow['status']): PdfArtifactRow {
  return {
    report_id: identity.reportId,
    diagnosis_case_id: identity.caseId,
    report_version: identity.version,
    status,
    object_key: null,
    pdf_sha256: null,
    pdf_size_bytes: null,
    error_code: null,
  };
}

test('new artifact acquires generation right', async () => {
  const pool = {
    query: async (sql: string) => {
      assert.match(sql, /INSERT INTO diagnosis_report_pdf_artifacts/);
      assert.match(sql, /ON CONFLICT \(report_id\)/);
      return { rows: [artifact('PENDING')] };
    },
  };
  const result = await new DiagnosisReportPdfRepo(pool as never).claim(identity);
  assert.equal(result.acquired, true);
  assert.equal(result.artifact.status, 'PENDING');
});

test('existing PENDING does not acquire generation right', async () => {
  let calls = 0;
  const pool = {
    query: async () => {
      calls += 1;
      return { rows: calls === 1 ? [] : [artifact('PENDING')] };
    },
  };
  const result = await new DiagnosisReportPdfRepo(pool as never).claim(identity);
  assert.equal(result.acquired, false);
  assert.equal(result.artifact.status, 'PENDING');
  assert.equal(calls, 2);
});

test('existing READY does not acquire generation right', async () => {
  let calls = 0;
  const pool = {
    query: async () => {
      calls += 1;
      return { rows: calls === 1 ? [] : [artifact('READY')] };
    },
  };
  const result = await new DiagnosisReportPdfRepo(pool as never).claim(identity);
  assert.equal(result.acquired, false);
  assert.equal(result.artifact.status, 'READY');
});

test('FAILED artifact can acquire generation right again', async () => {
  const pool = {
    query: async (sql: string) => {
      assert.match(sql, /status='FAILED'/);
      return { rows: [artifact('PENDING')] };
    },
  };
  const result = await new DiagnosisReportPdfRepo(pool as never).claim(identity);
  assert.equal(result.acquired, true);
});

test('claim returns a token only when generation right is acquired', async () => {
  const pool = {
    query: async () => ({ rows: [artifact('PENDING')] }),
  };
  const result = await new DiagnosisReportPdfRepo(pool as never).claim(identity);
  assert.equal(result.acquired, true);
  assert.match(result.generationToken ?? '', /^[0-9a-f-]{36}$/);
});

test('READY transition requires matching immutable object key', async () => {
  let queries = 0;
  const pool = {
    query: async () => {
      queries += 1;
      return { rows: [artifact('READY')] };
    },
  };
  const repo = new DiagnosisReportPdfRepo(pool as never);

  await assert.rejects(
    repo.ready(identity, '33333333-3333-4333-8333-333333333333', {
      objectKey: 'wrong.pdf',
      sha256: 'a'.repeat(64),
      sizeBytes: 100,
    }),
    /PDF_ARTIFACT_METADATA_INVALID/,
  );
  assert.equal(queries, 0);

  const result = await repo.ready(identity, '33333333-3333-4333-8333-333333333333', {
    objectKey: reportPdfObjectKey(identity),
    sha256: 'a'.repeat(64),
    sizeBytes: 100,
  });
  assert.equal(result.status, 'READY');
  assert.equal(queries, 1);
});

test('READY update only targets PENDING and cannot overwrite READY', async () => {
  const pool = {
    query: async (sql: string) => {
      assert.match(sql, /status='PENDING'/);
      assert.match(sql, /generation_token=\$4/);
      assert.match(sql, /lease_expires_at > now\(\)/);
      return { rows: [] };
    },
  };
  const repo = new DiagnosisReportPdfRepo(pool as never);
  await assert.rejects(
    repo.ready(identity, '33333333-3333-4333-8333-333333333333', {
      objectKey: reportPdfObjectKey(identity),
      sha256: 'a'.repeat(64),
      sizeBytes: 100,
    }),
    /PDF_ARTIFACT_LEASE_LOST/,
  );
});

test('failure update only targets PENDING', async () => {
  const pool = {
    query: async (sql: string) => {
      assert.match(sql, /status='FAILED'/);
      assert.match(sql, /status='PENDING'/);
      assert.match(sql, /generation_token=\$4/);
      assert.match(sql, /lease_expires_at > now\(\)/);
      return { rows: [] };
    },
  };
  await new DiagnosisReportPdfRepo(pool as never).failed(identity, '33333333-3333-4333-8333-333333333333', 'PDF_RENDER_FAILED');
});
