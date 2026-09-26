import { contentHash, type StoredReport } from '../domain/diagnosisReport';

export interface ApprovedPdfReport {
  id: string;
  diagnosis_case_id: string;
  version: number;
  status: string;
  content_json: StoredReport;
  snapshot_json: {
    organization_display_name: string;
    provider_display_name: string;
    content_hash: string;
    approved_at: string;
    approved_by: string;
    [key: string]: unknown;
  } | null;
}

const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);

export function approvedReportPdfHtml(report: ApprovedPdfReport): string {
  if (!['APPROVED', 'DELIVERED'].includes(report.status) || !report.snapshot_json) {
    throw new Error('PDF_REPORT_NOT_APPROVED');
  }

  const snapshot = report.snapshot_json;
  if (snapshot.content_hash !== contentHash(report.content_json) ||
      snapshot.report_version !== report.version ||
      !snapshot.approved_at || !snapshot.approved_by) {
    throw new Error('PDF_REPORT_SNAPSHOT_INVALID');
  }

  const sections = report.content_json.sections.map(section => `
    <section class="report-section">
      <h2>${escapeHtml(section.title)}</h2>
      ${section.blocks.map(block =>
        `<div class="report-block">${escapeHtml(block.text)}</div>`
      ).join('')}
    </section>
  `).join('');

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>IT経営KAIZEN 経営フィードバック 第${report.version}版</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: "Noto Sans CJK JP", "Yu Gothic", sans-serif; color: #202b38; }
  h1 { font-size: 20pt; }
  h2 { font-size: 13pt; margin-top: 20pt; }
  .meta { font-size: 10pt; }
  .report-section { break-inside: auto; }
  .report-block { white-space: pre-wrap; overflow-wrap: anywhere; margin: 10pt 0; break-inside: avoid; }
</style>
</head>
<body>
<h1>${escapeHtml(snapshot.organization_display_name)}</h1>
<p>IT経営KAIZEN 無料診断 / 経営フィードバック</p>
<p class="meta">提供：${escapeHtml(snapshot.provider_display_name)}</p>
<p class="meta">第${report.version}版 / 承認日時：${escapeHtml(snapshot.approved_at)}</p>
${sections}
</body>
</html>`;
}
