import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import { contentHash } from '../src/domain/diagnosisReport';
import { DESIGN_V2_REPORT_FORMAT_VERSION, type DesignV2ReportContent } from '../src/domain/freeDiagnosisDesignV2Report';
import { requireStaffAuth } from '../src/middleware/staffAuth';
import { createAdminPaidAssessmentSourceHandoffRouter } from '../src/routes/adminPaidAssessmentSourceHandoff';
import { PaidAssessmentSourceHandoffRepo } from '../src/services/paidAssessmentSourceHandoffRepo';
import {
  PaidAssessmentPreparationSelectionRepo,
  PaidAssessmentPreparationSelectionError,
} from '../src/services/paidAssessmentPreparationSelectionRepo';
import { StaffAuthService } from '../src/services/staffAuthService';
import { createFreeDiagnosisRuleBasedV1Harness } from './support/freeDiagnosisRuleBasedV1Harness';

const actor = 'e4-test@atlib.jp';
const root = path.resolve(__dirname, '..');
const sourceId = () => randomUUID();

async function setup() {
  const h = await createFreeDiagnosisRuleBasedV1Harness({ includeDesignV2: true });
  await h.db.exec(fs.readFileSync(path.join(root, 'migrations/037_design_v2_paid_assessment_source_handoff.sql'), 'utf8'));
  await h.db.exec(fs.readFileSync(path.join(root, 'migrations/038_paid_assessment_preparation_selection.sql'), 'utf8'));
  return h;
}

function reportContent(): DesignV2ReportContent {
  const keys = ['FUTURE', 'CURRENT_UNDERSTANDING', 'LENSES', 'UNKNOWNS', 'NEXT_FACTS'] as const;
  const sections = keys.map(key => ({
    key, title: key, entries: key === 'FUTURE' ? ['少人数で成長する', '判断を早くする'] : ['状況を確認する'],
  }));
  const candidate = {
    id: 'candidate-a', whatToVerify: '端末の管理方法', whyItMattersToFuture: '継続運用のため',
    whatMayBecomeKnowable: '管理範囲', lenses: ['TECHNOLOGY' as const], sourceRuleIds: ['rule-a'],
  };
  return {
    formatVersion: DESIGN_V2_REPORT_FORMAT_VERSION,
    recipient: { organizationDisplayName: 'Synthetic E4 Company' },
    diagnosisDate: '2026-11-25', issuer: { displayName: 'atLIB株式会社' },
    sections, diagnosisMap: sections.map(section => ({ ...section, overflowCount: 0 })),
    factCandidates: [candidate],
    assessmentProposal: { status: 'NOT_SELECTED', source: 'ANALYSIS_FACT_CANDIDATES', candidates: [candidate],
      selectedCandidateIds: ['candidate-a'], priceExcludingTaxText: '選択禁止' },
  };
}

async function eligible(h: Awaited<ReturnType<typeof setup>>, name = 'Synthetic E4') {
  const activity = await h.launcher.createSalesActivity(
    { name, contact: { name: 'Owner' }, selectedService: 'IT_KAIZEN' }, actor,
  );
  const kase = await h.cases.createCase(activity.companyId, activity.contactId, activity.salesActivityId, actor);
  const reportId = sourceId(); const decisionId = sourceId();
  const content = reportContent();
  const approval = {
    context: { adoptedNarrative: { source: 'HUMAN_EDITED', id: sourceId() } },
    content_hash: contentHash(content), approved_by: actor, approved_at: '2026-11-25T01:00:00.000Z',
  };
  await h.pool.query(
    `INSERT INTO diagnosis_reports
      (id,it_management_diagnosis_case_v2_id,version,status,content_json,snapshot_json,context_json,context_hash,
       prompt_version,policy_version,created_by,created_by_user_id,approved_by_user_id,approved_at,delivered_at)
     VALUES($1,$2,1,'DELIVERED',$3,$4,'{}'::jsonb,$5,'test','design-v2','HUMAN',$6,$6,$7,$7)`,
    [reportId, kase.id, JSON.stringify(content), JSON.stringify(approval), contentHash({}), actor, approval.approved_at],
  );
  const decision = { route: 'DESIGN_ASSESSMENT', materialDecision: 'Proceed', nextAction: 'Prepare' };
  const context = {
    report: { id: reportId, version: 1, content_hash: contentHash(content), approval_snapshot_hash: contentHash(approval) },
    decision,
  };
  await h.pool.query(
    `INSERT INTO management_feedback_decisions
      (id,it_management_diagnosis_case_v2_id,version,route_code,material_decision,next_action,context_snapshot_json,context_hash,decided_by_user_id)
     VALUES($1,$2,1,'DESIGN_ASSESSMENT',$3,$4,$5,$6,$7)`,
    [decisionId, kase.id, decision.materialDecision, decision.nextAction, JSON.stringify(context), contentHash(context), actor],
  );
  await h.pool.query('UPDATE it_management_diagnosis_case_v2 SET status=$2,feedback_report_id=$3,feedback_completed_at=now() WHERE id=$1',
    [kase.id, 'CLOSED', reportId]);
  const handoff = await new PaidAssessmentSourceHandoffRepo(h.pool).create(kase.id, actor);
  return { caseId: kase.id, reportId, decisionId, handoff: handoff.handoff };
}

