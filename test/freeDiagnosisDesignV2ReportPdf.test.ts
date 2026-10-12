import assert from 'node:assert/strict';
import test from 'node:test';
import { contentHash } from '../src/domain/diagnosisReport';
import { DESIGN_V2_REPORT_FORMAT_VERSION, type DesignV2ReportContent } from '../src/domain/freeDiagnosisDesignV2Report';
import {
  FreeDiagnosisDesignV2ReportPdfError,
  FreeDiagnosisDesignV2ReportPdfService,
  renderApprovedDesignV2ReportHtml,
} from '../src/services/freeDiagnosisDesignV2ReportPdf';

function reportContent(marker = 'APPROVED-V1'): DesignV2ReportContent {
  const sections = [
    ['FUTURE', '01 実現したい会社の未来'],
    ['CURRENT_UNDERSTANDING', '02 現在どこまで分かっているか'],
    ['LENSES', '03 未来に向けて確認しておく価値があること'],
    ['UNKNOWNS', '04 現時点ではまだ判断できないこと'],
    ['NEXT_FACTS', '05 次に確認する価値があること'],
  ] as const;
  const candidates = Array.from({ length: 5 }, (_, index) => ({
    id: `fact-${index + 1}`,
    whatToVerify: `${marker} 確認事項 ${index + 1}`,
    whyItMattersToFuture: '未来に向けた確認理由です。',
    whatMayBecomeKnowable: '確認によって判断材料を整理できます。',
    lenses: ['MANAGEMENT'] as const,
    sourceRuleIds: ['rule-1'],
  }));
  return {
    formatVersion: DESIGN_V2_REPORT_FORMAT_VERSION,
    recipient: { organizationDisplayName: `${marker} 株式会社`, name: '山田 太郎' },
    diagnosisDate: '2026-10-13',
    issuer: { displayName: 'atLIB株式会社' },
    sections: sections.map(([key, title]) => ({ key, title, entries: [`${marker} ${title}`] })),
    diagnosisMap: [],
    factCandidates: candidates,
    assessmentProposal: { status: 'NOT_SELECTED', source: 'ANALYSIS_FACT_CANDIDATES', candidates },
  };
}

function approvedRow(content: DesignV2ReportContent, overrides: Record<string, unknown> = {}) {
  return {
    id: 'report-1', version: 1, status: 'APPROVED', content_json: content,
    snapshot_json: { content_hash: contentHash(content), context: { adoptedNarrative: { id: 'narrative-1' } } },
    ...overrides,
  };
}

function service(rows: Record<string, unknown>[], renderer: (html: string) => Promise<Buffer>) {
  const pool = { query: async (_sql: string, values: readonly unknown[]) => ({ rows: rows.filter(row => row.id === values[0]) }) } as any;
  return new FreeDiagnosisDesignV2ReportPdfService(pool, renderer);
}

test('approved Design v2 PDF HTML is static, escaped, and preserves the eight-page presentation', () => {
  const content = reportContent('<script>alert(1)</script>');
  const html = renderApprovedDesignV2ReportHtml(content);
  assert.equal((html.match(/class="report-page/g) ?? []).length, 8);
  assert.match(html, /data:image\/png;base64,/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.match(html, /01 実現したい会社の未来/);
  assert.match(html, /診断結果を、次の経営判断へ/);
});

test('approved Design v2 PDF service renders only the approved, snapshot-verified report version', async () => {
  const v1 = reportContent('APPROVED-V1');
  const renderer = async (html: string) => Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from(html)]);
  const result = await service([approvedRow(v1, { id: 'report-1' })], renderer).generate('case-1', 'report-1');
  assert.equal(result.bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.match(result.contentDisposition, /^inline; filename="it-management-kaizen-report-2026-10-13\.pdf"; filename\*=UTF-8''/);
  assert.match(result.contentDisposition, /IT%E7%B5%8C%E5%96%B6KAIZEN/);
  assert.ok(result.elapsedMs >= 0);

  const v2 = reportContent('APPROVED-V2');
  const historical = await service([approvedRow(v1, { id: 'report-1' }), approvedRow(v2, { id: 'report-2', version: 2 })], renderer)
    .generate('case-1', 'report-1');
  assert.match(historical.bytes.toString('utf8'), /APPROVED-V1/);
  assert.doesNotMatch(historical.bytes.toString('utf8'), /APPROVED-V2/);
});

test('approved Design v2 PDF service rejects invalid lifecycle and snapshot states and fails closed on rendering', async () => {
  const content = reportContent();
  const renderer = async () => Buffer.from('%PDF-1.4\nvalid');
  await assert.rejects(
    service([], renderer).generate('case-1', 'report-1'),
    (error: unknown) => error instanceof FreeDiagnosisDesignV2ReportPdfError && error.status === 404,
  );
  await assert.rejects(
    service([approvedRow(content, { status: 'REVIEW_REQUIRED' })], renderer).generate('case-1', 'report-1'),
    (error: unknown) => error instanceof FreeDiagnosisDesignV2ReportPdfError && error.status === 409 && error.code === 'DESIGN_V2_REPORT_NOT_APPROVED',
  );
  await assert.rejects(
    service([approvedRow(content, { status: 'DELIVERED' })], renderer).generate('case-1', 'report-1'),
    (error: unknown) => error instanceof FreeDiagnosisDesignV2ReportPdfError && error.status === 409 && error.code === 'DESIGN_V2_REPORT_NOT_APPROVED',
  );
  await assert.rejects(
    service([approvedRow(content, { snapshot_json: null })], renderer).generate('case-1', 'report-1'),
    (error: unknown) => error instanceof FreeDiagnosisDesignV2ReportPdfError && error.status === 409 && error.code === 'DESIGN_V2_REPORT_SNAPSHOT_INVALID',
  );
  await assert.rejects(
    service([approvedRow(content, { snapshot_json: { content_hash: 'wrong', context: {} } })], renderer).generate('case-1', 'report-1'),
    (error: unknown) => error instanceof FreeDiagnosisDesignV2ReportPdfError && error.status === 409 && error.code === 'DESIGN_V2_REPORT_SNAPSHOT_INVALID',
  );
  const invalidContent = { ...content, sections: [] } as DesignV2ReportContent;
  await assert.rejects(
    service([approvedRow(invalidContent)], renderer).generate('case-1', 'report-1'),
    (error: unknown) => error instanceof FreeDiagnosisDesignV2ReportPdfError && error.status === 409 && error.code === 'DESIGN_V2_PDF_CONTENT_INVALID',
  );
  await assert.rejects(
    service([approvedRow(content)], async () => { throw new Error('renderer exploded'); }).generate('case-1', 'report-1'),
    (error: unknown) => error instanceof FreeDiagnosisDesignV2ReportPdfError && error.status === 500 && error.code === 'DESIGN_V2_PDF_RENDER_FAILED',
  );
});
