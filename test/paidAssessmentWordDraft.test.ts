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
import { renderPaidAssessmentWordDraft } from '../src/services/paidAssessmentWordDraft';

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
    hypotheses: [
      { id: 'cause-ok', state: 'HYPOTHESIS_WITH_VERIFIED_SUPPORT' },
      { id: 'cause-blocked', state: 'BLOCKED_BY_GAP_EVIDENCE' },
    ],
    counts: {
      HYPOTHESIS_WITH_VERIFIED_SUPPORT: 1,
      HYPOTHESIS_CONTESTED: 0,
      HYPOTHESIS_UNSUBSTANTIATED: 0,
      BLOCKED_BY_GAP_EVIDENCE: 1,
    },
  } as unknown as RootCauseReviewResult;
}

function options(): ActOptionReviewResult {
  return {
    options: [{ id: 'option-ok', state: 'REVIEWABLE' }],
    counts: { REVIEWABLE: 1, NEEDS_CONFIRMATION: 0, BLOCKED_BY_GAP_EVIDENCE: 0 },
  } as unknown as ActOptionReviewResult;
}

function scenarios(): ManagementScenarioReview {
  return {
    scenarios: [],
    counts: { REVIEWABLE: 0, NEEDS_CONFIRMATION: 0, BLOCKED_BY_OPTION_EVIDENCE: 0 },
  };
}

function decisions(): DecisionSessionReviewResult {
  return {
    decisions: [],
    counts: { REVIEWABLE: 0, NEEDS_CONFIRMATION: 0, BLOCKED_BY_OPTION_EVIDENCE: 0 },
  };
}

function initialActions(): InitialActionPlanReview {
  return {
    actions: [],
    counts: { REVIEWABLE_DRAFT: 0, NEEDS_CONFIRMATION: 0, BLOCKED_BY_DECISION_EVIDENCE: 0 },
  };
}

function roadmap(): RoadmapReviewResult {
  return {
    items: [],
    counts: { REVIEWABLE_DRAFT: 0, NEEDS_CONFIRMATION: 0, BLOCKED_BY_EVIDENCE: 0 },
  };
}

function fixture(): DeliverableProjectionInput {
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
    sections: [{
      id: 'section-1',
      title: '現在地と今後の方向',
      narrative: '確認した内容を整理します。\n未確認事項は区別して表示します。',
      statementIds: statements.map(value => value.id),
    }],
    gaps: gaps(),
    causes: causes(),
    options: options(),
    scenarios: scenarios(),
    decisions: decisions(),
    initialActions: initialActions(),
    roadmap: roadmap(),
  };
}

function entries(bytes: Buffer): Record<string, Uint8Array> {
  return unzipSync(new Uint8Array(bytes));
}

function documentXml(bytes: Buffer): string {
  const document = entries(bytes)['word/document.xml'];
  assert.ok(document, 'word/document.xml must exist');
  return strFromU8(document);
}

