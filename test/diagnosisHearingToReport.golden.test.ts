import assert from 'node:assert/strict';
import {after, before, test} from 'node:test';
import {createDiagnosisHarness} from './support/diagnosisHarness';
import {DiagnosisHearingRepo} from '../src/services/diagnosisHearingRepo';
import {SURVEY_QUESTIONS, type Actor} from '../src/domain/itManagementDiagnosis';
import {startedCase} from './support/workspaceFixtures';
import {operator} from './support/preparationFixtures';
import {contentHash} from '../src/domain/diagnosisReport';

let h: Awaited<ReturnType<typeof createDiagnosisHarness>>;
let hearing: DiagnosisHearingRepo;

const staff: Actor = {kind: 'STAFF', userId: 'phase5@test'};
const question = SURVEY_QUESTIONS.find(
  q => q.answer_type === 'SINGLE_SELECT' && q.options_json?.length
)!;

before(async () => {
  h = await createDiagnosisHarness();
  hearing = new DiagnosisHearingRepo(h.pool);
});

after(async () => {
  await h?.close();
});

test('hearing revision -> Human Review -> approved report snapshot -> reissue', async () => {
  const c = await startedCase(h);
  const answer = question.options_json![0]!;

  const first = await hearing.save(c.id, staff, {
    questionCode: question.question_code,
    questionVersion: question.version,
    expectedVersion: null,
    answer,
    statement: '初回ヒアリングの発言',
    unknownNote: ''
  });
  const revision1 = (await hearing.revisions(c.id, question.question_code, staff))[0]!;

  await hearing.save(c.id, staff, {
    questionCode: question.question_code,
    questionVersion: question.version,
    expectedVersion: 1,
    answer,
    statement: '訂正後のヒアリング発言',
    unknownNote: '',
    reason: '顧客確認による訂正'
  });
  const revisions = await hearing.revisions(c.id, question.question_code, staff);
  const revision2 = revisions[1]!;

  assert.notEqual(revision1.id, revision2.id);

  const original = await h.pool.query(
    "SELECT current_json->>'statement' AS statement FROM diagnosis_hearing_record_revisions WHERE id=$1",
    [revision1.id]
  );
  assert.equal(original.rows[0].statement, '初回ヒアリングの発言');

  await h.workspace.transition(
    c.id,
    operator,
    'FINISH',
    (await h.workspace.read(c.id, operator)).version
  );

  const insight = await h.review.createInsight(c.id, operator, {
    semantic_type: 'OBSERVATION',
    title: '訂正後のヒアリングで確認した事項',
    content: '訂正後のヒアリング発言を担当者が確認した',
    unknown_type: null,
    diagnosis_theme_id: null,
    area_tag: null,
    improvement_lens: null,
    source_refs: [{
      source_ref_type: 'HEARING_RECORD',
      source_ref_id: first.id,
      source_revision_id: revision2.id,
      relation: 'RELATED'
    }]
  });

  const review = await h.review.read(c.id, operator);
  assert.equal(
    review.approved_insights.find(i => i.id === insight.id)?.source_refs[0]?.source_revision_id,
    revision2.id
  );

  await h.review.complete(c.id, operator, review.version, false);

  const draftState = await h.report.read(c.id, operator);
  const draft = await h.report.manual(c.id, operator, draftState.version);
  const beforeApproval = await h.report.read(c.id, operator);

  await h.report.approve(c.id, operator, draft.id, beforeApproval.version);

  const approvedState = await h.report.read(c.id, operator);
  const approved = approvedState.reports.find(r => r.id === draft.id)!;

  assert.equal(approved.status, 'APPROVED');
  assert.equal(approved.snapshot_json.content_hash, contentHash(approved.content_json));
  assert.ok(approved.snapshot_json.insights.some((i: {id: string}) => i.id === insight.id));

  const source = await h.pool.query(
    'SELECT source_revision_id FROM insight_sources WHERE diagnosis_insight_id=$1',
    [insight.id]
  );
  assert.equal(source.rows[0].source_revision_id, revision2.id);

  const frozen = structuredClone(approved);

  const reissued = await h.report.reissue(
    c.id,
    operator,
    approvedState.version,
    'ヒアリング根拠の再確認'
  );
  assert.notEqual(reissued.id, approved.id);

  const afterReissue = await h.report.read(c.id, operator);
  assert.deepEqual(
    afterReissue.reports.find(r => r.id === approved.id),
    frozen
  );
});