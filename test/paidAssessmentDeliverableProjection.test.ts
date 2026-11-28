import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GapReviewResult } from '../src/domain/paidAssessmentGapReview';
import type { RootCauseReviewResult } from '../src/domain/paidAssessmentRootCauseReview';
import type { ActOptionReviewResult } from '../src/domain/paidAssessmentActOptionReview';
import type { ManagementScenarioReview } from '../src/domain/paidAssessmentScenarioComparison';
import type { DecisionSessionReviewResult } from '../src/domain/paidAssessmentDecisionSessionReview';
import type { InitialActionPlanReview } from '../src/domain/paidAssessmentInitialActionPlan';
import type { RoadmapReviewResult } from '../src/domain/paidAssessmentRoadmapReview';
import {
  buildPaidAssessmentDeliverableProjection,
  type DeliverableProjectionInput,
  type DeliverableStatement,
} from '../src/domain/paidAssessmentDeliverableProjection';

const coreSource = {
  kind: 'CORE_VERIFIED_REFERENCE' as const,
  id: 'core-source',
  version: 2,
  hash: 'a'.repeat(64),
};
const managementSource = {
  kind: 'MANAGEMENT_FEEDBACK' as const,
  id: 'management-source',
  version: 1,
};
const customerSource = {
  kind: 'CUSTOMER_STATEMENT' as const,
  id: 'customer-source',
  version: 3,
};

function gaps(): GapReviewResult {
  return {
    items: [
      { id: 'gap-ok', state: 'CONFIRMED_DIFFERENCE' },
      { id: 'gap-needs', state: 'INSUFFICIENT_EVIDENCE' },
      { id: 'shared', state: 'NO_DIFFERENCE_IDENTIFIED' },
    ],
    counts: { CONFIRMED_DIFFERENCE: 1, NO_DIFFERENCE_IDENTIFIED: 1, INSUFFICIENT_EVIDENCE: 1 },
  } as unknown as GapReviewResult;
}

function causes(): RootCauseReviewResult {
  return {
    hypotheses: [
      { id: 'cause-ok', state: 'HYPOTHESIS_WITH_VERIFIED_SUPPORT' },
      { id: 'cause-needs', state: 'HYPOTHESIS_CONTESTED' },
      { id: 'cause-blocked', state: 'BLOCKED_BY_GAP_EVIDENCE' },
    ],
    counts: {
      HYPOTHESIS_WITH_VERIFIED_SUPPORT: 1,
      HYPOTHESIS_CONTESTED: 1,
      HYPOTHESIS_UNSUBSTANTIATED: 0,
      BLOCKED_BY_GAP_EVIDENCE: 1,
    },
  } as unknown as RootCauseReviewResult;
}

function options(): ActOptionReviewResult {
  return {
    options: [
      { id: 'option-ok', state: 'REVIEWABLE' },
      { id: 'option-needs', state: 'NEEDS_CONFIRMATION' },
      { id: 'option-blocked', state: 'BLOCKED_BY_GAP_EVIDENCE' },
      { id: 'shared', state: 'REVIEWABLE' },
    ],
    counts: { REVIEWABLE: 2, NEEDS_CONFIRMATION: 1, BLOCKED_BY_GAP_EVIDENCE: 1 },
  } as unknown as ActOptionReviewResult;
}

function scenarios(): ManagementScenarioReview {
  return {
    scenarios: [
      { id: 'scenario-ok', state: 'REVIEWABLE' },
      { id: 'scenario-needs', state: 'NEEDS_CONFIRMATION' },
      { id: 'scenario-blocked', state: 'BLOCKED_BY_OPTION_EVIDENCE' },
    ],
    counts: { REVIEWABLE: 1, NEEDS_CONFIRMATION: 1, BLOCKED_BY_OPTION_EVIDENCE: 1 },
  } as unknown as ManagementScenarioReview;
}

function decisions(): DecisionSessionReviewResult {
  return {
    decisions: [
      { id: 'decision-ok', state: 'REVIEWABLE' },
      { id: 'decision-needs', state: 'NEEDS_CONFIRMATION' },
      { id: 'decision-blocked', state: 'BLOCKED_BY_OPTION_EVIDENCE' },
    ],
    counts: { REVIEWABLE: 1, NEEDS_CONFIRMATION: 1, BLOCKED_BY_OPTION_EVIDENCE: 1 },
  } as unknown as DecisionSessionReviewResult;
}

