import {
  buildScenarioPlanDisplay,
  type ScenarioPlanDisplay,
} from './paidAssessmentScenarioPlanDisplay';

import {
  buildInvestmentDisplay,
  type InvestmentDisplay,
} from './paidAssessmentInvestmentDisplay';

import PptxGenJS from 'pptxgenjs';
import {
  buildPaidAssessmentDeliverableProjection,
  type DeliverableProjectionInput,
  type DeliverableProjection,
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


type FutureComparison = NonNullable<
  DeliverableProjection['futureComparison']
>;

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

const COMPARISON_COLUMNS = 3;
const COMPARISON_ROWS = 2;

function addComparisonSlides(
  pptx: PptxGenJS,
  comparison: FutureComparison,
  availableSlides: number,
  investment?: InvestmentDisplay,
  plans?: ScenarioPlanDisplay,
): number {
  const groups = new Map<string, FutureComparison['rows']>();

  for (const row of comparison.rows) {
    const group = groups.get(row.future.id) ?? [];
    group.push(row);
    groups.set(row.future.id, group);
  }

  const empty =
    comparison.rows.length === 0 ||
    comparison.scenarios.length === 0;

  let expectedCount = empty ? 1 : 0;

  if (!empty) {
    for (const rows of groups.values()) {
      expectedCount +=
        Math.ceil(rows.length / COMPARISON_ROWS) *
        Math.ceil(
          comparison.scenarios.length / COMPARISON_COLUMNS
        );
    }
  }

  const recommendation = comparison.recommendation;
  const recommendationDetails = recommendation === null
    ? []
    : [
        ...recommendation.conditions.map(text => ({
          label: '実現条件',
          text,
        })),
        ...recommendation.alternativeConditions.map(text => ({
          label: '他の改善プランも検討する条件',
          text,
        })),
      ];

  if (recommendation !== null) {
    expectedCount += 1 +
      Math.ceil(recommendationDetails.length / 3);
  }

  if (investment !== undefined) {
    expectedCount += investment.columns.length === 0
      ? 1
      : investment.groups.length * Math.ceil(
          investment.columns.length / COMPARISON_COLUMNS,
        );
  }

  const yearsPerSlide = 3;

  if (plans !== undefined) {
    expectedCount += plans.columns.length === 0
      ? 1
      : plans.columns.reduce(
          (total, column) =>
            total + (column.plan === null
              ? 1
              : Math.ceil(
                  column.plan.years.length / yearsPerSlide,
                )),
          0,
        );
  }

  if (expectedCount > availableSlides) {
    throw new TypeError(
      'comparison exceeds available slide budget'
    );
  }

  let count = 0;

  function newSlide(title: string): PptxGenJS.Slide {
    const slide = pptx.addSlide();
    count += 1;

    addSlideTitle(slide, title);
    addInternalStatus(slide);

    return slide;
  }

  function addNotes(
    slide: PptxGenJS.Slide,
    lines: string[],
  ): void {
    const notes = [INTERNAL_STATUS, ...lines].join('\n');

    enforceCodePointLimit(
      notes,
      'comparison reviewer notes',
      MAX_SLIDE_NOTES,
    );

    slide.addNotes(notes);
  }

  function text(
    slide: PptxGenJS.Slide,
    value: string,
    x: number,
    y: number,
    w: number,
    h: number,
    fontSize: number,
    color = '111111',
    bold = false,
    align: 'left' | 'center' = 'left',
  ): void {
    slide.addText(value, {
      x, y, w, h,
      fontFace: 'Yu Gothic',
      fontSize,
      color,
      bold,
      align,
      margin: 0.05,
      valign: 'middle',
      fit: 'shrink',
      breakLine: false,
    });
  }

  function box(
    slide: PptxGenJS.Slide,
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
  ): void {
    slide.addShape('rect', {
      x, y, w, h,
      fill: { color: fill },
      line: { color: 'D4DFE6', width: 0.7 },
    });
  }

  if (empty) {
    const slide = newSlide('目指す未来への適合度比較');

    text(
      slide,
      '比較内容の準備が必要です。',
      0.85, 2.0, 11.5, 1.2, 26,
    );

    addNotes(slide, ['比較未完成']);
  } else {
    for (const rows of groups.values()) {
      const future = rows[0]!.future;

      enforceCodePointLimit(
        future.text, 'future text', 120,
      );

      for (
        let start = 0;
        start < comparison.scenarios.length;
        start += COMPARISON_COLUMNS
      ) {
        const scenarios = comparison.scenarios.slice(
          start,
          start + COMPARISON_COLUMNS,
        );

        for (
          let r = 0;
          r < rows.length;
          r += COMPARISON_ROWS
        ) {
          const slide = newSlide(
            '目指す未来への適合度比較',
          );

          const displayed = rows.slice(
            r, r + COMPARISON_ROWS,
          );

          const notes = [
            `futureId:${future.id}`,
            ...sourceNotes(future),
          ];

          box(slide, 0.75, 1.30, 11.8, 0.92, 'EDF3F7');

          text(
            slide, '目指す未来の姿',
            0.9, 1.34, 11.5, 0.23,
            12, '31566F',
          );

          text(
            slide, future.text,
            0.9, 1.58, 11.5, 0.54,
            21, '17354A', true,
          );

          const left = 0.75;
          const totalWidth = 11.8;
          const criterionWidth = 3.0;
          const colWidth =
            (totalWidth - criterionWidth) /
            scenarios.length;

          const headerY = 2.40;
          const headerHeight = 0.68;
          const rowHeight = 1.60;

          box(
            slide, left, headerY,
            criterionWidth, headerHeight,
            'E8EFF5',
          );

          text(
            slide, '未来の実現条件',
            left + 0.08, headerY + 0.04,
            criterionWidth - 0.16, 0.58,
            14, '31566F', true,
          );

          scenarios.forEach((scenario, index) => {
            enforceCodePointLimit(
              scenario.title,
              'comparison scenario title',
              36,
            );

            const x =
              left + criterionWidth + colWidth * index;

            box(
              slide, x, headerY, colWidth,
              headerHeight, 'E8EFF5',
            );

            text(
              slide, scenario.title,
              x + 0.05, headerY + 0.02,
              colWidth - 0.10,
              scenario.state === 'REVIEWABLE'
                ? 0.61 : 0.34,
              14, '31566F', true, 'center',
            );

            if (scenario.state !== 'REVIEWABLE') {
              text(
                slide,
                scenario.state === 'BLOCKED_BY_OPTION_EVIDENCE'
                  ? '実現条件の確認が必要'
                  : '追加確認が必要',
                x + 0.05, headerY + 0.36,
                colWidth - 0.10, 0.28,
                10, '9C0006', false, 'center',
              );
            }

            notes.push(
              `scenarioId:${scenario.id}`,
              `scenarioState:${scenario.state}`,
              ...scenario.reviewReasons,
            );
          });

          displayed.forEach((row, index) => {
            const y =
              headerY + headerHeight + index * rowHeight;

            enforceCodePointLimit(
              row.criterion.title,
              'comparison criterion title',
              40,
            );

            box(
              slide, left, y,
              criterionWidth, rowHeight,
              'F7F9FB',
            );

            text(
              slide, row.criterion.title,
              left + 0.10, y + 0.08,
              criterionWidth - 0.20,
              rowHeight - 0.16,
              17, '17354A', true,
            );

            notes.push(
              `criterionId:${row.criterion.id}`,
              row.criterion.rationale,
            );

            scenarios.forEach((scenario, column) => {
              const x =
                left + criterionWidth + colWidth * column;

              const evaluation =
                row.cells[start + column]!.evaluation;

              box(
                slide, x, y,
                colWidth, rowHeight,
                'FFFFFF',
              );

              if (evaluation === null) {
                text(
                  slide, '未評価',
                  x + 0.08, y + 0.30,
                  colWidth - 0.16, 1.0,
                  18, '666666', false, 'center',
                );

                notes.push(
                  `scenarioId:${scenario.id}`,
                  'evaluation:missing',
                );

                return;
              }

              enforceCodePointLimit(
                evaluation.rationale,
                'comparison evaluation rationale',
                60,
              );

              text(
                slide, FIT_SYMBOLS[evaluation.rating],
                x + 0.05, y + 0.05,
                colWidth - 0.10, 0.57,
                evaluation.rating === 'NEEDS_CONFIRMATION'
                  ? 20 : 32,
                FIT_COLORS[evaluation.rating],
                true, 'center',
              );

              text(
                slide, evaluation.rationale,
                x + 0.10, y + 0.65,
                colWidth - 0.20, 0.84,
                14, '333333', false, 'center',
              );

              notes.push(
                `scenarioId:${scenario.id}`,
                `rating:${evaluation.rating}`,
                evaluation.rationale,
              );

              for (const source of evaluation.sourceRefs) {
                notes.push(
                  `source:${source.kind} / ${source.id} / version ${source.version}`
                );
              }
            });
          });

          text(
            slide,
            '◎ 大きく貢献　○ 一定の貢献　△ 部分的な貢献　× 実現が難しい　要確認：追加確認が必要',
            0.75, 6.48, 11.8, 0.35,
            10, '526B7D',
          );

          addNotes(slide, notes);
        }
      }
    }
  }


  if (investment !== undefined) {
    enforceCodePointLimit(
      investment.scope,
      'investment scope',
      120,
    );

    if (investment.columns.length === 0) {
      const slide = newSlide('投資・実現条件の比較');

      text(
        slide, '比較内容の準備が必要です。',
        0.85, 2.0, 11.5, 1.0, 24,
      );

      addNotes(slide, ['投資比較未完成']);
    }

    for (const group of investment.groups) {
      for (
        let start = 0;
        start < investment.columns.length;
        start += COMPARISON_COLUMNS
      ) {
        const columns = investment.columns.slice(
          start,
          start + COMPARISON_COLUMNS,
        );

        const slide = newSlide(
          `投資・実現条件の比較｜${group.title}`,
        );

        text(
          slide,
          `比較範囲：${investment.scope}（${investment.taxLabel}）`,
          0.75, 1.30, 11.8, 0.60,
          15, '31566F',
        );

        const left = 0.75;
        const labelWidth = 2.85;
        const colWidth = (11.8 - labelWidth) / columns.length;
        const headerY = 2.00;
        const headerH = 0.65;
        const rowH = 0.91;

        box(
          slide, left, headerY,
          labelWidth, headerH, 'E8EFF5',
        );

        text(
          slide, '比較項目',
          left + 0.08, headerY + 0.03,
          labelWidth - 0.16, 0.58,
          15, '31566F', true,
        );

        const notes = [
          `scope:${investment.scope}`,
          `tax:${investment.taxLabel}`,
        ];

        columns.forEach((column, i) => {
          enforceCodePointLimit(
            column.title, 'investment title', 36,
          );

          const x = left + labelWidth + colWidth * i;

          box(
            slide, x, headerY,
            colWidth, headerH, 'E8EFF5',
          );

          text(
            slide, column.title,
            x + 0.06, headerY + 0.02,
            colWidth - 0.12,
            column.status === null ? 0.59 : 0.32,
            15, '31566F', true, 'center',
          );

          if (column.status !== null) {
            text(
              slide, column.status,
              x + 0.04, headerY + 0.35,
              colWidth - 0.08, 0.27,
              10, '9C0006', false, 'center',
            );
          }

          notes.push(`scenarioId:${column.scenarioId}`);

          if (column.source !== null) {
            const source = column.source;

            notes.push(
              `source:${source.kind} / ${source.id} / version ${source.version}`,
            );
          }
        });

        group.rows.forEach((row, r) => {
          const y = headerY + headerH + r * rowH;

          box(
            slide, left, y,
            labelWidth, rowH, 'F7F9FB',
          );

          text(
            slide, row.label,
            left + 0.08, y + 0.05,
            labelWidth - 0.16, rowH - 0.10,
            14, '17354A', true,
          );

          columns.forEach((_, i) => {
            const value = row.values[start + i]!;

            enforceCodePointLimit(
              value, 'investment cell', 60,
            );

            const x = left + labelWidth + colWidth * i;

            box(
              slide, x, y,
              colWidth, rowH, 'FFFFFF',
            );

            text(
              slide, value,
              x + 0.06, y + 0.04,
              colWidth - 0.12, rowH - 0.08,
              group.title === '投資額' ? 17 : 14,
              '334155', false, 'center',
            );
          });
        });

        text(
          slide, investment.caveat,
          0.75, 6.43, 11.8, 0.43,
          10, '526B7D',
        );

        addNotes(slide, notes);
      }
    }
  }


  if (plans !== undefined) {
    enforceCodePointLimit(
      plans.scope, 'plan scope', 120,
    );

    if (plans.columns.length === 0) {
      const slide = newSlide('シナリオ別複数年改善計画');

      text(
        slide, '比較内容の準備が必要です。',
        0.85, 2.0, 11.5, 1.0, 24,
      );

      addNotes(slide, ['改善計画未完成']);
    }

    for (const column of plans.columns) {
      enforceCodePointLimit(
        column.title, 'plan scenario title', 36,
      );

      const plan = column.plan;

      const notesBase = [
        `scenarioId:${column.scenarioId}`,
        `scope:${plans.scope}`,
        `tax:${plans.taxLabel}`,
        '経営判断前の検討案。期待する変化は未検証。',
      ];

      if (plan?.investmentEvidence) {
        const source = plan.investmentEvidence;

        notesBase.push(
          `source:${source.kind} / ${source.id} / version ${source.version}`,
        );
      }

      function planSlide() {
        const slide = newSlide('シナリオ別複数年改善計画');

        text(
          slide, column.title,
          0.75, 1.30, 7.2, 0.42,
          22, '31566F', true,
        );

        if (column.status !== null) {
          text(
            slide, column.status,
            8.05, 1.30, 4.5, 0.42,
            14, '9C0006', true, 'center',
          );
        }

        text(
          slide,
          `比較範囲：${plans!.scope}（${plans!.taxLabel}）`,
          0.75, 1.78, 11.8, 0.36,
          13, '526B7D',
        );

        return slide;
      }

      if (plan === null) {
        const slide = planSlide();

        text(
          slide, '未入力（改善計画）',
          0.85, 2.6, 11.5, 1.2, 25,
        );

        addNotes(slide, [...notesBase, '未入力']);
        continue;
      }

      for (
        let start = 0;
        start < plan.years.length;
        start += yearsPerSlide
      ) {
        const years = plan.years.slice(
          start, start + yearsPerSlide,
        );

        const slide = planSlide();

        const notes = [
          ...notesBase,
          ...plan.uncoveredOptionIds.map(
            id => `uncoveredOption:${id}`,
          ),
        ];

        const gap = 0.15;
        const width =
          (11.8 - gap * (years.length - 1)) / years.length;

        years.forEach((year, index) => {
          const x = 0.75 + index * (width + gap);
          const tx = x + 0.10;
          const tw = width - 0.20;
          const activities = year.activities.join('／');

          enforceCodePointLimit(
            year.heading, 'scenario plan heading', 42,
          );

          enforceCodePointLimit(
            year.purpose, 'scenario plan purpose', 60,
          );

          enforceCodePointLimit(
            activities, 'scenario plan activities', 100,
          );

          enforceCodePointLimit(
            year.expectedChange, 'scenario plan expected change', 60,
          );

          box(
            slide, x, 2.23, width, 4.38, 'FFFFFF',
          );

          box(
            slide, x, 2.23, width, 0.75, 'E8EFF5',
          );

          text(
            slide, year.heading,
            tx, 2.28, tw, 0.64,
            17, '17354A', true, 'center',
          );

          text(
            slide, '目的',
            tx, 3.02, tw, 0.22,
            11, '526B7D', true,
          );

          text(
            slide, year.purpose,
            tx, 3.24, tw, 0.52,
            15,
          );

          text(
            slide, '主な取り組み',
            tx, 3.79, tw, 0.22,
            11, '526B7D', true,
          );

          text(
            slide, activities,
            tx, 4.01, tw, 0.74,
            15,
          );

          text(
            slide, '期待する変化',
            tx, 4.78, tw, 0.22,
            11, '526B7D', true,
          );

          text(
            slide, year.expectedChange,
            tx, 5.00, tw, 0.60,
            16, '16836A', true,
          );

          text(
            slide, '年度別投資額',
            tx, 5.65, tw, 0.22,
            11, '526B7D', true,
          );

          text(
            slide, year.annualAmount,
            tx, 5.87, tw, 0.48,
            18, '17354A', true, 'center',
          );

          text(
            slide, year.costLabel,
            tx, 6.38, tw, 0.19,
            10, '526B7D', false, 'center',
          );

          notes.push(
            year.heading,
            `効果の確認方法：${year.verificationApproach}`,
            ...year.prerequisites.map(v => `実現条件：${v}`),
            ...year.risks.map(v => `リスク：${v}`),
            `計画を見直す条件：${year.reassessmentTrigger}`,
            ...year.openQuestions.map(v => `未確認事項：${v}`),
            ...year.optionIds.map(id => `ACT:${id}`),
            `算定条件：${year.costBasis ?? '未提示'}`,
          );
        });

        text(
          slide, plan.summary,
          0.75, 6.65, 11.8, 0.28,
          15, '31566F', true, 'center',
        );

        addNotes(slide, notes);
      }
    }
  }

  if (recommendation !== null) {
    const scenario = comparison.scenarios.find(
      s => s.id === recommendation.scenarioId,
    )!;

    enforceCodePointLimit(
      scenario.title, 'recommendation title', 36,
    );

    enforceCodePointLimit(
      recommendation.rationale,
      'recommendation rationale', 240,
    );

    const slide = newSlide(
      'atLIBからのご提案（検討案）',
    );

    box(slide, 0.75, 1.45, 11.8, 1.25, 'EDF3F7');

    text(
      slide, scenario.title,
      1.0, 1.65, 11.3, 0.84,
      32, '17354A', true,
    );

    text(
      slide, recommendation.rationale,
      1.0, 3.0, 11.3, 2.1,
      23,
    );

    if (scenario.state !== 'REVIEWABLE') {
      text(
        slide,
        '実現に向けて追加確認が必要です。',
        1.0, 5.4, 11.3, 0.7,
        17, '9C0006',
      );
    }

    addNotes(slide, [
      `recommendedScenarioId:${scenario.id}`,
      `scenarioState:${scenario.state}`,
      ...scenario.reviewReasons,
      '顧客による決定ではありません。',
    ]);

    for (
      let start = 0;
      start < recommendationDetails.length;
      start += 3
    ) {
      const details = recommendationDetails.slice(
        start, start + 3,
      );

      const detailSlide = newSlide(
        'ご提案の実現条件',
      );

      text(
        detailSlide, scenario.title,
        0.85, 1.35, 11.5, 0.55,
        20, '31566F', true,
      );

      details.forEach((detail, index) => {
        enforceCodePointLimit(
          detail.text,
          'recommendation condition',
          120,
        );

        const y = 2.0 + index * 1.50;

        text(
          detailSlide, detail.label,
          0.9, y, 11.5, 0.32,
          14, '31566F', true,
        );

        text(
          detailSlide, detail.text,
          0.9, y + 0.35, 11.5, 1.02,
          18,
        );
      });

      addNotes(detailSlide, [
        `recommendedScenarioId:${scenario.id}`,
        '顧客との協議に使用する検討案です。',
      ]);
    }
  }

  if (count !== expectedCount) {
    throw new TypeError('comparison slide count mismatch');
  }

  return count;
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

  const comparisonSlideCount =
    projection.futureComparison === undefined
      ? 0
      : addComparisonSlides(
          pptx,
          projection.futureComparison,
          MAX_SLIDES - selectedSlides.length,
          buildInvestmentDisplay(projection),
          buildScenarioPlanDisplay(projection),
        );

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
    slideCount:
      selectedSlides.length + 2 + comparisonSlideCount,
    status: 'INTERNAL_REVIEW_DRAFT',
  };
}
