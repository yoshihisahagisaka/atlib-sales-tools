import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { contentHash, type StoredReport } from '../src/domain/diagnosisReport';
import { renderApprovedReportPdf } from '../src/services/diagnosisReportPdfRenderer';
import type { ApprovedPdfReport } from '../src/services/diagnosisReportPdfHtml';

function report(): ApprovedPdfReport {
  const content_json: StoredReport = {
    sections: [{
      section_key: 'FUTURE',
      title: '1. 目指している会社の姿',
      blocks: [{
        block_id: 'pdf-test-block',
        section: 'FUTURE',
        block_type: 'FUTURE',
        text: 'IT経営KAIZEN：承認済みの日本語レポート',
        insight_refs: [],
        assessment_refs: [],
      }],
    }],
  };

  return {
    id: 'pdf-test-report',
    diagnosis_case_id: 'pdf-test-case',
    version: 1,
    status: 'APPROVED',
    content_json,
    snapshot_json: {
      organization_display_name: 'PDF検証株式会社',
      provider_display_name: 'atLIB株式会社',
      content_hash: contentHash(content_json),
      approved_at: '2026-09-26T03:00:00.000Z',
      approved_by: 'pdf-test-staff',
      report_version: 1,
    },
  };
}

test('approved report renders a valid PDF buffer', async () => {
  const source = report();
  const before = JSON.stringify(source);
  const pdf = await renderApprovedReportPdf(source);

  assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.ok(pdf.length > 1000);
  assert.equal(JSON.stringify(source), before);

  const sha256 = createHash('sha256').update(pdf).digest('hex');
  assert.match(sha256, /^[a-f0-9]{64}$/);
  console.log(`PDF_BYTES=${pdf.length} PDF_SHA256=${sha256}`);
});

test('unapproved report is rejected before PDF rendering', async () => {
  const source = report();
  source.status = 'DRAFT';
  await assert.rejects(
    renderApprovedReportPdf(source),
    /PDF_REPORT_NOT_APPROVED/,
  );
});
