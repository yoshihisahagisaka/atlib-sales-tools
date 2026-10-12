import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';
import { chromium } from 'playwright';
import { contentHash } from '../domain/diagnosisReport';
import type { DesignV2ReportContent, DesignV2ReportFactCandidate, DesignV2ReportSection } from '../domain/freeDiagnosisDesignV2Report';

export class FreeDiagnosisDesignV2ReportPdfError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
    this.name = 'FreeDiagnosisDesignV2ReportPdfError';
  }
}

export interface ApprovedDesignV2ReportPdf {
  bytes: Buffer;
  filename: string;
  contentDisposition: string;
  elapsedMs: number;
}

type PdfRenderer = (html: string) => Promise<Buffer>;

interface StoredApprovedReport {
  id: string;
  version: number;
  status: string;
  content_json: unknown;
  snapshot_json: unknown;
}

interface ApprovalSnapshot {
  content_hash: string;
  context: Record<string, unknown>;
}

const assetNames = [
  'it-management-kaizen-logo-v1.png',
  'atlib-corporate-logo.png',
  'report-cover-v1.png',
  'report-guide-v1.png',
] as const;

const staticParagraphs = [
  'このたびは「IT経営KAIZEN 無料診断」をご利用いただき、ありがとうございます。',
  'IT経営KAIZEN 無料診断は、ITの「良し悪し」を採点する診断ではありません。会社が実現したい未来を起点に、ITについて今どこまで分かっているのかを整理し、経営判断のために次に何を詳しく確認する価値があるのかを明らかにする診断です。',
  'ITについて「分からないこと」があること自体を、問題とは考えていません。大切なのは、分かっていることと、まだ分かっていないことを分け、何を確認すれば経営として判断できるのかを明らかにすることです。',
  'そのため、このレポートでは特定のシステムやAIの導入を前提とせず、今回のアンケートとヒアリングをもとに、貴社が実現したい未来、現在どこまで分かっているか、確認する価値があること、現時点ではまだ判断できないこと、次に確認したい事実を整理しています。',
  '本レポートが、これからのITについて考え、経営として次の判断を行うための材料となれば幸いです。',
] as const;

const interpretation = {
  lenses: [
    'ここに示しているのは、現時点で「問題がある」と判断した項目ではありません。貴社が実現したい未来と、アンケート・ヒアリングで確認した現在の状況を照らし合わせ、技術・運用・管理の視点から、さらに確認することで改善の可能性を検討できるテーマを整理したものです。',
    '実際の業務やITの状況を確認することで、システムを変えるべきなのか、仕事の進め方や運用を見直すべきなのか、経営として把握・管理する仕組みを整えるべきなのかなど、どこに改善の余地があり、何を優先して取り組む価値があるのかを判断する材料につながります。',
  ],
  unknowns: [
    'ここに示しているのは、今回の無料診断だけでは、まだ事実として確認できていないことです。分からないことがあること自体を、問題とは判断していません。貴社が実現したい未来に向けて経営判断を行ううえで、現時点では判断材料が十分ではないテーマを整理しています。',
    '必要な事実を確認することで、現在のままでよいのか、改善する必要があるのか、今は対応しなくてよいのかを判断できるようになります。「分からない」を「判断できる」に変えることが、ここで確認する目的です。',
  ],
  facts: [
    'ここに示しているのは、今回の診断結果から、次の経営判断に進むために事実として確認する価値があることです。すべてを確認する必要があるという意味ではありません。貴社が今後どの判断を行いたいかに応じて、必要なものを選んで確認していくためのテーマです。',
    '実際の業務、情報の流れ、ITの使われ方、運用や管理の状況を確認することで、改善の必要性や優先順位、取り得る選択肢を具体化し、何をするか、何をしないかを経営として判断するための材料につながります。',
  ],
} as const;

function asJson<T>(value: T | string): T {
  return typeof value === 'string' ? JSON.parse(value) as T : value;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 20_000) {
    throw new FreeDiagnosisDesignV2ReportPdfError(409, 'DESIGN_V2_PDF_CONTENT_INVALID');
  }
  return value;
}

function section(content: DesignV2ReportContent, key: DesignV2ReportSection['key']): DesignV2ReportSection {
  const found = content.sections.find(item => item.key === key);
  if (!found || !Array.isArray(found.entries)) throw new FreeDiagnosisDesignV2ReportPdfError(409, 'DESIGN_V2_PDF_CONTENT_INVALID');
  found.entries.forEach(requiredString);
  return found;
}

function facts(content: DesignV2ReportContent): readonly DesignV2ReportFactCandidate[] {
  if (!Array.isArray(content.factCandidates)) throw new FreeDiagnosisDesignV2ReportPdfError(409, 'DESIGN_V2_PDF_CONTENT_INVALID');
  content.factCandidates.forEach(candidate => {
    requiredString(candidate.whatToVerify); requiredString(candidate.whyItMattersToFuture); requiredString(candidate.whatMayBecomeKnowable);
  });
  return content.factCandidates;
}

