import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool, QueryResult } from 'pg';
import { contentHash } from '../src/domain/diagnosisReport';
import {
  DesignV2AssessmentEligibilityError,
  readDesignV2AssessmentEligibility,
} from '../src/services/designV2AssessmentEligibility';

const caseId = '10000000-0000-4000-8000-000000000001';
const reportId = '20000000-0000-4000-8000-000000000002';
const decisionId = '30000000-0000-4000-8000-000000000003';

function fixture() {
  const content = { sections: [{ title: '承認済みレポート' }], factCandidates: [{ status: 'CANDIDATE' }] };
  const approval = {
    context: { adoptedNarrative: { source: 'HUMAN_EDITED', id: 'edit-1' } },
    content_hash: contentHash(content),
    approved_by: 'reviewer-1',
    approved_at: '2026-11-17T01:00:00.000Z',
  };
  const snapshot = {
    report: {
      id: reportId,
      version: 4,
      content_hash: contentHash(content),
      approval_snapshot_hash: contentHash(approval),
    },
    decision: {
      route: 'DESIGN_ASSESSMENT',
      materialDecision: '設計Assessmentへ進む',
      nextAction: '適格性を確認する',
    },
  };
  return {
    kase: { id: caseId, status: 'CLOSED', feedback_report_id: reportId },
    decision: {
      id: decisionId,
      version: 2,
      route_code: 'DESIGN_ASSESSMENT',
      context_snapshot_json: snapshot,
      context_hash: contentHash(snapshot),
      decided_by_user_id: 'decision-maker-1',
      decided_at: new Date('2026-11-17T02:00:00.000Z'),
    },
    report: {
      id: reportId,
      version: 4,
      status: 'DELIVERED',
      content_json: content,
      snapshot_json: approval,
      policy_version: 'design-v2',
      approved_by_user_id: 'reviewer-1',
      approved_at: new Date('2026-11-17T01:00:00.000Z'),
    },
  };
}

function poolFor(rows: unknown[][], observedSql: string[] = []) {
  let index = 0;
  return {
    async query(sql: string) {
      observedSql.push(sql);
      const resultRows = rows[index++] ?? [];
      return { rows: resultRows, rowCount: resultRows.length } as QueryResult;
    },
  } as unknown as Pick<Pool, 'query'>;
}

async function expectCode(rows: unknown[][], code: string) {
  await assert.rejects(
    readDesignV2AssessmentEligibility(poolFor(rows), caseId),
    (error: unknown) => error instanceof DesignV2AssessmentEligibilityError && error.code === code,
  );
}

test('returns only immutable eligibility references for a valid Design v2 case', async () => {
  const f = fixture();
  const sql: string[] = [];
  const result = await readDesignV2AssessmentEligibility(poolFor([[f.kase], [f.decision], [f.report]], sql), caseId);
  assert.deepEqual(result, {
    caseId,
    feedbackDecision: {
      id: decisionId,
      version: 2,
      contextHash: f.decision.context_hash,
      decidedByUserId: 'decision-maker-1',
      decidedAt: '2026-11-17T02:00:00.000Z',
    },
    report: {
      id: reportId,
      version: 4,
      contentHash: f.decision.context_snapshot_json.report.content_hash,
      approvalSnapshotHash: f.decision.context_snapshot_json.report.approval_snapshot_hash,
    },
  });
  assert.equal(JSON.stringify(result).includes('承認済みレポート'), false);
  assert.equal(sql.length, 3);
  assert.ok(sql.every(statement => /^\s*SELECT\b/i.test(statement)));
  assert.ok(sql.every(statement => !/\bdiagnosis_cases\b|\bassessment_handoffs\b/i.test(statement)));
});

test('rejects an invalid or absent case without translating legacy identity', async () => {
  let queried = false;
  const noQueryPool = {
    async query() { queried = true; throw new Error('unexpected'); },
  } as unknown as Pick<Pool, 'query'>;
  await assert.rejects(
    readDesignV2AssessmentEligibility(noQueryPool, 'not-a-uuid'),
    (error: unknown) => error instanceof DesignV2AssessmentEligibilityError && error.code === 'CASE_NOT_FOUND',
  );
  assert.equal(queried, false);
  await expectCode([[]], 'CASE_NOT_FOUND');
});

test('rejects an open case or missing feedback report', async () => {
  const f = fixture();
  await expectCode([[{ ...f.kase, status: 'FEEDBACK_PENDING' }]], 'CASE_NOT_ELIGIBLE');
  await expectCode([[{ ...f.kase, feedback_report_id: null }]], 'CASE_NOT_ELIGIBLE');
});