const selected = () => ({ futureEntryIndex: 1, candidates: [{
  candidateId: 'candidate-a', area: 'MANAGEMENT' as const,
  confirmationQuestion: '端末の台帳を確認できますか', requestedFrom: '管理担当',
}] });

function hasCode(error: unknown, status: number, code: string): boolean {
  return error instanceof PaidAssessmentPreparationSelectionError && error.status === status && error.code === code;
}

test('E4 saves a staff-selected draft and projects E3/A/B without verified FACT', async () => {
  const h = await setup();
  try {
    const source = await eligible(h); const repo = new PaidAssessmentPreparationSelectionRepo(h.pool);
    const saved = await repo.save(source.caseId, actor, selected());
    assert.equal(saved.created, true);
    assert.equal(saved.view.saved?.version, 1);
    assert.equal(saved.view.saved?.handoffId, source.handoff.id);
    assert.equal(saved.view.preparation?.future.statement, '判断を早くする');
    assert.equal(saved.view.preparation?.sourceRefs.report.id, source.reportId);
    assert.deepEqual(saved.view.agenda?.counts, { verified: 0, toConfirm: 1, pendingWithoutQuestion: 0 });
    assert.equal(saved.view.agenda?.nextActions[0]?.verificationState, 'UNKNOWN');
    assert.equal(saved.view.agenda?.nextActions[0]?.area, 'MANAGEMENT');
    assert.equal(JSON.stringify(saved.view).includes('選択禁止'), false);
    assert.deepEqual(await repo.latest(source.caseId, actor), saved.view);
  } finally { await h.close(); }
});

test('E4 duplicate retries are idempotent across staff and a changed draft appends history', async () => {
  const h = await setup();
  try {
    const source = await eligible(h); const repo = new PaidAssessmentPreparationSelectionRepo(h.pool);
    const first = await repo.save(source.caseId, actor, selected());
    const repeat = await repo.save(source.caseId, 'second@atlib.jp', selected());
    assert.equal(repeat.created, false);
    assert.equal(repeat.view.saved?.id, first.view.saved?.id);
    const changed = await repo.save(source.caseId, actor, { futureEntryIndex: 0, candidates: [] });
    assert.equal(changed.created, true); assert.equal(changed.view.saved?.version, 2);
    assert.deepEqual(changed.view.agenda?.nextActions, []);
    const count = await h.pool.query<{ revisions: number; audits: number }>(
      `SELECT (SELECT count(*)::int FROM paid_assessment_preparation_selection_v1 WHERE handoff_id=$1) revisions,
              (SELECT count(*)::int FROM it_management_diagnosis_case_v2_audit WHERE case_id=$2
                 AND command='RecordPaidAssessmentPreparationSelection') audits`, [source.handoff.id, source.caseId],
    );
    assert.deepEqual(count.rows[0], { revisions: 2, audits: 2 });
  } finally { await h.close(); }
});

test('E4 serializes concurrent saves and prevents duplicate revision and audit', async () => {
  const h = await setup();
  try {
    const source = await eligible(h); const repo = new PaidAssessmentPreparationSelectionRepo(h.pool);
    const both = await Promise.all([
      repo.save(source.caseId, actor, selected()),
      repo.save(source.caseId, 'second@atlib.jp', selected()),
    ]);
    assert.deepEqual(both.map(x => x.created).sort(), [false, true]);
    const rows = await h.pool.query('SELECT id FROM paid_assessment_preparation_selection_v1 WHERE handoff_id=$1', [source.handoff.id]);
    assert.equal(rows.rowCount, 1);
  } finally { await h.close(); }
});