function assetDirectory(): string {
  return path.resolve(__dirname, '../../public/admin/assets');
}

function assetDataUrls(): Record<typeof assetNames[number], string> {
  const assets = {} as Record<typeof assetNames[number], string>;
  for (const name of assetNames) {
    try {
      assets[name] = `data:image/png;base64,${readFileSync(path.join(assetDirectory(), name)).toString('base64')}`;
    } catch {
      throw new FreeDiagnosisDesignV2ReportPdfError(500, 'DESIGN_V2_PDF_ASSET_UNAVAILABLE');
    }
  }
  return assets;
}

function presentationCss(assets: Record<typeof assetNames[number], string>): string {
  try {
    const root = path.resolve(__dirname, '../../public/admin');
    const css = ['free-diagnosis-v2.css', 'free-diagnosis-v2-report.css', 'free-diagnosis-v2-report-v2.css']
      .map(file => readFileSync(path.join(root, file), 'utf8')).join('\n');
    return `${css.replace("url('/admin/assets/report-cover-v1.png')", `url('${assets['report-cover-v1.png']}')`)}
      .report-document{font-family:"Noto Serif CJK JP","Noto Serif JP",serif}
      .report-document .document-header,.report-document .document-footer,.report-document .chapter-number,.report-document .cover-issuer p{font-family:"Noto Sans CJK JP","Noto Sans JP",sans-serif}`;
  } catch {
    throw new FreeDiagnosisDesignV2ReportPdfError(500, 'DESIGN_V2_PDF_PRESENTATION_UNAVAILABLE');
  }
}

function chapter(number: string, title: string, subtitle = ''): string {
  return `<section class="document-chapter"><header class="chapter-header">${number ? `<p class="chapter-number">${escapeHtml(number)}</p>` : ''}<h2>${escapeHtml(title)}</h2>${subtitle ? `<p class="chapter-subtitle">${escapeHtml(subtitle)}</p>` : ''}</header>`;
}

function page(pageNo: number, body: string, className = ''): string {
  return `<section class="report-page ${className}"><div class="document-header">IT経営KAIZEN 無料診断　診断結果レポート</div>${body}<footer class="document-footer"><span>atLIB株式会社</span><span>${pageNo}</span></footer></section>`;
}

function entries(values: readonly string[]): string {
  return `<ul class="document-entry-list">${values.map(value => `<li>${escapeHtml(value)}</li>`).join('')}</ul>`;
}

function detail(sectionValue: DesignV2ReportSection, subtitle = ''): string {
  return `${chapter(sectionValue.title.slice(0, 2), sectionValue.title.slice(3), subtitle)}${entries(sectionValue.entries)}</section>`;
}

function interpretationBlock(first: string, second: string): string {
  return `<section class="report-interpretation"><h3>この診断結果が表していること</h3><p>${escapeHtml(first)}</p><h3>確認することで、こんな判断につながる可能性があります</h3><p>${escapeHtml(second)}</p></section>`;
}

function staticIntroduction(assets: Record<typeof assetNames[number], string>): string {
  const labels: readonly [string, string][] = [
    ['diagram-future', '01 実現したい会社の未来'], ['diagram-context', '未来を基準に、アンケート＋ヒアリングで現在を確認'],
    ['diagram-current', '02 現在どこまで分かっているか'], ['diagram-unknown', '04 現時点ではまだ判断できないこと'],
    ['diagram-improvement', '03 未来に向けて確認することで、改善が期待できること'], ['diagram-technology', '技術'],
    ['diagram-operation', '運用'], ['diagram-management', '管理'], ['diagram-facts', '05 次に確認する価値があること'],
    ['diagram-next-decision', '次の経営判断へ'],
  ];
  return `${chapter('', 'このレポートをお読みいただく前に')} ${staticParagraphs.map(text => `<p class="introduction-paragraph">${escapeHtml(text)}</p>`).join('')}<section class="report-concept-diagram"><img class="report-concept-art" src="${assets['report-guide-v1.png']}" alt=""><div class="report-concept-labels">${labels.map(([className, text]) => `<p class="report-concept-label ${className}">${escapeHtml(text)}</p>`).join('')}</div></section></section>`;
}