test('returns a real internal-review DOCX with ordered human-authored content and provenance', async () => {
  const result = await renderPaidAssessmentWordDraft(fixture());
  assert.equal(result.bytes.subarray(0, 2).toString(), 'PK');
  const zipEntries = entries(result.bytes);
  assert.ok(zipEntries['[Content_Types].xml']);
  assert.ok(zipEntries['word/document.xml']);
  const xml = documentXml(result.bytes);
  for (const text of [
    'IT経営KAIZEN 改善計画書',
    'サンプル株式会社',
    '内部確認用・未承認',
    '現在地と今後の方向',
    '確認した内容を整理します。',
    '未確認事項は区別して表示します。',
    'management-source',
    'CORE_VERIFIED_REFERENCE',
    '内部追跡：GAP:gap-ok',
    '判断の根拠・参照一覧',
  ]) assert.ok(xml.includes(text), `missing ${text}`);
  assert.ok(xml.indexOf('現在地と今後の方向') < xml.indexOf('FUTURE の説明'));
  assert.equal(result.filename, 'assessment-report_2026-11.draft.docx');
  assert.equal(result.mimeType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(result.status, 'INTERNAL_REVIEW_DRAFT');
  assert.equal(result.readiness, 'REVIEWABLE_DRAFT');
  assert.deepEqual(result.reviewReasons, []);
  assert.equal(result.sectionCount, 1);
});

test('renders all ten exact epistemic labels without promoting candidates or expectations', async () => {
  const xml = documentXml((await renderPaidAssessmentWordDraft(fixture())).bytes);
  for (const kind of kinds) assert.ok(xml.includes(labels[kind]), `missing label ${kind}`);
  assert.ok(xml.includes('経営判断の候補（未承認）'));
  assert.ok(xml.includes('期待する変化（未検証）'));
  assert.ok(xml.includes('未確認事項（現時点では根拠未取得）'));
  assert.ok(!xml.includes('承認済みの経営判断'));
  assert.ok(xml.includes('期待する変化は実測済みの変化ではありません'));
  assert.ok(!xml.includes('期待する変化は実測済みの変化です'));
  assert.ok(!xml.includes(coreSource.hash));
});

test('renders every readiness state, permanent warning and exact review reasons', async () => {
  const reviewable = await renderPaidAssessmentWordDraft(fixture());
  assert.ok(documentXml(reviewable.bytes).includes('下書き確認可能'));
  assert.ok(documentXml(reviewable.bytes).includes('正式承認・顧客納品前'));

  const needs = fixture();
  needs.statements[0]!.relatedRefs = [{ kind: 'GAP', id: 'gap-needs' }];
  const needsResult = await renderPaidAssessmentWordDraft(needs);
  assert.equal(needsResult.readiness, 'NEEDS_CONFIRMATION');
  assert.deepEqual(needsResult.reviewReasons, ['UPSTREAM_REVIEW_NEEDED:GAP:gap-needs']);
  assert.ok(documentXml(needsResult.bytes).includes('追加確認が必要'));
  assert.ok(documentXml(needsResult.bytes).includes('UPSTREAM_REVIEW_NEEDED:GAP:gap-needs'));

  const blocked = fixture();
  blocked.statements[0]!.relatedRefs = [{ kind: 'ROOT_CAUSE', id: 'cause-blocked' }];
  const blockedResult = await renderPaidAssessmentWordDraft(blocked);
  assert.equal(blockedResult.readiness, 'BLOCKED_BY_EVIDENCE');
  assert.deepEqual(blockedResult.reviewReasons, ['UPSTREAM_BLOCKED:ROOT_CAUSE:cause-blocked']);
  const blockedXml = documentXml(blockedResult.bytes);
  assert.ok(blockedXml.includes('根拠の確認が必要'));
  assert.ok(blockedXml.includes('UPSTREAM_BLOCKED:ROOT_CAUSE:cause-blocked'));
  assert.ok(blockedXml.includes('内部確認用・未承認'));
  assert.equal('deliveryApproved' in blockedResult, false);
});

test('supports zero sections and preserves newlines, XML-special text, Unicode and source references', async () => {
  const empty = fixture();
  empty.sections = [];
  const emptyResult = await renderPaidAssessmentWordDraft(empty);
  assert.equal(emptyResult.sectionCount, 0);
  assert.equal(emptyResult.readiness, 'NEEDS_CONFIRMATION');
  assert.ok(documentXml(emptyResult.bytes).includes('NO_SECTIONS'));

  const special = fixture();
  special.customerLabel = '株式会社あいうえお＆研究所';
  special.sections[0]!.narrative = '1行目 <確認> & 判断\n2行目 "候補"';
  special.statements[0]!.text = 'A < B & C > D';
  special.statements[0]!.sourceRefs = [{ ...managementSource, id: '資料＆参照' }];
  const xml = documentXml((await renderPaidAssessmentWordDraft(special)).bytes);
  assert.ok(xml.includes('株式会社あいうえお＆研究所'));
  assert.ok(xml.includes('1行目 &lt;確認&gt; &amp; 判断'));
  assert.ok(xml.includes('2行目 &quot;候補&quot;') || xml.includes('2行目 "候補"'));
  assert.ok(xml.includes('A &lt; B &amp; C &gt; D'));
  assert.ok(xml.includes('資料＆参照'));
});

test('creates deterministic path-safe filenames without customer data, traversal or clocks', async () => {
  const cases: Array<[string, string]> = [
    ['../../report\\name\r\n.docx', 'assessment-reportnamedocx.draft.docx'],
    ['日本語のみ', 'assessment-report.draft.docx'],
    ['safe_ID-123', 'assessment-safe_ID-123.draft.docx'],
    ['a'.repeat(60), `assessment-${'a'.repeat(48)}.draft.docx`],
  ];
  for (const [reportId, expected] of cases) {
    const value = fixture();
    value.reportId = reportId;
    value.customerLabel = '秘密の顧客名';
    const result = await renderPaidAssessmentWordDraft(value);
    assert.equal(result.filename, expected);
    assert.ok(!result.filename.includes('秘密'));
    assert.ok(!result.filename.includes('..'));
    assert.ok(!/[\\/\r\n]/.test(result.filename));
  }
});

test('rejects render sizes beyond each explicit guard without truncation', async () => {
  const tooManySections = fixture();
  tooManySections.sections = Array.from({ length: 201 }, (_, index) => ({
    id: `section-${index}`,
    title: `節 ${index}`,
    narrative: '本文',
    statementIds: [],
  }));
  await assert.rejects(() => renderPaidAssessmentWordDraft(tooManySections), /sections must not exceed 200/);

  const tooManyOccurrences = fixture();
  tooManyOccurrences.statements = Array.from({ length: 3001 }, (_, index) => ({
    id: `large-statement-${index}`,
    kind: 'UNKNOWN' as const,
    text: `未確認事項 ${index}`,
    sourceRefs: [],
    relatedRefs: [],
  }));
  tooManyOccurrences.sections = [{
    id: 'large-section', title: '多数参照', narrative: '本文',
    statementIds: tooManyOccurrences.statements.map(value => value.id),
  }];
  await assert.rejects(
    () => renderPaidAssessmentWordDraft(tooManyOccurrences),
    /occurrences must not exceed 3000/,
  );

  const tooMuchText = fixture();
  tooMuchText.sections[0]!.narrative = 'あ'.repeat(1_000_001);
  await assert.rejects(() => renderPaidAssessmentWordDraft(tooMuchText), /text characters must not exceed 1000000/);

  const repeated = fixture();
  repeated.statements[0]!.text = 'あ'.repeat(600_000);
  repeated.sections = [
    { id: 'repeat-1', title: '一', narrative: '説明', statementIds: ['statement-1'] },
    { id: 'repeat-2', title: '二', narrative: '説明', statementIds: ['statement-1'] },
  ];
  await assert.rejects(
    () => renderPaidAssessmentWordDraft(repeated),
    /text characters must not exceed 1000000/,
  );
});

test('invokes D1 validation and rejects forged or malformed inputs', async () => {
  const invalidSource = fixture();
  invalidSource.statements[1]!.sourceRefs = [managementSource];
  await assert.rejects(() => renderPaidAssessmentWordDraft(invalidSource), /requires CORE_VERIFIED_REFERENCE/);

  const dangling = fixture();
  dangling.sections[0]!.statementIds = ['missing'];
  await assert.rejects(() => renderPaidAssessmentWordDraft(dangling), /unknown statement id/);

  const forgedState = fixture();
  (forgedState.gaps.items[0] as { state: string }).state = 'APPROVED';
  await assert.rejects(() => renderPaidAssessmentWordDraft(forgedState), /state is invalid/);
});

test('does not mutate input and returns detached review reasons', async () => {
  const value = fixture();
  value.statements[0]!.relatedRefs = [{ kind: 'GAP', id: 'gap-needs' }];
  const before = structuredClone(value);
  const result = await renderPaidAssessmentWordDraft(value);
  assert.deepEqual(value, before);
  assert.notEqual(result.reviewReasons, value.statements[0]!.relatedRefs);
  const originalReason = result.reviewReasons[0];
  result.reviewReasons.push('caller mutation');
  const repeated = await renderPaidAssessmentWordDraft(value);
  assert.deepEqual(repeated.reviewReasons, [originalReason]);
});

test('does not fabricate dates, prices, actors, scenarios, recommendations or actual change', async () => {
  const xml = documentXml((await renderPaidAssessmentWordDraft(fixture())).bytes);
  for (const forbidden of [
    '作成日', '承認日', '円', 'ROI', '実行担当者', 'Scenario A', '推奨順位', 'Actual Change', 'NEW FACT',
  ]) assert.ok(!xml.includes(forbidden), `fabricated ${forbidden}`);
});

function futureFitWordFixture(): DeliverableProjectionInput {
  const value = fixture();

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

test('renders a real Word future-fit comparison table with reasons and recommendation', async () => {
  const value = futureFitWordFixture();
  const result = await renderPaidAssessmentWordDraft(value);
  const xml = documentXml(result.bytes);

  for (const text of [
    '目指す未来への適合度比較',
    '人員増加だけに頼らず、持続的に成長できる会社',
    '現状活用型',
    '段階的改善型',
    '積極的変革型',
    '業務効率化',
    '属人化の解消',
    '一部の業務で重複作業を減らす',
    '業務全体の負担軽減を目指す',
    'atLIBからのご提案（検討案）',
    '現在の事業運営を維持しながら成長基盤を整える',
    '段階的に改善効果を確認する',
    '◎', '○', '△', '×',
    '比較評価の根拠・社内確認用',
  ]) {
    assert.ok(xml.includes(text), `missing ${text}`);
  }

  assert.match(xml, /<w:tbl>/);
  assert.equal(result.readiness, 'REVIEWABLE_DRAFT');
  assert.equal(result.status, 'INTERNAL_REVIEW_DRAFT');

  assert.ok(!xml.includes(coreSource.hash));

  assert.ok(
    xml.indexOf('目指す未来への適合度比較') <
    xml.indexOf('atLIBからのご提案（検討案）'),
  );
});

test('preserves the old Word layout when no comparison is provided', async () => {
  const xml = documentXml(
    (await renderPaidAssessmentWordDraft(fixture())).bytes,
  );

  assert.ok(!xml.includes('目指す未来への適合度比較'));
  assert.ok(!xml.includes('atLIBからのご提案（検討案）'));
});

test('renders missing and unknown evaluations without fabricating ratings', async () => {
  const value = futureFitWordFixture();
  const comparison = value.futureComparison!;

  value.futureComparison = {
    ...comparison,
    evaluations: [{
      ...comparison.evaluations[0]!,
      rating: 'NEEDS_CONFIRMATION',
      rationale: '業務工数の追加調査が必要',
      sourceRefs: [],
    }],
  };

  const result = await renderPaidAssessmentWordDraft(value);
  const xml = documentXml(result.bytes);

  assert.equal(result.readiness, 'NEEDS_CONFIRMATION');
  assert.ok(xml.includes('未評価'));
  assert.ok(xml.includes('要確認'));
  assert.ok(xml.includes('業務工数の追加調査が必要'));
});

test('does not hide blocked scenario status or promote its recommendation', async () => {
  const value = futureFitWordFixture();
  value.scenarios.scenarios[1]!.state =
    'BLOCKED_BY_OPTION_EVIDENCE';

  const result = await renderPaidAssessmentWordDraft(value);
  const xml = documentXml(result.bytes);

  assert.equal(result.readiness, 'BLOCKED_BY_EVIDENCE');
  assert.ok(xml.includes('実現条件の確認が必要'));
  assert.ok(xml.includes('内部確認用・未承認'));
  assert.ok(xml.includes('atLIBからのご提案（検討案）'));
  assert.equal('deliveryApproved' in result, false);
});

test('splits four scenarios into two tables without dropping any scenario', async () => {
  const value = futureFitWordFixture();

  value.scenarios.scenarios.push({
    ...value.scenarios.scenarios[0]!,
    id: 'd',
    title: '既存ベンダー連携型',
  });

  const comparison = value.futureComparison!;

  value.futureComparison = {
    ...comparison,
    scenarioIds: [...comparison.scenarioIds, 'd'],
    evaluations: [
      ...comparison.evaluations,
      ...comparison.evaluations
        .filter(e => e.scenarioId === 'a')
        .map(e => ({ ...e, scenarioId: 'd' })),
    ],
  };

  const xml = documentXml(
    (await renderPaidAssessmentWordDraft(value)).bytes,
  );

  assert.equal((xml.match(/<w:tbl>/g) ?? []).length, 2);
  assert.ok(xml.includes('既存ベンダー連携型'));
  assert.ok(xml.includes('積極的変革型'));
});

test('rejects oversized comparison text instead of silently clipping and preserves input', async () => {
  const value = futureFitWordFixture();
  const before = structuredClone(value);

  await renderPaidAssessmentWordDraft(value);
  assert.deepEqual(value, before);

  const comparison = value.futureComparison!;

  value.futureComparison = {
    ...comparison,
    evaluations: [{
      ...comparison.evaluations[0]!,
      rationale: 'あ'.repeat(241),
    }],
  };

  await assert.rejects(
    () => renderPaidAssessmentWordDraft(value),
    /evaluation rationale must not exceed 240/,
  );
});
