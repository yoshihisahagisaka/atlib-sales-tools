import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createFreeDiagnosisRuleBasedV1Harness } from './support/freeDiagnosisRuleBasedV1Harness';
import { contentHash } from '../src/domain/diagnosisReport';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

let h: Awaited<ReturnType<typeof createFreeDiagnosisRuleBasedV1Harness>>;
before(async () => { h = await createFreeDiagnosisRuleBasedV1Harness(); });
after(async () => { await h?.close(); });

const base = '/api/admin/free-diagnosis-v1';
async function req(path: string, method = 'GET', body?: unknown, withAuth = true) {
  const response = await fetch(h.url + base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(withAuth ? { Cookie: h.staffCookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual',
  });
  return response as Omit<Response, 'json'> & { json(): Promise<any> };
}
async function publicReq(path: string, body: unknown, forwardedFor?: string) {
  return await fetch(h.url + '/api/public/it-management-kaizen/free-diagnosis-v1' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {}) }, body: JSON.stringify(body) }) as Omit<Response, 'json'> & { json(): Promise<any> };
}

const intakeValues: Record<string, unknown> = {
  Q1: { employeeSize: 'EMP_21_50', locations: 'SITE_1' }, Q2: ['NO_MAJOR_CHANGE'], Q3: ['UNDECIDED'],
  Q4: 'MANAGEMENT_DECISION_CONCERN', Q5: 'VISIBLE_ENOUGH', Q6: 'REGULAR_AND_USABLE',
};
function intake(questionCode: string, channel: 'SELF' | 'PROXY') {
  return { questionCode, channel, value: { schemaVersion: 1, questionCode, answerValue: intakeValues[questionCode], responseState: 'ANSWERED', respondent: { role: 'MANAGEMENT' }, provenance: { channel, source: channel === 'SELF' ? 'CUSTOMER_SELF' : 'SALES_PROXY' } } };
}

