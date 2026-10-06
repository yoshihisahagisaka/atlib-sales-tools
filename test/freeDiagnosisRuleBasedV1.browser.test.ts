import { test, expect, type Page } from '@playwright/test';
import { createFreeDiagnosisRuleBasedV1Harness } from './support/freeDiagnosisRuleBasedV1Harness';

let h: Awaited<ReturnType<typeof createFreeDiagnosisRuleBasedV1Harness>>;
test.beforeAll(async () => { h = await createFreeDiagnosisRuleBasedV1Harness(); });
test.afterAll(async () => { await h?.close(); });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'staff_session', value: h.staffCookie.slice('staff_session='.length), url: h.url, httpOnly: true, sameSite: 'Lax' }]);
});

async function createCase(page: Page, name: string): Promise<void> {
  await page.goto(h.url + '/admin/free-diagnosis-v1.html');
  await page.fill('#companyName', name);
  await page.fill('#contactName', '担当者');
  await page.click('#btnCreateCase');
  await expect(page.locator('#view-intake')).toBeVisible();
}

async function completeIntake(page: Page, values: { q2: string[]; q3: string[]; q4: string; q5: string; q6: string; q7?: string }): Promise<void> {
  await page.selectOption('#intake_Q1_employee', 'EMP_21_50');
  await page.selectOption('#intake_Q1_locations', 'SITE_1');
  await page.selectOption('#intake_Q2', values.q2);
  await page.selectOption('#intake_Q3', values.q3);
  await page.selectOption('#intake_Q4', values.q4);
  await page.selectOption('#intake_Q5', values.q5);
  await page.selectOption('#intake_Q6', values.q6);
  if (values.q7) await page.fill('#intake_Q7', values.q7);
  await page.click('#btnCompleteIntake');
  await expect(page.locator('#view-preparation')).toBeVisible();
}

test('Production guard: 未認証では/admin/free-diagnosis-v1.htmlへアクセスできない（/auth/loginへredirect）', async ({ browser }) => {
  const freshContext = await browser.newContext();
  const page = await freshContext.newPage();
  await page.goto(h.url + '/admin/free-diagnosis-v1.html');
  await expect(page).toHaveURL(/\/auth\/login\?returnTo=/);
  await freshContext.close();
});

