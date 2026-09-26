import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contentHash, type StoredReport } from '../src/domain/diagnosisReport';
import {
  approvedReportPdfHtml,
  type ApprovedPdfReport,
} from '../src/services/diagnosisReportPdfHtml';

function approvedReport(): ApprovedPdfReport {
  const content_json: StoredReport = {
    sections: [{
      section_key: 'FUTURE',
      title: '1. 目指している会社の姿',
      blocks: [{
        block_id: 'block-1',
        section: 'FUTURE',
        block_type: 'FUTURE',
        text: '顧客の言葉：<改善> & "未来"',
        insight_refs: [],
        assessment_refs: [],
      }],
    }],
  };

  return {
    id: 'report-1',
    diagnosis_case_id: 'case-1',
    version: 1,
    status: 'APPROVED',
    content_json,
    snapshot_json: {
      organization_display_name: '株式会社 <顧客>',
      provider_display_name: 'atLIB株式会社',
      content_hash: contentHash(content_json),
      approved_at: '2026-09-26T03:00:00.000Z',
      approved_by: 'staff-1',
      report_version: 1,
    },
  };
}

test('approved snapshot renders escaped HTML without changing stored content', () => {
  const report = approvedReport();
  const original = JSON.stringify(report);
  const html = approvedReportPdfHtml(report);

  assert.match(html, /株式会社 &lt;顧客&gt;/);
  assert.match(html, /&lt;改善&gt; &amp; &quot;未来&quot;/);
  assert.doesNotMatch(html, /<改善>/);
  assert.equal(JSON.stringify(report), original);
});

test('draft and missing snapshot cannot render', () => {
  const draft = approvedReport();
  draft.status = 'DRAFT';
  assert.throws(() => approvedReportPdfHtml(draft), /PDF_REPORT_NOT_APPROVED/);

  const missing = approvedReport();
  missing.snapshot_json = null;
  assert.throws(() => approvedReportPdfHtml(missing), /PDF_REPORT_NOT_APPROVED/);
});

test('modified approved content is rejected', () => {
  const report = approvedReport();
  const section = report.content_json.sections[0];
  assert.ok(section);
  const block = section.blocks[0];
  assert.ok(block);
  block.text = '承認後に変更された文章';
  assert.throws(() => approvedReportPdfHtml(report), /PDF_REPORT_SNAPSHOT_INVALID/);
});

test('report version must match approved snapshot version', () => {
  const report = approvedReport();
  report.version = 2;
  assert.throws(() => approvedReportPdfHtml(report), /PDF_REPORT_SNAPSHOT_INVALID/);
});

test('previous approved version remains independent of reissued draft', () => {
  const previous = approvedReport();
  const originalHtml = approvedReportPdfHtml(previous);
  const reissued = approvedReport();
  reissued.id = 'report-2';
  reissued.version = 2;
  reissued.status = 'REVIEW_REQUIRED';
  const section = reissued.content_json.sections[0];
  assert.ok(section);
  const block = section.blocks[0];
  assert.ok(block);
  block.text = '第2版の資料案';

  assert.throws(() => approvedReportPdfHtml(reissued), /PDF_REPORT_NOT_APPROVED/);
  assert.equal(approvedReportPdfHtml(previous), originalHtml);
});