function initialActions(): InitialActionPlanReview {
  return {
    actions: [
      { id: 'action-ok', state: 'REVIEWABLE_DRAFT' },
      { id: 'action-needs', state: 'NEEDS_CONFIRMATION' },
      { id: 'action-blocked', state: 'BLOCKED_BY_DECISION_EVIDENCE' },
    ],
    counts: { REVIEWABLE_DRAFT: 1, NEEDS_CONFIRMATION: 1, BLOCKED_BY_DECISION_EVIDENCE: 1 },
  } as unknown as InitialActionPlanReview;
}

function roadmap(): RoadmapReviewResult {
  return {
    items: [
      { id: 'roadmap-ok', state: 'REVIEWABLE_DRAFT' },
      { id: 'roadmap-needs', state: 'NEEDS_CONFIRMATION' },
      { id: 'roadmap-blocked', state: 'BLOCKED_BY_EVIDENCE' },
    ],
    counts: { REVIEWABLE_DRAFT: 1, NEEDS_CONFIRMATION: 1, BLOCKED_BY_EVIDENCE: 1 },
  } as unknown as RoadmapReviewResult;
}

function statement(
  id: string,
  kind: DeliverableStatement['kind'],
  sourceRefs: DeliverableStatement['sourceRefs'] = [managementSource],
): DeliverableStatement {
  return { id, kind, text: `${id}の顧客向け説明`, sourceRefs, relatedRefs: [] };
}

function input(): DeliverableProjectionInput {
  const statements: DeliverableStatement[] = [
    statement('future', 'FUTURE'),
    statement('fact', 'VERIFIED_FACT_REFERENCE', [coreSource]),
    statement('unknown', 'UNKNOWN', []),
    statement('hypothesis', 'HYPOTHESIS', [customerSource]),
    statement('proposal', 'PROPOSAL'),
    statement('expected', 'EXPECTED_CHANGE'),
  ];
  statements[1]!.relatedRefs = [{ kind: 'GAP', id: 'gap-ok' }];
  statements[3]!.relatedRefs = [{ kind: 'ROOT_CAUSE', id: 'cause-ok' }];
  statements[4]!.relatedRefs = [{ kind: 'ACT_OPTION', id: 'option-ok' }];
  statements[5]!.relatedRefs = [{ kind: 'ROADMAP', id: 'roadmap-ok' }];
  return {
    reportId: 'report-1',
    customerLabel: 'サンプル株式会社',
    purpose: '経営判断に必要な情報を共有する',
    statements,
    sections: [
      { id: 'section-1', title: '現在地', narrative: '事実と未確認事項を説明します。', statementIds: ['fact', 'unknown'] },
      { id: 'section-2', title: '今後の方向', narrative: '目指す姿と選択肢を説明します。', statementIds: ['future', 'proposal', 'expected'] },
    ],
    gaps: gaps(),
    causes: causes(),
    options: options(),
    scenarios: scenarios(),
    decisions: decisions(),
    initialActions: initialActions(),
    roadmap: roadmap(),
  };
}

test('preserves epistemic kinds, sources, shared statements and stable section order', () => {
  const result = buildPaidAssessmentDeliverableProjection(input());
  assert.equal(result.readiness, 'REVIEWABLE_DRAFT');
  assert.deepEqual(result.sections.map(value => value.id), ['section-1', 'section-2']);
  assert.deepEqual(result.sections[0]!.statements.map(value => value.kind), [
    'VERIFIED_FACT_REFERENCE', 'UNKNOWN',
  ]);
  assert.deepEqual(result.evidenceIndex.map(value => value.kind), [
    'FUTURE', 'VERIFIED_FACT_REFERENCE', 'UNKNOWN', 'HYPOTHESIS', 'PROPOSAL', 'EXPECTED_CHANGE',
  ]);
  assert.deepEqual(result.references, {
    gapIds: ['gap-ok'], causeIds: ['cause-ok'], optionIds: ['option-ok'], scenarioIds: [],
    decisionIds: [], initialActionIds: [], roadmapIds: ['roadmap-ok'],
  });
  assert.equal('slideConclusion' in result, false);
  assert.equal('maturityScore' in result, false);
});

