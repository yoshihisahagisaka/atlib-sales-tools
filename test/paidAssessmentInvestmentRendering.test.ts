import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strFromU8, unzipSync } from 'fflate';
import type { GapReviewResult } from '../src/domain/paidAssessmentGapReview';
import type { RootCauseReviewResult } from '../src/domain/paidAssessmentRootCauseReview';
import type { ActOptionReviewResult } from '../src/domain/paidAssessmentActOptionReview';
import type { ManagementScenarioReview } from '../src/domain/paidAssessmentScenarioComparison';
import type { DecisionSessionReviewResult } from '../src/domain/paidAssessmentDecisionSessionReview';
import type { InitialActionPlanReview } from '../src/domain/paidAssessmentInitialActionPlan';
import type { RoadmapReviewResult } from '../src/domain/paidAssessmentRoadmapReview';
import type {
  DeliverableProjectionInput,
  DeliverableStatement,
  DeliverableStatementKind,
} from '../src/domain/paidAssessmentDeliverableProjection';
import {
  renderPaidAssessmentExecutiveSlidesDraft,
  type PaidAssessmentExecutiveSlidesInput,
} from '../src/services/paidAssessmentExecutiveSlidesDraft';

const managementSource = {
  kind: 'MANAGEMENT_FEEDBACK' as const,
  id: 'management-source',
  version: 2,
  hash: 'a'.repeat(64),
};
const coreSource = {
  kind: 'CORE_VERIFIED_REFERENCE' as const,
  id: 'core-source',
  version: 3,
  hash: 'b'.repeat(64),
};
const kinds: DeliverableStatementKind[] = [
  'FUTURE',
  'VERIFIED_FACT_REFERENCE',
  'CUSTOMER_STATEMENT',
  'UNKNOWN',
  'OBSERVATION',
  'RISK_IMPACT',
  'HYPOTHESIS',
  'PROPOSAL',
  'DECISION_CANDIDATE',
  'EXPECTED_CHANGE',
];
const labels: Record<DeliverableStatementKind, string> = {
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

function gaps(): GapReviewResult {
  return {
    items: [
      { id: 'gap-ok', state: 'CONFIRMED_DIFFERENCE' },
      { id: 'gap-needs', state: 'INSUFFICIENT_EVIDENCE' },
    ],
    counts: { CONFIRMED_DIFFERENCE: 1, NO_DIFFERENCE_IDENTIFIED: 0, INSUFFICIENT_EVIDENCE: 1 },
  } as unknown as GapReviewResult;
}

function causes(): RootCauseReviewResult {
  return {
    hypotheses: [],
    counts: {
      HYPOTHESIS_WITH_VERIFIED_SUPPORT: 0,
      HYPOTHESIS_CONTESTED: 0,
      HYPOTHESIS_UNSUBSTANTIATED: 0,
      BLOCKED_BY_GAP_EVIDENCE: 0,
    },
  } as unknown as RootCauseReviewResult;
}

function options(): ActOptionReviewResult {
  return {
    options: [],
    counts: { REVIEWABLE: 0, NEEDS_CONFIRMATION: 0, BLOCKED_BY_GAP_EVIDENCE: 0 },
  } as unknown as ActOptionReviewResult;
}

function scenarios(): ManagementScenarioReview {
  return { scenarios: [], counts: { REVIEWABLE: 0, NEEDS_CONFIRMATION: 0, BLOCKED_BY_OPTION_EVIDENCE: 0 } };
}

function decisions(): DecisionSessionReviewResult {
  return { decisions: [], counts: { REVIEWABLE: 0, NEEDS_CONFIRMATION: 0, BLOCKED_BY_OPTION_EVIDENCE: 0 } };
}

function initialActions(): InitialActionPlanReview {
  return {
    actions: [],
    counts: { REVIEWABLE_DRAFT: 0, NEEDS_CONFIRMATION: 0, BLOCKED_BY_DECISION_EVIDENCE: 0 },
  };
}

function roadmap(): RoadmapReviewResult {
  return { items: [], counts: { REVIEWABLE_DRAFT: 0, NEEDS_CONFIRMATION: 0, BLOCKED_BY_EVIDENCE: 0 } };
}

function assessment(): DeliverableProjectionInput {
  const statements: DeliverableStatement[] = kinds.map((kind, index) => ({
    id: `statement-${index + 1}`,
    kind,
    text: `${kind} の説明`,
    sourceRefs: kind === 'UNKNOWN' ? [] : [kind === 'VERIFIED_FACT_REFERENCE' ? coreSource : managementSource],
    relatedRefs: [],
  }));
  statements[0]!.relatedRefs = [{ kind: 'GAP', id: 'gap-ok' }];
  return {
    reportId: 'report_2026-11',
    customerLabel: 'サンプル株式会社',
    purpose: '経営判断に必要な事実と選択肢を確認する',
    statements,
    sections: [
      {
        id: 'section-a',
        title: '現状と目標',
        narrative: 'D1本文',
        statementIds: statements.slice(0, 5).map(statement => statement.id),
      },
      {
        id: 'section-b',
        title: '改善選択肢',
        narrative: 'D1本文',
        statementIds: statements.slice(5).map(statement => statement.id),
      },
    ],
    gaps: gaps(), causes: causes(), options: options(), scenarios: scenarios(), decisions: decisions(),
    initialActions: initialActions(), roadmap: roadmap(),
  };
}

function fixture(): PaidAssessmentExecutiveSlidesInput {
  return {
    assessment: assessment(),
    slides: [
      { sectionId: 'section-a', statementIds: ['statement-1', 'statement-2'] },
      { sectionId: 'section-b', statementIds: ['statement-6', 'statement-7'] },
    ],
  };
}

function entries(bytes: Buffer): Record<string, Uint8Array> {
  return unzipSync(new Uint8Array(bytes));
}

function xml(bytes: Buffer, path: string): string {
  const entry = entries(bytes)[path];
  assert.ok(entry, `${path} must exist`);
  return strFromU8(entry);
}

function slideXml(bytes: Buffer, number: number): string {
  return xml(bytes, `ppt/slides/slide${number}.xml`);
}

function notesXml(bytes: Buffer, number: number): string {
  return xml(bytes, `ppt/notesSlides/notesSlide${number}.xml`);
}

function allXml(bytes: Buffer): string {
  return Object.entries(entries(bytes))
    .filter(([name]) => name.endsWith('.xml'))
    .map(([, value]) => strFromU8(value))
    .join('\n');
}

function futureFitSlidesAssessment(): DeliverableProjectionInput {
  const value = fixture().assessment;

  value.statements[0]!.text =
    '人員増加だけに頼らず、持続的に成長できる会社';

  value.scenarios = {
    scenarios: [
      ['a', '現状活用型'],
      ['b', '段階的改善型'],
      ['c', '積極的変革型'],
    ].map(([id, title]) => ({
      id: id!,
      title: title!,
      managementPriority: {
        statement: value.statements[0]!.text,
        source: managementSource,
      },
      rationale: '未来を実現する方法を比較する',
      optionIds: ['option-ok'],
      expectedDirection: '業務負担の軽減',
      tradeoffs: [],
      risks: [],
      assumptions: [],
      investmentCharacter: 'NOT_ASSESSED' as const,
      state: 'REVIEWABLE' as const,
      reviewReasons: [],
    })),
    counts: {
      REVIEWABLE: 3,
      NEEDS_CONFIRMATION: 0,
      BLOCKED_BY_OPTION_EVIDENCE: 0,
    },
  };

  value.futureComparison = {
    criteria: [
      {
        id: 'efficiency',
        futureStatementId: 'statement-1',
        title: '業務効率化',
        rationale: '本来の業務に集中する時間を確保する',
      },
      {
        id: 'standardization',
        futureStatementId: 'statement-1',
        title: '属人化の解消',
        rationale: '担当者不在でも業務を継続する',
      },
    ],
    scenarioIds: ['a', 'b', 'c'],
    evaluations: [
      {
        criterionId: 'efficiency',
        scenarioId: 'a',
        rating: 'PARTIAL',
        rationale: '一部の業務で重複作業を減らす',
        sourceRefs: [coreSource],
      },
      {
        criterionId: 'efficiency',
        scenarioId: 'b',
        rating: 'HIGH',
        rationale: '業務全体の負担軽減を目指す',
        sourceRefs: [coreSource],
      },
      {
        criterionId: 'efficiency',
        scenarioId: 'c',
        rating: 'HIGH',
        rationale: '業務構造から見直す',
        sourceRefs: [coreSource],
      },
      {
        criterionId: 'standardization',
        scenarioId: 'a',
        rating: 'DIFFICULT',
        rationale: '現行環境だけでは改善に制約がある',
        sourceRefs: [coreSource],
      },
      {
        criterionId: 'standardization',
        scenarioId: 'b',
        rating: 'SUFFICIENT',
        rationale: '手順と情報管理を統一する',
        sourceRefs: [coreSource],
      },
      {
        criterionId: 'standardization',
        scenarioId: 'c',
        rating: 'HIGH',
        rationale: '業務体系を再構築する',
        sourceRefs: [coreSource],
      },
    ],
    recommendation: {
      scenarioId: 'b',
      rationale: '現在の事業運営を維持しながら成長基盤を整える',
      conditions: ['段階的に改善効果を確認する'],
      alternativeConditions: ['投資制約に応じて現状活用型も検討する'],
    },
  };

  return value;
}


function futureFitSlidesFixture(): PaidAssessmentExecutiveSlidesInput {
  const existing = fixture();

  return {
    assessment: futureFitSlidesAssessment(),
    slides: existing.slides,
  };
}


import {
  renderPaidAssessmentWordDraft,
} from '../src/services/paidAssessmentWordDraft';

import {
  buildPaidAssessmentDeliverableProjection,
} from '../src/domain/paidAssessmentDeliverableProjection';

import {
  buildInvestmentDisplay,
} from '../src/services/paidAssessmentInvestmentDisplay';

function investmentFixture(): PaidAssessmentExecutiveSlidesInput {
  const value = futureFitSlidesFixture();

  for (const scenario of value.assessment.scenarios.scenarios) {
    scenario.investmentCharacter = 'EVIDENCE_BACKED_RANGE';
    scenario.investmentNote = '参考見積に基づく概算';
    scenario.investmentEvidence = coreSource;
  }

  value.assessment.investmentComparison = {
    scope: '既存IT維持費を除く追加投資',
    taxBasis: 'EXCLUDING_TAX',
    entries: [
      ['a', 300_000, 30_000],
      ['b', 1_000_000, 80_000],
      ['c', 3_000_000, 150_000],
    ].map(([id, initial, monthly]) => ({
      scenarioId: String(id),
      initialYen: {
        min: Number(initial),
        max: id === 'b' ? 1_200_000 : Number(initial),
      },
      monthlyYen: {
        min: Number(monthly),
        max: id === 'b' ? 100_000 : Number(monthly),
      },
      monthlyPattern: 'CONSTANT_36_MONTHS',
      leadTime: '段階的に実施',
      internalEffort: '関係者による定期確認',
      deliveryTeam: '社内外の役割分担を協議',
    })),
  };

  return value;
}

function wordXml(bytes: Buffer): string {
  return xml(bytes, 'word/document.xml');
}

function visibleSlides(
  bytes: Buffer,
  count: number,
): string {
  return Array.from(
    { length: count },
    (_, i) => slideXml(bytes, i + 1),
  ).join('\n');
}

async function renderBoth(
  value: PaidAssessmentExecutiveSlidesInput,
) {
  const word = await renderPaidAssessmentWordDraft(
    value.assessment,
  );

  const slides =
    await renderPaidAssessmentExecutiveSlidesDraft(value);

  return {
    word,
    slides,
    wordText: wordXml(word.bytes),
    slideText: visibleSlides(
      slides.bytes,
      slides.slideCount,
    ),
  };
}

test('renders identical investment values and conditions in Word and slides', async () => {
  const value = investmentFixture();
  const before = structuredClone(value);

  const result = await renderBoth(value);

  for (const expected of [
    '投資・実現条件の比較',
    '既存IT維持費を除く追加投資',
    '税別',
    '1,000,000〜1,200,000円',
    '80,000〜100,000円',
    '1,960,000〜2,400,000円',
    '3,880,000〜4,800,000円',
    '840万円'.replace('840万円', '8,400,000円'),
    '36か月一定の想定',
    '関係者による定期確認',
    '社内外の役割分担を協議',
    '参考見積に基づく概算',
  ]) {
    assert.ok(result.wordText.includes(expected), `Word: ${expected}`);
    assert.ok(result.slideText.includes(expected), `PPTX: ${expected}`);
  }

  assert.equal(result.slides.slideCount, 10);

  assert.ok(
    result.wordText.indexOf('目指す未来への適合度比較') <
    result.wordText.indexOf('投資・実現条件の比較'),
  );

  assert.ok(
    result.wordText.indexOf('投資・実現条件の比較') <
    result.wordText.indexOf('atLIBからのご提案（検討案）'),
  );

  assert.ok(slideXml(result.slides.bytes, 5).includes(
    '目指す未来への適合度比較',
  ));

  assert.ok(slideXml(result.slides.bytes, 6).includes(
    '投資・実現条件の比較',
  ));

  assert.ok(slideXml(result.slides.bytes, 9).includes(
    'atLIBからのご提案（検討案）',
  ));

  assert.ok(notesXml(result.slides.bytes, 6).includes(
    'source:CORE_VERIFIED_REFERENCE',
  ));

  assert.ok(!result.wordText.includes(coreSource.hash));
  assert.ok(!allXml(result.slides.bytes).includes(coreSource.hash));

  assert.equal(result.word.readiness, result.slides.readiness);
  assert.deepEqual(result.word.reviewReasons, result.slides.reviewReasons);
  assert.deepEqual(value, before);
});

test('distinguishes missing entry, unknown, zero and variable costs', async () => {
  const value = investmentFixture();
  const comparison = value.assessment.investmentComparison!;

  comparison.entries = [
    {
      ...comparison.entries[0]!,
      initialYen: { min: 0, max: 0 },
      monthlyPattern: 'VARIABLE_OR_UNCONFIRMED',
    },
    {
      ...comparison.entries[1]!,
      initialYen: null,
      monthlyYen: null,
    },
  ];

  const display = buildInvestmentDisplay(
    buildPaidAssessmentDeliverableProjection(value.assessment),
  )!;

  assert.deepEqual(
    display.groups[0]!.rows[0]!.values,
    ['0円', '未算定', '未入力'],
  );

  assert.deepEqual(
    display.groups[0]!.rows[2]!.values,
    ['算出せず（変動・未確認）', '未算定', '未入力'],
  );

  const result = await renderBoth(value);

  for (const expected of [
    '未算定',
    '未入力',
    '算出せず（変動・未確認）',
  ]) {
    assert.ok(result.wordText.includes(expected));
    assert.ok(result.slideText.includes(expected));
  }

  assert.equal(result.word.readiness, 'NEEDS_CONFIRMATION');
  assert.equal(result.slides.readiness, 'NEEDS_CONFIRMATION');
});

test('keeps previous Word and PPTX behavior without investment input', async () => {
  const result = await renderBoth(futureFitSlidesFixture());

  assert.equal(result.slides.slideCount, 7);
  assert.ok(!result.wordText.includes('投資・実現条件の比較'));
  assert.ok(!result.slideText.includes('投資・実現条件の比較'));
});

test('renders all investment scenarios when the tables are split', async () => {
  const value = investmentFixture();
  const assessment = value.assessment;
  const future = assessment.futureComparison!;
  const investment = assessment.investmentComparison!;

  assessment.scenarios.scenarios.push({
    ...assessment.scenarios.scenarios[0]!,
    id: 'd',
    title: '既存ベンダー連携型',
  });

  assessment.futureComparison = {
    ...future,
    scenarioIds: [...future.scenarioIds, 'd'],
    evaluations: [
      ...future.evaluations,
      ...future.evaluations
        .filter(e => e.scenarioId === 'a')
        .map(e => ({ ...e, scenarioId: 'd' })),
    ],
  };

  investment.entries = [
    ...investment.entries,
    {
      ...investment.entries[0]!,
      scenarioId: 'd',
      initialYen: { min: 500_000, max: 500_000 },
    },
  ];

  const result = await renderBoth(value);

  assert.equal(result.slides.slideCount, 14);

  assert.equal(
    (result.wordText.match(/<w:tbl>/g) ?? []).length,
    8,
  );

  assert.ok(result.wordText.includes('500,000円'));
  assert.ok(result.slideText.includes('500,000円'));
  assert.ok(result.slideText.includes('既存ベンダー連携型'));
});

test('rejects excessive investment text without clipping it', async () => {
  const value = investmentFixture();

  value.assessment.investmentComparison!.entries = [{
    ...value.assessment.investmentComparison!.entries[0]!,
    internalEffort: 'あ'.repeat(241),
  }];

  await assert.rejects(
    () => renderPaidAssessmentWordDraft(value.assessment),
    /investment cell must not exceed 240/,
  );

  await assert.rejects(
    () => renderPaidAssessmentExecutiveSlidesDraft(value),
    /investment cell must not exceed 60/,
  );
});

test('retains upstream blocked state and internal draft status', async () => {
  const value = investmentFixture();

  value.assessment.scenarios.scenarios[1]!.state =
    'BLOCKED_BY_OPTION_EVIDENCE';

  const result = await renderBoth(value);

  assert.equal(result.word.readiness, 'BLOCKED_BY_EVIDENCE');
  assert.equal(result.slides.readiness, 'BLOCKED_BY_EVIDENCE');

  assert.ok(slideXml(result.slides.bytes, 6).includes(
    '実現条件の確認が必要',
  ));

  assert.equal(result.word.status, 'INTERNAL_REVIEW_DRAFT');
  assert.equal(result.slides.status, 'INTERNAL_REVIEW_DRAFT');
});

test('includes investment pages in the existing slide budget', async () => {
  const value = investmentFixture();

  value.slides = Array.from(
    { length: 35 },
    () => value.slides[0]!,
  );

  await assert.rejects(
    () => renderPaidAssessmentExecutiveSlidesDraft(value),
    /comparison exceeds available slide budget/,
  );
});

test('renders an empty comparison without fabricating amounts', async () => {
  const value = investmentFixture();

  value.assessment.futureComparison = {
    criteria: [],
    scenarioIds: [],
    evaluations: [],
  };

  value.assessment.investmentComparison!.entries = [];

  const result = await renderBoth(value);

  assert.equal(result.slides.slideCount, 6);
  assert.equal(result.word.readiness, 'NEEDS_CONFIRMATION');
  assert.equal(result.slides.readiness, 'NEEDS_CONFIRMATION');

  assert.ok(result.wordText.includes(
    '比較内容の準備が必要です。',
  ));

  assert.ok(slideXml(result.slides.bytes, 6).includes(
    '比較内容の準備が必要です。',
  ));
});

function multiYearFixture(): PaidAssessmentExecutiveSlidesInput {
  const value = investmentFixture();

  // Synthetic upstream ACT for the existing scenario references.
  // This is fixture data only, not a production approval.
  value.assessment.options = {
    options: [{
      id: 'option-ok',
      title: '業務改善の検討案',
      description: '業務の可視化と標準化を段階的に進める',
      why: '業務負担を軽減するため',
      area: 'OPERATION',
      lenses: ['STANDARDIZE', 'ORGANIZE'],
      future: {
        statement: value.assessment.statements[0]!.text,
        source: managementSource,
      },
      gapIds: ['gap-ok'],
      rootCauseHypothesisIds: [],
      expectedChange: {
        statement: '本来の業務に集中できる',
        verificationApproach: '業務負担の変化を確認する',
      },
      assumptions: [],
      dependencies: [],
      risks: [],
      actorCandidates: ['COMBINATION'],
      state: 'REVIEWABLE',
      reviewReasons: [],
    }],
    counts: {
      REVIEWABLE: 1,
      NEEDS_CONFIRMATION: 0,
      BLOCKED_BY_GAP_EVIDENCE: 0,
    },
  };

  const investment = value.assessment.investmentComparison!;

  investment.entries = investment.entries.map(entry =>
    entry.scenarioId === 'b'
      ? {
          ...entry,
          monthlyPattern: 'VARIABLE_OR_UNCONFIRMED' as const,
        }
      : entry,
  );

  const definitions = [
    {
      id: 'a',
      titles: ['現状把握', '個別業務改善', '運用定着'],
      activities: ['既存業務の調査', '重複作業の削減', '改善手順の定着'],
      changes: ['課題を把握する', '個別業務の負担を減らす', '既存運用を安定させる'],
    },
    {
      id: 'b',
      titles: ['改善基盤の整備', '業務効率の向上', '経営価値の向上'],
      activities: ['業務可視化・手順標準化', 'システム連携・自動化', '経営情報活用・継続改善'],
      changes: ['属人化を減らす', '本来の業務に集中する', '持続的な事業成長を支える'],
    },
    {
      id: 'c',
      titles: ['経営基盤設計', '業務体系の再構築', '全社的な改善'],
      activities: ['業務とITの全体設計', '業務基盤の移行', '経営管理と改善活動の統合'],
      changes: ['全体の方向性を統一する', '業務構造を変える', '事業拡大に対応する'],
    },
  ];

  value.assessment.scenarioPlans = {
    plans: definitions.map(definition => ({
      scenarioId: definition.id,
      years: definition.titles.map((title, index) => ({
        year: index + 1,
        title,
        purpose: '目指す未来に向けた経営基盤の整備',
        activities: [definition.activities[index]!],
        optionIds: ['option-ok'],
        expectedChange: definition.changes[index]!,
        verificationApproach: '業務負担と改善効果を確認する',
        prerequisites: ['関係者の合意'],
        risks: ['移行時の業務負担'],
        reassessmentTrigger: '期待する変化が得られない場合',
        openQuestions: [],
        annualYen: definition.id === 'b'
          ? {
              min: [2_200_000, 1_500_000, 800_000][index]!,
              max: [2_400_000, 1_500_000, 800_000][index]!,
            }
          : null,
        costBasis: definition.id === 'b'
          ? '年度別参考見積に基づく概算'
          : null,
      })),
    })),
  };

  return value;
}

test('renders scenario plans and reconciles annual estimates in both formats', async () => {
  const value = multiYearFixture();
  const before = structuredClone(value);
  const result = await renderBoth(value);

  assert.equal(result.slides.slideCount, 13);

  for (const expected of [
    'シナリオ別複数年改善計画',
    '改善基盤の整備',
    '業務効率の向上',
    '経営価値の向上',
    '業務可視化・手順標準化',
    '持続的な事業成長を支える',
    '2,200,000〜2,400,000円',
    '4,500,000〜4,700,000円',
    '3年間合計：4,500,000〜4,700,000円',
  ]) {
    assert.ok(result.wordText.includes(expected), `Word: ${expected}`);
    assert.ok(result.slideText.includes(expected), `PPTX: ${expected}`);
  }

  const comparison = slideXml(result.slides.bytes, 6);
  const plan = slideXml(result.slides.bytes, 10);

  assert.ok(comparison.includes(
    '4,500,000〜4,700,000円（年度別試算）',
  ));

  assert.ok(plan.includes('段階的改善型'));
  assert.ok(plan.includes('3年間合計：4,500,000〜4,700,000円'));

  assert.ok(slideXml(result.slides.bytes, 12).includes(
    'atLIBからのご提案（検討案）',
  ));

  assert.ok(
    result.wordText.indexOf('投資・実現条件の比較') <
    result.wordText.indexOf('シナリオ別複数年改善計画'),
  );

  assert.ok(
    result.wordText.indexOf('シナリオ別複数年改善計画') <
    result.wordText.indexOf('atLIBからのご提案（検討案）'),
  );

  for (const expected of [
    '業務負担と改善効果を確認する',
    '移行時の業務負担',
    '期待する変化が得られない場合',
    '年度別参考見積に基づく概算',
  ]) {
    assert.ok(result.wordText.includes(expected));
    assert.ok(notesXml(result.slides.bytes, 10).includes(expected));
  }

  assert.ok(!result.wordText.includes(coreSource.hash));
  assert.ok(!allXml(result.slides.bytes).includes(coreSource.hash));

  assert.deepEqual(value, before);
});

test('preserves missing plans, unknown annual costs and explicit zero', async () => {
  const value = multiYearFixture();
  const plans = value.assessment.scenarioPlans!;

  plans.plans = plans.plans
    .filter(plan => plan.scenarioId !== 'c')
    .map(plan => ({
      ...plan,
      years: plan.years.map(year =>
        plan.scenarioId !== 'b'
          ? year
          : year.year === 2
            ? {
                ...year,
                annualYen: null,
                costBasis: null,
              }
            : year.year === 3
              ? {
                  ...year,
                  annualYen: { min: 0, max: 0 },
                  costBasis: '追加投資なし',
                }
              : year,
      ),
    }));

  const result = await renderBoth(value);

  assert.equal(result.word.readiness, 'NEEDS_CONFIRMATION');
  assert.equal(result.slides.readiness, 'NEEDS_CONFIRMATION');

  for (const expected of [
    '未入力（改善計画）',
    '未算定',
    '0円',
    '3年間合計：未算定',
    '算出せず（変動・未確認）',
  ]) {
    assert.ok(result.wordText.includes(expected));
    assert.ok(result.slideText.includes(expected));
  }

  assert.ok(!slideXml(result.slides.bytes, 6).includes(
    '4,500,000〜4,700,000円（年度別試算）',
  ));
});

test('splits four-year plans without assuming costs after month 36', async () => {
  const value = multiYearFixture();
  const plan = value.assessment.scenarioPlans!.plans[0]!;

  plan.years = [
    ...plan.years,
    {
      ...plan.years[2]!,
      year: 4,
      title: '次の成長段階',
    },
  ];

  const result = await renderBoth(value);

  assert.equal(result.slides.slideCount, 14);

  assert.ok(slideXml(result.slides.bytes, 10).includes(
    '4年目｜次の成長段階',
  ));

  assert.ok(slideXml(result.slides.bytes, 10).includes(
    '4年間合計：未算定',
  ));

  assert.ok(result.wordText.includes('4年間合計：未算定'));

  assert.ok(slideXml(result.slides.bytes, 6).includes(
    '1,380,000円',
  ));
});

test('keeps the previous investment-only output without scenario plans', async () => {
  const result = await renderBoth(investmentFixture());

  assert.equal(result.slides.slideCount, 10);
  assert.ok(!result.wordText.includes('シナリオ別複数年改善計画'));
  assert.ok(!result.slideText.includes('シナリオ別複数年改善計画'));
});

test('includes scenario plan slides in the existing slide budget', async () => {
  const value = multiYearFixture();

  value.slides = Array.from(
    { length: 32 },
    () => value.slides[0]!,
  );

  await assert.rejects(
    () => renderPaidAssessmentExecutiveSlidesDraft(value),
    /comparison exceeds available slide budget/,
  );
});

test('retains blocked state and flags review needs on scenario plan slides', async () => {
  const value = multiYearFixture();

  value.assessment.scenarios.scenarios[1]!.state =
    'BLOCKED_BY_OPTION_EVIDENCE';

  const plan = value.assessment.scenarioPlans!.plans[0]!;

  plan.years = plan.years.map(year => ({
    ...year,
    openQuestions: ['担当者の役割分担を確認する'],
  }));

  const result = await renderBoth(value);

  assert.equal(result.word.readiness, 'BLOCKED_BY_EVIDENCE');
  assert.equal(result.slides.readiness, 'BLOCKED_BY_EVIDENCE');

  assert.ok(slideXml(result.slides.bytes, 9).includes(
    '追加確認が必要',
  ));

  assert.ok(slideXml(result.slides.bytes, 10).includes(
    '実現条件の確認が必要',
  ));

  assert.ok(notesXml(result.slides.bytes, 9).includes(
    '担当者の役割分担を確認する',
  ));

  assert.equal(result.word.status, 'INTERNAL_REVIEW_DRAFT');
  assert.equal(result.slides.status, 'INTERNAL_REVIEW_DRAFT');
});

test('rejects oversized plan text instead of silently clipping it', async () => {
  const value = multiYearFixture();
  const plan = value.assessment.scenarioPlans!.plans[0]!;

  plan.years = plan.years.map(year => ({
    ...year,
    activities: ['あ'.repeat(241)],
  }));

  await assert.rejects(
    () => renderPaidAssessmentWordDraft(value.assessment),
    /scenario plan detail must not exceed 240/,
  );

  await assert.rejects(
    () => renderPaidAssessmentExecutiveSlidesDraft(value),
    /scenario plan activities must not exceed 100/,
  );
});

test('preserves known three-year comparison while displaying a two-year plan', async () => {
  const value = multiYearFixture();

  const plan = value.assessment.scenarioPlans!.plans[0]!;

  plan.years = plan.years.slice(0, 2);

  const result = await renderBoth(value);

  assert.ok(slideXml(result.slides.bytes, 6).includes(
    '1,380,000円',
  ));

  assert.ok(slideXml(result.slides.bytes, 9).includes(
    '2年間合計：1,020,000円',
  ));

  assert.ok(result.wordText.includes('2年間合計：1,020,000円'));
});

test('renders an empty scenario plan comparison without invented values', async () => {
  const value = multiYearFixture();

  value.assessment.futureComparison = {
    criteria: [],
    scenarioIds: [],
    evaluations: [],
  };

  value.assessment.investmentComparison!.entries = [];
  value.assessment.scenarioPlans!.plans = [];

  const result = await renderBoth(value);

  assert.equal(result.slides.slideCount, 7);
  assert.equal(result.word.readiness, 'NEEDS_CONFIRMATION');
  assert.equal(result.slides.readiness, 'NEEDS_CONFIRMATION');

  assert.ok(slideXml(result.slides.bytes, 7).includes(
    '比較内容の準備が必要です。',
  ));
});
