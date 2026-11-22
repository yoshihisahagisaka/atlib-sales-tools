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
