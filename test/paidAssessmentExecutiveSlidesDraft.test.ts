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

test('returns a real four-slide internal-review PPTX with cover, status and selected content', async () => {
  const result = await renderPaidAssessmentExecutiveSlidesDraft(fixture());
  assert.equal(result.bytes.subarray(0, 2).toString(), 'PK');
  assert.ok(entries(result.bytes)['[Content_Types].xml']);
  assert.equal(result.mimeType, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  assert.equal(result.filename, 'assessment-report_2026-11.draft.pptx');
  assert.equal(result.slideCount, 4);
  assert.equal(result.status, 'INTERNAL_REVIEW_DRAFT');
  assert.ok(slideXml(result.bytes, 1).includes('IT経営KAIZEN 改善計画書 — 経営判断用要約'));
  assert.ok(slideXml(result.bytes, 2).includes('内部確認状況'));
  for (let number = 1; number <= 4; number += 1) {
    assert.ok(slideXml(result.bytes, number).includes('内部確認用・未承認'));
  }
});

test('renders only human-selected statements verbatim in supplied slide and statement order', async () => {
  const value = fixture();
  value.slides = [
    { sectionId: 'section-b', statementIds: ['statement-8', 'statement-6'] },
    { sectionId: 'section-a', statementIds: ['statement-3'] },
  ];
  const result = await renderPaidAssessmentExecutiveSlidesDraft(value);
  const first = slideXml(result.bytes, 3);
  const second = slideXml(result.bytes, 4);
  assert.ok(first.includes('改善選択肢'));
  assert.ok(first.indexOf('PROPOSAL の説明') < first.indexOf('RISK_IMPACT の説明'));
  assert.ok(second.includes('現状と目標'));
  assert.ok(second.includes('CUSTOMER_STATEMENT の説明'));
  assert.ok(!allXml(result.bytes).includes('独自の結論'));
  assert.equal(result.slideCount, 4);
});

test('preserves all ten epistemic labels without promotion or authentication', async () => {
  const value = fixture();
  value.slides = [
    { sectionId: 'section-a', statementIds: ['statement-1', 'statement-2', 'statement-3', 'statement-4'] },
    { sectionId: 'section-a', statementIds: ['statement-5'] },
    { sectionId: 'section-b', statementIds: ['statement-6', 'statement-7', 'statement-8', 'statement-9'] },
    { sectionId: 'section-b', statementIds: ['statement-10'] },
  ];
  const result = await renderPaidAssessmentExecutiveSlidesDraft(value);
  const content = allXml(result.bytes);
  for (const kind of kinds) assert.ok(content.includes(labels[kind]), `missing ${kind}`);
  assert.ok(content.includes('経営判断の候補（未承認）'));
  assert.ok(content.includes('期待する変化（未検証）'));
  assert.ok(!content.includes('認証済みFACT'));
  assert.ok(!content.includes('Actual Change'));
});

test('keeps source and typed related references in notes while excluding hashes', async () => {
  const result = await renderPaidAssessmentExecutiveSlidesDraft(fixture());
  const notes = notesXml(result.bytes, 3);
  assert.ok(notes.includes('sectionId:section-a'));
  assert.ok(notes.includes('statementId:statement-1'));
  assert.ok(notes.includes('kind:FUTURE'));
  assert.ok(notes.includes('source:MANAGEMENT_FEEDBACK / management-source / version 2'));
  assert.ok(notes.includes('relatedRef:GAP:gap-ok'));
  const content = allXml(result.bytes);
  assert.ok(!content.includes(managementSource.hash));
  assert.ok(!content.includes(coreSource.hash));
});

test('passes through every readiness state and exact reasons without approval', async () => {
  const reviewable = await renderPaidAssessmentExecutiveSlidesDraft(fixture());
  assert.equal(reviewable.readiness, 'REVIEWABLE_DRAFT');
  assert.deepEqual(reviewable.reviewReasons, []);
  assert.ok(slideXml(reviewable.bytes, 2).includes('下書き確認可能'));
  assert.ok(slideXml(reviewable.bytes, 2).includes('正式承認・顧客納品前'));

  const needs = fixture();
  needs.assessment.statements[0]!.relatedRefs = [{ kind: 'GAP', id: 'gap-needs' }];
  const needsResult = await renderPaidAssessmentExecutiveSlidesDraft(needs);
  assert.equal(needsResult.readiness, 'NEEDS_CONFIRMATION');
  assert.ok(slideXml(needsResult.bytes, 2).includes('追加確認が必要'));
  assert.ok(notesXml(needsResult.bytes, 2).includes('UPSTREAM_REVIEW_NEEDED:GAP:gap-needs'));

  const blocked = fixture();
  blocked.assessment.causes = {
    hypotheses: [{ id: 'cause-blocked', state: 'BLOCKED_BY_GAP_EVIDENCE' }],
    counts: {
      HYPOTHESIS_WITH_VERIFIED_SUPPORT: 0, HYPOTHESIS_CONTESTED: 0,
      HYPOTHESIS_UNSUBSTANTIATED: 0, BLOCKED_BY_GAP_EVIDENCE: 1,
    },
  } as unknown as RootCauseReviewResult;
  blocked.assessment.statements[0]!.relatedRefs = [{ kind: 'ROOT_CAUSE', id: 'cause-blocked' }];
  const blockedResult = await renderPaidAssessmentExecutiveSlidesDraft(blocked);
  assert.equal(blockedResult.readiness, 'BLOCKED_BY_EVIDENCE');
  assert.ok(slideXml(blockedResult.bytes, 2).includes('根拠の確認が必要'));
  assert.ok(notesXml(blockedResult.bytes, 2).includes('UPSTREAM_BLOCKED:ROOT_CAUSE:cause-blocked'));
  assert.ok(!allXml(blockedResult.bytes).includes('顧客納品許可'));
});

test('rejects malformed selections and D1 inputs while allowing repeated valid selections', async () => {
  const cases: Array<[PaidAssessmentExecutiveSlidesInput, RegExp]> = [];
  const unknownSection = fixture();
  unknownSection.slides = [{ sectionId: 'missing', statementIds: ['statement-1'] }];
  cases.push([unknownSection, /unknown sectionId/]);
  const duplicate = fixture();
  duplicate.slides = [{ sectionId: 'section-a', statementIds: ['statement-1', 'statement-1'] }];
  cases.push([duplicate, /duplicate statement id/]);
  const crossSection = fixture();
  crossSection.slides = [{ sectionId: 'section-a', statementIds: ['statement-6'] }];
  cases.push([crossSection, /does not belong/]);
  const invalidSource = fixture();
  invalidSource.assessment.statements[1]!.sourceRefs = [managementSource];
  cases.push([invalidSource, /requires CORE_VERIFIED_REFERENCE/]);
  for (const [value, pattern] of cases) {
    await assert.rejects(() => renderPaidAssessmentExecutiveSlidesDraft(value), pattern);
  }
  await assert.rejects(
    () => renderPaidAssessmentExecutiveSlidesDraft({ assessment: assessment(), slides: [] }),
    /1\.\.40/,
  );
  const repeated = fixture();
  repeated.slides = [
    { sectionId: 'section-a', statementIds: ['statement-1'] },
    { sectionId: 'section-a', statementIds: ['statement-1'] },
  ];
  assert.equal((await renderPaidAssessmentExecutiveSlidesDraft(repeated)).slideCount, 4);
});

test('preserves Unicode, XML special text, line breaks and safe deterministic filenames', async () => {
  const cases: Array<[string, string]> = [
    ['../../report\\name\r\n.pptx', 'assessment-reportnamepptx.draft.pptx'],
    ['日本語のみ', 'assessment-report.draft.pptx'],
    ['safe_ID-123', 'assessment-safe_ID-123.draft.pptx'],
    ['a'.repeat(60), `assessment-${'a'.repeat(48)}.draft.pptx`],
  ];
  for (const [reportId, expected] of cases) {
    const value = fixture();
    value.assessment.reportId = reportId;
    const result = await renderPaidAssessmentExecutiveSlidesDraft(value);
    assert.equal(result.filename, expected);
    assert.ok(!/[\\/\r\n]/.test(result.filename));
    assert.ok(!result.filename.includes('..'));
  }
  const special = fixture();
  special.assessment.sections[0]!.title = '現状 <確認> & 判断';
  special.assessment.statements[0]!.text = '第一行 <確認> & 判断\n第二行 “引用”';
  special.assessment.statements[0]!.sourceRefs = [{ ...managementSource, id: '資料・参照' }];
  const content = allXml((await renderPaidAssessmentExecutiveSlidesDraft(special)).bytes);
  assert.ok(content.includes('現状 &lt;確認&gt; &amp; 判断'));
  assert.ok(content.includes('第一行 &lt;確認&gt; &amp; 判断'));
  assert.ok(content.includes('第二行 “引用”'));
  assert.ok(content.includes('資料・参照'));
});

test('rejects every explicit display and reviewer-note size guard without clipping', async () => {
  const tooManySlides = fixture();
  tooManySlides.slides = Array.from({ length: 41 }, () => ({
    sectionId: 'section-a', statementIds: ['statement-1'],
  }));
  await assert.rejects(() => renderPaidAssessmentExecutiveSlidesDraft(tooManySlides), /1\.\.40/);

  const tooManyStatements = fixture();
  tooManyStatements.slides = [{
    sectionId: 'section-a',
    statementIds: ['statement-1', 'statement-2', 'statement-3', 'statement-4', 'statement-5'],
  }];
  await assert.rejects(() => renderPaidAssessmentExecutiveSlidesDraft(tooManyStatements), /1\.\.4/);

  const statementTooLong = fixture();
  statementTooLong.assessment.statements[0]!.text = 'あ'.repeat(91);
  await assert.rejects(() => renderPaidAssessmentExecutiveSlidesDraft(statementTooLong), /statement-1\.text.*90/);

  const totalTooLong = fixture();
  for (let index = 0; index < 3; index += 1) totalTooLong.assessment.statements[index]!.text = 'あ'.repeat(81);
  totalTooLong.slides = [{ sectionId: 'section-a', statementIds: ['statement-1', 'statement-2', 'statement-3'] }];
  await assert.rejects(() => renderPaidAssessmentExecutiveSlidesDraft(totalTooLong), /240 code points/);

  const titleTooLong = fixture();
  titleTooLong.assessment.sections[0]!.title = 'あ'.repeat(61);
  await assert.rejects(() => renderPaidAssessmentExecutiveSlidesDraft(titleTooLong), /title.*60/);

  const customerTooLong = fixture();
  customerTooLong.assessment.customerLabel = 'あ'.repeat(81);
  await assert.rejects(() => renderPaidAssessmentExecutiveSlidesDraft(customerTooLong), /customerLabel.*80/);

  const purposeTooLong = fixture();
  purposeTooLong.assessment.purpose = 'あ'.repeat(161);
  await assert.rejects(() => renderPaidAssessmentExecutiveSlidesDraft(purposeTooLong), /purpose.*160/);

  const notesTooLong = fixture();
  notesTooLong.assessment.statements[0]!.sourceRefs = [{ ...managementSource, id: 'a'.repeat(20_001) }];
  await assert.rejects(() => renderPaidAssessmentExecutiveSlidesDraft(notesTooLong), /reviewer notes.*20000/);
});

test('does not mutate D1 input and returns detached reasons with stable semantic output', async () => {
  const value = fixture();
  value.assessment.statements[0]!.relatedRefs = [{ kind: 'GAP', id: 'gap-needs' }];
  const before = structuredClone(value);
  const first = await renderPaidAssessmentExecutiveSlidesDraft(value);
  assert.deepEqual(value, before);
  const expectedReasons = [...first.reviewReasons];
  first.reviewReasons.push('caller mutation');
  const second = await renderPaidAssessmentExecutiveSlidesDraft(value);
  assert.deepEqual(second.reviewReasons, expectedReasons);
  assert.equal(second.readiness, first.readiness);
  for (let number = 1; number <= second.slideCount; number += 1) {
    assert.equal(slideXml(second.bytes, number), slideXml((await renderPaidAssessmentExecutiveSlidesDraft(value)).bytes, number));
  }
});

test('does not invent timestamp, actor, approval, ranking, ROI or a customer release', async () => {
  const content = allXml((await renderPaidAssessmentExecutiveSlidesDraft(fixture())).bytes);
  for (const forbidden of [
    '作成日', '承認日', '実行担当者', 'Scenario A', '最優先', 'ROI', '認証済み', '顧客納品許可',
  ]) assert.ok(!content.includes(forbidden), `fabricated ${forbidden}`);
});
