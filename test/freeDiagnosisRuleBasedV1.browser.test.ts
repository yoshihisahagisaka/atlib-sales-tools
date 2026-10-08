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
  await page.getByText('代理入力のために新しい案件を登録する').click();
  await page.fill('#companyName', name);
  await page.fill('#contactName', '担当者');
  await page.click('#btnCreateCase');
  await expect(page.locator('#view-intake')).toBeVisible();
}

async function completeIntake(page: Page, values: { q2: string[]; q3: string[]; q4: string; q5: string; q6: string; q7?: string }): Promise<void> {
  await page.click('#btnNextIntake');
  await page.selectOption('#intake_Q1_employee', 'EMP_21_50');
  await page.selectOption('#intake_Q1_locations', 'SITE_1');
  await page.click('#btnNextIntake');
  for (const value of values.q2) await page.locator(`input[name="intake_Q2"][value="${value}"]`).check();
  await page.click('#btnNextIntake');
  for (const value of values.q3) await page.locator(`input[name="intake_Q3"][value="${value}"]`).check();
  await page.click('#btnNextIntake');
  await page.locator(`input[name="intake_Q4"][value="${values.q4}"]`).check();
  await page.click('#btnNextIntake');
  await page.locator(`input[name="intake_Q5"][value="${values.q5}"]`).check();
  await page.click('#btnNextIntake');
  await page.locator(`input[name="intake_Q6"][value="${values.q6}"]`).check();
  await page.click('#btnNextIntake');
  if (values.q7) await page.fill('#intake_Q7', values.q7);
  await page.click('#btnNextIntake');
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

test('Public Customer Selfは事前アンケートから申込み・予約導線へ進み、送信前には永続化しない', async ({ browser }) => {
  const context = await browser.newContext(); const page = await context.newPage();
  const before = Number((await h.pool.query('SELECT count(*)::int AS count FROM it_management_public_self_submission')).rows[0].count);
  await page.goto(h.url + '/it-management-kaizen/free-diagnosis/?acquisition_source_type=EVENT&acquisition_source_name=SHINSEIKAI&utm_source=shinseikai&utm_medium=flyer_qr&utm_campaign=it_management_kaizen_free_diagnosis');
  await expect(page.getByText('今回の回答者のお立場を教えてください', { exact: true })).toBeVisible();
  await page.getByLabel('経営者・役員').check(); await page.click('#start-questions');
  await expect(page.getByText('事前アンケート', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Initial Rule');
  await page.locator('[data-field="employeeSize"]').selectOption('EMP_21_50'); await page.locator('[data-field="locations"]').selectOption('SITE_1'); await page.click('#next');
  await page.getByLabel('安定・効率を高める').check(); await page.click('#next');
  await page.getByLabel('経営判断を支えたい').check(); await page.click('#next');
  await page.getByLabel('経営判断に必要な情報').check(); await page.click('#next');
  await page.getByLabel('一部だけ把握できている').check(); await page.click('#next');
  await page.getByLabel('届くが、判断には使いにくい').check(); await page.click('#next');
  await page.fill('#q7', '確認したいことがあります'); await page.click('#next');
  await expect(page.getByText('ご回答ありがとうございました', { exact: true })).toBeVisible();
  await expect(page.getByText('御社について、60分で確認する準備ができました。', { exact: true })).toBeVisible();
  await expect(page.getByText('ご回答いただいた内容', { exact: true })).toBeVisible();
  await expect(page.getByText('事前アンケートだけで診断結果を決めることはありません。ご回答をもとに、60分で詳しく確認する内容を整理します。', { exact: true })).toBeVisible();
  await expect(page.locator('body')).toContainText('安定・効率を高める');
  await expect(page.locator('body')).toContainText('経営判断を支えたい');
  await expect(page.locator('body')).not.toContainText('Problem'); await expect(page.locator('body')).not.toContainText('Finding'); await expect(page.locator('body')).not.toContainText('Gap');
  expect(Number((await h.pool.query('SELECT count(*)::int AS count FROM it_management_public_self_submission')).rows[0].count)).toBe(before);
  await page.click('#to-application');
  await page.fill('#company', '公開UI株式会社'); await page.fill('#name', '経営者'); await page.fill('#email', 'public-ui@example.test');
  await page.fill('#referralPersonName', '紹介 太郎');
  await expect(page.getByRole('link', { name: 'プライバシーポリシー' })).toHaveAttribute('href', 'https://www.atlib.jp/policy/');
  await page.check('#privacy'); await page.check('#use'); await page.click('#submit');
  await expect(page.getByText('無料IT経営診断のお申込みを受け付けました')).toBeVisible();
  const timerex = page.locator('#timerex-link');
  await expect(timerex).toHaveAttribute('href', 'https://timerex.net/s/yoshihisa.hagisaka_e611/446dce29');
  await expect(timerex).toHaveAttribute('target', '_blank'); await expect(timerex).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page).toHaveURL(/\/it-management-kaizen\/free-diagnosis\//); expect(await page.locator('iframe').count()).toBe(0);
  await expect(page.locator('body')).not.toContainText('48時間'); await expect(page.locator('body')).not.toContainText('14日間');
  const saved: any = (await h.pool.query(`SELECT c.status,s.referral_person_name FROM it_management_public_self_submission p JOIN it_management_diagnosis_case_v2 c ON c.id=p.it_management_diagnosis_case_v2_id JOIN sales_activity s ON s.id=p.sales_activity_id WHERE p.contact_id=(SELECT id FROM contact WHERE email='public-ui@example.test')`)).rows[0];
  expect(saved.status).toBe('BOOKING_PENDING'); expect(saved.referral_person_name).toBe('紹介 太郎');
  await context.close();
});

test('Customer Selfで作成済みの案件を管理画面で再利用し、回答を変更せず診断準備へ進める', async ({ browser }) => {
  const publicContext = await browser.newContext(); const publicPage = await publicContext.newPage();
  await publicPage.goto(h.url + '/it-management-kaizen/free-diagnosis/');
  await publicPage.getByLabel('経営者・役員').check(); await publicPage.click('#start-questions');
  await publicPage.locator('[data-field="employeeSize"]').selectOption('EMP_21_50'); await publicPage.locator('[data-field="locations"]').selectOption('SITE_1'); await publicPage.click('#next');
  await publicPage.getByLabel('安定・効率を高める').check(); await publicPage.click('#next');
  await publicPage.getByLabel('経営判断を支えたい').check(); await publicPage.click('#next');
  await publicPage.getByLabel('経営判断に必要な情報').check(); await publicPage.click('#next');
  await publicPage.getByLabel('一部だけ把握できている').check(); await publicPage.click('#next');
  await publicPage.getByLabel('届くが、判断には使いにくい').check(); await publicPage.click('#next');
  await publicPage.click('#next'); await publicPage.click('#to-application');
  await publicPage.fill('#company', '公開案件再利用株式会社'); await publicPage.fill('#name', '公開回答者'); await publicPage.fill('#email', 'reuse-self@example.test');
  await publicPage.check('#privacy'); await publicPage.check('#use'); await publicPage.click('#submit');
  await publicContext.close();

  const adminContext = await browser.newContext(); await adminContext.addCookies([{ name: 'staff_session', value: h.staffCookie.slice('staff_session='.length), url: h.url, httpOnly: true, sameSite: 'Lax' }]);
  const adminPage = await adminContext.newPage(); await adminPage.goto(h.url + '/admin/free-diagnosis-v1.html'); await adminPage.click('#btnLoadCases');
  const card = adminPage.locator('.case-card').filter({ hasText: '公開案件再利用株式会社' }); await card.getByRole('button', { name: 'この案件を開く' }).click();
  await expect(adminPage.locator('#view-intake')).toBeVisible(); await expect(adminPage.locator('#intakeForm')).toContainText('お客様ご本人が回答した内容です');
  await expect(adminPage.locator('#intake_Q1_employee')).toBeDisabled(); await adminPage.click('#btnCompleteIntake');
  await expect(adminPage.locator('#view-preparation')).toBeVisible(); await expect(adminPage.locator('#prepEntryChannel')).toHaveText('お客様ご本人による回答');
  await adminContext.close();
});

test('Structured IntakeからInitial Ruleを通じてPreparationを表示する: Staff ProxyとQ7を保持する', async ({ page }) => {
  await createCase(page, 'ブラウザ確認株式会社');
  await expect(page.locator('#intakeForm')).toContainText('今回の回答者の立場');
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
  await page.click('#btnNextIntake');
  await page.selectOption('#intake_Q1_employee', 'EMP_21_50'); await page.selectOption('#intake_Q1_locations', 'SITE_1'); await page.click('#btnNextIntake');
  await expect(page.locator('#intakeForm')).toContainText('業務や会社に予定されている変化');
  await expect(page.locator('input[name="intake_Q2"]').first()).toBeVisible();
});

test('PreparationからStructured Hearingを記録し、Final Ruleを自動実行して診断内容確認へ進める', async ({ page }) => {
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
  await expect(page.locator('#view-review')).toBeVisible();
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
  await expect(page.locator('#view-review')).toBeVisible();
  await page.click('#btnApprove');
  await expect(page.locator('#view-report')).toBeVisible();
  await expect(page.locator('#reportStatus')).toContainText('顧客向けレポート');
  await expect(page.locator('#reportPreview')).toContainText('IT経営アセスメント');
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
  await page.getByText('代理入力のために新しい案件を登録する').click();
  await page.fill('#companyName', '交流会流入株式会社'); await page.fill('#contactName', '担当者');
  await page.selectOption('#acquisitionSourceType', 'EVENT'); await page.fill('#acquisitionSourceName', '経営者交流会A');
  await page.click('#btnCreateCase');
  await completeIntake(page, { q2: ['NO_MAJOR_CHANGE'], q3: ['UNDECIDED'], q4: 'NO_MAJOR_CONCERN', q5: 'VISIBLE_ENOUGH', q6: 'REGULAR_AND_USABLE' });
  await expect(page.locator('#prepAttribution')).toContainText('経営者交流会A');
  await page.goto(h.url + '/admin/free-diagnosis-v1.html');
  await page.click('#btnLoadCases');
  await expect(page.locator('#caseList')).toContainText('交流会流入株式会社');
});
