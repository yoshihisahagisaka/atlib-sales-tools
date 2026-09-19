import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { applicationSchema, companyDisplayName, hashAccessToken, PROVIDER_NAME, SURVEY_QUESTIONS, SURVEY_VERSION, type Actor } from '../src/domain/itManagementDiagnosis';
import { createDiagnosisHarness } from './support/diagnosisHarness';

let h: Awaited<ReturnType<typeof createDiagnosisHarness>>;
let ip = 1;
let notifications = 0;
before(async () => { h = await createDiagnosisHarness(async () => { notifications++; throw new Error('simulated notification failure'); }); });
after(async () => { await h?.close(); });
const application = { companyName: 'ABC株式会社', contactName: '山田', email: 'customer@example.test', phone: '03-0000-0000' };
const staff: Actor = { kind: 'STAFF', userId: 'operator@atlib.jp' };
const publicBase = '/api/it-management-diagnosis';
const adminBase = '/api/admin/it-management-diagnosis';
async function request(path: string, method = 'GET', body?: unknown, token?: string, admin = false, extra: Record<string,string> = {}) {
  const response = await fetch(h.url + path, { method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `192.0.2.${ip++ % 250 + 1}`,
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(admin ? { Cookie: h.staffCookie, 'X-Diagnosis-Command': '1' } : {}), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  // These tests assert the untrusted wire shape at runtime, including forbidden keys.
  return response as Omit<Response, 'json'> & { json(): Promise<any> };
}
async function webCase() {
  const response = await request(`${publicBase}/cases`, 'POST', application);
  assert.equal(response.status, 201);
  const result = await response.json() as { id: string; access_token: string; diagnosis_status: string };
  return { ...result, actor: { kind: 'CUSTOMER', token: result.access_token } as Actor };
}
async function fullAnswers(id: string, actor: Actor, except?: string) {
  for (const q of SURVEY_QUESTIONS.filter(q => q.is_required && q.question_code !== except)) {
    await h.repo.submitResponse(id, q.question_code, q.version, q.answer_type === 'MULTI_SELECT' ? ['分からない'] : '分からない', actor);
  }
}
async function count(table: string, id: string) {
  // table is always a test-owned literal, never user content.
  const result = await h.db.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table} WHERE diagnosis_case_id=$1`, [id]);
  return result.rows[0]!.count;
}
function noJudgement(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, v] of Object.entries(value)) {
    assert.doesNotMatch(key, /score|maturity|radar|fact_status|semantic_type|confidence|suggested.?services|actionHint|insight/i);
    noJudgement(v);
  }
}

test('Golden: Web申込を一括保存、敬称は表示のみ、raw tokenはhashのみ', async () => {
  const c = await webCase();
  assert.equal(c.diagnosis_status, 'APPLICATION_STARTED');
  const { rows } = await h.db.query<Record<string, unknown>>(`SELECT c.*,o.name FROM diagnosis_cases c JOIN organizations o ON o.id=c.organization_id WHERE c.id=$1`, [c.id]);
  assert.equal(rows[0]!.name, 'ABC株式会社'); assert.equal(rows[0]!.assessment_status, 'NOT_PROPOSED');
  assert.equal(rows[0]!.access_token_hash, hashAccessToken(c.access_token));
  assert.doesNotMatch(JSON.stringify(rows), new RegExp(c.access_token));
  assert.equal((await h.db.query('SELECT * FROM participants WHERE diagnosis_case_id=$1', [c.id])).rows.length, 1);
  assert.equal(await count('case_transitions', c.id), 1); assert.equal(await count('diagnosis_audit_logs', c.id), 1);
  const data = await h.repo.getSurvey(c.id, c.actor);
  assert.equal(data.organization_display_name, 'ABC株式会社様'); assert.equal(data.provider_name, 'atLIB株式会社');
  noJudgement(data);
  assert.equal(applicationSchema.parse({ ...application, companyName: ' ABC株式会社様 様 ' }).companyName, 'ABC株式会社');
  assert.equal(companyDisplayName('ABC株式会社'), 'ABC株式会社様'); assert.equal(PROVIDER_NAME, 'atLIB株式会社');
  assert.equal(applicationSchema.safeParse({ ...application, companyName: '様' }).success, false);
});

test('Golden: 開始は冪等、生回答「完全に把握」「分からない」を保存して再開できる', async () => {
  const c = await webCase();
  for (let i = 0; i < 2; i++) assert.equal((await request(`${publicBase}/cases/${c.id}/survey/start`, 'POST', {}, c.access_token)).status, 204);
  assert.equal(await count('case_transitions', c.id), 2);
  for (const [code, value] of [['Q04_IT_VISIBILITY', 'IT環境は完全に把握できている'], ['Q07_AUTHORITY_RESPONSIBILITY', '分からない']]) {
    assert.equal((await request(`${publicBase}/cases/${c.id}/survey/responses/${code}`, 'PUT', { questionVersion: 2, rawValue: value }, c.access_token)).status, 204);
  }
  const response = await request(`${publicBase}/cases/${c.id}/survey`, 'GET', undefined, c.access_token);
  assert.equal(response.status, 200); const data = await response.json(); noJudgement(data);
  assert.equal(data.responses.length, 2); assert.equal(data.responses[0].raw_value_json, 'IT環境は完全に把握できている');
  assert.equal(data.responses[1].raw_value_json, '分からない'); assert.equal(await count('diagnosis_futures', c.id), 0);
  assert.equal(data.survey.answered_required, 2);
  const columns = await h.db.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_name='survey_responses'`);
  assert.doesNotMatch(columns.rows.map(r => r.column_name).join(','), /score|maturity|confidence|fact_status|semantic_type/);
  const tables = await h.db.query<{ table_name: string }>(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`);
  assert.ok(!tables.rows.some(r => /^facts?$/.test(r.table_name)));
  assert.equal((await h.db.query('SELECT id FROM source_records')).rows.length,0);
  assert.equal((await h.db.query('SELECT id FROM diagnosis_insights')).rows.length,0);
});

test('Golden: Q01変更はCompleteまでFuture未生成、必須Q06不足は422、完了でSURVEY_STATED', async () => {
  const c = await webCase(); await h.repo.startSurvey(c.id, c.actor);
  await fullAnswers(c.id, c.actor, 'Q06_SECURITY_RISK');
  const q01 = SURVEY_QUESTIONS[0]!;
  await h.repo.submitResponse(c.id, q01.question_code, 2, [q01.options_json![0]!], c.actor);
  assert.equal(await count('diagnosis_futures', c.id), 0);
  const updated = [q01.options_json![1]!, '分からない'];
  await h.repo.submitResponse(c.id, q01.question_code, 2, updated, c.actor);
  assert.equal(await count('diagnosis_futures', c.id), 0);
  const incomplete = await request(`${publicBase}/cases/${c.id}/survey/complete`, 'POST', {}, c.access_token);
  assert.equal(incomplete.status, 422); assert.deepEqual((await incomplete.json()).questionCodes, ['Q06_SECURITY_RISK']);
  assert.equal((await h.repo.getSurvey(c.id, c.actor)).diagnosis_status, 'SURVEY_IN_PROGRESS');
  assert.equal(await count('diagnosis_futures', c.id), 0);
  await h.repo.submitResponse(c.id, 'Q06_SECURITY_RISK', 2, '分からない', c.actor);
  assert.equal((await request(`${publicBase}/cases/${c.id}/survey/complete`, 'POST', {}, c.access_token)).status, 204);
  const overview = await h.repo.getSurvey(c.id, staff);
  assert.equal(overview.diagnosis_status, 'SURVEY_COMPLETED'); noJudgement(overview);
  assert.ok('future' in overview); assert.equal(overview.future?.intent_status, 'SURVEY_STATED');
  assert.equal(overview.future?.statement, updated.join(' / '));
  assert.equal(overview.future?.source_ref_id, overview.responses.find(r => r.question_code === q01.question_code)!.id);
  assert.equal(await count('case_transitions', c.id), 3); assert.equal(await count('diagnosis_audit_logs', c.id), 3);
  assert.equal((await request(`${publicBase}/cases/${c.id}/survey/complete`, 'POST', {}, c.access_token)).status, 409);
  assert.equal((await request(`${publicBase}/cases/${c.id}/survey/start`, 'POST', {}, c.access_token)).status, 409);
  assert.equal((await request(`${publicBase}/cases/${c.id}/survey/responses/Q01_FUTURE`, 'PUT', { questionVersion: 2, rawValue: ['分からない'] }, c.access_token)).status, 409);
  assert.equal(await count('diagnosis_futures', c.id), 1);
  assert.ok(notifications >= 1, 'notification failure did not roll back completion');
});

test('Golden: 無効・別Case・期限切れ・失効tokenによる読み書きを拒否', async () => {
  const c = await webCase(); const other = await webCase();
  for (const token of ['invalid', 'a'.repeat(43), other.access_token]) {
    for (const [suffix, method, body] of [['survey','GET',undefined], ['survey/start','POST',{}],
      ['survey/responses/Q04_IT_VISIBILITY','PUT',{ questionVersion: 2, rawValue: '分からない' }], ['survey/complete','POST',{}]] as const) {
      assert.equal((await request(`${publicBase}/cases/${c.id}/${suffix}`, method, body, token)).status, 401);
    }
  }
  assert.equal((await request(`${publicBase}/cases/${randomUUID()}/survey`, 'GET', undefined, c.access_token)).status, 401);
  await h.db.query(`UPDATE diagnosis_cases SET access_token_expires_at=now()-interval '1 day' WHERE id=$1`, [other.id]);
  assert.equal((await request(`${publicBase}/cases/${other.id}/survey`, 'GET', undefined, other.access_token)).status, 401);
  assert.equal((await request(`${adminBase}/cases/${c.id}/access/revoke`, 'POST', {}, undefined, true)).status, 204);
  assert.equal((await request(`${publicBase}/cases/${c.id}/survey`, 'GET', undefined, c.access_token)).status, 401);
  assert.equal((await request(`${publicBase}/cases/${c.id}/survey/start`, 'POST', {}, c.access_token)).status, 401);
  assert.equal((await request(`${adminBase}/cases/${c.id}/survey/start`, 'POST', {}, undefined, true)).status, 204);
});

test('Golden: SALES_VISITは既存staff認証、同一Surveyとactor記録、顧客発言を補完しない', async () => {
  assert.equal((await request(`${adminBase}/cases`)).status, 401);
  const redirect = await request('/admin/it-management-diagnosis.html'); assert.equal(redirect.status, 302);
  assert.match(redirect.headers.get('location')!, /^\/auth\/login/);
  assert.equal((await request(`${adminBase}/cases`, 'POST', application, undefined, false, { Cookie: h.staffCookie })).status, 403);
  assert.equal((await request(`${adminBase}/cases`, 'POST', application, undefined, true, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await request(`${publicBase}/cases`, 'POST', { ...application, entry_channel: 'SALES_VISIT', owner_user_id: 'forged' })).status, 422);
  assert.equal((await request(`${adminBase}/cases`, 'POST', application, undefined, true)).status,409);
  const draft=await (await request(`${adminBase}/sales-intakes`,'POST',{customer:application,customerStatements:[],unknowns:[],salespersonNotes:[],surveyAnswers:{}},undefined,true)).json();
  const response = await request(`${adminBase}/sales-intakes/${draft.id}/consent-and-start`, 'POST', {expectedVersion:draft.version,customerAgreed:true,customerReference:'Synthetic customer'}, undefined, true);
  assert.equal(response.status, 200); const c = await response.json(); assert.equal(c.entry_channel, 'SALES_VISIT'); assert.ok(!c.access_token);
  assert.equal((await request(`${adminBase}/cases/${c.id}/survey/start`, 'POST', {}, undefined, true)).status, 204);
  await fullAnswers(c.id, staff);
  assert.equal((await request(`${adminBase}/cases/${c.id}/survey/complete`, 'POST', {}, undefined, true)).status, 204);
  const overview = await (await request(`${adminBase}/cases/${c.id}/overview`, 'GET', undefined, undefined, true)).json();
  assert.equal(overview.owner_user_id, 'operator@atlib.jp'); assert.equal(overview.entry_channel, 'SALES_VISIT');
  assert.ok(overview.responses.every((r: { entered_by_user_id: string; entry_channel: string }) => r.entered_by_user_id === 'operator@atlib.jp' && r.entry_channel === 'SALES_VISIT'));
  assert.equal(overview.future.intent_status, 'SURVEY_STATED'); noJudgement(overview);
  const list = await (await request(`${adminBase}/cases?status=SURVEY_COMPLETED&entryChannel=SALES_VISIT`, 'GET', undefined, undefined, true)).json();
  assert.equal(list.items.length, 1); assert.equal(list.items[0].organization_display_name, 'ABC株式会社様');
  assert.ok(list.items[0].current_next_action); assert.equal(list.items[0].assessment_status, 'NOT_PROPOSED'); noJudgement(list);
});

test('回答のquestion/version/typeを検証し、任意自由記述の原文と空への変更を保存', async () => {
  const c = await webCase(); await h.repo.startSurvey(c.id, c.actor);
  for (const [code, questionVersion, rawValue] of [['BAD',2,'分からない'], ['Q04_IT_VISIBILITY',1,'分からない'],
    ['Q04_IT_VISIBILITY',2,['分からない']], ['Q04_IT_VISIBILITY',2,'not-an-option'], ['Q01_FUTURE',2,['分からない','分からない']],
    ['Q10_FREE_COMMENT',2,'a'.repeat(4001)]] as const) {
    assert.equal((await request(`${publicBase}/cases/${c.id}/survey/responses/${code}`, 'PUT', { questionVersion, rawValue }, c.access_token)).status, 422);
  }
  await h.repo.submitResponse(c.id, 'Q10_FREE_COMMENT', 2, '  前任者しか分からない\n<script>alert(1)</script>  ', c.actor);
  const data = await h.repo.getSurvey(c.id, c.actor);
  assert.equal(data.responses[0]!.raw_value_json, '  前任者しか分からない\n<script>alert(1)</script>  ');
  await h.repo.submitResponse(c.id, 'Q10_FREE_COMMENT', 2, '', c.actor);
  assert.equal((await h.repo.getSurvey(c.id, c.actor)).responses[0]!.raw_value_json, '');
  assert.equal(await count('diagnosis_futures', c.id), 0);
});

test('完了時のDB障害はFutureと遷移をrollbackし、再実行できる', async () => {
  const c = await webCase(); await h.repo.startSurvey(c.id, c.actor); await fullAnswers(c.id, c.actor);
  await h.db.exec(`CREATE FUNCTION fail_complete_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.command='CompleteSurvey' THEN RAISE EXCEPTION 'test failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_complete BEFORE INSERT ON diagnosis_audit_logs FOR EACH ROW EXECUTE FUNCTION fail_complete_audit();`);
  try { await assert.rejects(h.repo.completeSurvey(c.id, c.actor)); }
  finally { await h.db.exec('DROP TRIGGER fail_complete ON diagnosis_audit_logs; DROP FUNCTION fail_complete_audit();'); }
  assert.equal((await h.repo.getSurvey(c.id, c.actor)).diagnosis_status, 'SURVEY_IN_PROGRESS');
  assert.equal(await count('diagnosis_futures', c.id), 0); assert.equal(await count('case_transitions', c.id), 2);
  const results = await Promise.allSettled([h.repo.completeSurvey(c.id, c.actor), h.repo.completeSurvey(c.id, c.actor)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(await count('diagnosis_futures', c.id), 1);
});

test('会社名でOrganizationを自動マージせず、質問定義はDBに固定', async () => {
  const a = await webCase(); const b = await webCase();
  const rows = await h.db.query<{ organization_id: string }>('SELECT organization_id FROM diagnosis_cases WHERE id IN ($1,$2)', [a.id,b.id]);
  assert.notEqual(rows.rows[0]!.organization_id, rows.rows[1]!.organization_id);
  const data = await h.repo.getSurvey(a.id, a.actor);
  assert.equal(SURVEY_VERSION, 2);
  assert.equal(data.survey_version, 2);
  assert.ok(data.questions.every(q => q.version === 2));
  await h.repo.startSurvey(a.id, a.actor);
  await fullAnswers(a.id, a.actor);
  assert.ok((await h.repo.getSurvey(a.id, a.actor)).responses.every(r => r.question_version === 2));
  const persisted = await h.db.query<{ survey_version: number }>('SELECT survey_version FROM diagnosis_cases WHERE id=$1', [a.id]);
  assert.equal(persisted.rows[0]!.survey_version, 2);
  assert.equal(data.questions.length, 10); assert.equal(data.questions.filter(q => q.is_required).length, 9);
  assert.deepEqual(data.questions.map(({ id: _id, ...q }) => q), SURVEY_QUESTIONS);
});

test('不存在Caseは全読取・更新で顧客401／スタッフ404となり500を返さない', async () => {
  const c = await webCase();
  const missing = randomUUID();
  const operations = [
    ['survey', 'GET', undefined], ['survey/start', 'POST', {}],
    ['survey/responses/Q04_IT_VISIBILITY', 'PUT', { questionVersion: 2, rawValue: '分からない' }],
    ['survey/complete', 'POST', {}],
  ] as const;
  for (const [suffix, method, body] of operations) {
    const absent = await request(`${publicBase}/cases/${missing}/${suffix}`, method, body, c.access_token);
    const invalid = await request(`${publicBase}/cases/${c.id}/${suffix}`, method, body, 'x'.repeat(43));
    assert.equal(absent.status, 401);
    assert.equal(invalid.status, 401);
    assert.deepEqual(await absent.json(), await invalid.json(), 'Case存在の有無をレスポンスで区別しない');
    const admin = await request(`${adminBase}/cases/${missing}/${suffix}`, method, body, undefined, true);
    assert.equal(admin.status, 404);
    assert.deepEqual(await admin.json(), { error: '案件が見つかりません。' });
  }
  assert.equal((await request(`${adminBase}/cases/${missing}/overview`, 'GET', undefined, undefined, true)).status, 404);
  assert.equal((await request(`${adminBase}/cases/${missing}/access/revoke`, 'POST', {}, undefined, true)).status, 404);
});

test('Survey v2のSSOT文書案は質問文・選択肢・type・必須区分・code・versionを完全に保持', () => {
  const document = fs.readFileSync(path.resolve(__dirname, '../docs/free-it-management-diagnosis-survey-v2-question-set-proposal.md'), 'utf8');
  const block = /```json\s*([\s\S]*?)```/.exec(document);
  assert.ok(block, '質問定義JSONが文書案に存在する');
  assert.deepEqual(JSON.parse(block[1]!), { survey_version: 2, questions: SURVEY_QUESTIONS });
});

test('ログにraw token・query・自由記述・メールを記録しない', async () => {
  const c = await webCase(); await h.repo.startSurvey(c.id, c.actor);
  const secretComment = 'PRIVATE_COMMENT_CANARY';
  await request(`${publicBase}/cases/${c.id}/survey/responses/Q10_FREE_COMMENT`, 'PUT', { questionVersion: 2, rawValue: secretComment }, c.access_token);
  await request(`${publicBase}/cases/${c.id}/survey?token=${c.access_token}&email=LOG_EMAIL_CANARY`, 'GET', undefined, c.access_token, false,
    { Referer: `http://example.test/${c.access_token}`, 'X-Private-Header': c.access_token });
  await new Promise(resolve => setImmediate(resolve));
  const logs = h.logs.join('');
  for (const value of [c.access_token, secretComment, 'LOG_EMAIL_CANARY', application.email, application.phone]) assert.ok(!logs.includes(value));
});

test('Golden: legacy migration/table/APIを維持し、新APIに旧評価を混入させない', async () => {
  assert.equal((await h.db.query(`SELECT * FROM kaizen_diagnostics WHERE company_name='Legacy株式会社'`)).rows.length, 1);
  const definitions = await (await request('/api/kaizen-diagnostic/questions')).json();
  const answers = Object.fromEntries(definitions.questions.map((q: { id: string; options: { value: string }[] }) => [q.id, q.options[0]!.value]));
  assert.equal((await request('/api/kaizen-diagnostic', 'POST', { ...application, answers })).status, 204);
  assert.equal((await h.db.query('SELECT * FROM kaizen_diagnostics')).rows.length, 2);
  const root = path.resolve(__dirname, '..');
  const migration = fs.readFileSync(path.join(root,'migrations/007_it_management_diagnosis.sql'),'utf8');
  assert.doesNotMatch(migration, /DROP\s|ALTER\s|kaizen_diagnostics/i);
  const server = fs.readFileSync(path.join(root,'src/server.ts'),'utf8');
  assert.match(server, /app\.use\('\/api\/admin\/it-management-diagnosis',\s*\.\.\.adminAuthGate/);
  const adminMount=server.search(/app\.use\('\/admin',\s*\.\.\.adminAuthGate/);
  const publicMount=server.indexOf('app.use(express.static');
  assert.ok(adminMount>=0 && publicMount>adminMount,'protected admin mount precedes public static files');
  for (const file of ['public/it-management-diagnosis.html','public/admin/it-management-diagnosis.html',
    'public/admin/it-management-diagnosis-new.html','public/admin/it-management-diagnosis-detail.html']) {
    const source = fs.readFileSync(path.join(root,file),'utf8');
    assert.match(source,/atLIB株式会社/); assert.doesNotMatch(source,/score|maturity|radar|suggestedServices|actionHint/i);
  }
});

test('公開Case作成の既存IP Rate Limitを適用', async () => {
  for (let i = 0; i < 6; i++) {
    const response = await request(`${publicBase}/cases`, 'POST', application, undefined, false, { 'X-Forwarded-For': '198.51.100.200' });
    assert.equal(response.status, i < 5 ? 201 : 429);
  }
});