test('Public Customer Selfは内部コードを表示せず、SELFとして正式送信できる', async ({ browser }) => {
  const context = await browser.newContext(); const page = await context.newPage();
  await page.goto(h.url + '/it-management-kaizen/free-diagnosis/?utm_source=shinseikai&utm_medium=flyer_qr&utm_campaign=it_management_kaizen_free_diagnosis');
  await expect(page.getByText('事前アンケート', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Initial Rule');
  await page.locator('[data-field="employeeSize"]').selectOption('EMP_21_50'); await page.locator('[data-field="locations"]').selectOption('SITE_1'); await page.click('#next');
  await page.getByLabel('安定・効率を高める').check(); await page.click('#next');
  await page.getByLabel('経営判断を支えたい').check(); await page.click('#next');
  await page.getByLabel('経営判断に必要な情報').check(); await page.click('#next');
  await page.getByLabel('一部だけ把握できている').check(); await page.click('#next');
  await page.getByLabel('届くが、判断には使いにくい').check(); await page.click('#next');
  await page.fill('#q7', '確認したいことがあります'); await page.click('#next');
  await page.fill('#company', '公開UI株式会社'); await page.fill('#name', '経営者'); await page.fill('#email', 'public-ui@example.test');
  await page.check('#privacy'); await page.check('#use'); await page.click('#submit');
  await expect(page.getByText('事前アンケートを受け付けました')).toBeVisible();
  await context.close();
});

test('Structured IntakeからInitial Ruleを通じてPreparationを表示する: Staff ProxyとQ7を保持する', async ({ page }) => {
  await createCase(page, 'ブラウザ確認株式会社');
  await expect(page.locator('#intakeForm')).toContainText('今後1〜3年で、会社として予定している変化');
  await completeIntake(page, {
    q2: ['HEADCOUNT_GROWTH'], q3: ['SUPPORT_CHANGE'], q4: 'CHANGE_READINESS_CONCERN',
    q5: 'MOSTLY_VISIBLE', q6: 'REGULAR_AND_USABLE', q7: '拠点を増やす際に確認したいことがあります。',
  });

  await expect(page.locator('#prepCompany')).toHaveText('ブラウザ確認株式会社');
  await expect(page.locator('#prepFocus')).toContainText('成長・変化への対応');
  await expect(page.locator('#prepWhy')).toContainText('60分で状況を確認する価値');
  await expect(page.locator('#prepQ7')).toHaveText('拠点を増やす際に確認したいことがあります。');
  const preparationText = await page.locator('#view-preparation').innerText();
  for (const internal of ['M05', 'PRIMARY', 'RELATED', 'HEADCOUNT_GROWTH']) expect(preparationText).not.toContain(internal);
});

test('Healthy CaseはFocusを強制せず、正常なPreparation状態として表示される', async ({ page }) => {
  await createCase(page, '健全確認株式会社');
  await completeIntake(page, {
    q2: ['NO_MAJOR_CHANGE'], q3: ['UNDECIDED'], q4: 'NO_MAJOR_CONCERN',
    q5: 'VISIBLE_ENOUGH', q6: 'REGULAR_AND_USABLE',
  });
  await expect(page.locator('#prepFocus')).toHaveText('現時点では重要な確認テーマは特定されていません。');
  await expect(page.locator('#prepWhy')).toContainText('優先して確認すべき重要なテーマは特定されていません');
  await expect(page.locator('#view-focus')).toBeHidden();
});

test('回答者の立場により質問文は変わるが、同じStructured Intakeを使う', async ({ page }) => {
  await createCase(page, '回答者確認株式会社');
  await page.selectOption('#respondentRole', 'IT_OR_BUSINESS_STAFF');
  await expect(page.locator('#intakeForm')).toContainText('業務や会社に予定されている変化');
  await expect(page.locator('#intakeForm')).toContainText('日々の業務で使うITの状況');
  await expect(page.locator('#intake_Q2')).toBeVisible();
  await expect(page.locator('#intake_Q6')).toBeVisible();
});

test('PreparationからStructured Hearingを記録し、Final Rule Previewへ進める', async ({ page }) => {
  await createCase(page, 'Hearing確認株式会社');
  await completeIntake(page, { q2: ['NO_MAJOR_CHANGE'], q3: ['ENABLE_MANAGEMENT_DECISION'], q4: 'MANAGEMENT_DECISION_CONCERN', q5: 'VISIBLE_ENOUGH', q6: 'REGULAR_AND_USABLE' });
  await page.click('#btnStartHearing');
  await expect(page.locator('#hearingStarter')).toContainText('経営判断に必要なIT情報');
  await page.selectOption('#structuredAnswer', 'CANNOT_JUDGE');
  await page.selectOption('#knowledgeState', 'PARTIAL');
  await page.fill('#statementText', '予算判断に必要な情報がそろわない');
  await page.click('#btnRecordStatement');
  await expect(page.locator('#statementList')).toContainText('一部、追加確認が必要');
  await page.click('#btnCompleteHearing');
  await expect(page.locator('#view-analysis')).toBeVisible();
  await page.click('#btnRunAnalysis');
  await expect(page.locator('#analysisResult')).toBeVisible();
});

test('Admin UIからReport承認・送付・Focused ConfirmationでHearingへ戻れる', async ({ page }) => {
  await createCase(page, 'レポート導線株式会社');
  await completeIntake(page, { q2: ['NO_MAJOR_CHANGE'], q3: ['ENABLE_MANAGEMENT_DECISION'], q4: 'MANAGEMENT_DECISION_CONCERN', q5: 'VISIBLE_ENOUGH', q6: 'REGULAR_AND_USABLE' });
  await page.click('#btnStartHearing');
  await page.selectOption('#structuredAnswer', 'CANNOT_JUDGE');
  await page.selectOption('#knowledgeState', 'PARTIAL');
  await page.fill('#statementText', '追加確認が必要です');
  await page.click('#btnRecordStatement');
  await page.click('#btnCompleteHearing');
  await page.click('#btnRunAnalysis');
  await page.click('#btnGoToReport');
  await expect(page.locator('#view-report')).toBeVisible();
  await page.click('#btnProjectReport');
  await expect(page.locator('#reportStatus')).toContainText('下書き');
  await page.click('#btnApproveReport');
  await expect(page.locator('#reportStatus')).toContainText('承認');
  await page.click('#btnDeliverReport');
  await expect(page.locator('#feedbackControls')).toBeVisible();
  await page.selectOption('#feedbackRoute', 'FOCUSED_CONFIRMATION');
  await page.fill('#feedbackDecision', '追加で確認する');
  await page.fill('#feedbackAction', '確認を再開する');
  await page.click('#btnRecordFeedback');
  await expect(page.locator('#view-hearing')).toBeVisible();
  await expect(page.locator('#statementList')).toContainText('一部、追加確認が必要');
});

test('Admin UIでSales Activityの流入元を保存・表示・検索できる', async ({ page }) => {
  await page.goto(h.url + '/admin/free-diagnosis-v1.html');
  await page.fill('#companyName', '交流会流入株式会社'); await page.fill('#contactName', '担当者');
  await page.selectOption('#acquisitionSourceType', 'EVENT'); await page.fill('#acquisitionSourceName', '経営者交流会A');
  await page.fill('#utmSource', 'executive-meetup-a'); await page.fill('#utmMedium', 'flyer');
  await page.fill('#utmCampaign', 'it-kaizen-free-diagnosis'); await page.fill('#utmContent', 'flyer-v1');
  await page.click('#btnCreateCase');
  await completeIntake(page, { q2: ['NO_MAJOR_CHANGE'], q3: ['UNDECIDED'], q4: 'NO_MAJOR_CONCERN', q5: 'VISIBLE_ENOUGH', q6: 'REGULAR_AND_USABLE' });
  await expect(page.locator('#prepAttribution')).toContainText('経営者交流会A');
  await expect(page.locator('#prepAttribution')).toContainText('it-kaizen-free-diagnosis');
  await page.goto(h.url + '/admin/free-diagnosis-v1.html');
  await page.fill('#filterSource', '経営者交流会A'); await page.click('#btnFilterAttribution');
  await expect(page.locator('#attributionSearchResult')).toContainText('交流会流入株式会社');
});
