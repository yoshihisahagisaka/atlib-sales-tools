import { chromium } from 'playwright';
import {
  approvedReportPdfHtml,
  type ApprovedPdfReport,
} from './diagnosisReportPdfHtml';

export async function renderApprovedReportPdf(
  report: ApprovedPdfReport,
): Promise<Buffer> {
  // Reject invalid or unapproved reports before starting a browser.
  const html = approvedReportPdfHtml(report);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });

    const bytes = Buffer.from(pdf);
    if (bytes.length === 0 || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error('PDF_RENDER_INVALID_OUTPUT');
    }

    return bytes;
  } finally {
    await browser.close();
  }
}
