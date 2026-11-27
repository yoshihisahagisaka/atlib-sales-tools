import PptxGenJS from 'pptxgenjs';
import {
  buildPaidAssessmentDeliverableProjection,
  type DeliverableProjectionInput,
  type DeliverableReadiness,
  type DeliverableStatement,
  type DeliverableStatementKind,
} from '../domain/paidAssessmentDeliverableProjection';

export interface ExecutiveSlideSelection {
  sectionId: string;
  statementIds: readonly string[];
}

export interface PaidAssessmentExecutiveSlidesInput {
  assessment: DeliverableProjectionInput;
  slides: readonly ExecutiveSlideSelection[];
}

export interface PaidAssessmentExecutiveSlidesDraft {
  reportId: string;
  filename: string;
  mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  bytes: Buffer;
  readiness: DeliverableReadiness;
  reviewReasons: string[];
  slideCount: number;
  status: 'INTERNAL_REVIEW_DRAFT';
}

const MIME_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const INTERNAL_STATUS = '内部確認用・未承認';
const MAX_SLIDES = 40;
const MAX_STATEMENTS_PER_SLIDE = 4;
const MAX_CUSTOMER_LABEL = 80;
const MAX_PURPOSE = 160;
const MAX_SECTION_TITLE = 60;
const MAX_STATEMENT_TEXT = 90;
const MAX_SLIDE_STATEMENT_TEXT = 240;
const MAX_SLIDE_NOTES = 20_000;

const kindLabels: Record<DeliverableStatementKind, string> = {
  FUTURE: '実現したい会社の姿',
  VERIFIED_FACT_REFERENCE: '確認済み事実への参照（要照合）',
  CUSTOMER_STATEMENT: 'お客様のご発言',
  UNKNOWN: 'まだ確認できていないこと',
  OBSERVATION: '観察事項',
  RISK_IMPACT: 'リスク・経営への影響',
  HYPOTHESIS: '原因仮説',
  PROPOSAL: '改善案',
  DECISION_CANDIDATE: '経営判断の候補（未承認）',
  EXPECTED_CHANGE: '期待する変化（未検証）',
};

const readinessLabels: Record<DeliverableReadiness, string> = {
  REVIEWABLE_DRAFT: '下書き確認可能',
  NEEDS_CONFIRMATION: '追加確認が必要',
  BLOCKED_BY_EVIDENCE: '根拠の確認が必要',
};

function requireObject(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object`);
  }
}

function requireNonblank(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a nonblank string`);
  }
}

function codePoints(value: string): number {
  return Array.from(value).length;
}

function enforceCodePointLimit(value: string, field: string, limit: number): void {
  if (codePoints(value) > limit) throw new TypeError(`${field} must not exceed ${limit} code points`);
}

function filenameFor(reportId: string): string {
  const sanitized = reportId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48);
  return sanitized.length === 0
    ? 'assessment-report.draft.pptx'
    : `assessment-${sanitized}.draft.pptx`;
}

function sourceNotes(statement: DeliverableStatement): string[] {
  if (statement.sourceRefs.length === 0) {
    return [statement.kind === 'UNKNOWN'
      ? '未確認事項（現時点では根拠未取得）'
      : '根拠参照：未提示'];
  }
  return statement.sourceRefs.map(source => (
    `source:${source.kind} / ${source.id} / version ${source.version}`
  ));
}

function contentNotes(sectionId: string, statements: readonly DeliverableStatement[]): string {
  const lines = [
    INTERNAL_STATUS,
    '参照情報であり、検証済みの権限・承認を示すものではありません。',
    `sectionId:${sectionId}`,
  ];
  for (const statement of statements) {
    lines.push(`statementId:${statement.id}`, `kind:${statement.kind}`);
    lines.push(...sourceNotes(statement));
    for (const ref of statement.relatedRefs) lines.push(`relatedRef:${ref.kind}:${ref.id}`);
  }
  return lines.join('\n');
}

function addInternalStatus(slide: PptxGenJS.Slide): void {
  slide.addText(INTERNAL_STATUS, {
    x: 10.15, y: 7.02, w: 2.7, h: 0.25,
    fontFace: 'Yu Gothic', fontSize: 10, bold: true, color: '9C0006',
    align: 'right', margin: 0,
  });
}

