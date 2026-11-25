import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import { contentHash } from '../src/domain/diagnosisReport';
import { requireStaffAuth } from '../src/middleware/staffAuth';
import { createAdminPaidAssessmentSourceHandoffRouter } from '../src/routes/adminPaidAssessmentSourceHandoff';
import {
  PaidAssessmentSourceHandoffError,
  PaidAssessmentSourceHandoffRepo,
} from '../src/services/paidAssessmentSourceHandoffRepo';
import { StaffAuthService } from '../src/services/staffAuthService';
import { createFreeDiagnosisRuleBasedV1Harness } from './support/freeDiagnosisRuleBasedV1Harness';

const actor = 'assessment-operator@atlib.jp';
const migrationPath = path.resolve(__dirname, '../migrations/037_design_v2_paid_assessment_source_handoff.sql');

async function setup() {
  const h = await createFreeDiagnosisRuleBasedV1Harness({ includeDesignV2: true });
  await h.db.exec(fs.readFileSync(migrationPath, 'utf8'));
  return h;
}

async function eligibleCase(h: Awaited<ReturnType<typeof setup>>, name = 'E1 synthetic') {
  const activity = await h.launcher.createSalesActivity(
    { name, contact: { name: 'Owner' }, selectedService: 'IT_KAIZEN' }, actor,
  );
  const kase = await h.cases.createCase(activity.companyId, activity.contactId, activity.salesActivityId, actor);
  const reportId = randomUUID();
  const decisionId = randomUUID();
  const content = { sections: [{ heading: 'verified current state' }], factCandidates: [{ status: 'CANDIDATE' }] };
  const approval = {
    context: { adoptedNarrative: { source: 'HUMAN_EDITED', id: randomUUID() } },
    content_hash: contentHash(content), approved_by: actor, approved_at: '2026-11-23T01:00:00.000Z',
  };
  await h.pool.query(
    `INSERT INTO diagnosis_reports
      (id,it_management_diagnosis_case_v2_id,version,status,content_json,snapshot_json,context_json,context_hash,
       prompt_version,policy_version,created_by,created_by_user_id,approved_by_user_id,approved_at,delivered_at)
     VALUES($1,$2,1,'DELIVERED',$3,$4,'{}'::jsonb,$5,'test','design-v2','HUMAN',$6,$6,$7,$7)`,
    [reportId, kase.id, JSON.stringify(content), JSON.stringify(approval), contentHash({}), actor, approval.approved_at],
  );
  const decisionInput = { route: 'DESIGN_ASSESSMENT', materialDecision: 'Proceed to assessment', nextAction: 'Prepare evidence' };
  const decisionSnapshot = {
    report: { id: reportId, version: 1, content_hash: contentHash(content), approval_snapshot_hash: contentHash(approval) },
    decision: decisionInput,
  };
  await h.pool.query(
    `INSERT INTO management_feedback_decisions
      (id,it_management_diagnosis_case_v2_id,version,route_code,material_decision,next_action,context_snapshot_json,context_hash,decided_by_user_id,decided_at)
     VALUES($1,$2,1,'DESIGN_ASSESSMENT',$3,$4,$5,$6,$7,$8)`,
    [decisionId, kase.id, decisionInput.materialDecision, decisionInput.nextAction,
      JSON.stringify(decisionSnapshot), contentHash(decisionSnapshot), actor, '2026-11-23T02:00:00.000Z'],
  );
  await h.pool.query(
    `UPDATE it_management_diagnosis_case_v2
        SET status='CLOSED',feedback_report_id=$2,feedback_completed_at=now()
      WHERE id=$1`,
    [kase.id, reportId],
  );
  return { caseId: kase.id, reportId, decisionId, content, approval };
}

test('creates a minimal immutable Design v2 source handoff and one audit', async () => {
  const h = await setup();
  try {
    const source = await eligibleCase(h);
    const result = await new PaidAssessmentSourceHandoffRepo(h.pool).create(source.caseId, actor);
    assert.equal(result.created, true);
    assert.equal(result.handoff.version, 1);
    assert.equal(result.handoff.sourceCaseId, source.caseId);
    assert.equal(result.handoff.feedbackDecisionId, source.decisionId);
    assert.equal(result.handoff.reportId, source.reportId);
    assert.equal(result.handoff.snapshotHash, contentHash(result.handoff.snapshot));
    assert.deepEqual(result.handoff.snapshot.eligibility.report, {
      id: source.reportId, version: 1, contentHash: contentHash(source.content), approvalSnapshotHash: contentHash(source.approval),
    });
    const serialized = JSON.stringify(result);
    for (const forbidden of ['verified current state', 'factCandidates', 'price', 'workId', 'assignedTo']) {
      assert.equal(serialized.includes(forbidden), false);
    }
    const audit = await h.pool.query<{ command: string; detail_json: Record<string, unknown> }>(
      `SELECT command,detail_json FROM it_management_diagnosis_case_v2_audit
        WHERE case_id=$1 AND command='CreatePaidAssessmentSourceHandoff'`, [source.caseId],
    );
    assert.equal(audit.rowCount, 1);
    assert.equal(audit.rows[0]?.detail_json.snapshotHash, result.handoff.snapshotHash);
  } finally { await h.close(); }
});

