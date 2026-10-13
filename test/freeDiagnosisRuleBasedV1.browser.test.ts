import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createFreeDiagnosisRuleBasedV1Harness } from './support/freeDiagnosisRuleBasedV1Harness';
import { intakeAnswerEnvelopeSchema } from '../src/domain/freeDiagnosisRuleBasedV1';
import { projectIntakeSemantics } from '../src/domain/intakeSemanticProjection';
import { runInitialRule } from '../src/domain/initialRuleEngine';
import { designV2SurveyAnswerSchema } from '../src/domain/publicCustomerSelfDesignV2';

let h: Awaited<ReturnType<typeof createFreeDiagnosisRuleBasedV1Harness>>;
test.beforeAll(async () => { h = await createFreeDiagnosisRuleBasedV1Harness({ includeDesignV2: true }); });
test.afterAll(async () => { await h?.close(); });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'staff_session', value: h.staffCookie.slice('staff_session='.length), url: h.url, httpOnly: true, sameSite: 'Lax' }]);
});

async function createCase(page: Page, name: string): Promise<void> {
  await page.goto(h.url + '/admin/free-diagnosis-v1.html');
  const caseId = await page.evaluate(async companyName => {
    const activityResponse = await fetch('/api/admin/free-diagnosis-v1/sales-activities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: companyName, contact: { name: '担当者' }, selectedService: 'IT_KAIZEN' }) });
    const activity = await activityResponse.json();
    const caseResponse = await fetch(`/api/admin/free-diagnosis-v1/sales-activities/${activity.salesActivityId}/cases`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    return (await caseResponse.json()).id;
  }, name);
  await page.click('#btnLoadCases');
  const row = page.locator('#caseList tbody tr').filter({ hasText: name });
  await row.getByRole('button').click();
  await expect(page.locator('#view-intake')).toBeVisible();
}

async function fillCanonicalStaffProxySurvey(page: Page): Promise<void> {
  await page.locator('[data-proxy-q1="employeeRange"]').selectOption('31〜50人');
  await page.locator('[data-proxy-q1="siteRange"]').selectOption('1か所');
  await page.getByLabel('少人数でも無理なく成長・運営できる会社にしたい').check();
  await page.getByLabel('経営判断を支えたい').check();
  await page.getByLabel('経営判断に関すること').check();
  await page.getByLabel('分かることと分からないことがある').check();
  await page.getByLabel('報告・共有はあるが、数字の羅列や専門用語が多く、経営判断には使いにくい').check();
  await page.getByLabel('AI・生成AI').check();
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
  await expect(page.getByText('事前アンケート 1 / 7', { exact: true })).toBeVisible();
  await expect(page.locator('.service-intro')).toBeHidden(); await expect(page.locator('.service-steps')).toBeHidden();
  await expect(page.locator('body')).not.toContainText('Initial Rule');
  await page.locator('[data-q1="employeeRange"]').selectOption('31〜50人'); await page.locator('[data-q1="siteRange"]').selectOption('1か所'); await page.click('#next');
  await page.getByLabel('少人数でも無理なく成長・運営できる会社にしたい').check(); await page.click('#next');
  await page.getByLabel('経営判断を支えたい').check(); await page.click('#next');
  await page.getByLabel('経営判断に関すること').check(); await page.click('#next');
  await page.getByLabel('分かることと分からないことがある').check(); await page.click('#next');
  await page.getByLabel('報告・共有はあるが、数字の羅列や専門用語が多く、経営判断には使いにくい').check(); await page.click('#next');
  await page.getByLabel('AI・生成AI').check(); await page.click('#next');
  await expect(page.getByText('ご回答ありがとうございました', { exact: true })).toBeVisible();
  await expect(page.getByText('ご回答をもとに、御社が実現したいことに対して、「今どこまで分かっているか」「次に何を確認すれば、経営として判断できるか」を60分で一緒に整理します。', { exact: true })).toBeVisible();
  await expect(page.getByText('ITの良し悪しを採点したり、システムの導入を勧めたりする診断ではありません。', { exact: true })).toBeVisible();
  await expect(page.getByText('ご回答いただいた内容', { exact: true })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('少人数でも無理なく成長・運営できる会社にしたい');
  await expect(page.locator('body')).not.toContainText('経営判断を支えたい');
  await expect(page.getByRole('button', { name: '60分の無料IT経営診断を申し込む' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Problem'); await expect(page.locator('body')).not.toContainText('Finding'); await expect(page.locator('body')).not.toContainText('Gap');
  expect(Number((await h.pool.query('SELECT count(*)::int AS count FROM it_management_public_self_submission')).rows[0].count)).toBe(before);
  await page.click('#to-application');
  await expect(page.getByText('事前アンケートの回答を、無料診断の準備・実施に利用することに同意します', { exact: true })).toBeVisible();
  expect(await page.locator('#company').evaluate((element, email) => getComputedStyle(element).borderColor === getComputedStyle(document.querySelector(email)!).borderColor, '#email')).toBe(true);
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
  const saved: any = (await h.pool.query(`SELECT c.id,c.status,s.referral_person_name FROM it_management_public_self_submission p JOIN it_management_diagnosis_case_v2 c ON c.id=p.it_management_diagnosis_case_v2_id JOIN sales_activity s ON s.id=p.sales_activity_id WHERE p.contact_id=(SELECT id FROM contact WHERE email='public-ui@example.test')`)).rows[0];
  expect(saved.status).toBe('BOOKING_PENDING'); expect(saved.referral_person_name).toBe('紹介 太郎');
  await context.addCookies([{ name: 'staff_session', value: h.staffCookie.slice('staff_session='.length), url: h.url, httpOnly: true, sameSite: 'Lax' }]);
  await page.goto(h.url + '/admin/free-diagnosis-v1.html'); await page.click('#btnLoadCases');
  const listed = page.locator('#caseList tbody tr').filter({ hasText: '公開UI株式会社' });
  await expect(listed).toContainText('本人回答'); await expect(listed).toContainText('日程調整');
  await context.close();
});

test.skip('V1 response-state Public UI is superseded by the canonical Design v2 survey', async ({ browser }) => {
  const context = await browser.newContext(); const page = await context.newPage();
  await page.goto(h.url + '/it-management-kaizen/free-diagnosis/');
  await page.getByLabel('ITまたは業務の担当').check(); await page.click('#start-questions');
  await page.locator('[data-field="employeeSize"]').selectOption('EMP_21_50'); await page.locator('[data-field="locations"]').selectOption('SITE_1'); await page.click('#next');
  await expect(page.getByText('今後1〜3年で、業務や会社に予定されている変化はありますか？', { exact: true })).toBeVisible();
  await expect(page.getByLabel('分からない', { exact: true })).toHaveCount(1);
  await page.getByLabel('分からない', { exact: true }).check(); await page.click('#next');
  await page.getByLabel('経営判断を支えたい').check(); await page.click('#next');
  await expect(page.getByLabel('分からない', { exact: true })).toHaveCount(0);
  await expect(page.getByText('回答の状況', { exact: true })).toHaveCount(0);
  await page.getByLabel('経営判断に必要な情報').check(); await page.click('#next');
  await page.getByLabel('分かることと分からないことがある').check(); await page.click('#next');
  await expect(page.getByLabel('分からない', { exact: true })).toHaveCount(0); await page.getByLabel('情報は得られるが、そのままでは判断に使いにくい').check(); await page.click('#next');
  await page.click('#next'); await page.click('#to-application');
  await page.fill('#company', '回答状態確認株式会社'); await page.fill('#name', '担当者'); await page.fill('#email', 'response-state@example.test');
  await page.check('#privacy'); await page.check('#use'); await page.click('#submit');
  await expect(page.getByText('無料IT経営診断のお申込みを受け付けました')).toBeVisible();
  const rows: any[] = (await h.pool.query(`SELECT r.raw_value_json FROM hearing_intake_response_v2 r JOIN it_management_public_self_submission p ON p.it_management_diagnosis_case_v2_id=r.case_id JOIN contact c ON c.id=p.contact_id WHERE c.email='response-state@example.test' ORDER BY r.question_code`)).rows;
  const answers = rows.map(row => intakeAnswerEnvelopeSchema.parse(row.raw_value_json));
  expect(answers.find(answer => answer.questionCode === 'Q2')).toMatchObject({ answerValue: null, responseState: 'NOT_IN_POSITION_TO_ANSWER' });
  expect(answers.find(answer => answer.questionCode === 'Q4')).toMatchObject({ answerValue: 'MANAGEMENT_DECISION_CONCERN', responseState: 'ANSWERED' });
  expect(answers.find(answer => answer.questionCode === 'Q6')).toMatchObject({ answerValue: 'DELIVERED_NOT_USABLE', responseState: 'ANSWERED' });
  const projection = projectIntakeSemantics(answers); expect(projection.knowledgeUnknownQuestionCodes).toEqual([]); expect(projection.authorityConfirmationCandidates).toEqual([{ questionCode: 'Q2', reason: 'NOT_IN_POSITION_TO_ANSWER' }]);
  const rule = runInitialRule(projection); expect(rule.problemFindings).toEqual([]); expect(rule.assessmentEscalated).toBe(false);
  await context.close();
  const adminContext = await browser.newContext(); await adminContext.addCookies([{ name: 'staff_session', value: h.staffCookie.slice('staff_session='.length), url: h.url, httpOnly: true, sameSite: 'Lax' }]);
  const adminPage = await adminContext.newPage(); await adminPage.goto(h.url + '/admin/free-diagnosis-v1.html'); await adminPage.click('#btnLoadCases');
  const row = adminPage.locator('tr').filter({ hasText: '回答状態確認株式会社' }); await row.getByRole('button', { name: '開く' }).click();
  await expect(adminPage.locator('#view-intake')).toBeVisible(); await expect(adminPage.locator('input[name="response_Q2"]')).toHaveCount(0);
  await adminContext.close();
});

test.skip('V1 Public answer-code UI is superseded by the canonical Design v2 survey', async ({ browser }) => {
  const context = await browser.newContext(); const page = await context.newPage();
  await page.goto(h.url + '/it-management-kaizen/free-diagnosis/');
  await page.getByLabel('経営者・役員').check(); await page.click('#start-questions');
  await expect(page.locator('input[name="response-state"]')).toHaveCount(0);
  await expect(page.getByText('回答の状況', { exact: true })).toHaveCount(0);
  await expect(page.locator('option[value="EMP_UNKNOWN"], option[value="SITE_UNKNOWN"]')).toHaveCount(0);
  await page.locator('[data-field="employeeSize"]').selectOption('EMP_21_50'); await page.locator('[data-field="locations"]').selectOption('SITE_1'); await page.click('#next');
  await expect(page.locator('input[name="response-state"]')).toHaveCount(0);
  await page.getByLabel('安定・効率を高める').check(); await page.click('#next');
  await expect(page.getByLabel('まだ決めていない', { exact: true })).toBeVisible();
  await expect(page.locator('input[name="response-state"]')).toHaveCount(0);
  await page.getByLabel('まだ決めていない', { exact: true }).check(); await page.click('#next');
  await page.getByLabel('大きな懸念はない').check(); await page.click('#next');
  await expect(page.getByLabel('分からない', { exact: true })).toHaveCount(0);
  await page.getByLabel('必要な状況は把握できている').check();
  await page.click('#next'); await expect(page.getByLabel('分からない', { exact: true })).toHaveCount(0);
  await context.close();
});

test.skip('V1 preparation reuse is not a Design v2 Customer Self downstream path', async ({ browser }) => {
  const publicContext = await browser.newContext(); const publicPage = await publicContext.newPage();
  await publicPage.goto(h.url + '/it-management-kaizen/free-diagnosis/');
  await publicPage.getByLabel('経営者・役員').check(); await publicPage.click('#start-questions');
  await publicPage.locator('[data-field="employeeSize"]').selectOption('EMP_21_50'); await publicPage.locator('[data-field="locations"]').selectOption('SITE_1'); await publicPage.click('#next');
  await publicPage.getByLabel('安定・効率を高める').check(); await publicPage.click('#next');
  await publicPage.getByLabel('経営判断を支えたい').check(); await publicPage.click('#next');
  await publicPage.getByLabel('経営判断に必要な情報').check(); await publicPage.click('#next');
  await publicPage.getByLabel('分かることと分からないことがある').check(); await publicPage.click('#next');
  await publicPage.getByLabel('情報は得られるが、そのままでは判断に使いにくい').check(); await publicPage.click('#next');
  await publicPage.click('#next'); await publicPage.click('#to-application');
  await publicPage.fill('#company', '公開案件再利用株式会社'); await publicPage.fill('#name', '公開回答者'); await publicPage.fill('#email', 'reuse-self@example.test');
  await publicPage.check('#privacy'); await publicPage.check('#use'); await publicPage.click('#submit');
  await publicContext.close();

  const adminContext = await browser.newContext(); await adminContext.addCookies([{ name: 'staff_session', value: h.staffCookie.slice('staff_session='.length), url: h.url, httpOnly: true, sameSite: 'Lax' }]);
  const adminPage = await adminContext.newPage(); await adminPage.goto(h.url + '/admin/free-diagnosis-v1.html'); await adminPage.click('#btnLoadCases');
  const card = adminPage.locator('tr').filter({ hasText: '公開案件再利用株式会社' }); await card.getByRole('button', { name: '開く' }).click();
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

test('HA case: 事業拡大・少人数成長・生産性・経営判断から複数テーマと質問シーケンスを表示する', async ({ page }) => {
  await createCase(page, '逆算型ヒアリング株式会社');
  await completeIntake(page, {
    q2: ['BUSINESS_EXPANSION', 'LEAN_SCALING'], q3: ['IMPROVE_PRODUCTIVITY', 'ENABLE_MANAGEMENT_DECISION'],
    q4: 'MANAGEMENT_DECISION_CONCERN', q5: 'PARTIALLY_VISIBLE', q6: 'DELIVERED_NOT_USABLE',
  });
  await expect(page.locator('#prepThemes')).toContainText('IT経営判断');
  await expect(page.locator('#prepThemes')).toContainText('成長・変化への対応');
  await expect(page.locator('#prepThemes')).toContainText('業務生産性');
  await page.click('#btnStartHearing');
  await expect(page.locator('#hearingThemes')).toContainText('IT経営判断');
  await expect(page.locator('#hearingThemes')).toContainText('成長・変化への対応');
  await expect(page.locator('#hearingThemes')).toContainText('業務生産性');
  await page.getByRole('button', { name: /成長・変化への対応/ }).click();
  await expect(page.locator('#hearingSequence')).toContainText('必要な状態');
  await expect(page.locator('#hearingSequence')).toContainText('今の業務やITのまま規模が広がった場合');
  await expect(page.locator('#deepDiveHints')).toContainText('Excel');
  await expect(page.locator('#planItemRef')).toBeHidden();
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
  await page.goto(h.url + '/admin/free-diagnosis-v1.html'); await page.click('#btnLoadCases');
  const savedCase = page.locator('tr').filter({ hasText: 'Hearing確認株式会社' }); await savedCase.getByRole('button').click();
  await expect(page.locator('#view-review')).toBeVisible(); await expect(page.locator('#findingsList')).toBeVisible();
  await expect(page.getByRole('button', { name: '顧客向けレポート' })).toBeDisabled();
  await page.getByRole('button', { name: '60分診断', exact: true }).click(); await expect(page.locator('#view-hearing')).toBeVisible();
  await page.getByRole('button', { name: '診断内容の確認' }).click(); await expect(page.locator('#view-review')).toBeVisible();
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
  await expect(page.locator('#reportStatus')).toContainText('レポート下書き');
  const draftText = page.locator('.report-draft-edit').first();
  await expect(draftText).toBeVisible();
  await draftText.fill('今回の60分で伺った、今後の会社の変化・ITに期待する状態です。');
  await page.click('#btnSaveReportDraft');
  await expect(page.locator('.report-draft-edit').first()).toHaveValue('今回の60分で伺った、今後の会社の変化・ITに期待する状態です。');
  await page.click('#btnApproveReport');
  await expect(page.locator('#reportStatus')).toContainText('承認');
  await expect(page.locator('.report-draft-edit')).toHaveCount(0);
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
  await page.getByText('営業で伺った内容を登録する', { exact: true }).first().click();
  await page.fill('#companyName', '交流会流入株式会社'); await page.fill('#contactName', '担当者');
  await page.selectOption('#acquisitionSourceType', 'EVENT'); await page.fill('#acquisitionSourceName', '経営者交流会A');
  await fillCanonicalStaffProxySurvey(page);
  await expect(page.locator('#btnCreateCase')).toBeDisabled();
  await page.check('#proxyConsentConfirmed');
  await page.click('#btnCreateCase');
  await expect(page.locator('#proxySaveStatus')).toContainText('営業で伺った内容を登録しました。');
  const caseId = new URL((await page.locator('#proxySaveStatus a').getAttribute('href'))!, h.url).searchParams.get('caseId');
  const activity = (await h.pool.query<any>('SELECT a.acquisition_source_type,a.acquisition_source_name FROM sales_activity a JOIN it_management_diagnosis_case_v2 c ON c.sales_activity_id=a.id WHERE c.id=$1', [caseId])).rows[0];
  expect(activity).toEqual({ acquisition_source_type: 'EVENT', acquisition_source_name: '経営者交流会A' });
  await page.locator('#proxySaveStatus a').click();
  await expect(page).toHaveURL(new RegExp(`free-diagnosis-v2-analysis\\.html\\?caseId=${caseId}`));
  await expect(page.getByRole('heading', { name: 'ヒアリング後の整理' })).toBeVisible();
  await page.goto(h.url + '/admin/free-diagnosis-v1.html');
  await page.click('#btnLoadCases');
  await expect(page.locator('#caseList')).toContainText('交流会流入株式会社');
});

test('共通案件一覧はDesign v2本人回答と営業代理入力を正式provenanceで表示し後続画面へ接続する', async ({ page }) => {
  const canonicalSurvey = designV2SurveyAnswerSchema.parse({
    q1CompanyContext: { employeeRange: '31〜50人', siteRange: '1か所' }, q2Future: ['BUSINESS_GROWTH'],
    q3ItExpectations: ['MANAGEMENT_DECISION_SUPPORT'], q4CurrentInterest: 'MANAGEMENT_DECISION', q5Visibility: 'VISIBLE_PARTIAL',
    q6ManagementConnection: 'REPORTED_NOT_DECISION_USABLE', q7InterestThemes: ['AI'],
  });
  const self = await h.publicSelf.submit({ idempotencyKey: randomUUID(), company: { name: '一覧本人回答株式会社' },
    contact: { name: '本人回答者', email: 'list-self@example.test', respondentRole: 'MANAGEMENT' }, survey: canonicalSurvey,
    consent: { privacy: true, diagnosisUse: true, wordingVersion: 'it_management_public_self_consent_v1' },
    attribution: { utmSource: 'newsletter', utmCampaign: 'design-v2-list' } });
  const staff = await h.staffProxyDesignV2.submit({ idempotencyKey: randomUUID(), respondentRole: 'MANAGEMENT',
    activity: { name: '一覧代理入力株式会社', contact: { name: '営業ヒアリング先' }, selectedService: 'IT_KAIZEN' }, survey: canonicalSurvey, consentConfirmed: true }, 'operator@atlib.jp');

  await page.goto(h.url + '/admin/free-diagnosis-v1.html'); await page.click('#btnLoadCases');
  const selfRow = page.locator('#caseList tbody tr').filter({ hasText: '一覧本人回答株式会社' });
  await expect(selfRow).toContainText('本人回答'); await expect(selfRow).toContainText('日程調整');
  await expect(selfRow).toContainText('獲得元未確定 / newsletter / design-v2-list');
  const staffRow = page.locator('#caseList tbody tr').filter({ hasText: '一覧代理入力株式会社' });
  await expect(staffRow).toContainText('営業ヒアリング先'); await expect(staffRow).toContainText('営業代理入力'); await expect(staffRow).toContainText('ヒアリング');
  await expect(page.locator('#caseList')).not.toContainText('CUSTOMER_SELF'); await expect(page.locator('#caseList')).not.toContainText('STAFF_PROXY');
  await staffRow.getByRole('button', { name: 'ヒアリング' }).click();
  await expect(page).toHaveURL(new RegExp(`free-diagnosis-v2-hearing\\.html\\?caseId=${staff.caseId}`));
  expect((await h.pool.query<any>('SELECT status FROM it_management_diagnosis_case_v2 WHERE id=$1', [staff.caseId])).rows[0].status).toBe('HEARING_IN_PROGRESS');
  expect((await h.pool.query<any>('SELECT status FROM it_management_diagnosis_case_v2 WHERE id=$1', [self.caseId])).rows[0].status).toBe('BOOKING_PENDING');
  const reportId = await page.evaluate(async caseId => {
    const draftResponse = await fetch(`/api/admin/free-diagnosis-v1/cases/${caseId}/design-v2/report-drafts/ensure`, { method: 'POST' });
    const draft = await draftResponse.json();
    const approveResponse = await fetch(`/api/admin/free-diagnosis-v1/cases/${caseId}/design-v2/report-drafts/${draft.id}/approve`, { method: 'POST' });
    if (!approveResponse.ok) throw new Error('approval failed');
    return draft.id;
  }, staff.caseId);
  await page.goto(h.url + '/admin/free-diagnosis-v1.html'); await page.click('#btnLoadCases');
  const approvedRow = page.locator('#caseList tbody tr').filter({ hasText: '一覧代理入力株式会社' });
  await expect(approvedRow).toContainText('承認済みレポートを確認');
  await approvedRow.getByRole('button', { name: '承認済みレポートを確認' }).click();
  await expect(page).toHaveURL(new RegExp(`free-diagnosis-v2-report\\.html\\?caseId=${staff.caseId}&reportId=${reportId}`));
});
