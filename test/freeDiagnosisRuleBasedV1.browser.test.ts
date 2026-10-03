import { test, expect } from '@playwright/test';
import { createFreeDiagnosisRuleBasedV1Harness } from './support/freeDiagnosisRuleBasedV1Harness';

let h: Awaited<ReturnType<typeof createFreeDiagnosisRuleBasedV1Harness>>;
test.beforeAll(async () => { h = await createFreeDiagnosisRuleBasedV1Harness(); });
test.afterAll(async () => { await h?.close(); });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'staff_session', value: h.staffCookie.slice('staff_session='.length), url: h.url, httpOnly: true, sameSite: 'Lax' }]);
});

const FORBIDDEN_TERMS = [
  'Risk Score', 'リスクスコア', 'Maturity Score', '成熟度スコア', 'Gap Score', 'ギャップスコア',
  'traffic light', '問題あり', '問題なし', 'AI診断',
];

test('Production guard: 未認証では/admin/free-diagnosis-v1.htmlへアクセスできない（/auth/loginへredirect）', async ({ browser }) => {
  // This harness does not mount /auth/login itself (that is server.ts's own staffAuth router,
  // tested elsewhere) -- only requireStaffAuth's redirect target is asserted here.
  const freshContext = await browser.newContext();
  const page = await freshContext.newPage();
  await page.goto(h.url + '/admin/free-diagnosis-v1.html');
  await expect(page).toHaveURL(/\/auth\/login\?returnTo=/);
  await freshContext.close();
});