function addSlideTitle(slide: PptxGenJS.Slide, title: string): void {
  slide.addText(title, {
    x: 0.75, y: 0.48, w: 11.8, h: 0.58,
    fontFace: 'Yu Gothic', fontSize: 25, bold: true, color: '111111',
    margin: 0, breakLine: false, fit: 'shrink',
  });
  slide.addShape('line', {
    x: 0.75, y: 1.16, w: 11.8, h: 0,
    line: { color: 'B7C9D6', width: 1.25 },
  });
}

function addStatement(
  slide: PptxGenJS.Slide,
  statement: DeliverableStatement,
  index: number,
  count: number,
): void {
  const availableHeight = 5.42;
  const gap = 0.12;
  const blockHeight = (availableHeight - gap * (count - 1)) / count;
  const y = 1.35 + index * (blockHeight + gap);
  slide.addText(kindLabels[statement.kind], {
    x: 0.85, y, w: 11.55, h: 0.32,
    fontFace: 'Yu Gothic', fontSize: 12, bold: true, color: '31566F',
    margin: 0, fit: 'shrink',
  });
  slide.addText(statement.text, {
    x: 0.85, y: y + 0.36, w: 11.55, h: blockHeight - 0.38,
    fontFace: 'Yu Gothic', fontSize: count >= 4 ? 16 : 18, color: '111111',
    margin: 0.04, valign: 'middle', breakLine: false, fit: 'shrink',
    lineSpacingMultiple: 1.05,
  });
}

