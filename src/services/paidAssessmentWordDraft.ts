import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  PageBreak,
  Paragraph,
  TextRun,
} from 'docx';
import {
  buildPaidAssessmentDeliverableProjection,
  type DeliverableProjectionInput,
  type DeliverableReadiness,
  type DeliverableStatement,
  type DeliverableStatementKind,
} from '../domain/paidAssessmentDeliverableProjection';

export interface PaidAssessmentWordDraft {
  reportId: string;
  filename: string;
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  bytes: Buffer;
  readiness: DeliverableReadiness;
  reviewReasons: string[];
  sectionCount: number;
  status: 'INTERNAL_REVIEW_DRAFT';
}

const MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const INTERNAL_STATUS = '内部確認用・未承認';
const MAX_SECTIONS = 200;
const MAX_STATEMENT_OCCURRENCES = 3000;
const MAX_TEXT_CHARACTERS = 1_000_000;

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

function filenameFor(reportId: string): string {
  const sanitized = reportId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48);
  return sanitized.length === 0
    ? 'assessment-report.draft.docx'
    : `assessment-${sanitized}.draft.docx`;
}

function textRuns(text: string, options: { bold?: boolean; color?: string } = {}): TextRun[] {
  const lines = text.split(/\r?\n/);
  return lines.map((line, index) => new TextRun({
    text: line,
    break: index === 0 ? undefined : 1,
    bold: options.bold,
    color: options.color,
  }));
}

function bodyParagraph(text: string): Paragraph {
  return new Paragraph({
    children: textRuns(text),
    spacing: { after: 160, line: 360 },
  });
}

function sourceText(statement: DeliverableStatement): string[] {
  if (statement.sourceRefs.length === 0) {
    return statement.kind === 'UNKNOWN'
      ? ['未確認事項（現時点では根拠未取得）']
      : ['根拠参照：未提示'];
  }
  return statement.sourceRefs.map(source => (
    `根拠参照：${source.kind} / ${source.id} / version ${source.version}`
  ));
}

function statementParagraphs(statement: DeliverableStatement): Paragraph[] {
  const paragraphs: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: kindLabels[statement.kind], bold: true })],
      spacing: { before: 180, after: 80 },
      keepNext: true,
    }),
    bodyParagraph(statement.text),
    ...sourceText(statement).map(text => new Paragraph({
      children: [new TextRun({ text, size: 19, color: '404040' })],
      spacing: { after: 60 },
    })),
  ];
  if (statement.relatedRefs.length > 0) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({
        text: `内部追跡：${statement.relatedRefs.map(ref => `${ref.kind}:${ref.id}`).join('、')}`,
        size: 18,
        color: '666666',
      })],
      spacing: { after: 120 },
    }));
  }
  return paragraphs;
}

function textCharacterCount(input: DeliverableProjectionInput): number {
  const statementsById = new Map(input.statements.map(s => [s.id, s] as const));
  let total = input.reportId.length + input.customerLabel.length + input.purpose.length;

  for (const section of input.sections) {
    total += section.title.length + section.narrative.length;
    for (const id of section.statementIds) {
      const statement = statementsById.get(id)!; // resolved by D1 first
      total += kindLabels[statement.kind].length + statement.text.length;
      for (const line of sourceText(statement)) total += line.length;
      if (statement.relatedRefs.length > 0) {
        total += '内部追跡：'.length
          + statement.relatedRefs.map(ref => `${ref.kind}:${ref.id}`).join('、').length;
      }
    }
  }

  // Every statement is shown once in D2's Evidence Index even if
  // it does not occur in any section; do NOT charge an unrendered body.
  for (const statement of input.statements) {
    total += statement.id.length + kindLabels[statement.kind].length;
    for (const line of sourceText(statement)) total += line.length;
  }
  return total;
}

function enforceRenderSize(input: DeliverableProjectionInput): void {
  if (input.sections.length > MAX_SECTIONS) {
    throw new TypeError(`sections must not exceed ${MAX_SECTIONS}`);
  }
  const occurrences = input.sections.reduce((sum, section) => sum + section.statementIds.length, 0);
  if (occurrences > MAX_STATEMENT_OCCURRENCES) {
    throw new TypeError(`rendered statement occurrences must not exceed ${MAX_STATEMENT_OCCURRENCES}`);
  }
  if (textCharacterCount(input) > MAX_TEXT_CHARACTERS) {
    throw new TypeError(`rendered text characters must not exceed ${MAX_TEXT_CHARACTERS}`);
  }
}