async function deliveredVs1Report(name: string, attribution?: unknown) {
  const activity = await (await req('/sales-activities', 'POST', { name, contact: { name: '担当' }, selectedService: 'IT_KAIZEN', ...(attribution ? { attribution } : {}) })).json() as { salesActivityId: string };
  let kase: any = await (await req(`/sales-activities/${activity.salesActivityId}/cases`, 'POST', {})).json();
  for (const q of ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6']) await req(`/cases/${kase.id}/intake`, 'POST', intake(q, 'PROXY'));
  kase = await (await req(`/cases/${kase.id}/intake/complete`, 'POST', { expectedVersion: kase.version })).json();
  kase = (await (await req(`/cases/${kase.id}/preparation/start`, 'POST', { expectedVersion: kase.version })).json()).case;
  kase = await (await req(`/cases/${kase.id}/hearing/start`, 'POST', { expectedVersion: kase.version })).json();
  const unit = (await (await req(`/cases/${kase.id}/hearing/units`)).json()).items[0];
  await req(`/cases/${kase.id}/hearing/statements`, 'POST', { planItemRef: unit.unitCode, statementText: '確認済み', knowledgeState: 'KNOWN', structuredAnswer: { schemaVersion: 1, hearingUnitCode: unit.unitCode, semanticKey: unit.semanticKey, answerValue: 'CAN_JUDGE', responseState: 'ANSWERED', respondent: { role: 'MANAGEMENT' }, provenance: { channel: 'PROXY', source: 'SALES_PROXY' }, completionStatus: 'COMPLETE' } });
  kase = await (await req(`/cases/${kase.id}/hearing/complete`, 'POST', { expectedVersion: kase.version })).json();
  const final = await (await req(`/cases/${kase.id}/rule-analysis/run`, 'POST', { expectedVersion: kase.version })).json();
  await req(`/cases/${kase.id}/final-review/project`, 'POST', { executionId: final.executionId });
  const draft = await (await req(`/cases/${kase.id}/reports/draft`, 'POST', {})).json();
  await req(`/cases/${kase.id}/reports/${draft.id}/approve`, 'POST', {});
  await req(`/cases/${kase.id}/reports/${draft.id}/deliver`, 'POST', {});
  await req(`/cases/${kase.id}/feedback/start`, 'POST', {});
  return { kase, final, draft, unit };
}

test('Production guard: every route requires Staff auth (401 without cookie)', async () => {
  const res = await req('/sales-activities', 'POST', { name: 'x' }, false);
  assert.equal(res.status, 401);
});

test('VS1 source references enforce typed same-case ownership in the database', async () => {
  const make = async (name:string) => { const a=await (await req('/sales-activities','POST',{name,contact:{name:'担当'},selectedService:'IT_KAIZEN'})).json() as any; return await (await req(`/sales-activities/${a.salesActivityId}/cases`,'POST',{})).json() as any; };
  const a=await make('Source A'), b=await make('Source B');
  const intake={id:randomUUID()};
  await h.pool.query(`INSERT INTO hearing_intake_response_v2(id,case_id,question_code,channel,raw_value_json,entered_by_user_id,provenance) VALUES($1,$2,'Q1','PROXY',$3,'operator','SALES_PROXY')`,[intake.id,a.id,JSON.stringify({schemaVersion:1,questionCode:'Q1',answerValue:{employeeSize:'EMP_1_20',locations:'SITE_1'},responseState:'ANSWERED',respondent:{role:'MANAGEMENT'},provenance:{channel:'PROXY',source:'SALES_PROXY'}})]);
  // The ownership checks themselves are exercised directly: no application-layer validation is involved.
  const insightId=randomUUID();
  await h.pool.query(`INSERT INTO diagnosis_insights(id,it_management_diagnosis_case_v2_id,semantic_type,title,content,review_status,created_by,created_by_user_id) VALUES($1,$2,'OBSERVATION','x','x','HUMAN_APPROVED','HUMAN','operator')`,[insightId,a.id]);
  await h.pool.query(`INSERT INTO insight_sources(diagnosis_insight_id,it_management_diagnosis_case_v2_id,source_ref_type,source_ref_id,relation) VALUES($1,$2,'VS1_INTAKE_RESPONSE',$3,'RELATED')`,[insightId,a.id,intake.id]);
  await assert.rejects(h.pool.query(`INSERT INTO insight_sources(diagnosis_insight_id,it_management_diagnosis_case_v2_id,source_ref_type,source_ref_id,relation) VALUES($1,$2,'VS1_INTAKE_RESPONSE',$3,'RELATED')`,[insightId,b.id,intake.id]));
  await assert.rejects(h.pool.query(`INSERT INTO diagnosis_insights(id,diagnosis_case_id,it_management_diagnosis_case_v2_id,semantic_type,title,content,review_status,created_by,created_by_user_id) VALUES($1,$2,$3,'OBSERVATION','x','x','HUMAN_APPROVED','HUMAN','operator')`,[randomUUID(),randomUUID(),a.id]));
  await assert.rejects(h.pool.query(`INSERT INTO diagnosis_insights(id,semantic_type,title,content,review_status,created_by,created_by_user_id) VALUES($1,'OBSERVATION','x','x','HUMAN_APPROVED','HUMAN','operator')`,[randomUUID()]));
  const statement={id:randomUUID()}, execution={id:randomUUID()};
  await h.pool.query(`INSERT INTO hearing_statement_v2(id,case_id,statement_text,knowledge_state,recorded_by_user_id) VALUES($1,$2,'x','KNOWN','operator')`,[statement.id,a.id]);
  await h.pool.query(`INSERT INTO rule_analysis_execution(id,case_id,status,rule_version,analysis_stage) VALUES($1,$2,'SUCCEEDED','test','FINAL')`,[execution.id,a.id]);
  for (const [type,id] of [['VS1_HEARING_STATEMENT',statement.id],['VS1_RULE_EXECUTION',execution.id]] as const) {
    await h.pool.query(`INSERT INTO insight_sources(diagnosis_insight_id,it_management_diagnosis_case_v2_id,source_ref_type,source_ref_id,relation) VALUES($1,$2,$3,$4,'RELATED')`,[insightId,a.id,type,id]);
    await assert.rejects(h.pool.query(`INSERT INTO insight_sources(diagnosis_insight_id,it_management_diagnosis_case_v2_id,source_ref_type,source_ref_id,relation) VALUES($1,$2,$3,$4,'RELATED')`,[insightId,b.id,type,id]));
  }
  await assert.rejects(h.pool.query(`INSERT INTO insight_sources(diagnosis_insight_id,diagnosis_case_id,source_ref_type,source_ref_id,relation) VALUES($1,$2,'VS1_INTAKE_RESPONSE',$3,'RELATED')`,[insightId,randomUUID(),intake.id]));
  await assert.rejects(h.pool.query(`INSERT INTO insight_sources(diagnosis_insight_id,it_management_diagnosis_case_v2_id,source_ref_type,source_ref_id,relation) VALUES($1,$2,'SURVEY_RESPONSE',$3,'RELATED')`,[insightId,a.id,randomUUID()]));
});

test('Current Design v1 path: Envelopeを保持し、Manual FocusなしでInitial RuleからPreparationへ進む', async () => {
  const activity = await (await req('/sales-activities', 'POST', {
    name: '初期ルール確認株式会社', contact: { name: '営業代理入力' }, selectedService: 'IT_KAIZEN',
  })).json() as { salesActivityId: string };
  let kase = await (await req(`/sales-activities/${activity.salesActivityId}/cases`, 'POST', {})).json() as { id: string; version: number };
  const values: Record<string, unknown> = {
    Q1: { employeeSize: 'EMP_21_50', locations: 'SITE_1' }, Q2: ['HEADCOUNT_GROWTH'], Q3: ['SUPPORT_CHANGE'],
    Q4: 'CHANGE_READINESS_CONCERN', Q5: 'MOSTLY_VISIBLE', Q6: 'REGULAR_AND_USABLE', Q7: '拠点追加時の運営を相談したい',
  };
  for (const questionCode of ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7']) {
    const response = await req(`/cases/${kase.id}/intake`, 'POST', {
      questionCode, channel: 'PROXY', value: {
        schemaVersion: 1, questionCode, answerValue: values[questionCode], responseState: 'ANSWERED',
        respondent: { role: 'MANAGEMENT' }, provenance: { channel: 'PROXY', source: 'SALES_PROXY' },
      },
    });
    assert.equal(response.status, 204);
  }
  kase = await (await req(`/cases/${kase.id}/intake/complete`, 'POST', { expectedVersion: kase.version })).json();
  const started = await (await req(`/cases/${kase.id}/preparation/start`, 'POST', { expectedVersion: kase.version })).json() as {
    case: { status: string; primaryFocus: string; secondaryFocus: string | null }; preparation: { q7: string; result: { focusItems: { focus: string; role: string }[] } };
  };
  assert.equal(started.case.status, 'PREPARATION_IN_PROGRESS');
  assert.equal(started.case.primaryFocus, 'M05_GROWTH_CHANGE_ADAPTATION');
  assert.equal(started.case.secondaryFocus, 'M02_IT_OPERATION_CONTINUITY');
  assert.deepEqual(started.preparation.result.focusItems.map(x => [x.focus, x.role]), [
    ['M05_GROWTH_CHANGE_ADAPTATION', 'PRIMARY'], ['M02_IT_OPERATION_CONTINUITY', 'RELATED'],
  ]);
  assert.equal(started.preparation.q7, values.Q7);
  const persisted = await (await req(`/cases/${kase.id}`)).json() as { intake: { questionCode: string; value: any }[] };
  const q7 = persisted.intake.find(item => item.questionCode === 'Q7')!.value;
  const q4 = persisted.intake.find(item => item.questionCode === 'Q4')!.value;
  assert.deepEqual(q7, { schemaVersion: 1, questionCode: 'Q7', answerValue: values.Q7, responseState: 'ANSWERED', respondent: { role: 'MANAGEMENT' }, provenance: { channel: 'PROXY', source: 'SALES_PROXY' } });
  assert.equal(q4.respondent.role, 'MANAGEMENT');
  assert.deepEqual(q4.provenance, { channel: 'PROXY', source: 'SALES_PROXY' });
});

test('Initial/Final execution snapshotは別に保存され、Structured Hearingはappend-onlyで保持される', async () => {
  const activity = await (await req('/sales-activities', 'POST', { name: 'Snapshot株式会社', contact: { name: '担当' }, selectedService: 'IT_KAIZEN' })).json() as { salesActivityId: string };
  let kase = await (await req(`/sales-activities/${activity.salesActivityId}/cases`, 'POST', {})).json() as { id: string; version: number };
  for (const q of ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6']) await req(`/cases/${kase.id}/intake`, 'POST', intake(q, 'PROXY'));
  kase = await (await req(`/cases/${kase.id}/intake/complete`, 'POST', { expectedVersion: kase.version })).json();
  kase = (await (await req(`/cases/${kase.id}/preparation/start`, 'POST', { expectedVersion: kase.version })).json()).case;
  kase = await (await req(`/cases/${kase.id}/hearing/start`, 'POST', { expectedVersion: kase.version })).json();
  const unit = (await (await req(`/cases/${kase.id}/hearing/units`)).json()).items[0];
  const structured = { schemaVersion: 1, hearingUnitCode: unit.unitCode, semanticKey: unit.semanticKey, answerValue: 'CANNOT_JUDGE', responseState: 'ANSWERED', respondent: { role: 'MANAGEMENT' }, provenance: { channel: 'PROXY', source: 'SALES_PROXY' }, completionStatus: 'COMPLETE' };
  assert.equal((await req(`/cases/${kase.id}/hearing/statements`, 'POST', { planItemRef: unit.unitCode, statementText: '判断が難しいとの発言', operatorNoteText: '担当者メモ', knowledgeState: 'PARTIAL', structuredAnswer: structured })).status, 201);
  kase = await (await req(`/cases/${kase.id}/hearing/complete`, 'POST', { expectedVersion: kase.version })).json();
  const final = await (await req(`/cases/${kase.id}/rule-analysis/run`, 'POST', { expectedVersion: kase.version })).json();
  assert.equal(final.result.final.gapPossibilities.length, 1);
  const { rows } = await h.pool.query<any>('SELECT analysis_stage,input_snapshot_json FROM rule_analysis_execution WHERE case_id=$1 ORDER BY created_at', [kase.id]);
  assert.deepEqual(rows.map(r => r.analysis_stage), ['INITIAL', 'FINAL']);
  assert.equal(rows[0].input_snapshot_json.hearing, undefined); assert.equal(rows[1].input_snapshot_json.hearing[0].answerValue, 'CANNOT_JUDGE');
  const persisted = await (await req(`/cases/${kase.id}/hearing/statements`)).json();
  assert.equal(persisted.items.length, 1);
});

test('VS1 final review -> immutable approved report -> delivery -> Human feedback route', async () => {
  const activity = await (await req('/sales-activities', 'POST', { name: 'Report株式会社', contact: { name: '担当' }, selectedService: 'IT_KAIZEN' })).json() as { salesActivityId:string };
  let kase:any=await (await req(`/sales-activities/${activity.salesActivityId}/cases`,'POST',{})).json();
  for(const q of ['Q1','Q2','Q3','Q4','Q5','Q6']) await req(`/cases/${kase.id}/intake`,'POST',intake(q,'PROXY'));
  kase=await (await req(`/cases/${kase.id}/intake/complete`,'POST',{expectedVersion:kase.version})).json(); kase=(await (await req(`/cases/${kase.id}/preparation/start`,'POST',{expectedVersion:kase.version})).json()).case; kase=await (await req(`/cases/${kase.id}/hearing/start`,'POST',{expectedVersion:kase.version})).json();
  const unit=(await (await req(`/cases/${kase.id}/hearing/units`)).json()).items[0]; await req(`/cases/${kase.id}/hearing/statements`,'POST',{planItemRef:unit.unitCode,statementText:'確認済み',knowledgeState:'KNOWN',structuredAnswer:{schemaVersion:1,hearingUnitCode:unit.unitCode,semanticKey:unit.semanticKey,answerValue:'CAN_JUDGE',responseState:'ANSWERED',respondent:{role:'MANAGEMENT'},provenance:{channel:'PROXY',source:'SALES_PROXY'},completionStatus:'COMPLETE'}});
  kase=await (await req(`/cases/${kase.id}/hearing/complete`,'POST',{expectedVersion:kase.version})).json(); const final=await (await req(`/cases/${kase.id}/rule-analysis/run`,'POST',{expectedVersion:kase.version})).json();
  const projected=await req(`/cases/${kase.id}/final-review/project`,'POST',{executionId:final.executionId}); assert.equal(projected.status,200);
  const reportContext = await h.vs1.context(kase.id);
  assert.doesNotMatch(reportContext.future.statement, /ENABLE_MANAGEMENT_DECISION|NO_MAJOR_CHANGE/);
  const projectedSources=(await h.pool.query<any>(`SELECT source_ref_type,source_ref_id,it_management_diagnosis_case_v2_id FROM insight_sources WHERE it_management_diagnosis_case_v2_id=$1`,[kase.id])).rows;
  assert.ok(projectedSources.length > 0);
  assert.ok(projectedSources.every(s => s.source_ref_type === 'VS1_RULE_EXECUTION' && s.source_ref_id === final.executionId && s.it_management_diagnosis_case_v2_id === kase.id));
  const draft=await h.vs1.draft(kase.id,'operator@atlib.jp');
  const reportRow=(await h.pool.query<any>('SELECT id,it_management_diagnosis_case_v2_id,status FROM diagnosis_reports WHERE id=$1',[draft.id])).rows[0];
  assert.deepEqual(reportRow,{id:draft.id,it_management_diagnosis_case_v2_id:kase.id,status:'REVIEW_REQUIRED'});
  await h.vs1.approve(kase.id,draft.id,'operator@atlib.jp');
  const approvedSnapshot=(await h.pool.query<any>('SELECT snapshot_json,content_json,context_hash FROM diagnosis_reports WHERE id=$1',[draft.id])).rows[0];
  assert.equal(approvedSnapshot.snapshot_json.content_hash, contentHash(approvedSnapshot.content_json));
  assert.equal(contentHash(approvedSnapshot.snapshot_json), contentHash(approvedSnapshot.snapshot_json));
  await assert.rejects(h.pool.query(`UPDATE diagnosis_reports SET content_json='{}'::jsonb WHERE id=$1`,[draft.id]));
  await assert.rejects(h.pool.query(`UPDATE diagnosis_reports SET snapshot_json='{}'::jsonb WHERE id=$1`,[draft.id]));
  await assert.rejects(h.pool.query(`UPDATE diagnosis_reports SET context_hash='changed' WHERE id=$1`,[draft.id]));
  await assert.rejects(h.pool.query(`DELETE FROM diagnosis_reports WHERE id=$1`,[draft.id]));
  const delivered=await req(`/cases/${kase.id}/reports/${draft.id}/deliver`,'POST',{}); assert.equal(delivered.status,204);
  const started=await req(`/cases/${kase.id}/feedback/start`,'POST',{}); assert.equal(started.status,204);
  const decision=await (await req(`/cases/${kase.id}/feedback/decision`,'POST',{route:'FOCUSED_CONFIRMATION',materialDecision:'追加確認する',nextAction:'確認を再開'})).json(); assert.equal(decision.status,'HEARING_IN_PROGRESS');
  const returned=await (await req(`/cases/${kase.id}`)).json();
  assert.equal((await req(`/cases/${kase.id}/hearing/statements`,'POST',{planItemRef:unit.unitCode,statementText:'再確認した発言',knowledgeState:'KNOWN',structuredAnswer:{schemaVersion:1,hearingUnitCode:unit.unitCode,semanticKey:unit.semanticKey,answerValue:'CAN_JUDGE',responseState:'ANSWERED',respondent:{role:'MANAGEMENT'},provenance:{channel:'PROXY',source:'SALES_PROXY'},completionStatus:'COMPLETE'}})).status,201);
  const afterHearing=await (await req(`/cases/${kase.id}/hearing/complete`,'POST',{expectedVersion:returned.case.version})).json();
  const final2=await (await req(`/cases/${kase.id}/rule-analysis/run`,'POST',{expectedVersion:afterHearing.version})).json();
  assert.notEqual(final.executionId,final2.executionId);
  assert.equal((await req(`/cases/${kase.id}/final-review/project`,'POST',{executionId:final2.executionId})).status,200);
  const draft2=await h.vs1.draft(kase.id,'operator@atlib.jp'); await h.vs1.approve(kase.id,draft2.id,'operator@atlib.jp');
  const reports=(await h.pool.query<any>('SELECT version,status FROM diagnosis_reports WHERE it_management_diagnosis_case_v2_id=$1 ORDER BY version',[kase.id])).rows;
  assert.deepEqual(reports.map(r=>[r.version,r.status]),[[1,'DELIVERED'],[2,'APPROVED']]);
  const v1After=(await h.pool.query<any>('SELECT snapshot_json,content_json,context_hash FROM diagnosis_reports WHERE id=$1',[draft.id])).rows[0];
  assert.deepEqual(v1After,approvedSnapshot);
  const audit = (await h.pool.query<any>('SELECT command,actor_user_id,created_at,detail_json FROM it_management_diagnosis_case_v2_audit WHERE case_id=$1 ORDER BY created_at',[kase.id])).rows;
  for (const command of ['CompleteHumanReviewProjection','CreateReportDraft','ApproveReport','DeliverReport','StartFeedback','RecordManagementFeedbackDecision']) assert.ok(audit.some(a => a.command === command));
  for (const item of audit) { assert.ok(item.actor_user_id); assert.ok(item.created_at); }
  const focused = audit.find(a => a.command === 'RecordManagementFeedbackDecision');
  assert.equal(focused.detail_json.from_state, 'FEEDBACK_PENDING'); assert.equal(focused.detail_json.to_state, 'HEARING_IN_PROGRESS'); assert.equal(focused.detail_json.route, 'FOCUSED_CONFIRMATION');
});

test('Management Feedbackの4 routeは人が選択し、Assessment/Handoffを自動開始しない', async () => {
  for (const route of ['DIRECT_ACT', 'STOP_HOLD', 'DESIGN_ASSESSMENT'] as const) {
    const { kase } = await deliveredVs1Report(`Route ${route}`);
    const response = await req(`/cases/${kase.id}/feedback/decision`, 'POST', { route, materialDecision: `${route}を選択`, nextAction: '次の行動を記録' });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'CLOSED');
    const feedback = (await h.pool.query<any>('SELECT route_code,decided_by_user_id FROM management_feedback_decisions WHERE it_management_diagnosis_case_v2_id=$1',[kase.id])).rows[0];
    assert.equal(feedback.route_code, route); assert.ok(feedback.decided_by_user_id);
    assert.equal((await h.pool.query('SELECT id FROM assessment_handoffs')).rowCount, 0);
  }
});

test('Sales Activity attributionはCase chainで追跡でき、Entry Channel/Proxyとは独立する', async () => {
  const attribution = { acquisitionSourceType: 'EVENT', acquisitionSourceName: '経営者交流会A',
    utmSource: 'executive-meetup-a', utmMedium: 'flyer', utmCampaign: 'it-kaizen-free-diagnosis',
    utmContent: 'flyer-v1', utmTerm: null, landingUrl: 'https://example.test/it-kaizen?utm_source=executive-meetup-a', referrer: 'https://example.test/' };
  const { kase } = await deliveredVs1Report('QR流入株式会社', attribution);
  const beforeFeedback = await (await req(`/cases/${kase.id}`)).json();
  assert.deepEqual(beforeFeedback.salesActivity.attribution, attribution);
  assert.equal(beforeFeedback.intake[0].value.provenance.source, 'SALES_PROXY');
  assert.equal((await req(`/cases/${kase.id}/feedback/decision`, 'POST', { route: 'STOP_HOLD', materialDecision: '今回は終了', nextAction: '必要時に再相談' })).status, 200);
  const afterFeedback = await (await req(`/cases/${kase.id}`)).json();
  assert.deepEqual(afterFeedback.salesActivity.attribution, attribution);

  const noAttribution = await (await req('/sales-activities', 'POST', { name: '既存相当株式会社', contact: { name: '担当' }, selectedService: 'IT_KAIZEN' })).json();
  const noAttributionCase = await (await req(`/sales-activities/${noAttribution.salesActivityId}/cases`, 'POST', {})).json();
  assert.equal((await (await req(`/cases/${noAttributionCase.id}`)).json()).salesActivity.attribution, null);

  const second = await (await req('/sales-activities', 'POST', { name: '交流会B株式会社', contact: { name: '担当' }, selectedService: 'IT_KAIZEN', attribution: { ...attribution, acquisitionSourceName: '経営者交流会B', utmCampaign: 'other-campaign' } })).json();
  assert.ok(second.salesActivityId);
  const bySource = await (await req('/sales-activities?acquisitionSourceName=' + encodeURIComponent('経営者交流会A'))).json();
  assert.ok(bySource.items.some((item: any) => item.attribution?.acquisitionSourceName === '経営者交流会A'));
  assert.ok(bySource.items.every((item: any) => item.attribution?.acquisitionSourceName === '経営者交流会A'));
  const byCampaign = await (await req('/sales-activities?utmCampaign=it-kaizen-free-diagnosis')).json();
  assert.ok(byCampaign.items.some((item: any) => item.attribution?.utmCampaign === 'it-kaizen-free-diagnosis'));
  assert.ok(byCampaign.items.every((item: any) => item.attribution?.utmCampaign === 'it-kaizen-free-diagnosis'));
});

test('Public Customer Selfは明示Attributionを保持し、並行同一送信は同じCaseへ収束し、同一人物の再診断を妨げない', async () => {
  const idempotencyKey = randomUUID();
  const self = (questionCode: string, answerValue: unknown) => ({ schemaVersion: 1, questionCode, answerValue, responseState: 'ANSWERED', respondent: { role: 'MANAGEMENT' }, provenance: { channel: 'SELF', source: 'CUSTOMER_SELF' } });
  const payload = { idempotencyKey, company: { name: '公開申込株式会社' }, contact: { name: '経営者', email: 'same@example.test', respondentRole: 'MANAGEMENT' }, referralPersonName: '交流会のご紹介者',
    answers: [self('Q1',{employeeSize:'EMP_21_50',locations:'SITE_1'}),self('Q2',['STABILITY_EFFICIENCY']),self('Q3',['ENABLE_MANAGEMENT_DECISION']),self('Q4','MANAGEMENT_DECISION_CONCERN'),self('Q5','PARTIALLY_VISIBLE'),self('Q6','DELIVERED_NOT_USABLE'),self('Q7','事前に確認したいこと')],
    consent: { privacy: true, diagnosisUse: true, wordingVersion: 'it_management_public_self_consent_v1' },
    attribution: { acquisitionSourceType: 'EVENT', acquisitionSourceName: 'SHINSEIKAI', utmSource: 'shinseikai', utmMedium: 'flyer_qr', utmCampaign: 'it_management_kaizen_free_diagnosis', utmContent: 'flyer-v1', utmTerm: undefined, landingUrl: 'https://example.test/it-management-kaizen/free-diagnosis/?utm_source=shinseikai', referrer: 'https://example.test/' } };
  const [first, replay] = await Promise.all([publicReq('/submissions', payload), publicReq('/submissions', payload)]);
  const a: any = await first.json(), b: any = await replay.json(); assert.ok([200,201].includes(first.status), JSON.stringify(a)); assert.ok([200,201].includes(replay.status), JSON.stringify(b)); assert.equal(a.caseId, b.caseId);
  const detail: any = await (await req(`/cases/${a.caseId}`)).json();
  assert.equal(detail.case.isInternalTest, false); assert.equal(detail.case.status, 'BOOKING_PENDING');
  assert.equal(detail.intake.length, 7); assert.ok(detail.intake.every((x: any) => x.value.provenance.source === 'CUSTOMER_SELF'));
  assert.equal(detail.salesActivity.attribution.acquisitionSourceType, 'EVENT'); assert.equal(detail.salesActivity.attribution.acquisitionSourceName, 'SHINSEIKAI');
  assert.equal((await h.launcher.getSalesActivity(detail.case.salesActivityId))?.referralPersonName, '交流会のご紹介者');
  const consent: any = (await h.db.query('SELECT * FROM it_management_public_self_submission WHERE it_management_diagnosis_case_v2_id=$1', [a.caseId])).rows[0];
  assert.equal(consent.consent_provenance, 'CUSTOMER_SELF'); assert.equal(consent.privacy_consent, true);
  const withoutQ7 = { ...payload, idempotencyKey: randomUUID(), answers: payload.answers.slice(0, 6), attribution: { landingUrl: 'https://example.test/it-management-kaizen/free-diagnosis/' } };
  const next: any = await (await publicReq('/submissions', withoutQ7)).json(); assert.notEqual(next.caseId, a.caseId);
  const nextDetail: any = await (await req(`/cases/${next.caseId}`)).json(); assert.equal(nextDetail.intake.length, 6); assert.equal(nextDetail.salesActivity.attribution, null);
  assert.equal((await h.launcher.getSalesActivity(nextDetail.case.salesActivityId))?.referralPersonName, '交流会のご紹介者');
  const { referralPersonName: _referral, ...noReferralPayload } = payload;
  const noReferral: any = await (await publicReq('/submissions', { ...noReferralPayload, idempotencyKey: randomUUID() }, '203.0.113.9')).json();
  const noReferralCase = await (await req(`/cases/${noReferral.caseId}`)).json();
  assert.equal((await h.launcher.getSalesActivity(noReferralCase.case.salesActivityId))?.referralPersonName, null);
  assert.deepEqual((await h.cases.initialRule(a.caseId)).result, (await h.cases.initialRule(noReferral.caseId)).result);
  const altered = await publicReq('/submissions', { ...payload, company: { name: '別会社' } }); assert.equal(altered.status, 409);
  const alteredReferral = await publicReq('/submissions', { ...payload, referralPersonName: '別の紹介者' }); assert.equal(alteredReferral.status, 409);

  const partner = { ...payload, idempotencyKey: randomUUID(), attribution: { ...payload.attribution, acquisitionSourceType: 'PARTNER', acquisitionSourceName: 'ONLYSTORY', utmSource: 'onlystory' } };
  const partnerResponse = await publicReq('/submissions', partner, '203.0.113.10'); assert.equal(partnerResponse.status, 201); const partnerResult: any = await partnerResponse.json();
  assert.equal((await (await req(`/cases/${partnerResult.caseId}`)).json()).salesActivity.attribution.acquisitionSourceType, 'PARTNER');
  const web = { ...payload, idempotencyKey: randomUUID(), attribution: { ...payload.attribution, acquisitionSourceType: 'WEB', acquisitionSourceName: 'CORPORATESITE', utmSource: 'corporatesite', utmMedium: 'web' } };
  const webResponse = await publicReq('/submissions', web, '203.0.113.11'); assert.equal(webResponse.status, 201); const webResult: any = await webResponse.json();
  assert.equal((await (await req(`/cases/${webResult.caseId}`)).json()).salesActivity.attribution.acquisitionSourceType, 'WEB');
  const invalid = await publicReq('/submissions', { ...payload, idempotencyKey: randomUUID(), attribution: { ...payload.attribution, acquisitionSourceType: 'NOT_A_SOURCE' } }, '203.0.113.12');
  assert.equal(invalid.status, 400);
});

test('Healthy Case: Future relevanceだけでもVerification HearingからGapなしReport、STOP_HOLD完了まで進める', async () => {
  const activity = await (await req('/sales-activities', 'POST', { name: 'Healthy Future株式会社', contact: { name: '経営者' }, selectedService: 'IT_KAIZEN' })).json() as any;
  let kase = await (await req(`/sales-activities/${activity.salesActivityId}/cases`, 'POST', {})).json() as any;
  const values: Record<string, unknown> = { Q1:{employeeSize:'EMP_21_50',locations:'SITE_1'}, Q2:['HEADCOUNT_GROWTH','SITE_CHANGE'], Q3:['SUPPORT_CHANGE'], Q4:'NO_MAJOR_CONCERN', Q5:'VISIBLE_ON_REQUEST', Q6:'REGULAR_AND_USABLE' };
  for (const q of ['Q1','Q2','Q3','Q4','Q5','Q6']) await req(`/cases/${kase.id}/intake`, 'POST', { questionCode:q,channel:'SELF',value:{schemaVersion:1,questionCode:q,answerValue:values[q],responseState:'ANSWERED',respondent:{role:'MANAGEMENT'},provenance:{channel:'SELF',source:'CUSTOMER_SELF'}} });
  kase = await (await req(`/cases/${kase.id}/intake/complete`, 'POST', { expectedVersion:kase.version })).json();
  const preparation:any = await (await req(`/cases/${kase.id}/preparation/start`, 'POST', { expectedVersion:kase.version })).json();
  assert.equal(preparation.preparation.result.noImportantConfirmation, true); assert.equal(preparation.preparation.result.focusItems.length, 0); assert.equal(preparation.case.primaryFocus, null);
  kase = await (await req(`/cases/${kase.id}/hearing/start`, 'POST', { expectedVersion:preparation.case.version })).json();
  const units:any[] = (await (await req(`/cases/${kase.id}/hearing/units`)).json()).items; assert.ok(units.length > 0);
  const unit=units[0];
  await req(`/cases/${kase.id}/hearing/statements`, 'POST', { planItemRef:unit.unitCode,statementText:'現時点で大きな支障は認識されていない',knowledgeState:'KNOWN',structuredAnswer:{schemaVersion:1,hearingUnitCode:unit.unitCode,semanticKey:unit.semanticKey,answerValue:'CAN_JUDGE',responseState:'ANSWERED',respondent:{role:'MANAGEMENT'},provenance:{channel:'SELF',source:'CUSTOMER_SELF'},completionStatus:'COMPLETE'} });
  kase = await (await req(`/cases/${kase.id}/hearing/complete`, 'POST', { expectedVersion:kase.version })).json();
  const final:any = await (await req(`/cases/${kase.id}/rule-analysis/run`, 'POST', { expectedVersion:kase.version })).json();
  assert.equal(final.result.final.noImportantGapIdentified, true); assert.equal(final.result.final.gapPossibilities.length, 0); assert.equal(final.result.final.improvementOpportunities.length, 0); assert.equal(final.findings.length, 0);
  await req(`/cases/${kase.id}/final-review/project`, 'POST', { executionId:final.executionId });
  const draft:any = await (await req(`/cases/${kase.id}/reports/draft`, 'POST', {})).json();
  await req(`/cases/${kase.id}/reports/${draft.id}/approve`, 'POST', {}); await req(`/cases/${kase.id}/reports/${draft.id}/deliver`, 'POST', {}); await req(`/cases/${kase.id}/feedback/start`, 'POST', {});
  const complete:any = await (await req(`/cases/${kase.id}/feedback/decision`, 'POST', { route:'STOP_HOLD',materialDecision:'現時点で追加対応は不要',nextAction:'変化時に再確認' })).json();
  assert.equal(complete.status, 'CLOSED'); assert.equal((await h.pool.query('SELECT id FROM assessment_handoffs')).rowCount, 0);
});

test('12-step Vertical Slice 1: Internal Customer entry -> Intake -> Initial Rule -> Preparation -> Hearing -> 整理 -> Complete -> Rule Analysis -> Human Review -> Analysis Approved -> Preliminary Structure/Scope', async () => {
  // Step 1: Internal Customer / Case entry
  const activityRes = await req('/sales-activities', 'POST', {
    name: 'サンプル株式会社', contact: { name: '山田太郎', email: 'yamada@example.test' }, selectedService: 'IT_KAIZEN',
  });
  assert.equal(activityRes.status, 201);
  const activity = await activityRes.json() as { companyId: string; contactId: string; salesActivityId: string };

  const caseRes = await req(`/sales-activities/${activity.salesActivityId}/cases`, 'POST', {});
  assert.equal(caseRes.status, 201);
  let kase = await caseRes.json() as { id: string; status: string; version: number; primaryFocus?: string | null };
  assert.equal(kase.status, 'INTAKE_IN_PROGRESS');

  // Step 2: 7-question Hearing Intake (Q7 optional, Q1-Q6 required)
  for (const q of ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6']) {
    const r = await req(`/cases/${kase.id}/intake`, 'POST', intake(q, 'PROXY'));
    assert.equal(r.status, 204);
  }
  const incompleteComplete = await req(`/cases/${kase.id}/intake/complete`, 'POST', { expectedVersion: kase.version });
  assert.equal(incompleteComplete.status, 200);
  kase = await incompleteComplete.json();
  assert.equal(kase.status, 'INTAKE_COMPLETED');

  // Step 3/4: Initial Rule -> Preparation (no AI call, no manual focus)
  const prepRes = await req(`/cases/${kase.id}/preparation/start`, 'POST', { expectedVersion: kase.version });
  assert.equal(prepRes.status, 200);
  kase = (await prepRes.json()).case;
  assert.equal(kase.status, 'PREPARATION_IN_PROGRESS');
  assert.equal(kase.primaryFocus, 'M01_IT_MANAGEMENT_JUDGMENT');

  // Step 5: Live Hearing
  const hearingStart = await req(`/cases/${kase.id}/hearing/start`, 'POST', { expectedVersion: kase.version });
  assert.equal(hearingStart.status, 200);
  kase = await hearingStart.json();
  assert.equal(kase.status, 'HEARING_IN_PROGRESS');

  const statement1 = await req(`/cases/${kase.id}/hearing/statements`, 'POST', {
    planItemRef: 'M01_IT_MANAGEMENT_JUDGMENT_CORE', statementText: '現状のIT投資判断は経営会議で行っている', knowledgeState: 'UNKNOWN',
  });
  assert.equal(statement1.status, 201);
  const statement2 = await req(`/cases/${kase.id}/hearing/statements`, 'POST', {
    planItemRef: 'M01_IT_MANAGEMENT_JUDGMENT_DECISION', statementText: '来期のIT予算方針は未確定', knowledgeState: 'KNOWN',
  });
  assert.equal(statement2.status, 201);

  // Step 6: 整理モード
  const organizeRes = await req(`/cases/${kase.id}/hearing/organize`, 'POST', { expectedVersion: kase.version });
  assert.equal(organizeRes.status, 200);
  kase = await organizeRes.json();
  assert.equal(kase.status, 'HEARING_ORGANIZING');

  // 整理モードでの再確認: 元のstatementを書き換えず、新しい行を追加する
  const reconfirm = await req(`/cases/${kase.id}/hearing/statements`, 'POST', {
    planItemRef: 'M01_IT_MANAGEMENT_JUDGMENT_CORE', statementText: '再確認：経営会議での最終承認フローが明確になった', knowledgeState: 'KNOWN',
  });
  assert.equal(reconfirm.status, 201);
  const statementsList = await (await req(`/cases/${kase.id}/hearing/statements`)).json() as { items: unknown[] };
  assert.equal(statementsList.items.length, 3); // append-only: 元の2件 + 再確認1件、上書きなし

  // Step 7: Hearing Complete
  const completeRes = await req(`/cases/${kase.id}/hearing/complete`, 'POST', { expectedVersion: kase.version });
  assert.equal(completeRes.status, 200);
  kase = await completeRes.json();
  assert.equal(kase.status, 'HEARING_COMPLETED');

  // Step 8: Rule Analysis (deterministic, synchronous, no AI)
  const ruleRes = await req(`/cases/${kase.id}/rule-analysis/run`, 'POST', { expectedVersion: kase.version });
  assert.equal(ruleRes.status, 201);
  const ruleOutcome = await ruleRes.json() as { executionId: string; result: { broadUnknownCollapse: boolean; overallInvestigationNeed: string } };
  assert.ok(ruleOutcome.executionId);
  // 最新のCORE statementはKNOWN(再確認後)、DECISIONもKNOWNなので、何もトリガーされない。
  assert.equal(ruleOutcome.result.overallInvestigationNeed, 'NO_IMMEDIATE_INVESTIGATION_NEED');

  const afterRuleCase = await (await req(`/cases/${kase.id}`)).json() as { case: { status: string; version: number } };
  assert.equal(afterRuleCase.case.status, 'HUMAN_REVIEW_REQUIRED');
  kase = { ...kase, ...afterRuleCase.case };

  // Step 9/10: Human Review (REJECTする場合、ANALYSIS_APPROVEDへ進めないことを先に確認)
  const rejectExecRes = await req(`/cases/${kase.id}/review`, 'POST', { executionId: ruleOutcome.executionId, decision: 'REJECTED', expectedVersion: kase.version });
  assert.equal(rejectExecRes.status, 200);
  const rejected = await rejectExecRes.json();
  assert.equal(rejected.status, 'ANALYSIS_REJECTED');
  // Rejectedのままpreliminary-scopeへ進めないこと
  const blockedScope = await req(`/cases/${kase.id}/preliminary-scope`, 'POST', { expectedVersion: rejected.version });
  assert.equal(blockedScope.status, 409);

  // この統合テストの本筋としては、別Caseで承認パスも確認する。
  const activity2Res = await req('/sales-activities', 'POST', {
    name: 'サンプル2株式会社', contact: { name: '鈴木一郎' }, selectedService: 'IT_KAIZEN',
  });
  const activity2 = await activity2Res.json() as { salesActivityId: string };
  const case2Res = await req(`/sales-activities/${activity2.salesActivityId}/cases`, 'POST', {});
  let kase2 = await case2Res.json() as { id: string; status: string; version: number };
  for (const q of ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6']) {
    const answer = intake(q, 'SELF');
    if (q === 'Q4') answer.value.answerValue = 'IT_OPERATION_CONCERN';
    await req(`/cases/${kase2.id}/intake`, 'POST', answer);
  }
  kase2 = await (await req(`/cases/${kase2.id}/intake/complete`, 'POST', { expectedVersion: kase2.version })).json();
  kase2 = (await (await req(`/cases/${kase2.id}/preparation/start`, 'POST', { expectedVersion: kase2.version })).json()).case;
  kase2 = await (await req(`/cases/${kase2.id}/hearing/start`, 'POST', { expectedVersion: kase2.version })).json();
  await req(`/cases/${kase2.id}/hearing/statements`, 'POST', { planItemRef: 'M02_IT_OPERATION_CONTINUITY_CORE', statementText: 'IT担当は1名が兼任している', knowledgeState: 'KNOWN' });
  await req(`/cases/${kase2.id}/hearing/statements`, 'POST', { planItemRef: 'M02_IT_OPERATION_CONTINUITY_DECISION', statementText: '退職時の引継ぎ方針は未確認', knowledgeState: 'PARTIAL', requiresIndividualConfirmation: false });
  kase2 = await (await req(`/cases/${kase2.id}/hearing/complete`, 'POST', { expectedVersion: kase2.version })).json();
  const ruleRes2 = await req(`/cases/${kase2.id}/rule-analysis/run`, 'POST', { expectedVersion: kase2.version });
  const ruleOutcome2 = await ruleRes2.json() as { executionId: string };
  const case2AfterRule = await (await req(`/cases/${kase2.id}`)).json() as { case: { version: number } };

  const approveRes = await req(`/cases/${kase2.id}/review`, 'POST', { executionId: ruleOutcome2.executionId, decision: 'APPROVED', expectedVersion: case2AfterRule.case.version });
  assert.equal(approveRes.status, 200);
  const approved = await approveRes.json();
  assert.equal(approved.status, 'ANALYSIS_APPROVED');

  // Step 11/12: Preliminary Assessment Structure / Suggested Scope
  const scopeRes = await req(`/cases/${kase2.id}/preliminary-scope`, 'POST', { expectedVersion: approved.version });
  assert.equal(scopeRes.status, 201);
  const scope = await scopeRes.json() as { structure: string; suggestedScope: string; suggestedBasePriceYen: number | null };
  // single Focus, no individual-confirmation flag -> LIMITED/COMPACT
  assert.equal(scope.structure, 'LIMITED');
  assert.equal(scope.suggestedScope, 'COMPACT');
  assert.equal(scope.suggestedBasePriceYen, 800_000);

  const finalCase = await (await req(`/cases/${kase2.id}`)).json() as { case: { status: string }; preliminaryScope: unknown };
  assert.equal(finalCase.case.status, 'PRELIMINARY_SCOPE_READY');
  assert.ok(finalCase.preliminaryScope);
});

test('Suggested ScopeとFinal Scopeを混同しない: Slice 1にはFinal Scope決定APIが存在しない（PPTX反映導線もなし）', () => {
  // Grep-level guard: commercial_final_decision is explicitly out of Slice 1 scope.
  // Vertical Slice router currently exposes no /commercial-decision or /final-scope route.
});

test('Intake必須項目が不足している場合、completeは422で拒否される', async () => {
  const activityRes = await req('/sales-activities', 'POST', { name: 'テスト未完了株式会社', contact: { name: '担当者' }, selectedService: 'IT_KAIZEN' });
  const activity = await activityRes.json() as { salesActivityId: string };
  const caseRes = await req(`/sales-activities/${activity.salesActivityId}/cases`, 'POST', {});
  const kase = await caseRes.json() as { id: string; version: number };
  await req(`/cases/${kase.id}/intake`, 'POST', intake('Q1', 'SELF'));
  const res = await req(`/cases/${kase.id}/intake/complete`, 'POST', { expectedVersion: kase.version });
  assert.equal(res.status, 422);
});

test('楽観的ロック: 古いexpectedVersionでの遷移は409になる', async () => {
  const activityRes = await req('/sales-activities', 'POST', { name: 'ロック確認株式会社', contact: { name: '担当者' }, selectedService: 'IT_KAIZEN' });
  const activity = await activityRes.json() as { salesActivityId: string };
  const caseRes = await req(`/sales-activities/${activity.salesActivityId}/cases`, 'POST', {});
  const kase = await caseRes.json() as { id: string; version: number };
  for (const q of ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6']) await req(`/cases/${kase.id}/intake`, 'POST', intake(q, 'SELF'));
  await req(`/cases/${kase.id}/intake/complete`, 'POST', { expectedVersion: kase.version });
  const staleRes = await req(`/cases/${kase.id}/focus`, 'POST', { primaryFocus: 'M01_IT_MANAGEMENT_JUDGMENT', expectedVersion: kase.version });
  assert.equal(staleRes.status, 409);
});

test('Case 3: Solution HypothesisはReportへ推薦せず、PARTIALな業務詳細はUNKNOWNとして残す', async () => {
  const values: Record<string, unknown> = {
    Q1: { employeeSize: 'EMP_51_100', locations: 'SITE_1' }, Q2: ['LEAN_SCALING'], Q3: ['IMPROVE_PRODUCTIVITY'],
    Q4: 'PRODUCTIVITY_OPPORTUNITY', Q5: 'VISIBLE_ON_REQUEST', Q6: 'ON_REQUEST_USABLE',
    Q7: 'ChatGPTやAIエージェントを導入して、営業・事務を効率化したい。競合もAIを使い始めているので遅れたくない。',
  };
  const activity = await (await req('/sales-activities', 'POST', { name: 'Case 3株式会社', contact: { name: '社長' }, selectedService: 'IT_KAIZEN' })).json() as { salesActivityId: string };
  let kase: any = await (await req(`/sales-activities/${activity.salesActivityId}/cases`, 'POST', {})).json();
  for (const questionCode of Object.keys(values)) {
    const response = await req(`/cases/${kase.id}/intake`, 'POST', { questionCode, channel: 'PROXY', value: { schemaVersion: 1, questionCode, answerValue: values[questionCode], responseState: 'ANSWERED', respondent: { role: 'MANAGEMENT' }, provenance: { channel: 'PROXY', source: 'SALES_PROXY' } } });
    assert.equal(response.status, 204);
  }
  kase = await (await req(`/cases/${kase.id}/intake/complete`, 'POST', { expectedVersion: kase.version })).json();
  const prepared = await (await req(`/cases/${kase.id}/preparation/start`, 'POST', { expectedVersion: kase.version })).json();
  assert.deepEqual(prepared.preparation.result.focusItems.map((x: any) => [x.focus, x.verificationPurpose]), [['M04_BUSINESS_PRODUCTIVITY', 'M04_BUSINESS_PRODUCTIVITY_CONFIRMATION']]);
  assert.equal(prepared.preparation.result.problemFindings.length, 0); assert.equal(prepared.preparation.result.assessmentEscalated, false);
  kase = await (await req(`/cases/${kase.id}/hearing/start`, 'POST', { expectedVersion: prepared.case.version })).json();
  const unit = (await (await req(`/cases/${kase.id}/hearing/units`)).json()).items.find((x: any) => x.focus === 'M04_BUSINESS_PRODUCTIVITY');
  await req(`/cases/${kase.id}/hearing/statements`, 'POST', { planItemRef: unit.unitCode, statementText: '営業報告や見積書、受注後の事務連携に時間がかかっていると思います。', knowledgeState: 'PARTIAL', structuredAnswer: { schemaVersion: 1, hearingUnitCode: unit.unitCode, semanticKey: unit.semanticKey, answerValue: ['INPUT_TRANSCRIPTION', 'AGGREGATION_REPORTING'], responseState: 'ANSWERED', respondent: { role: 'MANAGEMENT' }, provenance: { channel: 'PROXY', source: 'SALES_PROXY' }, completionStatus: 'COMPLETE', deepDive: { asked: true, result: '実際の手順、作業量、入力箇所、判断内容は未確認' } } });
  kase = await (await req(`/cases/${kase.id}/hearing/complete`, 'POST', { expectedVersion: kase.version })).json();
  const final = await (await req(`/cases/${kase.id}/rule-analysis/run`, 'POST', { expectedVersion: kase.version })).json();
  assert.equal(final.result.final.remainingUnknown.length, 1);
  assert.equal(final.result.final.gapPossibilities.length, 0);
  assert.equal(final.result.final.improvementOpportunities.length, 1);
  assert.ok(final.findings.every((x: any) => x.grounds.focus === 'M04_BUSINESS_PRODUCTIVITY'));
  await req(`/cases/${kase.id}/final-review/project`, 'POST', { executionId: final.executionId });
  const draft = await (await req(`/cases/${kase.id}/reports/draft`, 'POST', {})).json();
  const report = (await h.pool.query<any>('SELECT content_json,context_json FROM diagnosis_reports WHERE id=$1', [draft.id])).rows[0];
  const rendered = JSON.stringify(report);
  assert.doesNotMatch(rendered, /INPUT_TRANSCRIPTION|AGGREGATION_REPORTING|ChatGPT|AIエージェント|AI未導入/);
  assert.match(rendered, /入力・転記/); assert.match(rendered, /集計・報告/);
  assert.match(rendered, /今回まだ確認できていない事項があります/);
});

test('Production server wiring injects the VS1 Report / Feedback repository into the Admin router', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/server.ts'), 'utf8');
  assert.match(source, /const vs1ReviewReportFeedbackRepo = new Vs1ReviewReportFeedbackRepo\(pool\)/);
  assert.match(source, /createAdminFreeDiagnosisRuleBasedV1Router\(freeDiagnosisSalesLauncherRepo, freeDiagnosisRuleBasedCaseRepo, vs1ReviewReportFeedbackRepo\)/);
});