test('E4 rejects invalid, absent, untransferred and stale source cases', async () => {
  const h = await setup();
  try {
    const repo = new PaidAssessmentPreparationSelectionRepo(h.pool);
    await assert.rejects(repo.save('not-uuid', actor, selected()), e => hasCode(e, 400, 'INVALID_CASE_ID'));
    await assert.rejects(repo.save(sourceId(), actor, selected()), e => hasCode(e, 404, 'CASE_NOT_FOUND'));
    const act = await h.launcher.createSalesActivity({ name: 'untransferred', contact: { name: 'Owner' }, selectedService: 'IT_KAIZEN' }, actor);
    const no = await h.cases.createCase(act.companyId, act.contactId, act.salesActivityId, actor);
    await assert.rejects(repo.latest(no.id, actor), e => hasCode(e, 409, 'HANDOFF_REQUIRED'));
    const source = await eligible(h);
    const report = await h.pool.query<{ content_json: unknown; snapshot_json: unknown }>(
      'SELECT content_json,snapshot_json FROM diagnosis_reports WHERE id=$1', [source.reportId],
    );
    const decision = { route: 'STOP_HOLD', materialDecision: 'Stop', nextAction: 'No further action' };
    const context = { report: { id: source.reportId, version: 1,
      content_hash: contentHash(report.rows[0]!.content_json),
      approval_snapshot_hash: contentHash(report.rows[0]!.snapshot_json) }, decision };
    await h.pool.query(
      `INSERT INTO management_feedback_decisions
        (id,it_management_diagnosis_case_v2_id,version,route_code,material_decision,next_action,context_snapshot_json,context_hash,decided_by_user_id)
       VALUES($1,$2,2,'STOP_HOLD',$3,$4,$5,$6,$7)`,
      [sourceId(), source.caseId, decision.materialDecision, decision.nextAction,
        JSON.stringify(context), contentHash(context), actor],
    );
    await assert.rejects(repo.save(source.caseId, actor, selected()), e => hasCode(e, 409, 'HANDOFF_STALE'));
    assert.equal((await h.pool.query('SELECT id FROM paid_assessment_preparation_selection_v1')).rowCount, 0);
  } finally { await h.close(); }
});

test('E4 refuses old Handoff selection after a new verified Decision/Handoff', async () => {
  const h = await setup();
  try {
    const source = await eligible(h); const repo = new PaidAssessmentPreparationSelectionRepo(h.pool);
    await repo.save(source.caseId, actor, selected());
    const report = await h.pool.query<{ content_json: unknown; snapshot_json: unknown }>(
      'SELECT content_json,snapshot_json FROM diagnosis_reports WHERE id=$1', [source.reportId],
    );
    const decisionId = sourceId(); const content = report.rows[0]!.content_json; const approval = report.rows[0]!.snapshot_json;
    const decision = { route: 'DESIGN_ASSESSMENT', materialDecision: 'Revised', nextAction: 'Prepare again' };
    const context = { report: { id: source.reportId, version: 1, content_hash: contentHash(content),
      approval_snapshot_hash: contentHash(approval) }, decision };
    await h.pool.query(
      `INSERT INTO management_feedback_decisions
        (id,it_management_diagnosis_case_v2_id,version,route_code,material_decision,next_action,context_snapshot_json,context_hash,decided_by_user_id)
       VALUES($1,$2,2,'DESIGN_ASSESSMENT',$3,$4,$5,$6,$7)`,
      [decisionId, source.caseId, decision.materialDecision, decision.nextAction, JSON.stringify(context), contentHash(context), actor],
    );
    await assert.rejects(repo.latest(source.caseId, actor), e => hasCode(e, 409, 'HANDOFF_STALE'));
    const nextHandoff = await new PaidAssessmentSourceHandoffRepo(h.pool).create(source.caseId, actor);
    assert.notEqual(nextHandoff.handoff.id, source.handoff.id);
    const next = await repo.latest(source.caseId, actor);
    assert.deepEqual(next, { saved: null, preparation: null, agenda: null });
    assert.equal((await h.pool.query('SELECT id FROM paid_assessment_preparation_selection_v1')).rowCount, 1);
  } finally { await h.close(); }
});