export async function renderPaidAssessmentWordDraft(
  input: DeliverableProjectionInput,
): Promise<PaidAssessmentWordDraft> {
  const projection = buildPaidAssessmentDeliverableProjection(input);
  enforceRenderSize(input);

  const children: Paragraph[] = [
    new Paragraph({
      text: 'IT経営KAIZEN 改善計画書',
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { before: 1800, after: 480 },
    }),
    new Paragraph({
      children: [new TextRun({ text: projection.customerLabel, size: 30, bold: true })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
    }),
    new Paragraph({
      children: textRuns(projection.purpose),
      alignment: AlignmentType.CENTER,
      spacing: { after: 720, line: 360 },
    }),
    new Paragraph({
      children: [new TextRun({ text: INTERNAL_STATUS, bold: true, color: '9C0006', size: 28 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
    }),
    new Paragraph({
      children: [new TextRun({
        text: '経営判断の候補は承認済みの判断ではありません。期待する変化は実測済みの変化ではありません。',
        size: 20,
      })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      text: '内部確認状況',
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 180 },
      keepNext: true,
    }),
    new Paragraph({
      children: [new TextRun({
        text: readinessLabels[projection.readiness],
        bold: true,
        color: projection.readiness === 'REVIEWABLE_DRAFT' ? '000000' : '9C0006',
        size: 26,
      })],
      spacing: { after: 180 },
    }),
  ];

  if (projection.reviewReasons.length === 0) {
    children.push(bodyParagraph('正式承認・顧客納品前'));
  } else {
    children.push(new Paragraph({
      children: [new TextRun({ text: '内部レビュー理由', bold: true })],
      spacing: { after: 100 },
      keepNext: true,
    }));
    for (const reason of projection.reviewReasons) {
      children.push(new Paragraph({
        text: reason,
        bullet: { level: 0 },
        spacing: { after: 80 },
      }));
    }
  }

  for (const section of projection.sections) {
    children.push(new Paragraph({
      text: section.title,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 360, after: 180 },
      keepNext: true,
    }));
    children.push(bodyParagraph(section.narrative));
    for (const statement of section.statements) {
      children.push(...statementParagraphs(statement));
    }
  }

  children.push(new Paragraph({
    text: '判断の根拠・参照一覧',
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 420, after: 180 },
    keepNext: true,
  }));
  if (projection.evidenceIndex.length === 0) {
    children.push(bodyParagraph('参照情報はありません。'));
  } else {
    for (const entry of projection.evidenceIndex) {
      children.push(new Paragraph({
        children: [new TextRun({
          text: `${entry.statementId}｜${kindLabels[entry.kind]}`,
          bold: true,
        })],
        spacing: { before: 140, after: 70 },
        keepNext: true,
      }));
      if (entry.sources.length === 0) {
        children.push(new Paragraph({
          text: entry.kind === 'UNKNOWN'
            ? '未確認事項（現時点では根拠未取得）'
            : '根拠参照：未提示',
          spacing: { after: 80 },
        }));
      } else {
        for (const source of entry.sources) {
          children.push(new Paragraph({
            text: `${source.kind} / ${source.id} / version ${source.version}`,
            bullet: { level: 0 },
            spacing: { after: 70 },
          }));
        }
      }
    }
  }

  const document = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Yu Gothic', size: 22, color: '000000' },
          paragraph: { spacing: { after: 160, line: 360 } },
        },
        title: { run: { font: 'Yu Gothic', color: '000000', bold: true } },
        heading1: { run: { font: 'Yu Gothic', color: '000000', bold: true } },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
        },
      },
      children,
    }],
  });
  const bytes = await Packer.toBuffer(document);

  return {
    reportId: projection.reportId,
    filename: filenameFor(projection.reportId),
    mimeType: MIME_TYPE,
    bytes,
    readiness: projection.readiness,
    reviewReasons: [...projection.reviewReasons],
    sectionCount: projection.sections.length,
    status: 'INTERNAL_REVIEW_DRAFT',
  };
}