test('same source decision is idempotent across staff and serialized concurrent calls', async () => {
  const h = await setup();
  try {
    const source = await eligibleCase(h);
    const repo = new PaidAssessmentSourceHandoffRepo(h.pool);
    const first = await repo.create(source.caseId, actor);
    const second = await repo.create(source.caseId, 'other-staff@atlib.jp');
    assert.equal(second.created, false);
    assert.equal(second.handoff.id, first.handoff.id);
    const concurrentSource = await eligibleCase(h, 'concurrent');
    const results = await Promise.all([
      repo.create(concurrentSource.caseId, actor), repo.create(concurrentSource.caseId, 'other-staff@atlib.jp'),
    ]);
    assert.deepEqual(results.map(item => item.created).sort(), [false, true]);
    const counts = await h.pool.query<{ handoffs: number; audits: number }>(
      `SELECT
        (SELECT count(*)::int FROM paid_assessment_source_handoff_v2 WHERE source_case_id=$1) handoffs,
        (SELECT count(*)::int FROM it_management_diagnosis_case_v2_audit WHERE case_id=$1 AND command='CreatePaidAssessmentSourceHandoff') audits`,
      [concurrentSource.caseId],
    );
    assert.deepEqual(counts.rows[0], { handoffs: 1, audits: 1 });
  } finally { await h.close(); }
});

test('latest preserves history and rejects a changed record for the same decision', async () => {
  const h = await setup();
  try {
    const source = await eligibleCase(h);
    const repo = new PaidAssessmentSourceHandoffRepo(h.pool);
    const first = await repo.create(source.caseId, actor);
    const reportId = randomUUID();
    const content = { sections: [{ heading: 'new verified state' }] };
    const approval = { context: {}, content_hash: contentHash(content), approved_by: actor, approved_at: '2026-11-23T03:00:00.000Z' };
    await h.pool.query(
      `INSERT INTO diagnosis_reports
        (id,it_management_diagnosis_case_v2_id,version,status,content_json,snapshot_json,context_json,context_hash,prompt_version,policy_version,created_by,created_by_user_id,approved_by_user_id,approved_at,delivered_at)
       VALUES($1,$2,2,'DELIVERED',$3,$4,'{}'::jsonb,$5,'test','design-v2','HUMAN',$6,$6,$7,$7)`,
      [reportId, source.caseId, JSON.stringify(content), JSON.stringify(approval), contentHash({}), actor, approval.approved_at],
    );
    const decisionId = randomUUID();
    const decision = { route: 'DESIGN_ASSESSMENT', materialDecision: 'Continue', nextAction: 'Refresh source' };
    const snapshot = { report: { id: reportId, version: 2, content_hash: contentHash(content), approval_snapshot_hash: contentHash(approval) }, decision };
    await h.pool.query(
      `INSERT INTO management_feedback_decisions
       (id,it_management_diagnosis_case_v2_id,version,route_code,material_decision,next_action,context_snapshot_json,context_hash,decided_by_user_id)
       VALUES($1,$2,2,'DESIGN_ASSESSMENT',$3,$4,$5,$6,$7)`,
      [decisionId, source.caseId, decision.materialDecision, decision.nextAction, JSON.stringify(snapshot), contentHash(snapshot), actor],
    );
    await h.pool.query('UPDATE it_management_diagnosis_case_v2 SET feedback_report_id=$2 WHERE id=$1', [source.caseId, reportId]);
    const second = await repo.create(source.caseId, actor);
    assert.equal(second.handoff.version, 2);
    assert.equal((await repo.latest(source.caseId, actor))?.id, second.handoff.id);
    assert.equal((await h.pool.query('SELECT id FROM paid_assessment_source_handoff_v2 WHERE source_case_id=$1', [source.caseId])).rowCount, 2);
    assert.notEqual(first.handoff.id, second.handoff.id);
  } finally { await h.close(); }
});