test('E4 validates strict selections and immutable table / stored selection hash', async () => {
  const h = await setup();
  try {
    const source = await eligible(h); const repo = new PaidAssessmentPreparationSelectionRepo(h.pool);
    await assert.rejects(repo.save(source.caseId, actor, { futureEntryIndex: -1, candidates: [] }), e => hasCode(e, 400, 'INVALID_SELECTION'));
    await assert.rejects(repo.save(source.caseId, actor, { futureEntryIndex: 0, candidates: [{ candidateId: 'missing', area: 'TECHNOLOGY' }] }), e => hasCode(e, 400, 'INVALID_SELECTION'));
    const first = await repo.save(source.caseId, actor, selected());
    const id = first.view.saved!.id;
    await assert.rejects(h.pool.query('UPDATE paid_assessment_preparation_selection_v1 SET version=2 WHERE id=$1', [id]));
    await assert.rejects(h.pool.query('DELETE FROM paid_assessment_preparation_selection_v1 WHERE id=$1', [id]));
    await h.pool.query('DROP TRIGGER paid_assessment_preparation_selection_v1_immutable ON paid_assessment_preparation_selection_v1');
    await h.pool.query('UPDATE paid_assessment_preparation_selection_v1 SET selection_hash=$2 WHERE id=$1', [id, 'a'.repeat(64)]);
    await assert.rejects(repo.latest(source.caseId, actor), e => hasCode(e, 409, 'PREPARATION_SELECTION_INTEGRITY_MISMATCH'));
  } finally { await h.close(); }
});

test('E4 rolls back saving a draft when audit insert fails', async () => {
  const h = await setup();
  try {
    const source = await eligible(h); const repo = new PaidAssessmentPreparationSelectionRepo(h.pool);
    await h.pool.query(`CREATE FUNCTION fail_e4_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit blocked'; END $$`);
    await h.pool.query(`CREATE TRIGGER fail_e4_audit BEFORE INSERT ON it_management_diagnosis_case_v2_audit FOR EACH ROW
      WHEN (NEW.command='RecordPaidAssessmentPreparationSelection') EXECUTE FUNCTION fail_e4_audit()`);
    await assert.rejects(repo.save(source.caseId, actor, selected()), /audit blocked/);
    assert.equal((await h.pool.query('SELECT id FROM paid_assessment_preparation_selection_v1')).rowCount, 0);
  } finally { await h.close(); }
});

test('E4 staff HTTP GET/POST is authenticated and excludes handoff or report body fields', async () => {
  const h = await setup();
  const auth = new StaffAuthService('e4-test-secret');
  const app = express(); app.use(express.json()); app.use(cookieParser());
  const repo = new PaidAssessmentPreparationSelectionRepo(h.pool);
  app.use('/api/admin/it-management-kaizen/assessment-source-handoffs', requireStaffAuth(auth),
    createAdminPaidAssessmentSourceHandoffRouter(new PaidAssessmentSourceHandoffRepo(h.pool), repo));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/it-management-kaizen/assessment-source-handoffs`;
  try {
    const source = await eligible(h); const endpoint = `${base}/${source.caseId}/preparation`;
    const cookie = `staff_session=${auth.issueSessionToken({ email: actor })}`;
    assert.equal((await fetch(endpoint)).status, 401);
    assert.equal((await fetch(endpoint, { headers: { cookie: 'staff_session=invalid' } })).status, 401);
    const send = (body: unknown) => fetch(endpoint, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await send({ ...selected(), reportId: source.reportId })).status, 400);
    assert.equal((await send(selected())).status, 201);
    assert.equal((await send(selected())).status, 200);
    const current = await fetch(endpoint, { headers: { cookie } });
    assert.equal(current.status, 200);
    const json = await current.json() as { view: { saved: { handoffId: string } } };
    assert.equal(json.view.saved.handoffId, source.handoff.id);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await h.close();
  }
});

test('E4 SQL migration is runner-safe and limits runtime grants', () => {
  const sql = fs.readFileSync(path.join(root, 'migrations/038_paid_assessment_preparation_selection.sql'), 'utf8');
  assert.doesNotMatch(sql, /\bBEGIN\s*;/i);
  assert.doesNotMatch(sql, /\bCOMMIT\s*;/i);
  assert.match(sql, /BEFORE UPDATE OR DELETE/);
  assert.match(sql, /GRANT SELECT, INSERT[\s\S]*sales_tools_runtime/);
  assert.match(sql, /REVOKE UPDATE, DELETE[\s\S]*sales_tools_runtime/);
  assert.match(sql, /GRANT SELECT, INSERT[\s\S]*sales_tools_app/);
  assert.match(sql, /REVOKE UPDATE, DELETE[\s\S]*sales_tools_app/);
});
