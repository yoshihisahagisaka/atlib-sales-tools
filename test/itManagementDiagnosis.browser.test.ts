import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { createDiagnosisHarness } from './support/diagnosisHarness';
import { SURVEY_QUESTIONS } from '../src/domain/itManagementDiagnosis';

let h: Awaited<ReturnType<typeof createDiagnosisHarness>>;
test.beforeAll(async () => { h = await createDiagnosisHarness(); });
test.afterAll(async () => { await h?.close(); });
async function login(context: BrowserContext) {
  await context.addCookies([{ name: 'staff_session', value: h.staffCookie.slice('staff_session='.length), url: h.url, httpOnly: true, sameSite: 'Lax' }]);
}
async function application(page: Page, staff = false) {
  await page.goto(h.url + (staff ? '/admin/it-management-diagnosis-new.html' : '/it-management-diagnosis.html'));
  await page.getByLabel('会社名（敬称不要）').fill('ABC株式会社様');
  await page.getByLabel('ご担当者名').fill('山田');
  await page.getByLabel('メールアドレス').fill('customer@example.test');
  if (!staff) {
    await page.getByRole('button', { name: '申し込んでアンケートへ進む' }).click();
    await expect(page.locator('#survey-questions')).toBeHidden();
    await page.locator('#policy-acknowledged').check();
  }
  if(staff){
    await page.getByRole('button',{name:'会話内容を保存する',exact:true}).click();
    await expect(page.locator('#consent')).toBeVisible();
    await page.locator('#consent-customer').fill('山田');await page.locator('#customer-agreed').check();
    await page.locator('#start').click();
  }else await page.getByRole('button', { name: '申し込んでアンケートへ進む' }).click();
  await expect(page.locator('#survey-questions')).toBeVisible();
  await expect(page.locator('#company-display')).toHaveText('ABC株式会社様');
  const id = staff ? new URL(page.url()).searchParams.get('id')! : new URLSearchParams(new URL(page.url()).hash.slice(1)).get('case')!;
  const result = await h.db.query<{ survey_version: number }>('SELECT survey_version FROM diagnosis_cases WHERE id=$1', [id]);
  expect(result.rows[0]!.survey_version).toBe(2);
}
async function answerUnknown(page: Page) {
  for (const q of SURVEY_QUESTIONS.filter(q => q.is_required)) {
    await page.locator(`[data-question-code="${q.question_code}"]`).getByLabel('分からない', { exact: true }).check();
  }
  await page.getByRole('button', { name: '途中保存する', exact: true }).click();
  await expect(page.locator('#progress-text')).toHaveText('必須9問のうち 9問を保存済み');
  const id = new URL(page.url()).searchParams.get('id') || new URLSearchParams(new URL(page.url()).hash.slice(1)).get('case')!;
  const result = await h.db.query<{ question_version: number }>('SELECT question_version FROM survey_responses WHERE diagnosis_case_id=$1', [id]);
  expect(result.rows).toHaveLength(9);
  expect(result.rows.every(r => r.question_version === 2)).toBe(true);
}

test('Web: 申込→自動保存→別タブ再開→通信失敗から再保存→必須guard→完了', async ({ page, context }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await application(page);
  const q01 = page.locator('[data-question-code="Q01_FUTURE"]');
  await q01.getByLabel('分からない', { exact: true }).check();
  await expect(page.locator('#progress-text')).toHaveText('必須9問のうち 1問を保存済み');
  const resume = await page.locator('#resume-link').inputValue();
  expect(new URL(resume).search).toBe('');
  const id = new URLSearchParams(new URL(resume).hash.slice(1)).get('case')!;
  expect((await h.db.query('SELECT * FROM diagnosis_futures WHERE diagnosis_case_id=$1', [id])).rows).toHaveLength(0);
  const resumed = await context.newPage(); resumed.on('pageerror', e => errors.push(e.message));
  await resumed.goto(resume);
  await expect(resumed.locator('[data-question-code="Q01_FUTURE"]').getByLabel('分からない', { exact: true })).toBeChecked();
  const q04 = resumed.locator('[data-question-code="Q04_IT_VISIBILITY"]');
  await resumed.route('**/survey/responses/Q04_IT_VISIBILITY', route => route.abort('failed'));
  await q04.getByLabel('IT環境は完全に把握できている', { exact: true }).check();
  await expect(resumed.locator('#diagnosis-error')).toContainText('通信できませんでした');
  await expect(q04.getByLabel('IT環境は完全に把握できている', { exact: true })).toBeChecked();
  await resumed.unroute('**/survey/responses/Q04_IT_VISIBILITY');
  await resumed.getByRole('button', { name: '途中保存する', exact: true }).click();
  await expect(resumed.locator('#progress-text')).toHaveText('必須9問のうち 2問を保存済み');
  await resumed.getByRole('button', { name: '回答を完了する', exact: true }).click();
  await expect(resumed.locator('#diagnosis-error')).toHaveText('未回答の必須項目があります。');
  await answerUnknown(resumed);
  await resumed.locator('[data-question-code="Q10_FREE_COMMENT"] textarea').fill('前任者しか分からない\n<script>window.injected=true</script>');
  await resumed.getByRole('button', { name: '回答を完了する', exact: true }).click();
  await expect(resumed.locator('#survey-success')).toBeVisible();
  await expect(resumed.locator('#survey-success')).toContainText('同じ質問を最初から繰り返すことはしません');
  expect((await h.db.query<{ name: string }>('SELECT o.name FROM organizations o JOIN diagnosis_cases c ON c.organization_id=o.id WHERE c.id=$1',[id])).rows[0]!.name).toBe('ABC株式会社');
  const future = await h.db.query<{ intent_status: string }>('SELECT intent_status FROM diagnosis_futures WHERE diagnosis_case_id=$1',[id]);
  expect(future.rows[0]!.intent_status).toBe('SURVEY_STATED');
  await resumed.reload(); await expect(resumed.locator('#survey-success')).toBeVisible();
  await resumed.screenshot({ path: info.outputPath('web-completed.png'), fullPage: true });
  expect(errors).toEqual([]);
  await resumed.close();
});