test('rejects invalid, absent and ineligible sources without handoff or audit', async () => {
  const h = await setup();
  try {
    const repo = new PaidAssessmentSourceHandoffRepo(h.pool);
    await assert.rejects(repo.create('invalid', actor), error => code(error, 400, 'INVALID_CASE_ID'));
    await assert.rejects(repo.create(randomUUID(), actor), error => code(error, 404, 'CASE_NOT_FOUND'));
    const activity = await h.launcher.createSalesActivity({ name: 'open', contact: { name: 'Owner' }, selectedService: 'IT_KAIZEN' }, actor);
    const open = await h.cases.createCase(activity.companyId, activity.contactId, activity.salesActivityId, actor);
    await assert.rejects(repo.create(open.id, actor), error => code(error, 409, 'CASE_NOT_ELIGIBLE'));
    assert.equal((await h.pool.query('SELECT id FROM paid_assessment_source_handoff_v2')).rowCount, 0);
    assert.equal((await h.pool.query("SELECT id FROM it_management_diagnosis_case_v2_audit WHERE command='CreatePaidAssessmentSourceHandoff'")).rowCount, 0);
  } finally { await h.close(); }
});

test('detects stored handoff tampering and append-only SQL blocks update and delete', async () => {
  const h = await setup();
  try {
    const source = await eligibleCase(h);
    const repo = new PaidAssessmentSourceHandoffRepo(h.pool);
    const created = await repo.create(source.caseId, actor);
    await assert.rejects(h.pool.query('UPDATE paid_assessment_source_handoff_v2 SET version=2 WHERE id=$1', [created.handoff.id]));
    await assert.rejects(h.pool.query('DELETE FROM paid_assessment_source_handoff_v2 WHERE id=$1', [created.handoff.id]));
    await h.pool.query('DROP TRIGGER paid_assessment_source_handoff_v2_immutable ON paid_assessment_source_handoff_v2');
    await h.pool.query("UPDATE paid_assessment_source_handoff_v2 SET snapshot_hash=$2 WHERE id=$1", [created.handoff.id, 'a'.repeat(64)]);
    await assert.rejects(repo.latest(source.caseId, actor), error => code(error, 409, 'HANDOFF_INTEGRITY_MISMATCH'));
  } finally { await h.close(); }
});

test('audit failure rolls back the handoff and releases the client', async () => {
  const h = await setup();
  try {
    const source = await eligibleCase(h);
    await h.pool.query(`CREATE FUNCTION fail_e1_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit failed'; END $$`);
    await h.pool.query(`CREATE TRIGGER fail_e1_audit BEFORE INSERT ON it_management_diagnosis_case_v2_audit FOR EACH ROW
      WHEN (NEW.command='CreatePaidAssessmentSourceHandoff') EXECUTE FUNCTION fail_e1_audit()`);
    await assert.rejects(new PaidAssessmentSourceHandoffRepo(h.pool).create(source.caseId, actor), /audit failed/);
    assert.equal((await h.pool.query('SELECT id FROM paid_assessment_source_handoff_v2 WHERE source_case_id=$1', [source.caseId])).rowCount, 0);
    assert.equal((await h.pool.query('SELECT 1 ok')).rows[0]?.ok, 1);
  } finally { await h.close(); }
});

test('REST API enforces staff cookie, strict empty body, POST status and GET latest', async () => {
  const h = await setup();
  const staffAuth = new StaffAuthService('e1-test-secret');
  const app = express();
  app.use(express.json()); app.use(cookieParser());
  app.use('/api/admin/it-management-kaizen/assessment-source-handoffs', requireStaffAuth(staffAuth),
    createAdminPaidAssessmentSourceHandoffRouter(new PaidAssessmentSourceHandoffRepo(h.pool)));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/it-management-kaizen/assessment-source-handoffs`;
  try {
    const source = await eligibleCase(h);
    const cookie = `staff_session=${staffAuth.issueSessionToken({ email: actor })}`;
    assert.equal((await fetch(`${base}/${source.caseId}`, { method: 'POST' })).status, 401);
    assert.equal((await fetch(`${base}/${source.caseId}`, { method: 'POST', headers: { authorization: 'Bearer ignored' } })).status, 401);
    assert.equal((await fetch(`${base}/${source.caseId}`, {
      method: 'POST', headers: { cookie: 'staff_session=invalid-token' },
    })).status, 401);
    const invalid = await fetch(`${base}/${source.caseId}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{"extra":true}' });
    assert.equal(invalid.status, 400);
    const created = await fetch(`${base}/${source.caseId}`, { method: 'POST', headers: { cookie } });
    assert.equal(created.status, 201);
    const retry = await fetch(`${base}/${source.caseId}`, { method: 'POST', headers: { cookie } });
    assert.equal(retry.status, 200);
    const latest = await fetch(`${base}/${source.caseId}/latest`, { headers: { cookie } });
    assert.equal(latest.status, 200);
    assert.equal((await latest.json() as { handoff: { sourceCaseId: string } }).handoff.sourceCaseId, source.caseId);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await h.close();
  }
});