test('keeps a CORE_VERIFIED_REFERENCE as caller-supplied provenance without Core authorization claims', () => {
  const result = buildPaidAssessmentDeliverableProjection(input());
  const fact = result.sections[0]!.statements[0]!;
  assert.equal(fact.kind, 'VERIFIED_FACT_REFERENCE');
  assert.deepEqual(fact.sourceRefs, [coreSource]);
  assert.equal('authenticated' in fact, false);
  assert.equal('factRecord' in fact, false);
  assert.equal('approved' in result, false);
});

test('rejects a verified statement without a Core reference and distinguishes source-free UNKNOWN', () => {
  const missingCore = input();
  missingCore.statements[1]!.sourceRefs = [customerSource];
  assert.throws(() => buildPaidAssessmentDeliverableProjection(missingCore), /requires CORE_VERIFIED_REFERENCE/);

  const sourceFreeProposal = input();
  sourceFreeProposal.statements[4]!.sourceRefs = [];
  const result = buildPaidAssessmentDeliverableProjection(sourceFreeProposal);
  assert.equal(result.readiness, 'NEEDS_CONFIRMATION');
  assert.deepEqual(result.reviewReasons, ['SOURCE_NOT_PROVIDED:proposal']);
  assert.equal(result.evidenceIndex.find(value => value.statementId === 'unknown')!.sources.length, 0);
  assert.ok(!result.reviewReasons.includes('SOURCE_NOT_PROVIDED:unknown'));
});

test('propagates referenced review states and keeps decision candidates unauthenticated', () => {
  const value = input();
  value.statements[0]!.relatedRefs = [
    { kind: 'GAP', id: 'gap-needs' },
    { kind: 'ROOT_CAUSE', id: 'cause-needs' },
    { kind: 'DECISION_CANDIDATE', id: 'decision-ok' },
    { kind: 'INITIAL_ACTION', id: 'action-needs' },
    { kind: 'ROADMAP', id: 'roadmap-needs' },
  ];
  const result = buildPaidAssessmentDeliverableProjection(value);
  assert.equal(result.readiness, 'NEEDS_CONFIRMATION');
  assert.deepEqual(result.reviewReasons, [
    'UPSTREAM_REVIEW_NEEDED:GAP:gap-needs',
    'UPSTREAM_REVIEW_NEEDED:ROOT_CAUSE:cause-needs',
    'DECISION_NOT_AUTHENTICATED:DECISION_CANDIDATE:decision-ok',
    'UPSTREAM_REVIEW_NEEDED:INITIAL_ACTION:action-needs',
    'UPSTREAM_REVIEW_NEEDED:ROADMAP:roadmap-needs',
  ]);
});

test('blocked referenced items take precedence while unreferenced blocked items do not contaminate readiness', () => {
  const healthy = buildPaidAssessmentDeliverableProjection(input());
  assert.equal(healthy.readiness, 'REVIEWABLE_DRAFT');

  const value = input();
  value.statements[0]!.relatedRefs = [
    { kind: 'ROOT_CAUSE', id: 'cause-blocked' },
    { kind: 'DECISION_CANDIDATE', id: 'decision-needs' },
    { kind: 'INITIAL_ACTION', id: 'action-blocked' },
  ];
  const result = buildPaidAssessmentDeliverableProjection(value);
  assert.equal(result.readiness, 'BLOCKED_BY_EVIDENCE');
  assert.deepEqual(result.reviewReasons, [
    'UPSTREAM_BLOCKED:ROOT_CAUSE:cause-blocked',
    'UPSTREAM_BLOCKED:INITIAL_ACTION:action-blocked',
  ]);
});

