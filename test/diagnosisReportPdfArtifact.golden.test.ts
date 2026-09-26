import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  reportPdfObjectKey,
  reportPdfSha256,
} from '../src/services/diagnosisReportPdfArtifact';

const caseId = '11111111-1111-4111-8111-111111111111';
const reportIdV1 = '22222222-2222-4222-8222-222222222222';
const reportIdV2 = '33333333-3333-4333-8333-333333333333';

test('same report identity produces the same immutable object key', () => {
  const identity = { caseId, reportId: reportIdV1, version: 1 };
  const first = reportPdfObjectKey(identity);
  const second = reportPdfObjectKey(identity);

  assert.equal(first, second);
  assert.equal(
    first,
    `it-management-diagnosis/reports/${caseId}/v1/${reportIdV1}.pdf`,
  );
});

test('reissued report has a different object key', () => {
  const previous = reportPdfObjectKey({
    caseId, reportId: reportIdV1, version: 1,
  });
  const reissued = reportPdfObjectKey({
    caseId, reportId: reportIdV2, version: 2,
  });

  assert.notEqual(previous, reissued);
  assert.match(reissued, /\/v2\//);
});

test('invalid identity is rejected', () => {
  assert.throws(
    () => reportPdfObjectKey({ caseId, reportId: '../escape', version: 1 }),
    /PDF_ARTIFACT_IDENTITY_INVALID/,
  );
  assert.throws(
    () => reportPdfObjectKey({ caseId, reportId: reportIdV1, version: 0 }),
    /PDF_ARTIFACT_IDENTITY_INVALID/,
  );
});

test('PDF hash is stable and changes when bytes change', () => {
  const first = Buffer.from('%PDF-1.4\nfirst');
  const second = Buffer.from('%PDF-1.4\nsecond');

  assert.equal(reportPdfSha256(first), reportPdfSha256(Buffer.from(first)));
  assert.notEqual(reportPdfSha256(first), reportPdfSha256(second));
  assert.match(reportPdfSha256(first), /^[a-f0-9]{64}$/);
});

test('non-PDF bytes are rejected', () => {
  assert.throws(
    () => reportPdfSha256(Buffer.from('not a PDF')),
    /PDF_ARTIFACT_INVALID_BYTES/,
  );
});