test('checks the latest overall decision before applying the route gate', async () => {
  const f = fixture();
  await expectCode([[f.kase], [{ ...f.decision, route_code: 'FOCUSED_CONFIRMATION' }]], 'ASSESSMENT_ROUTE_NOT_SELECTED');
  await expectCode([[f.kase], [{ ...f.decision, route_code: 'STOP_HOLD' }]], 'ASSESSMENT_ROUTE_NOT_SELECTED');
});

test('rejects Decision snapshot tampering, hash mismatch and route disagreement', async () => {
  const f = fixture();
  await expectCode([[f.kase], [{ ...f.decision, context_snapshot_json: { ...f.decision.context_snapshot_json, changed: true } }]], 'DECISION_INTEGRITY_MISMATCH');
  await expectCode([[f.kase], [{ ...f.decision, context_hash: 'a'.repeat(64) }]], 'DECISION_INTEGRITY_MISMATCH');
  const wrongRoute = { ...f.decision.context_snapshot_json, decision: { ...f.decision.context_snapshot_json.decision, route: 'DIRECT_ACT' } };
  await expectCode([[f.kase], [{ ...f.decision, context_snapshot_json: wrongRoute, context_hash: contentHash(wrongRoute) }]], 'DECISION_INTEGRITY_MISMATCH');
});

test('rejects a report from another case or one not referenced by the case', async () => {
  const f = fixture();
  await expectCode([[f.kase], [f.decision], []], 'REPORT_INTEGRITY_MISMATCH');
  await expectCode([[{ ...f.kase, feedback_report_id: '40000000-0000-4000-8000-000000000004' }], [f.decision], [f.report]], 'REPORT_INTEGRITY_MISMATCH');
});

test('rejects report version, status or policy mismatch', async () => {
  const f = fixture();
  await expectCode([[f.kase], [f.decision], [{ ...f.report, version: 5 }]], 'REPORT_INTEGRITY_MISMATCH');
  await expectCode([[f.kase], [f.decision], [{ ...f.report, status: 'APPROVED' }]], 'REPORT_INTEGRITY_MISMATCH');
  await expectCode([[f.kase], [f.decision], [{ ...f.report, policy_version: 'vs1' }]], 'REPORT_INTEGRITY_MISMATCH');
});

test('rejects content, approval snapshot and embedded content hash mismatch', async () => {
  const f = fixture();
  await expectCode([[f.kase], [f.decision], [{ ...f.report, content_json: { changed: true } }]], 'REPORT_INTEGRITY_MISMATCH');
  await expectCode([[f.kase], [f.decision], [{ ...f.report, snapshot_json: { ...f.report.snapshot_json, context: { changed: true } } }]], 'REPORT_INTEGRITY_MISMATCH');
  const approval = { ...f.report.snapshot_json, content_hash: 'b'.repeat(64) };
  const snapshot = {
    ...f.decision.context_snapshot_json,
    report: { ...f.decision.context_snapshot_json.report, approval_snapshot_hash: contentHash(approval) },
  };
  const decision = { ...f.decision, context_snapshot_json: snapshot, context_hash: contentHash(snapshot) };
  await expectCode([[f.kase], [decision], [{ ...f.report, snapshot_json: approval }]], 'REPORT_INTEGRITY_MISMATCH');
});

test('rejects missing approval provenance', async () => {
  const f = fixture();
  await expectCode([[f.kase], [f.decision], [{ ...f.report, approved_by_user_id: null }]], 'REPORT_INTEGRITY_MISMATCH');
  await expectCode([[f.kase], [f.decision], [{ ...f.report, approved_at: null }]], 'REPORT_INTEGRITY_MISMATCH');
  const approval = { ...f.report.snapshot_json, approved_by: '' };
  const snapshot = {
    ...f.decision.context_snapshot_json,
    report: { ...f.decision.context_snapshot_json.report, approval_snapshot_hash: contentHash(approval) },
  };
  const decision = { ...f.decision, context_snapshot_json: snapshot, context_hash: contentHash(snapshot) };
  await expectCode([[f.kase], [decision], [{ ...f.report, snapshot_json: approval }]], 'REPORT_INTEGRITY_MISMATCH');
});

test('propagates database errors', async () => {
  const dbError = new Error('database unavailable');
  const failingPool = {
    async query() { throw dbError; },
  } as unknown as Pick<Pool, 'query'>;
  await assert.rejects(
    readDesignV2AssessmentEligibility(failingPool, caseId),
    error => error === dbError,
  );
});