test('latest returns null without cross-case leakage and requires a staff actor', async () => {
  const h = await setup();
  try {
    const a = await eligibleCase(h, 'case A');
    const b = await eligibleCase(h, 'case B');
    const repo = new PaidAssessmentSourceHandoffRepo(h.pool);
    await repo.create(a.caseId, actor);
    assert.equal(await repo.latest(b.caseId, actor), null);
    await assert.rejects(repo.latest(a.caseId, ''), error => code(error, 403, 'STAFF_REQUIRED'));
  } finally { await h.close(); }
});

test('E1 rejects a changed latest feedback route without handoff or audit writes', async () => {
  const h = await setup();
  try {
    const source = await eligibleCase(h);
    const decision = { route: 'STOP_HOLD', materialDecision: '今回は見送る', nextAction: '現状維持' };
    const snapshot = {
      report: {
        id: source.reportId,
        version: 1,
        content_hash: contentHash(source.content),
        approval_snapshot_hash: contentHash(source.approval),
      },
      decision,
    };
    await h.pool.query(
      `INSERT INTO management_feedback_decisions
        (id,it_management_diagnosis_case_v2_id,version,route_code,
         material_decision,next_action,context_snapshot_json,context_hash,decided_by_user_id)
       VALUES($1,$2,2,'STOP_HOLD',$3,$4,$5,$6,$7)`,
      [randomUUID(), source.caseId, decision.materialDecision, decision.nextAction,
        JSON.stringify(snapshot), contentHash(snapshot), actor],
    );
    await assert.rejects(
      new PaidAssessmentSourceHandoffRepo(h.pool).create(source.caseId, actor),
      error => code(error, 409, 'ASSESSMENT_ROUTE_NOT_SELECTED'),
    );
    assert.equal((await h.pool.query(
      'SELECT id FROM paid_assessment_source_handoff_v2 WHERE source_case_id=$1',
      [source.caseId],
    )).rowCount, 0);
    assert.equal((await h.pool.query(
      `SELECT id FROM it_management_diagnosis_case_v2_audit
         WHERE case_id=$1 AND command='CreatePaidAssessmentSourceHandoff'`,
      [source.caseId],
    )).rowCount, 0);
  } finally { await h.close(); }
});

test('E1 rejects a divergent but internally consistent snapshot for the same decision', async () => {
  const h = await setup();
  try {
    const source = await eligibleCase(h);
    const repo = new PaidAssessmentSourceHandoffRepo(h.pool);
    const first = await repo.create(source.caseId, actor);
    const divergent = structuredClone(first.handoff.snapshot);
    divergent.eligibility.feedbackDecision.decidedAt = '2026-11-24T02:00:00.000Z';
    // Disposable PGlite fixture only: simulate corrupted historical state.
    await h.pool.query(
      'DROP TRIGGER paid_assessment_source_handoff_v2_immutable ON paid_assessment_source_handoff_v2',
    );
    await h.pool.query(
      `UPDATE paid_assessment_source_handoff_v2
          SET snapshot_json=$2::jsonb,snapshot_hash=$3
        WHERE id=$1`,
      [first.handoff.id, JSON.stringify(divergent), contentHash(divergent)],
    );
    await h.pool.query(
      `CREATE TRIGGER paid_assessment_source_handoff_v2_immutable BEFORE UPDATE OR DELETE
         ON paid_assessment_source_handoff_v2 FOR EACH ROW
         EXECUTE FUNCTION prevent_paid_assessment_source_handoff_v2_mutation()`,
    );
    await assert.rejects(
      repo.create(source.caseId, actor),
      error => code(error, 409, 'HANDOFF_SOURCE_CONFLICT'),
    );
    assert.equal((await h.pool.query(
      'SELECT id FROM paid_assessment_source_handoff_v2 WHERE source_case_id=$1',
      [source.caseId],
    )).rowCount, 1);
    assert.equal((await h.pool.query(
      `SELECT id FROM it_management_diagnosis_case_v2_audit
         WHERE case_id=$1 AND command='CreatePaidAssessmentSourceHandoff'`,
      [source.caseId],
    )).rowCount, 1);
  } finally { await h.close(); }
});

test('migration is runner-safe and explicitly defines immutability and least privilege', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.doesNotMatch(sql, /\bBEGIN\s*;/i);
  assert.doesNotMatch(sql, /\bCOMMIT\s*;/i);
  assert.match(sql, /BEFORE UPDATE OR DELETE/i);
  assert.match(sql, /GRANT SELECT, INSERT[\s\S]*sales_tools_runtime/i);
  assert.match(sql, /REVOKE UPDATE, DELETE[\s\S]*sales_tools_runtime/i);
  assert.match(sql, /GRANT SELECT, INSERT[\s\S]*sales_tools_app/i);
  assert.match(sql, /REVOKE UPDATE, DELETE[\s\S]*sales_tools_app/i);
});

function code(error: unknown, status: number, expected: string): boolean {
  return error instanceof PaidAssessmentSourceHandoffError && error.status === status && error.code === expected;
}