test('validates typed references and permits equal raw IDs in different namespaces', () => {
  const equalIds = input();
  equalIds.statements[0]!.relatedRefs = [
    { kind: 'GAP', id: 'shared' },
    { kind: 'ACT_OPTION', id: 'shared' },
  ];
  const result = buildPaidAssessmentDeliverableProjection(equalIds);
  assert.deepEqual(result.references.gapIds, ['shared', 'gap-ok']);
  assert.deepEqual(result.references.optionIds, ['shared', 'option-ok']);

  const duplicate = input();
  duplicate.statements[0]!.relatedRefs = [
    { kind: 'GAP', id: 'gap-ok' },
    { kind: 'GAP', id: 'gap-ok' },
  ];
  assert.throws(() => buildPaidAssessmentDeliverableProjection(duplicate), /duplicate related ref/);
  const unknown = input();
  unknown.statements[0]!.relatedRefs = [{ kind: 'SCENARIO', id: 'missing' }];
  assert.throws(() => buildPaidAssessmentDeliverableProjection(unknown), /unknown related ref/);
  const invalidKind = input();
  (invalidKind.statements[0]!.relatedRefs as Array<{ kind: string; id: string }>).push({ kind: 'FACT', id: 'fact' });
  assert.throws(() => buildPaidAssessmentDeliverableProjection(invalidKind), /kind is invalid/);
});

test('supports empty statements and scenarios and marks a section-free draft for confirmation', () => {
  const value = input();
  value.statements = [];
  value.sections = [];
  value.scenarios = { scenarios: [], counts: { REVIEWABLE: 0, NEEDS_CONFIRMATION: 0, BLOCKED_BY_OPTION_EVIDENCE: 0 } };
  const result = buildPaidAssessmentDeliverableProjection(value);
  assert.deepEqual(result.sections, []);
  assert.deepEqual(result.evidenceIndex, []);
  assert.equal(result.readiness, 'NEEDS_CONFIRMATION');
  assert.deepEqual(result.reviewReasons, ['NO_SECTIONS']);
});

test('rejects invalid identities, sources, section links, duplicate upstream IDs and states', () => {
  const mutations: Array<(value: DeliverableProjectionInput) => void> = [
    value => { value.reportId = ' '; },
    value => { value.customerLabel = ''; },
    value => { value.purpose = ' '; },
    value => { value.statements[0]!.text = ''; },
    value => { (value.statements[0] as { kind: string }).kind = 'FACT'; },
    value => { value.statements[0]!.sourceRefs = [{ ...managementSource, version: 0 }]; },
    value => { value.statements[0]!.sourceRefs = [{ ...managementSource, hash: 'A'.repeat(64) }]; },
    value => { value.sections[0]!.title = ''; },
    value => { value.sections[0]!.narrative = ' '; },
    value => { value.sections[0]!.statementIds = ['missing']; },
    value => { value.sections[0]!.statementIds = ['fact', 'fact']; },
    value => { value.gaps.items.push({ ...value.gaps.items[0]! }); },
    value => { (value.roadmap.items[0] as { state: string }).state = 'DELIVERED'; },
  ];
  for (const mutate of mutations) {
    const invalid = input();
    mutate(invalid);
    assert.throws(() => buildPaidAssessmentDeliverableProjection(invalid), TypeError);
  }
  const duplicateStatement = input();
  duplicateStatement.statements = [...duplicateStatement.statements, { ...duplicateStatement.statements[0]! }];
  assert.throws(() => buildPaidAssessmentDeliverableProjection(duplicateStatement), /duplicate statement id/);
  const duplicateSection = input();
  duplicateSection.sections = [...duplicateSection.sections, { ...duplicateSection.sections[0]! }];
  assert.throws(() => buildPaidAssessmentDeliverableProjection(duplicateSection), /duplicate section id/);
});

test('is deterministic, preserves inputs and deeply detaches all shared-view data', () => {
  const value = input();
  const before = structuredClone(value);
  const first = buildPaidAssessmentDeliverableProjection(value);
  const second = buildPaidAssessmentDeliverableProjection(value);
  assert.deepEqual(first, second);
  assert.deepEqual(value, before);
  assert.notEqual(first.sections, value.sections);
  assert.notEqual(first.sections[0], value.sections[0]);
  assert.notEqual(first.sections[0]!.statementIds, value.sections[0]!.statementIds);
  assert.notEqual(first.sections[0]!.statements[0], value.statements[1]);
  assert.notEqual(first.sections[0]!.statements[0]!.sourceRefs, value.statements[1]!.sourceRefs);
  assert.notEqual(first.sections[0]!.statements[0]!.relatedRefs, value.statements[1]!.relatedRefs);
  assert.notEqual(first.evidenceIndex[0]!.sources, value.statements[0]!.sourceRefs);
});

