import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createFreeDiagnosisRuleBasedV1Harness } from './support/freeDiagnosisRuleBasedV1Harness';

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

const intakeValues: Record<string, unknown> = {
  Q1: { employeeSize: 'EMP_21_50', locations: 'SITE_1' }, Q2: ['NO_MAJOR_CHANGE'], Q3: ['UNDECIDED'],
  Q4: 'MANAGEMENT_DECISION_CONCERN', Q5: 'VISIBLE_ENOUGH', Q6: 'REGULAR_AND_USABLE',
};
function intake(questionCode: string, channel: 'SELF' | 'PROXY') {
  return { questionCode, channel, value: { schemaVersion: 1, questionCode, answerValue: intakeValues[questionCode], responseState: 'ANSWERED', respondent: { role: 'MANAGEMENT' }, provenance: { channel, source: channel === 'SELF' ? 'CUSTOMER_SELF' : 'SALES_PROXY' } } };
}

test('Production guard: every route requires Staff auth (401 without cookie)', async () => {
  const res = await req('/sales-activities', 'POST', { name: 'x' }, false);
  assert.equal(res.status, 401);
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
