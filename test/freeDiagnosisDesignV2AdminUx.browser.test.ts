import { test, expect } from '@playwright/test';
import express from 'express';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

let server: ReturnType<express.Express['listen']>;
let url: string;

test.beforeAll(async () => {
  const app = express();
  app.use('/admin', express.static(path.resolve(__dirname, '../public/admin')));
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
test.afterAll(async () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

const content = {
  future: { heading: '目指している会社の姿', entries: ['少人数で成長する'] },
  currentUnderstanding: { heading: '現在の理解', entries: ['一部を把握している'] },
  confirmationAndImprovement: { heading: '改善可能性', entries: ['確認する価値があります'] },
  unknowns: { heading: 'まだ確認できていないこと', entries: ['業務の詳細'] },
  nextFacts: { heading: '次に確認すること', entries: ['情報の流れ'] },
};

function workspace(overrides: any = {}) {
  return {
    case: { id: '11111111-1111-4111-8111-111111111111' },
    originalSurvey: { answers: {
      q1CompanyContext: { employeeRange: 'EMP_21_50', siteRange: 'SITE_1' },
      q2Future: ['BUSINESS_GROWTH', 'LEAN_GROWTH'], q3ItExpectations: ['PRODUCTIVITY', 'MANAGEMENT_DECISION_SUPPORT'],
      q4CurrentInterest: 'MANAGEMENT_DECISION', q5Visibility: 'VISIBLE_PARTIAL', q6ManagementConnection: 'REPORTED_NOT_DECISION_USABLE', q7InterestThemes: ['AUTOMATION'],
    } },
    hearingRecords: [{ statementText: '<img src=x onerror=alert(1)>確認した内容', planItemRef: null, recordedAt: '2026-10-11T00:00:00Z' }],
    currentCompanyContext: { employeeRange: 'EMP_21_50', siteRange: 'SITE_1' },
    currentStructuredState: {
      q2Future: ['BUSINESS_GROWTH', 'LEAN_GROWTH'], q3ItExpectations: ['PRODUCTIVITY', 'MANAGEMENT_DECISION_SUPPORT'],
      q4CurrentInterest: 'MANAGEMENT_DECISION', q5Visibility: 'VISIBLE_PARTIAL', q6ManagementConnection: 'REPORTED_NOT_DECISION_USABLE', q7InterestThemes: ['AUTOMATION'],
    },
    currentStateRevision: { id: 'state-1', revisionNo: 1 },
    currentStateDiffFromOriginal: { q1CompanyContext: { status: 'UNCHANGED' }, q2Future: { status: 'UNCHANGED' }, q3ItExpectations: { status: 'UNCHANGED' }, q4CurrentInterest: { status: 'UNCHANGED' }, q5Visibility: { status: 'UNCHANGED' }, q6ManagementConnection: { status: 'UNCHANGED' }, q7InterestThemes: { status: 'UNCHANGED' } },
    latestAnalysisResult: { analysis: {
      futureUnderstanding: [{ id: 'future', text: '成長したい' }], currentUnderstanding: [{ id: 'current', text: '一部を把握' }],
      lensFindings: [{ id: 'theme-1', text: '情報の流れを確認する価値', lenses: ['TECHNOLOGY', 'OPERATION', 'MANAGEMENT'] }], unknowns: [{ id: 'unknown-1', text: 'まだ確認できていない', lenses: ['OPERATION'] }],
      hearingViewpoints: [{ id: 'theme-1', label: '情報が判断へ届く流れ', whyUseful: '経営判断とのつながりを確認するため', lenses: ['OPERATION', 'MANAGEMENT'], exampleQuestions: ['どの情報を確認していますか？'] }],
      factCandidates: [{ id: 'fact-1', whatToVerify: '共有内容', whyItMattersToFuture: '成長を支えるため', whatMayBecomeKnowable: '改善可能性', lenses: ['MANAGEMENT'] }], healthyGuard: { noImportantGapIdentified: false },
    } },
    traceability: { viewpoints: [{ id: 'theme-1', relatedQuestionCodes: ['Q4', 'Q6'] }], analysisItemThemes: { 'theme-1': ['theme-1'], 'unknown-1': ['theme-1'], 'fact-1': ['theme-1'] }, narrativeSectionThemes: { confirmationAndImprovement: ['theme-1'], unknowns: ['theme-1'], nextFacts: ['theme-1'] } },
    latestGeneratedNarrative: { id: '22222222-2222-4222-8222-222222222222', content }, latestHumanEditedNarrative: null, humanEditedNarrativeStatus: 'NONE', analysisFreshness: 'CURRENT', ...overrides,
  };
}

async function routeWorkspace(page: any, state: { value: any }) {
  await page.route('**/design-v2/post-hearing-analysis', (route: any) => route.fulfill({ json: state.value }));
}

test('Live Hearing remains a separate theme memo workspace', async ({ page }) => {
  const state = { value: workspace() }; const memoBodies: any[] = [];
  await routeWorkspace(page, state);
  await page.route('**/hearing/statements', async (route: any) => { memoBodies.push(route.request().postDataJSON()); await route.fulfill({ status: 201, json: { id: 'memo-1' } }); });
  await page.goto(`${url}/admin/free-diagnosis-v2-hearing.html?caseId=${state.value.case.id}`);
  await expect(page.getByRole('heading', { name: '今回確認したいこと' })).toBeVisible();
  await expect(page.locator('#viewpoints .viewpoint')).toHaveCount(1);
  await page.locator('.theme-memo').fill('ヒアリングで確認したメモ'); await page.locator('#saveMemos').click();
  await expect.poll(() => memoBodies).toHaveLength(1);
  expect(memoBodies[0]).toMatchObject({ statementText: 'ヒアリングで確認したメモ', planItemRef: 'design-v2-viewpoint:theme-1' });
  expect(memoBodies[0].structuredAnswer).toBeUndefined();
});

test('Post-Hearing makes the five diagnostic results the primary Human Review', async ({ page }) => {
  const state = { value: workspace() }; await routeWorkspace(page, state);
  await page.goto(`${url}/admin/free-diagnosis-v2-analysis.html?caseId=${state.value.case.id}`);
  await expect(page.getByRole('heading', { name: '診断結果の確認・整理' })).toBeVisible();
  await expect(page.locator('#humanNarrative [data-section]')).toHaveCount(5);
  for (const heading of ['01 実現したい会社の未来', '02 現在どこまで分かっているか', '03 未来に向けて確認しておく価値があること', '04 現時点ではまだ判断できないこと', '05 次に確認する価値があること']) {
    await expect(page.locator('#humanNarrative').getByRole('heading', { name: heading })).toBeVisible();
  }
  await expect(page.getByText('分析から作成した元の文面')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Generated Narrative');
  await expect(page.locator('body')).not.toContainText('M01');
  await expect(page.locator('img')).toHaveCount(0);
});

test('current Human Edited Narrative has priority and is saved through the existing narrative route', async ({ page }) => {
  const edited = { ...content, future: { ...content.future, entries: ['既に人が整えた表現'] } };
  const state = { value: workspace({ latestHumanEditedNarrative: { id: 'edit-1', generatedNarrativeId: '22222222-2222-4222-8222-222222222222', content: edited }, humanEditedNarrativeStatus: 'CURRENT' }) };
  let body: any; await routeWorkspace(page, state);
  await page.route('**/design-v2/narrative-edits', async (route: any) => { body = route.request().postDataJSON(); state.value = { ...state.value, latestHumanEditedNarrative: { id: 'edit-2', generatedNarrativeId: state.value.latestGeneratedNarrative.id, content: body.content }, humanEditedNarrativeStatus: 'CURRENT' }; await route.fulfill({ status: 201, json: { id: 'edit-2' } }); });
  await page.goto(`${url}/admin/free-diagnosis-v2-analysis.html?caseId=${state.value.case.id}`);
  const future = page.locator('[data-section=future]'); await expect(future).toHaveValue('既に人が整えた表現');
  await future.fill('人が確認して整えた表現'); await page.locator('#saveNarrative').click();
  await expect.poll(() => body?.generatedNarrativeId).toBe(state.value.latestGeneratedNarrative.id);
  expect(body.content.future.entries).toEqual(['人が確認して整えた表現']);
  await expect(future).toHaveValue('人が確認して整えた表現');
});

test('survey is a default-closed read-only reference and Q1 is its sole separate editor', async ({ page }) => {
  const state = { value: workspace() }; await routeWorkspace(page, state);
  await page.goto(`${url}/admin/free-diagnosis-v2-analysis.html?caseId=${state.value.case.id}`);
  await expect(page.locator('#answerReference')).not.toHaveAttribute('open', ''); await expect(page.locator('#openAnswerReference')).toBeVisible();
  await expect(page.locator('#q1Editor')).toBeHidden(); await expect(page.locator('#reviewAnswers')).toHaveCount(0);
  await page.locator('#openAnswerReference').click();
  await expect(page.locator('#original .original-card')).toHaveCount(7); await expect(page.locator('#original input, #original select, #original textarea, #original button')).toHaveCount(0);
  await expect(page.locator('#original')).toContainText('会社の状況'); await expect(page.locator('#original')).toContainText('関心のあるITテーマ');
  await page.locator('#openQ1Editor').click();
  await expect(page.locator('#q1Editor')).toBeVisible(); await expect(page.locator('#editor [data-field=q1CompanyContext]')).toHaveCount(1);
  await expect(page.locator('#editor [data-field=q2Future], #editor [data-field=q3ItExpectations], #editor [data-field=q4CurrentInterest], #editor [data-field=q5Visibility], #editor [data-field=q6ManagementConnection], #editor [data-field=q7InterestThemes]')).toHaveCount(0);
});

test('Q1 uses the preserved Current revision route without changing Original or Q2-Q7', async ({ page }) => {
  const state = { value: workspace() }; let saveBody: any; const calls: string[] = [];
  await routeWorkspace(page, state);
  await page.route('**/design-v2/current-state-revisions', async (route: any) => { calls.push('save'); saveBody = route.request().postDataJSON(); state.value = { ...state.value, currentCompanyContext: saveBody.q1CompanyContext, currentStateRevision: { id: 'state-2', revisionNo: 2 }, analysisFreshness: 'REANALYSIS_REQUIRED' }; await route.fulfill({ status: 201, json: { id: 'state-2', revisionNo: 2 } }); });
  await page.route('**/design-v2/reanalyze', async (route: any) => { calls.push('reanalyze'); state.value = workspace({ currentCompanyContext: saveBody.q1CompanyContext, currentStateRevision: { id: 'state-2', revisionNo: 2 } }); await route.fulfill({ json: { reused: false } }); });
  await page.goto(`${url}/admin/free-diagnosis-v2-analysis.html?caseId=${state.value.case.id}`); const originalBefore = await page.locator('#original').textContent();
  await page.locator('#openQ1Editor').click(); await page.locator('[name="q1CompanyContext.employeeRange"][value=EMP_51_100]').check(); await page.locator('#saveAndAnalyze').click();
  await expect.poll(() => calls).toEqual(['save', 'reanalyze']); expect(saveBody.q1CompanyContext).toEqual({ employeeRange: 'EMP_51_100', siteRange: 'SITE_1' });
  expect(saveBody.state).toEqual(workspace().currentStructuredState); await page.locator('#openAnswerReference').click(); expect(await page.locator('#original').textContent()).toBe(originalBefore);
});

test('stale analysis keeps edits guarded and hearing memo remains separate from analysis input', async ({ page }) => {
  const state = { value: workspace({ analysisFreshness: 'REANALYSIS_REQUIRED', latestAnalysisResult: null, latestGeneratedNarrative: null, humanEditedNarrativeStatus: 'STALE_REVIEW_REQUIRED', latestHumanEditedNarrative: { id: 'old', content } }) };
  await routeWorkspace(page, state); await page.goto(`${url}/admin/free-diagnosis-v2-analysis.html?caseId=${state.value.case.id}`);
  await expect(page.locator('#saveNarrative')).toHaveCount(0); await expect(page.getByText('前回の編集文は、現在の分析より前の内容です。確認してください。')).toBeVisible();
  await expect(page.locator('#records')).toContainText('<img src=x onerror=alert(1)>確認した内容'); await expect(page.locator('#records img')).toHaveCount(0);
});

test('narrow viewport keeps the same Human Review and secondary survey behavior', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); const state = { value: workspace() }; await routeWorkspace(page, state);
  await page.goto(`${url}/admin/free-diagnosis-v2-analysis.html?caseId=${state.value.case.id}`);
  expect(await page.locator('.analysis-grid').evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length)).toBe(1);
  await expect(page.locator('#humanNarrative [data-section]')).toHaveCount(5); await expect(page.locator('#answerReference')).not.toHaveAttribute('open', ''); await page.locator('#openAnswerReference').click(); await expect(page.locator('#answerReference')).toBeVisible();
});