function nextDecision(): string {
  const services: readonly [string, string, string][] = [
    ['設計Assessment', '問いを、判断材料へ', '無料診断で明らかになった「次に確認したいこと」を事実として確認し、経営判断に必要なIT戦略と改善プランを具体化します。'],
    ['IT経営KAIZEN 導入支援', '判断を、実行へ', '経営判断に基づき、必要なシステムや仕組みの選定・設計・導入を支援します。'],
    ['IT経営KAIZEN 運用支援', 'IT運用を、IT戦略へ', '日々のIT運用を支えながら、IT部門が運用対応だけに追われず、企業のIT戦略を担える体制づくりを支援します。'],
    ['IT経営KAIZEN 継続KAIZEN', '改善を、一度で終わらせない', '経営や事業、ITの変化を継続的に確認し、判断・実行・振り返り・改善を繰り返すKAIZENの仕組みづくりを支援します。'],
  ];
  const principles = [
    'IT経営で大切なのは、新しいシステムやAIを導入することそのものではありません。会社が実現したい未来に対して、何が必要なのか、何には投資し、何には投資しないのかを、経営として判断できることだと私たちは考えています。',
    'そのためIT経営KAIZENでは、ITだけを見るのではなく、「技術」「運用」「管理」の3つの視点から会社の状況を捉えます。システムを変えれば解決するのか、仕事の進め方や運用を見直すべきなのか、経営として把握・管理する仕組みが必要なのか。一つの課題を一つの答えに決めつけず、複数の視点から確認します。',
    'さらに、会社が目指す未来に対して、現在どこまで分かっているか、何を確認する価値があるか、何がまだ判断できないか、次にどの事実を確認するか、どのような選択肢があるか、そして何を実行するかを順に整理していきます。',
    '分からないことを推測で埋めたり、最初から特定の製品や解決策を当てはめたりはしません。必要な事実を確認し、経営判断に必要な材料を整理します。',
    'また、当社への発注を前提とした診断ではありません。実行すると判断した場合も、当社へ依頼する、現在のITベンダーへ依頼する、自社のIT部門で実施するなど、貴社に適した方法を選択できます。',
    '進めることも、進めないことも含めて、最後に判断するのは経営者です。IT経営KAIZENは、その判断と実行を支えます。',
  ];
  return `${chapter('', '診断結果を、次の経営判断へ')}<p class="next-decision-lead">今回の無料診断で整理した内容によって、次に必要なことは企業ごとに異なります。さらに事実を確認する必要があれば設計Assessmentへ進み、すでに判断できる状態であれば、導入・運用・継続的な改善へ進むこともできます。何も実施しないことも、経営判断の一つです。</p><section class="service-options">${services.map(([title, subtitle, text]) => `<section class="service-option"><h3>${escapeHtml(title)}</h3><h4>${escapeHtml(subtitle)}</h4><p>${escapeHtml(text)}</p></section>`).join('')}</section><section class="kaizen-principle"><h3>IT経営KAIZENが大切にしていること</h3>${principles.map(text => `<p>${escapeHtml(text)}</p>`).join('')}</section></section>`;
}

export function renderApprovedDesignV2ReportHtml(content: DesignV2ReportContent): string {
  const assets = assetDataUrls();
  const css = presentationCss(assets);
  const future = section(content, 'FUTURE'); const current = section(content, 'CURRENT_UNDERSTANDING');
  const lenses = section(content, 'LENSES'); const unknowns = section(content, 'UNKNOWNS');
  const candidates = facts(content);
  const recipient = requiredString(content.recipient?.organizationDisplayName);
  const diagnosisDate = requiredString(content.diagnosisDate);
  const cover = `<section class="report-page report-cover"><img class="report-logo" src="${assets['it-management-kaizen-logo-v1.png']}" alt="IT経営KAIZEN"><div class="cover-rule"></div><p class="cover-service">IT経営KAIZEN 無料診断</p><h1>診断結果レポート</h1><p class="cover-message">会社の未来から、ITを考える。</p><div class="report-recipient"><strong>${escapeHtml(recipient)}</strong>${content.recipient.role ? `<p>${escapeHtml(content.recipient.role)}</p>` : ''}${content.recipient.name ? `<p>${escapeHtml(content.recipient.name)} 様</p>` : ''}<p>診断日：${escapeHtml(diagnosisDate || '未記入')}</p></div><div class="cover-issuer"><img class="cover-atlib-logo" src="${assets['atlib-corporate-logo.png']}" alt="atLIB"><p>atLIB株式会社</p></div></section>`;
  const factsHtml = `${chapter('05', '次に確認する価値があること')}${candidates.map((candidate, index) => `<article class="fact-candidate"><h3><span class="fact-candidate-number">${String(index + 1).padStart(2, '0')}</span><span class="fact-candidate-title">${escapeHtml(candidate.whatToVerify)}</span></h3><p>${escapeHtml(`${candidate.whyItMattersToFuture} ${candidate.whatMayBecomeKnowable}`)}</p></article>`).join('')}</section>`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline';"><title>IT経営KAIZEN 診断結果レポート</title><style>${css}</style></head><body><main class="report-editor-shell"><article class="report-document">${cover}${page(2, staticIntroduction(assets), 'report-introduction-document')}${page(3, detail(future), 'report-future-page')}${page(4, detail(current), 'report-current-page')}${page(5, `${detail(lenses)}${interpretationBlock(...interpretation.lenses)}`, 'report-improvement-page')}${page(6, `${detail(unknowns)}${interpretationBlock(...interpretation.unknowns)}`, 'report-unknowns-page')}${page(7, `${factsHtml}${interpretationBlock(...interpretation.facts)}`, 'report-facts-page')}${page(8, nextDecision(), 'report-next-decision-document')}</article></main></body></html>`;
}