test('営業訪問: Google認証Gate→代理回答完了→新一覧と概要にFuture・担当者・原文表示', async ({ page, context }, info) => {
  await login(context); await application(page, true);
  const id = new URL(page.url()).searchParams.get('id')!;
  await expect(page.locator('#resume-card')).toBeHidden();
  await answerUnknown(page);
  await page.locator('[data-question-code="Q10_FREE_COMMENT"] textarea').fill('<script>window.injected=true</script>');
  await page.getByRole('button', { name: '回答を完了する', exact: true }).click();
  await expect(page.locator('#survey-success')).toBeVisible();
  await page.getByRole('link', { name: '案件の概要を確認する' }).click();
  await expect(page.locator('#future')).toHaveText('分からない');
  await expect(page.locator('#future-source')).toContainText('顧客が目指している会社の姿として回答');
  await expect(page.locator('#case-meta')).toContainText('operator@atlib.jp');
  await expect(page.locator('#raw-responses')).toContainText('<script>window.injected=true</script>');
  expect(await page.evaluate(() => (window as unknown as { injected?: boolean }).injected)).toBeUndefined();
  await page.screenshot({ path: info.outputPath('staff-overview.png'), fullPage: true });
  await page.getByRole('link', { name: '← 無料診断案件一覧' }).click();
  await page.locator('#channel-filter').selectOption('SALES_VISIT');
  await expect(page.locator('#case-list tr')).toHaveCount(1);
  await expect(page.locator('#case-list')).toContainText('ABC株式会社様');
  await expect(page.locator('#case-list')).toContainText('未提案');
  await expect(page.locator('#case-list')).toContainText('取得済み情報を確認し、無料診断の準備を開始');
  await page.screenshot({ path: info.outputPath('staff-list.png'), fullPage: true });
  const records = await h.db.query<{ entry_channel: string; entered_by_user_id: string }>('SELECT entry_channel,entered_by_user_id FROM survey_responses WHERE diagnosis_case_id=$1',[id]);
  expect(records.rows.every(r => r.entry_channel === 'SALES_VISIT' && r.entered_by_user_id === 'operator@atlib.jp')).toBe(true);
});

test('無効token画面は回答を表示せず、スタッフが再開リンクを失効できる', async ({ page, context }) => {
  await application(page);
  const resume = await page.locator('#resume-link').inputValue();
  const id = new URLSearchParams(new URL(resume).hash.slice(1)).get('case')!;
  await page.goto(`${h.url}/it-management-diagnosis.html#case=${id}&token=${'x'.repeat(43)}`);
  await expect(page.locator('#diagnosis-error')).toContainText('無効または期限切れ');
  await expect(page.locator('#survey-section')).toBeHidden();
  await login(context);
  await page.goto(`${h.url}/admin/it-management-diagnosis-detail.html?id=${id}`);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '顧客の再開リンクを失効する' }).click();
  await expect(page.locator('#access-status')).toHaveText('顧客の再開リンクは失効済みです。');
  await page.goto(resume);
  await expect(page.locator('#diagnosis-error')).toContainText('無効または期限切れ');
});

test('営業会話: 同意前は案件なし、3分類と取得済み回答を同意後に再利用', async ({page,context},info)=>{
  await login(context);
  const before=(await h.db.query('SELECT id FROM diagnosis_cases')).rows.length;
  await page.goto(h.url+'/admin/sales-conversation.html');
  await page.locator('#company-name').fill('会話保存テスト');
  await page.locator('#contact-name').fill('田中');
  await page.locator('#email').fill('conversation@example.test');
  await page.locator('#customer-statements').fill('担当者は2名と伺った');
  await page.locator('#unknowns').fill('契約更新日はまだ分からない');
  await page.locator('#salesperson-notes').fill('引継ぎに課題があるかもしれない');
  await page.getByText('既に伺った回答を記録する（任意）',{exact:true}).click();
  await page.locator('[data-code="Q04_IT_VISIBILITY"]').getByLabel('分からない',{exact:true}).check();
  await page.locator('#save').click();
  await expect(page.locator('#consent')).toBeVisible();
  expect((await h.db.query('SELECT id FROM diagnosis_cases')).rows.length).toBe(before);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBeTruthy();
  await page.screenshot({path:info.outputPath('sales-conversation.png'),fullPage:true});
  await page.reload();
  await expect(page.locator('#unknowns')).toHaveValue('契約更新日はまだ分からない');
  await page.locator('#consent-customer').fill('田中・代表者');
  await page.locator('#customer-agreed').check();
  await page.locator('#start').click();
  await expect(page.locator('#survey-questions')).toBeVisible();
  await expect(page.locator('[data-question-code="Q04_IT_VISIBILITY"]').getByLabel('分からない',{exact:true})).toBeChecked();
  await expect(page.locator('#survey-questions')).toContainText('営業会話で伺った回答を引き継いでいます');
  const id=new URL(page.url()).searchParams.get('id')!;
  await page.goto(h.url+'/admin/it-management-diagnosis-detail.html?id='+id);
  const summary=page.locator('#sales-conversation-summary');
  await expect(summary).toContainText('担当者は2名と伺った');
  await expect(summary).toContainText('契約更新日はまだ分からない');
  await expect(summary).toContainText('引継ぎに課題があるかもしれない');
  expect((await h.db.query('SELECT id FROM diagnosis_cases')).rows.length).toBe(before+1);
});