function comparisonInput(): DeliverableProjectionInput {
  const value = input();

  value.scenarios.scenarios =
    value.scenarios.scenarios.map(s => ({
      ...s,
      title: s.id,
      managementPriority: {
        statement: '人を増やさず事業を拡大する',
        source: managementSource,
      },
      rationale: '業務改善の方向を比較する',
      optionIds: ['option-ok'],
      expectedDirection: '業務負担の軽減',
      tradeoffs: [],
      risks: [],
      assumptions: [],
      investmentCharacter: 'NOT_ASSESSED',
      reviewReasons: [],
    }));

  value.futureComparison = {
    criteria: [{
      id: 'efficiency',
      futureStatementId: 'future',
      title: '本来の業務に集中する',
      rationale: '成長に必要な時間を確保する',
    }],
    scenarioIds: ['scenario-ok'],
    evaluations: [{
      criterionId: 'efficiency',
      scenarioId: 'scenario-ok',
      rating: 'HIGH',
      rationale: '標準化により負担軽減を目指す',
      sourceRefs: [coreSource],
    }],
    recommendation: {
      scenarioId: 'scenario-ok',
      rationale: '事業成長の方向と合う',
      conditions: ['段階的に効果を確認する'],
      alternativeConditions: [],
    },
  };

  return value;
}

test('keeps the existing D1 contract when comparison is omitted', () => {
  const result = buildPaidAssessmentDeliverableProjection(input());
  assert.equal('futureComparison' in result, false);
  assert.equal(result.readiness, 'REVIEWABLE_DRAFT');
});

test('projects future-fit matrix and explicit recommendation without approval', () => {
  const result = buildPaidAssessmentDeliverableProjection(
    comparisonInput(),
  );

  assert.equal(result.readiness, 'REVIEWABLE_DRAFT');
  assert.deepEqual(result.references.scenarioIds, ['scenario-ok']);
  assert.equal(
    result.futureComparison!.rows[0]!.future.id,
    'future',
  );
  assert.equal(
    result.futureComparison!.rows[0]!.cells[0]!.evaluation!.rating,
    'HIGH',
  );
  assert.deepEqual(
    result.futureComparison!.rows[0]!.cells[0]!.evaluation!.sourceRefs,
    [coreSource],
  );
  assert.equal(
    result.futureComparison!.recommendation!.scenarioId,
    'scenario-ok',
  );
  assert.deepEqual(result.references.decisionIds, []);
});

test('distinguishes missing evaluation from explicit confirmation needed', () => {
  const value = comparisonInput();
  const comparison = value.futureComparison!;

  value.futureComparison = {
    ...comparison,
    evaluations: [],
  };

  const missing = buildPaidAssessmentDeliverableProjection(value);

  assert.equal(missing.readiness, 'NEEDS_CONFIRMATION');
  assert.equal(
    missing.futureComparison!.rows[0]!.cells[0]!.evaluation,
    null,
  );
  assert.deepEqual(missing.reviewReasons, [
    'FUTURE_FIT_NOT_EVALUATED:["efficiency","scenario-ok"]',
  ]);

  value.futureComparison = {
    ...comparison,
    evaluations: [{
      ...comparison.evaluations[0]!,
      rating: 'NEEDS_CONFIRMATION',
      sourceRefs: [],
    }],
  };

  const pending = buildPaidAssessmentDeliverableProjection(value);

  assert.equal(pending.readiness, 'NEEDS_CONFIRMATION');
  assert.deepEqual(pending.reviewReasons, [
    'FUTURE_FIT_NEEDS_CONFIRMATION:["efficiency","scenario-ok"]',
  ]);
});