test('12-step flow end-to-end in a real browser, no forbidden score/judgment language anywhere, UNKNOWNが中立表現、ない／分からないを区別', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(h.url + '/admin/free-diagnosis-v1.html');

  // Step 1: Customer / Case entry
  await page.fill('#companyName', 'ブラウザ確認株式会社');
  await page.fill('#contactName', '佐藤花子');
  await page.click('#btnCreateCase');
  await expect(page.locator('#view-intake')).toBeVisible();

  // Step 2: Intake (7問、Canonicalの質問文言をそのまま表示)
  await expect(page.locator('#intakeForm')).toContainText('会社規模・主な拠点数');
  await expect(page.locator('#intakeForm')).toContainText('今後1〜3年の会社の変化');
  await page.fill('#intake_Q1', '社員30名、拠点1箇所');
  await page.fill('#intake_Q2', '来年に新規事業を立ち上げる予定');
  await page.fill('#intake_Q3', 'IT投資の判断を経営会議で適切に行えるようにしたい');
  await page.fill('#intake_Q4', '情報システムの全体像が見えていない');
  await page.fill('#intake_Q5', '担当者しか把握していない');
  await page.fill('#intake_Q6', '予算の規模感');
  await page.click('#btnCompleteIntake');
  await expect(page.locator('#view-focus')).toBeVisible();

  // Step 3: Focus Selection
  await page.selectOption('#primaryFocus', 'M01_IT_MANAGEMENT_JUDGMENT');
  await page.click('#btnSelectFocus');
  await expect(page.locator('#view-preparation')).toBeVisible();

  // Step 4: Preparation -- Company/Change/Intent/Concern/Q7/Focus/Whyがすべて表示される
  await expect(page.locator('#prepCompany')).toHaveText('ブラウザ確認株式会社');
  await expect(page.locator('#prepChange')).toContainText('新規事業');
  await expect(page.locator('#prepIntent')).toContainText('経営会議');
  await expect(page.locator('#prepConcern')).toContainText('全体像');
  await expect(page.locator('#prepFocus')).toContainText('M01 IT経営判断');
  await expect(page.locator('#prepWhy')).toContainText('IT経営判断');
  await page.click('#btnStartHearing');
  await expect(page.locator('#view-hearing')).toBeVisible();

  // Step 5: Live Hearing -- 3-column layout + story navigator
  await expect(page.locator('.hearing-layout .hearing-col.left')).toBeVisible();
  await expect(page.locator('.hearing-layout .hearing-col.center')).toBeVisible();
  await expect(page.locator('.hearing-layout .hearing-col.right')).toBeVisible();
  await expect(page.locator('#storyNav .crumb.active')).toHaveText('主テーマ');
  // CORE item: UNKNOWNのまま記録（中立表現であることを確認）
  await page.selectOption('#planItemRef', 'M01_IT_MANAGEMENT_JUDGMENT_CORE');
  await page.selectOption('#knowledgeState', 'UNKNOWN');
  await page.fill('#statementText', '経営会議での意思決定フローはまだ確認できていない');
  await page.click('#btnRecordStatement');
  await expect(page.locator('#statementList')).toContainText('今回まだ確認できていない');
  // DECISION item: 「ない」(存在しない) ケースをKNOWN+naFlagで記録 -- 「分からない」とは別バッジになること
  await page.selectOption('#planItemRef', 'M01_IT_MANAGEMENT_JUDGMENT_DECISION');
  await page.selectOption('#knowledgeState', 'KNOWN');
  await page.check('#naFlag');
  await page.fill('#statementText', '来期のIT予算方針はまだ存在しない（検討前）');
  await page.click('#btnRecordStatement');
  await expect(page.locator('#statementList')).toContainText('ない（確認済み）');
  const statementListText = await page.locator('#statementList').innerText();
  expect(statementListText).toContain('ない（確認済み）');
  expect(statementListText).toContain('今回まだ確認できていない');
  // 「ない」と「分からない」が別バッジであることを直接確認
  const ngBadgeCount = await page.locator('#statementList .badge.ng').count();
  const unknownBadgeCount = await page.locator('#statementList .badge.unknown').count();
  expect(ngBadgeCount).toBe(1);
  expect(unknownBadgeCount).toBe(1);

  // Step 6: 整理モード
  await page.click('#btnOrganize');
  await expect(page.locator('#view-organize')).toBeVisible();
  await expect(page.locator('.organize-bucket.unknown')).toContainText('M01_IT_MANAGEMENT_JUDGMENT_CORE');
  await expect(page.locator('.organize-bucket.known')).toContainText('M01_IT_MANAGEMENT_JUDGMENT_DECISION');
  // 整理モードでの再確認（append-onlyであり、元の記録を書き換えない）
  await page.selectOption('#planItemRefOrganize', 'M01_IT_MANAGEMENT_JUDGMENT_CORE');
  await page.selectOption('#knowledgeStateOrganize', 'KNOWN');
  await page.fill('#statementTextOrganize', '再確認：意思決定フローが明確になった');
  await page.click('#btnReconfirm');
  await expect(page.locator('.organize-bucket.known')).toContainText('M01_IT_MANAGEMENT_JUDGMENT_CORE');

  // Step 7: Hearing Complete
  await page.click('#btnCompleteHearingFromOrganize');
  await expect(page.locator('#view-analysis')).toBeVisible();

  // Step 8: Rule Analysis
  await page.click('#btnRunAnalysis');
  await expect(page.locator('#analysisResult')).toBeVisible();
  await expect(page.locator('#resultPanel')).toContainText('Investigation Need');
  await page.click('#btnGoToReview');
  await expect(page.locator('#view-review')).toBeVisible();

  // Step 9: Human Review -- approve
  await page.click('#btnApprove');
  await expect(page.locator('#view-approved')).toBeVisible();

  // Step 10/11/12: Analysis Approved -> Preliminary Assessment Structure / Suggested Scope
  await page.click('#btnGoToScope');
  await expect(page.locator('#view-scope')).toBeVisible();
  await page.click('#btnGenerateScope');
  await expect(page.locator('#scopeResult')).toBeVisible();
  await expect(page.locator('#gatesPanel')).toContainText('対象ごとに個別の確認が必要か');
  await expect(page.locator('#scopePanel')).toContainText('Assessment Structure');

  // UIで禁止するものが一切表示されていないことをページ全体テキストで確認
  const fullText = await page.locator('main.admin-shell').innerText();
  for (const term of FORBIDDEN_TERMS) expect(fullText).not.toContain(term);

  expect(errors, 'no uncaught page errors during the full 12-step flow').toHaveLength(0);
});