export async function renderPaidAssessmentExecutiveSlidesDraft(
  input: PaidAssessmentExecutiveSlidesInput,
): Promise<PaidAssessmentExecutiveSlidesDraft> {
  requireObject(input, 'input');
  if (!('assessment' in input)) throw new TypeError('assessment is required');
  const projection = buildPaidAssessmentDeliverableProjection(input.assessment);
  if (!Array.isArray(input.slides)) throw new TypeError('slides must be an array');
  if (input.slides.length < 1 || input.slides.length > MAX_SLIDES) {
    throw new TypeError(`slides must contain 1..${MAX_SLIDES} entries`);
  }

  enforceCodePointLimit(projection.customerLabel, 'customerLabel', MAX_CUSTOMER_LABEL);
  enforceCodePointLimit(projection.purpose, 'purpose', MAX_PURPOSE);
  const sectionsById = new Map(projection.sections.map(section => [section.id, section] as const));
  const selectedSlides: Array<{
    sectionId: string;
    title: string;
    statements: DeliverableStatement[];
    notes: string;
  }> = [];

  for (const [slideIndex, selection] of input.slides.entries()) {
    requireObject(selection, `slides[${slideIndex}]`);
    requireNonblank(selection.sectionId, `slides[${slideIndex}].sectionId`);
    const section = sectionsById.get(selection.sectionId);
    if (!section) throw new TypeError(`slides[${slideIndex}] has unknown sectionId: ${selection.sectionId}`);
    enforceCodePointLimit(section.title, `section ${section.id}.title`, MAX_SECTION_TITLE);
    if (!Array.isArray(selection.statementIds)) {
      throw new TypeError(`slides[${slideIndex}].statementIds must be an array`);
    }
    if (
      selection.statementIds.length < 1
      || selection.statementIds.length > MAX_STATEMENTS_PER_SLIDE
    ) {
      throw new TypeError(
        `slides[${slideIndex}].statementIds must contain 1..${MAX_STATEMENTS_PER_SLIDE} entries`,
      );
    }
    const sectionStatements = new Map(section.statements.map(statement => [statement.id, statement] as const));
    const seen = new Set<string>();
    const statements: DeliverableStatement[] = [];
    let totalText = 0;
    for (const [statementIndex, statementId] of selection.statementIds.entries()) {
      requireNonblank(statementId, `slides[${slideIndex}].statementIds[${statementIndex}]`);
      if (seen.has(statementId)) {
        throw new TypeError(`slides[${slideIndex}] contains duplicate statement id: ${statementId}`);
      }
      seen.add(statementId);
      const statement = sectionStatements.get(statementId);
      if (!statement) {
        throw new TypeError(
          `slides[${slideIndex}] statement ${statementId} does not belong to section ${section.id}`,
        );
      }
      enforceCodePointLimit(
        statement.text,
        `statement ${statement.id}.text`,
        MAX_STATEMENT_TEXT,
      );
      totalText += codePoints(statement.text);
      statements.push(statement);
    }
    if (totalText > MAX_SLIDE_STATEMENT_TEXT) {
      throw new TypeError(
        `slides[${slideIndex}] statement text must not exceed ${MAX_SLIDE_STATEMENT_TEXT} code points`,
      );
    }
    const notes = contentNotes(section.id, statements);
    enforceCodePointLimit(notes, `slides[${slideIndex}] reviewer notes`, MAX_SLIDE_NOTES);
    selectedSlides.push({ sectionId: section.id, title: section.title, statements, notes });
  }

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'atLIB';
  pptx.subject = 'IT経営KAIZEN 設計Assessment 社内確認用下書き';
  pptx.title = 'IT経営KAIZEN 改善計画書 経営判断用要約';
  pptx.company = 'atLIB';
  pptx.theme = {
    headFontFace: 'Yu Gothic',
    bodyFontFace: 'Yu Gothic',
  };

  const cover = pptx.addSlide();
  cover.background = { color: 'F4F7F9' };
  cover.addText('IT経営KAIZEN 改善計画書 — 経営判断用要約', {
    x: 0.9, y: 1.15, w: 11.5, h: 0.9,
    fontFace: 'Yu Gothic', fontSize: 28, bold: true, color: '111111',
    align: 'center', margin: 0, fit: 'shrink',
  });
  cover.addText(projection.customerLabel, {
    x: 1.2, y: 2.35, w: 10.9, h: 0.65,
    fontFace: 'Yu Gothic', fontSize: 22, bold: true, color: '31566F',
    align: 'center', margin: 0, fit: 'shrink',
  });
  cover.addText(projection.purpose, {
    x: 1.35, y: 3.25, w: 10.6, h: 1.25,
    fontFace: 'Yu Gothic', fontSize: 18, color: '333333',
    align: 'center', valign: 'middle', margin: 0.05, fit: 'shrink',
  });
  cover.addText(INTERNAL_STATUS, {
    x: 3.65, y: 5.35, w: 6.05, h: 0.55,
    fontFace: 'Yu Gothic', fontSize: 21, bold: true, color: '9C0006',
    align: 'center', margin: 0,
  });
  cover.addNotes(`${INTERNAL_STATUS}\n顧客納品・正式承認前の社内確認用下書きです。`);
  addInternalStatus(cover);

  const statusSlide = pptx.addSlide();
  addSlideTitle(statusSlide, '内部確認状況');
  statusSlide.addText(readinessLabels[projection.readiness], {
    x: 1.0, y: 1.75, w: 11.3, h: 0.85,
    fontFace: 'Yu Gothic', fontSize: 28, bold: true,
    color: projection.readiness === 'REVIEWABLE_DRAFT' ? '111111' : '9C0006',
    align: 'center', margin: 0,
  });
  statusSlide.addText(`確認理由 ${projection.reviewReasons.length}件`, {
    x: 1.0, y: 3.0, w: 11.3, h: 0.6,
    fontFace: 'Yu Gothic', fontSize: 20, color: '333333', align: 'center', margin: 0,
  });
  if (projection.reviewReasons.length === 0) {
    statusSlide.addText('正式承認・顧客納品前', {
      x: 1.0, y: 4.1, w: 11.3, h: 0.6,
      fontFace: 'Yu Gothic', fontSize: 18, color: '9C0006', align: 'center', margin: 0,
    });
  }
  statusSlide.addNotes([
    INTERNAL_STATUS,
    'D1 readinessをそのまま表示しています。正式承認・顧客納品前です。',
    ...(projection.reviewReasons.length === 0 ? ['reviewReasons:none'] : projection.reviewReasons),
  ].join('\n'));
  addInternalStatus(statusSlide);

  for (const selected of selectedSlides) {
    const slide = pptx.addSlide();
    addSlideTitle(slide, selected.title);
    selected.statements.forEach((statement, index) => {
      addStatement(slide, statement, index, selected.statements.length);
    });
    slide.addNotes(selected.notes);
    addInternalStatus(slide);
  }

  const output = await pptx.write({ outputType: 'nodebuffer', compression: true });
  if (!(output instanceof Uint8Array) && !(output instanceof ArrayBuffer)) {
    throw new TypeError('PPTX renderer did not return binary output');
  }
  const bytes = Buffer.from(output instanceof ArrayBuffer ? new Uint8Array(output) : output);
  if (bytes.length === 0 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new TypeError('PPTX renderer returned an invalid ZIP package');
  }

  return {
    reportId: projection.reportId,
    filename: filenameFor(projection.reportId),
    mimeType: MIME_TYPE,
    bytes,
    readiness: projection.readiness,
    reviewReasons: [...projection.reviewReasons],
    slideCount: selectedSlides.length + 2,
    status: 'INTERNAL_REVIEW_DRAFT',
  };
}