test('preserves blocked precedence even for explicitly recommended high fit', () => {
  const value = comparisonInput();
  const comparison = value.futureComparison!;

  value.futureComparison = {
    ...comparison,
    scenarioIds: ['scenario-blocked', 'scenario-needs'],
    evaluations: [{
      ...comparison.evaluations[0]!,
      scenarioId: 'scenario-blocked',
    }],
    recommendation: {
      ...comparison.recommendation!,
      scenarioId: 'scenario-blocked',
    },
  };

  const result = buildPaidAssessmentDeliverableProjection(value);

  assert.equal(result.readiness, 'BLOCKED_BY_EVIDENCE');
  assert.deepEqual(result.reviewReasons, [
    'UPSTREAM_BLOCKED:SCENARIO:scenario-blocked',
  ]);

  assert.equal(
    result.futureComparison!.rows[0]!.cells[0]!.evaluation!.rating,
    'HIGH',
  );

  assert.equal(
    result.futureComparison!.scenarios[0]!.state,
    'BLOCKED_BY_OPTION_EVIDENCE',
  );

  assert.deepEqual(result.references.decisionIds, []);
});

test('propagates scenario confirmation and deduplicates existing references', () => {
  const value = comparisonInput();
  const comparison = value.futureComparison!;

  value.statements[0]!.relatedRefs = [{
    kind: 'SCENARIO',
    id: 'scenario-needs',
  }];

  value.futureComparison = {
    ...comparison,
    scenarioIds: ['scenario-needs'],
    evaluations: [{
      ...comparison.evaluations[0]!,
      scenarioId: 'scenario-needs',
    }],
    recommendation: {
      ...comparison.recommendation!,
      scenarioId: 'scenario-needs',
    },
  };

  const result = buildPaidAssessmentDeliverableProjection(value);

  assert.equal(result.readiness, 'NEEDS_CONFIRMATION');
  assert.deepEqual(result.references.scenarioIds, ['scenario-needs']);
  assert.deepEqual(result.reviewReasons, [
    'UPSTREAM_REVIEW_NEEDED:SCENARIO:scenario-needs',
  ]);
});

test('marks an explicitly empty comparison as needing preparation', () => {
  const value = comparisonInput();

  value.futureComparison = {
    criteria: [],
    scenarioIds: [],
    evaluations: [],
  };

  const result = buildPaidAssessmentDeliverableProjection(value);

  assert.equal(result.readiness, 'NEEDS_CONFIRMATION');
  assert.deepEqual(result.reviewReasons, [
    'FUTURE_COMPARISON_NO_CRITERIA',
    'FUTURE_COMPARISON_NO_SCENARIOS',
  ]);
  assert.equal(result.futureComparison!.recommendation, null);
});

test('rejects invalid comparison references without bypassing D1 validation', () => {
  const value = comparisonInput();
  const comparison = value.futureComparison!;

  value.futureComparison = {
    ...comparison,
    criteria: [{
      ...comparison.criteria[0]!,
      futureStatementId: 'proposal',
    }],
  };

  assert.throws(
    () => buildPaidAssessmentDeliverableProjection(value),
    /Unknown FUTURE/,
  );
});

test('detaches comparison data and remains deterministic without mutating inputs', () => {
  const value = comparisonInput();
  const before = structuredClone(value);

  const first = buildPaidAssessmentDeliverableProjection(value);
  const second = buildPaidAssessmentDeliverableProjection(value);

  assert.deepEqual(first, second);
  assert.deepEqual(value, before);

  first.futureComparison!.rows[0]!.criterion.title = 'modified';

  assert.deepEqual(value, before);
  assert.notDeepEqual(first, second);
});

function investmentInput(): DeliverableProjectionInput {
  const value = comparisonInput();

  const scenario = value.scenarios.scenarios.find(
    s => s.id === 'scenario-ok',
  )!;

  scenario.investmentCharacter = 'EVIDENCE_BACKED_RANGE';
  scenario.investmentNote = '取得済み参考見積に基づく概算';
  scenario.investmentEvidence = coreSource;

  value.investmentComparison = {
    scope: '既存維持費を除く追加投資',
    taxBasis: 'EXCLUDING_TAX',
    entries: [{
      scenarioId: 'scenario-ok',
      initialYen: {
        min: 1_000_000,
        max: 1_200_000,
      },
      monthlyYen: {
        min: 80_000,
        max: 100_000,
      },
      monthlyPattern: 'CONSTANT_36_MONTHS',
      leadTime: '段階的に実施',
      internalEffort: '関係者による定期確認',
      deliveryTeam: '社内外の役割を協議する',
    }],
  };

  return value;
}