export async function renderApprovedDesignV2ReportPdf(html: string): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.route('**/*', route => /^https?:/i.test(route.request().url()) ? route.abort() : route.continue());
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 30_000 });
    await page.emulateMedia({ media: 'print' });
    let timeout: NodeJS.Timeout | undefined;
    const pdf = Buffer.from(await Promise.race([
      page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('DESIGN_V2_PDF_TIMEOUT')), 60_000); }),
    ]).finally(() => { if (timeout) clearTimeout(timeout); }));
    if (pdf.length < 1_000 || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('DESIGN_V2_PDF_INVALID_OUTPUT');
    return pdf;
  } finally {
    await browser.close();
  }
}

function safeFilePart(value: string): string {
  return value.normalize('NFKC').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || '会社名未記入';
}

export function designV2ReportPdfFilename(content: DesignV2ReportContent): { ascii: string; utf8: string } {
  const date = /^\d{4}-\d{2}-\d{2}/.test(content.diagnosisDate) ? content.diagnosisDate.slice(0, 10) : '診断日未記入';
  const company = safeFilePart(requiredString(content.recipient?.organizationDisplayName));
  return { ascii: `it-management-kaizen-report-${date}.pdf`, utf8: `IT経営KAIZEN_診断結果レポート_${company}_${safeFilePart(date)}.pdf` };
}

export function inlinePdfContentDisposition(filename: { ascii: string; utf8: string }): string {
  const encoded = encodeURIComponent(filename.utf8).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `inline; filename="${filename.ascii}"; filename*=UTF-8''${encoded}`;
}

export class FreeDiagnosisDesignV2ReportPdfService {
  constructor(private readonly pool: Pool, private readonly render: PdfRenderer = renderApprovedDesignV2ReportPdf) {}

  async generate(caseId: string, reportId: string): Promise<ApprovedDesignV2ReportPdf> {
    const { rows } = await this.pool.query<StoredApprovedReport>(
      `SELECT id,version,status,content_json,snapshot_json FROM diagnosis_reports
       WHERE id=$1 AND it_management_diagnosis_case_v2_id=$2 AND policy_version='design-v2'`, [reportId, caseId],
    );
    const report = rows[0];
    if (!report) throw new FreeDiagnosisDesignV2ReportPdfError(404, 'DESIGN_V2_REPORT_NOT_FOUND');
    if (report.status !== 'APPROVED') throw new FreeDiagnosisDesignV2ReportPdfError(409, 'DESIGN_V2_REPORT_NOT_APPROVED');
    let content: DesignV2ReportContent; let snapshot: ApprovalSnapshot;
    try { content = asJson<DesignV2ReportContent>(report.content_json as DesignV2ReportContent | string); snapshot = asJson<ApprovalSnapshot>(report.snapshot_json as ApprovalSnapshot | string); }
    catch { throw new FreeDiagnosisDesignV2ReportPdfError(409, 'DESIGN_V2_REPORT_SNAPSHOT_INVALID'); }
    if (!snapshot || typeof snapshot.content_hash !== 'string' || !snapshot.context || Array.isArray(snapshot.context) || contentHash(content) !== snapshot.content_hash) {
      throw new FreeDiagnosisDesignV2ReportPdfError(409, 'DESIGN_V2_REPORT_SNAPSHOT_INVALID');
    }
    const startedAt = Date.now();
    try {
      const bytes = await this.render(renderApprovedDesignV2ReportHtml(content));
      if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('DESIGN_V2_PDF_INVALID_OUTPUT');
      const filename = designV2ReportPdfFilename(content);
      return {
        bytes,
        filename: filename.utf8,
        contentDisposition: inlinePdfContentDisposition(filename),
        elapsedMs: Date.now() - startedAt,
      };
    } catch (error) {
      if (error instanceof FreeDiagnosisDesignV2ReportPdfError) throw error;
      throw new FreeDiagnosisDesignV2ReportPdfError(500, 'DESIGN_V2_PDF_RENDER_FAILED');
    }
  }
}

export function pdfSha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
