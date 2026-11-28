import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  PageBreak,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  TableLayoutType,
} from 'docx';
import {
  buildPaidAssessmentDeliverableProjection,
  type DeliverableProjectionInput,
  type DeliverableProjection,
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


type FutureComparison = NonNullable<
  DeliverableProjection['futureComparison']
>;

type WordBlock = Paragraph | Table;

const FIT_SYMBOLS = {
  HIGH: '◎',
  SUFFICIENT: '○',
  PARTIAL: '△',
  DIFFICULT: '×',
  NEEDS_CONFIRMATION: '要確認',
} as const;

const FIT_COLORS = {
  HIGH: '16836A',
  SUFFICIENT: '2875B5',
  PARTIAL: '946B20',
  DIFFICULT: 'B45353',
  NEEDS_CONFIRMATION: '666666',
} as const;

const SCENARIOS_PER_TABLE = 3;
const COMPARISON_TABLE_WIDTH = 9638;
const MAX_COMPARISON_CELLS = 3000;

function comparisonBlocks(
  comparison: FutureComparison,
): {
  body: WordBlock[];
  evidence: Paragraph[];
  characters: number;
} {
  const body: WordBlock[] = [];
  const evidence: Paragraph[] = [];

  let characters = 0;

  function record(text: string): string {
    characters += text.length;
    return text;
  }

  function bounded(
    text: string,
    limit: number,
    field: string,
  ): string {
    if (text.length > limit) {
      throw new TypeError(
        `${field} must not exceed ${limit} characters`,
      );
    }
    return record(text);
  }

  function heading(text: string): Paragraph {
    return new Paragraph({
      text: record(text),
      heading: HeadingLevel.HEADING_1,
      keepNext: true,
      spacing: { before: 320, after: 180 },
    });
  }

  function paragraph(text: string): Paragraph {
    return bodyParagraph(record(text));
  }

  function cell(
    width: number,
    paragraphs: Paragraph[],
    header = false,
  ): TableCell {
    return new TableCell({
      width: { size: width, type: WidthType.DXA },
      margins: {
        top: 100,
        bottom: 100,
        left: 120,
        right: 120,
      },
      ...(header ? {
        shading: { fill: 'E8EFF5' },
      } : {}),
      children: paragraphs,
    });
  }

  function cellText(
    text: string,
    bold = false,
  ): Paragraph {
    return new Paragraph({
      children: textRuns(text, { bold }),
      spacing: { after: 60, line: 260 },
    });
  }

  if (
    comparison.rows.length *
    comparison.scenarios.length >
    MAX_COMPARISON_CELLS
  ) {
    throw new TypeError(
      'comparison cells must not exceed 3000',
    );
  }

  body.push(
    heading('目指す未来への適合度比較'),
  );

  const displayedFutures = new Set<string>();

  for (const row of comparison.rows) {
    if (displayedFutures.has(row.future.id)) continue;

    displayedFutures.add(row.future.id);

    body.push(
      paragraph('目指す未来の姿'),
      paragraph(row.future.text),
    );
  }

  if (
    comparison.rows.length === 0 ||
    comparison.scenarios.length === 0
  ) {
    body.push(
      paragraph('比較内容の準備が必要です。'),
    );
  }

  for (
    let start = 0;
    start < comparison.scenarios.length;
    start += SCENARIOS_PER_TABLE
  ) {
    if (comparison.rows.length === 0) break;

    const scenarios = comparison.scenarios.slice(
      start,
      start + SCENARIOS_PER_TABLE,
    );

    const criterionWidth = 2800;
    const available =
      COMPARISON_TABLE_WIDTH - criterionWidth;

    const widths = scenarios.map((_, i) =>
      i === scenarios.length - 1
        ? available -
          Math.floor(available / scenarios.length) * i
        : Math.floor(available / scenarios.length),
    );

    const header = new TableRow({
      tableHeader: true,
      children: [
        cell(
          criterionWidth,
          [cellText(record('未来の実現条件'), true)],
          true,
        ),
        ...scenarios.map((scenario, i) => {
          const paragraphs = [
            cellText(
              bounded(
                scenario.title,
                100,
                'scenario title',
              ),
              true,
            ),
          ];

          if (scenario.state !== 'REVIEWABLE') {
            paragraphs.push(cellText(record(
              scenario.state === 'BLOCKED_BY_OPTION_EVIDENCE'
                ? '実現条件の確認が必要'
                : '追加確認が必要',
            )));
          }

          return cell(widths[i]!, paragraphs, true);
        }),
      ],
    });

    const rows = comparison.rows.map(row => {
      const first = cell(
        criterionWidth,
        [
          cellText(
            bounded(
              row.criterion.title,
              100,
              'criterion title',
            ),
            true,
          ),
          cellText(
            bounded(
              row.criterion.rationale,
              240,
              'criterion rationale',
            ),
          ),
        ],
      );

      const cells = scenarios.map((_, i) => {
        const evaluation =
          row.cells[start + i]!.evaluation;

        if (evaluation === null) {
          return cell(widths[i]!, [
            cellText(record('未評価')),
          ]);
        }

        return cell(widths[i]!, [
          new Paragraph({
            children: [
              new TextRun({
                text: record(
                  FIT_SYMBOLS[evaluation.rating],
                ),
                color: FIT_COLORS[evaluation.rating],
                bold: true,
                size: 32,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
          }),
          cellText(
            bounded(
              evaluation.rationale,
              240,
              'evaluation rationale',
            ),
          ),
        ]);
      });

      return new TableRow({
        cantSplit: true,
        children: [first, ...cells],
      });
    });

    body.push(new Table({
      width: {
        size: COMPARISON_TABLE_WIDTH,
        type: WidthType.DXA,
      },
      layout: TableLayoutType.FIXED,
      columnWidths: [criterionWidth, ...widths],
      rows: [header, ...rows],
    }));

    body.push(paragraph(
      '◎ 大きく貢献　○ 一定の貢献　' +
      '△ 部分的な貢献　× 実現が難しい　' +
      '要確認：追加確認が必要',
    ));
  }

  const recommendation = comparison.recommendation;

  if (recommendation !== null) {
    const scenario = comparison.scenarios.find(
      s => s.id === recommendation.scenarioId,
    )!;

    body.push(
      heading('atLIBからのご提案（検討案）'),
      paragraph(scenario.title),
      paragraph(recommendation.rationale),
    );

    if (scenario.state !== 'REVIEWABLE') {
      body.push(paragraph(
        '実現に向けて追加確認が必要です。',
      ));
    }

    if (recommendation.conditions.length > 0) {
      body.push(paragraph('実現条件'));

      for (const condition of recommendation.conditions) {
        body.push(paragraph(condition));
      }
    }

    if (recommendation.alternativeConditions.length > 0) {
      body.push(paragraph(
        '他の改善プランも検討する条件',
      ));

      for (const condition of recommendation.alternativeConditions) {
        body.push(paragraph(condition));
      }
    }
  }

  evidence.push(
    heading('比較評価の根拠・社内確認用'),
  );

  for (const row of comparison.rows) {
    for (const cell of row.cells) {
      if (cell.evaluation === null) continue;

      evidence.push(paragraph(
        `${row.criterion.id} / ${cell.scenarioId}`,
      ));

      for (const source of cell.evaluation.sourceRefs) {
        evidence.push(paragraph(
          `${source.kind} / ${source.id} / version ${source.version}`,
        ));
      }
    }
  }

  return { body, evidence, characters };
}

export async function renderPaidAssessmentWordDraft(
  input: DeliverableProjectionInput,
): Promise<PaidAssessmentWordDraft> {
  const projection = buildPaidAssessmentDeliverableProjection(input);
  enforceRenderSize(input);

  const comparison = projection.futureComparison === undefined
    ? undefined
    : comparisonBlocks(projection.futureComparison);

  if (
    comparison !== undefined &&
    textCharacterCount(input) + comparison.characters >
    MAX_TEXT_CHARACTERS
  ) {
    throw new TypeError(
      `rendered text characters must not exceed ${MAX_TEXT_CHARACTERS}`,
    );
  }

  const children: WordBlock[] = [
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

  if (comparison !== undefined) {
    children.push(...comparison.body);
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

  if (comparison !== undefined) {
    children.push(...comparison.evidence);
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