test('shares evidence-backed investment ranges and comparable period totals', () => {
  const result =
    buildPaidAssessmentDeliverableProjection(investmentInput());

  const comparison = result.investmentComparison!;
  const entry = comparison.columns[0]!.entry!;

  assert.equal(comparison.currency, 'JPY');
  assert.equal(comparison.taxBasis, 'EXCLUDING_TAX');

  assert.deepEqual(entry.firstYearYen, {
    min: 1_960_000,
    max: 2_400_000,
  });

  assert.deepEqual(entry.threeYearYen, {
    min: 3_880_000,
    max: 4_800_000,
  });

  assert.deepEqual(entry.investmentEvidence, coreSource);

  assert.equal(result.readiness, 'REVIEWABLE_DRAFT');
  assert.deepEqual(result.references.decisionIds, []);
});

test('does not infer totals for variable or unconfirmed monthly costs', () => {
  const value = investmentInput();

  value.investmentComparison!.entries = [{
    ...value.investmentComparison!.entries[0]!,
    monthlyPattern: 'VARIABLE_OR_UNCONFIRMED',
  }];

  const entry = buildPaidAssessmentDeliverableProjection(value)
    .investmentComparison!.columns[0]!.entry!;

  assert.equal(entry.firstYearYen, null);
  assert.equal(entry.threeYearYen, null);
  assert.deepEqual(entry.monthlyYen, {
    min: 80_000,
    max: 100_000,
  });
});

test('distinguishes explicitly unknown amounts from zero amounts', () => {
  const value = investmentInput();

  const initial = value.investmentComparison!.entries[0]!;

  value.investmentComparison!.entries = [{
    ...initial,
    monthlyYen: null,
  }];

  let entry = buildPaidAssessmentDeliverableProjection(value)
    .investmentComparison!.columns[0]!.entry!;

  assert.equal(entry.monthlyYen, null);
  assert.equal(entry.firstYearYen, null);

  value.investmentComparison!.entries = [{
    ...initial,
    monthlyYen: { min: 0, max: 0 },
  }];

  entry = buildPaidAssessmentDeliverableProjection(value)
    .investmentComparison!.columns[0]!.entry!;

  assert.deepEqual(entry.monthlyYen, { min: 0, max: 0 });
  assert.deepEqual(entry.firstYearYen, initial.initialYen);
});

test('requires existing investment evidence for numeric ranges', () => {
  const value = investmentInput();

  const scenario = value.scenarios.scenarios.find(
    s => s.id === 'scenario-ok',
  )!;

  delete scenario.investmentEvidence;

  assert.throws(
    () => buildPaidAssessmentDeliverableProjection(value),
    /Numeric investment requires existing scenario evidence/,
  );
});

test('rejects invalid cost ranges, amounts and unsafe totals', () => {
  const ranges = [
    { min: -1, max: 100 },
    { min: 100, max: 10 },
    { min: 1.5, max: 10 },
    { min: 0, max: Number.POSITIVE_INFINITY },
  ];

  for (const range of ranges) {
    const value = investmentInput();

    value.investmentComparison!.entries = [{
      ...value.investmentComparison!.entries[0]!,
      initialYen: range,
    }];

    assert.throws(
      () => buildPaidAssessmentDeliverableProjection(value),
      /initialYen is invalid/,
    );
  }

  const overflow = investmentInput();

  overflow.investmentComparison!.entries = [{
    ...overflow.investmentComparison!.entries[0]!,
    monthlyYen: {
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
    },
  }];

  assert.throws(
    () => buildPaidAssessmentDeliverableProjection(overflow),
    /Investment total exceeds safe range/,
  );
});

