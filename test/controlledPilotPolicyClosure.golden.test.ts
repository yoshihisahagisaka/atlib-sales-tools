import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDiagnosisHarness } from './support/diagnosisHarness';
import { DIAGNOSIS_POLICY_NOTICE_VERSION } from '../src/routes/itManagementDiagnosis';

let h: Awaited<ReturnType<typeof createDiagnosisHarness>>;
before(async () => { h = await createDiagnosisHarness(); });
after(async () => { await h?.close(); });

const application = { companyName: 'Policy株式会社', contactName: '山田', email: 'policy@example.test', phone: '03-0000-0000' };
async function request(path: string, method = 'GET', body?: unknown, admin = false, extra: Record<string,string> = {}) {
  const response = await fetch(h.url + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(admin ? { Cookie: h.staffCookie, 'X-Diagnosis-Command': '1' } : {}),
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return response as Omit<Response,'json'> & { json(): Promise<any> };
}

async function createWebCase() {
  const response = await request('/api/it-management-diagnosis/cases', 'POST', application);
  assert.equal(response.status, 201);
  return await response.json() as { id: string; access_token: string };
}

test('BD-05: Web申込はversioned notice acknowledgementなしでは作成できず、確認履歴を保存する', async () => {
  const rejected = await request('/api/it-management-diagnosis/cases', 'POST', application, false, { 'X-Test-Skip-Policy-Injection': '1' });
  assert.equal(rejected.status, 422);

  const c = await createWebCase();
  const { rows } = await h.db.query<{ notice_version: string; channel: string; acknowledged_by_type: string }>(
    'SELECT notice_version,channel,acknowledged_by_type FROM diagnosis_policy_acknowledgements WHERE diagnosis_case_id=$1', [c.id]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.notice_version, DIAGNOSIS_POLICY_NOTICE_VERSION);
  assert.equal(rows[0]!.channel, 'WEB');
  assert.equal(rows[0]!.acknowledged_by_type, 'CUSTOMER');
});

test('BD-03/05: Transcriptは別同意が存在するまでDBレベルで保存を拒否する', async () => {
  const c = await createWebCase();
  const insertTranscript = () => h.db.query(`INSERT INTO source_records
    (id,diagnosis_case_id,source_type,entered_by_user_id,content)
    VALUES($1,$2,'TRANSCRIPT','operator@atlib.jp','顧客発言の文字起こし')`, [randomUUID(), c.id]);
  await assert.rejects(insertTranscript, /TRANSCRIPT_CONSENT_REQUIRED/);

  const consent = await request(`/api/admin/it-management-diagnosis/cases/${c.id}/transcript-consents`, 'POST', {
    consentVersion: 'TRANSCRIPT-CONSENT-PILOT-v1',
    consentScope: '60分診断の文字起こしを診断整理に利用',
    consentedAt: new Date().toISOString(),
    customerReference: 'respondent',
    evidenceNote: '事前説明後に明示同意を確認',
  }, true);
  assert.equal(consent.status, 201);
  assert.equal((await consent.json()).status, 'ACTIVE');

  await insertTranscript();
  const count = await h.db.query<{ count: number }>(`SELECT count(*)::int AS count FROM source_records WHERE diagnosis_case_id=$1 AND source_type='TRANSCRIPT'`, [c.id]);
  assert.equal(count.rows[0]!.count, 1);
});

test('BD-02: deletion requestはHuman scope/approvalを経由し、destructive実行はControlled Pilotで無効', async () => {
  const c = await createWebCase();
  const created = await request(`/api/admin/it-management-diagnosis/cases/${c.id}/deletion-requests`, 'POST', { requesterReference: 'customer-request-001' }, true);
  assert.equal(created.status, 201);
  const deletion = await created.json() as { id: string; status: string };
  assert.equal(deletion.status, 'REQUESTED');

  const scoped = await request(`/api/admin/it-management-diagnosis/cases/${c.id}/deletion-requests/${deletion.id}/scope`, 'PUT', {
    dataClasses: ['GENERAL_RAW_DIAGNOSIS','RAW_AI_IO'],
    restrictedRetention: [{ dataClass: 'APPROVED_DECISION_EVIDENCE', reason: '説明責任のためBusiness Policyに従い制限保存' }],
  }, true);
  assert.equal(scoped.status, 204);

  const approved = await request(`/api/admin/it-management-diagnosis/cases/${c.id}/deletion-requests/${deletion.id}/decision`, 'POST', {
    decision: 'APPROVE', reason: '顧客要求を確認し対象分類を確定',
  }, true);
  assert.equal(approved.status, 204);

  const policy = await request(`/api/admin/it-management-diagnosis/cases/${c.id}/policy`, 'GET', undefined, true);
  assert.equal(policy.status, 200);
  const readModel = await policy.json();
  assert.equal(readModel.deletion_requests[0].status, 'APPROVED');
  assert.deepEqual(readModel.deletion_requests[0].scoped_data_classes, ['GENERAL_RAW_DIAGNOSIS','RAW_AI_IO']);

  const dryRun = await request(`/api/admin/it-management-diagnosis/cases/${c.id}/retention/dry-run`, 'GET', undefined, true);
  assert.equal(dryRun.status, 200);
  const preview = await dryRun.json();
  assert.equal(preview.dry_run, true);
  assert.equal(preview.destructive_execution_enabled, false);
});