test('requires the same selected future-comparison scenarios', () => {
  const missing = investmentInput();

  delete missing.futureComparison;

  assert.throws(
    () => buildPaidAssessmentDeliverableProjection(missing),
    /Investment comparison requires future comparison/,
  );

  const unrelated = investmentInput();

  unrelated.investmentComparison!.entries = [{
    ...unrelated.investmentComparison!.entries[0]!,
    scenarioId: 'scenario-needs',
  }];

  assert.throws(
    () => buildPaidAssessmentDeliverableProjection(unrelated),
    /Unknown investment scenario/,
  );

  const duplicate = investmentInput();

  duplicate.investmentComparison!.entries = [
    ...duplicate.investmentComparison!.entries,
    duplicate.investmentComparison!.entries[0]!,
  ];

  assert.throws(
    () => buildPaidAssessmentDeliverableProjection(duplicate),
    /Duplicate investment scenario/,
  );
});

test('preserves scenario order and flags missing investment entry', () => {
  const value = investmentInput();
  const comparison = value.futureComparison!;

  value.scenarios.scenarios.push({
    ...value.scenarios.scenarios.find(
      s => s.id === 'scenario-ok',
    )!,
    id: 'second-scenario',
    title: '別の改善案',
  });

  value.futureComparison = {
    ...comparison,
    scenarioIds: ['second-scenario', 'scenario-ok'],
    evaluations: [
      ...comparison.evaluations,
      {
        ...comparison.evaluations[0]!,
        scenarioId: 'second-scenario',
      },
    ],
  };

  const result =
    buildPaidAssessmentDeliverableProjection(value);

  assert.deepEqual(
    result.investmentComparison!.columns.map(c => c.scenarioId),
    ['second-scenario', 'scenario-ok'],
  );

  assert.equal(
    result.investmentComparison!.columns[0]!.entry,
    null,
  );

  assert.equal(result.readiness, 'NEEDS_CONFIRMATION');

  assert.ok(result.reviewReasons.includes(
    'INVESTMENT_COMPARISON_NOT_ENTERED:second-scenario',
  ));
});

test('preserves blocked precedence and never promotes an investment to approval', () => {
  const value = investmentInput();

  value.scenarios.scenarios.find(
    s => s.id === 'scenario-ok',
  )!.state = 'BLOCKED_BY_OPTION_EVIDENCE';

  const result =
    buildPaidAssessmentDeliverableProjection(value);

  assert.equal(result.readiness, 'BLOCKED_BY_EVIDENCE');

  assert.ok(result.reviewReasons.includes(
    'UPSTREAM_BLOCKED:SCENARIO:scenario-ok',
  ));

  assert.equal('approved' in result, false);
  assert.deepEqual(result.references.decisionIds, []);
});

test('preserves existing reports and returns detached investment data', () => {
  const existing =
    buildPaidAssessmentDeliverableProjection(comparisonInput());

  assert.equal('investmentComparison' in existing, false);

  const value = investmentInput();
  const before = structuredClone(value);

  const result =
    buildPaidAssessmentDeliverableProjection(value);

  assert.deepEqual(
    result,
    buildPaidAssessmentDeliverableProjection(value),
  );

  result.investmentComparison!
    .columns[0]!.entry!.initialYen!.min = 99;

  assert.deepEqual(value, before);
});

test('supports qualitative or unknown investment without fabricating price', () => {
  const value = investmentInput();

  const scenario = value.scenarios.scenarios.find(
    s => s.id === 'scenario-ok',
  )!;

  scenario.investmentCharacter = 'QUALITATIVE_ONLY';
  scenario.investmentNote = '既存設備を活用する方向';
  delete scenario.investmentEvidence;

  value.investmentComparison!.entries = [{
    ...value.investmentComparison!.entries[0]!,
    initialYen: null,
    monthlyYen: null,
    monthlyPattern: 'VARIABLE_OR_UNCONFIRMED',
  }];

  const entry = buildPaidAssessmentDeliverableProjection(value)
    .investmentComparison!.columns[0]!.entry!;

  assert.equal(entry.initialYen, null);
  assert.equal(entry.monthlyYen, null);
  assert.equal(entry.firstYearYen, null);
  assert.equal(entry.threeYearYen, null);
  assert.equal(entry.investmentEvidence, null);
});
