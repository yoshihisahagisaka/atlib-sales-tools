import { test,expect } from '@playwright/test';
import { createDiagnosisHarness } from './support/diagnosisHarness';
import { operator } from './support/preparationFixtures';
import { FakeInterviewProvider,interviewOutput,readyCase } from './support/workspaceFixtures';
let h:Awaited<ReturnType<typeof createDiagnosisHarness>>;const provider=new FakeInterviewProvider();
test.beforeAll(async()=>{h=await createDiagnosisHarness(undefined,undefined,provider);});test.afterAll(async()=>{await h?.close();});
test.beforeEach(async({context})=>{provider.run=async ctx=>interviewOutput(ctx);await context.addCookies([{name:'staff_session',value:h.staffCookie.slice('staff_session='.length),url:h.url,httpOnly:true,sameSite:'Lax'}]);});

test('Workspace: Human Start → 原文記録 → AI候補のAsk/Later/Unnecessary → 未確認を残してFinish',async({page},info)=>{
 const c=await readyCase(h),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const calls=provider.calls;
 await page.goto(`${h.url}/admin/it-management-diagnosis-detail.html?id=${c.id}`);
 await page.getByRole('link',{name:'確認内容を記録する'}).click();
 await expect(page.locator('#company')).toHaveText('ABC株式会社様');await expect(page.getByText('無料 IT経営診断 / 提供：atLIB株式会社')).toBeVisible();
 await expect(page.locator('#run-ai')).toBeDisabled();await page.locator('#start').click();await expect(page.locator('#case-status')).toHaveText('DIAGNOSIS_IN_PROGRESS');
 expect(provider.calls).toBe(calls);
 await page.locator('#statement-content').fill('入社連絡が前日になることがあります');await page.getByRole('button',{name:'顧客発言を保存',exact:true}).click();
 await expect(page.locator('#sources')).toContainText('入社連絡が前日になることがあります');
 await page.locator('#note-content').fill('作業工程の内訳はまだ分からない');await page.getByRole('button',{name:'担当者メモを保存',exact:true}).click();await expect(page.locator('#sources')).toContainText('担当者メモ');
 const before=await h.workspace.read(c.id,operator);await page.locator('#run-ai').click();await expect(page.locator('#executions')).toContainText('SUCCEEDED');
 await expect(page.locator('#suggestions .suggestion-card')).toHaveCount(5);
 const cards=page.locator('#suggestions .suggestion-card');await cards.nth(0).getByRole('button',{name:'Ask（質問する）',exact:true}).click();await expect(cards.nth(0)).toContainText('判断：Ask');
 await cards.nth(1).getByRole('button',{name:'Later（後で確認）',exact:true}).click();await expect(cards.nth(1)).toContainText('判断：Later');
 await cards.nth(2).getByRole('button',{name:'Unnecessary（今回は不要）',exact:true}).click();await expect(cards.nth(2)).toContainText('判断：Unnecessary');
 await cards.nth(0).getByText('出典を見る',{exact:true}).click();await expect(cards.nth(0).locator('details')).toContainText('SOURCE_RECORD');
 const after=await h.workspace.read(c.id,operator);expect(after.sources).toEqual(before.sources);expect(after.themes).toEqual(before.themes);expect(after.plan_items).toEqual(before.plan_items);expect(after.future.intent_status).toBe('SURVEY_STATED');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBeTruthy();
 await page.screenshot({path:info.outputPath('workspace-interview.png'),fullPage:true});
 page.once('dialog',d=>d.accept());await page.locator('#finish').click();await expect(page.locator('#case-status')).toHaveText('HUMAN_REVIEW_REQUIRED');await expect(page.locator('#run-ai')).toBeDisabled();await expect(page.locator('#statement-form')).toBeHidden();
 await page.screenshot({path:info.outputPath('workspace-finished.png'),fullPage:true});expect(errors).toEqual([]);
 await page.goto(`${h.url}/it-management-diagnosis.html#case=${c.id}&token=${c.access_token}`);await expect(page.locator('#survey-success')).toBeVisible();
});

test('Future再確認・Transcript追跡・自発的Evidence存在とHuman追加',async({page})=>{
 const c=await readyCase(h);
 await h.repo.recordTranscriptConsent(c.id,operator,{consentVersion:'TEST-v1',consentScope:'browser transcript capture',consentedAt:new Date().toISOString()});
 await page.goto(`${h.url}/admin/it-management-diagnosis-workspace.html?id=${c.id}`);await page.locator('#start').click();await expect(page.locator('#case-status')).toHaveText('DIAGNOSIS_IN_PROGRESS');
 await page.getByText('Transcriptを貼り付けて保存',{exact:true}).click();await page.locator('#transcript-content').fill('顧客：採用を増やせる会社を目指す');await page.getByRole('button',{name:'Transcriptを保存',exact:true}).click();await expect(page.locator('#sources')).toContainText('Transcript');
 const transcript=(await h.workspace.read(c.id,operator)).sources[0];await page.locator('#statement-parent').selectOption(transcript.id);await page.locator('#statement-content').fill('採用を増やせる会社を目指す');await page.getByRole('button',{name:'顧客発言を保存',exact:true}).click();await expect(page.locator('#sources')).toContainText('元記録：');
 await page.getByText('対話でFutureを再確認する',{exact:true}).click();await page.locator('#future-statement').fill('採用を増やせる会社を目指す');const statement=(await h.workspace.read(c.id,operator)).sources.find(s=>s.source_type==='INTERVIEW_STATEMENT');await page.locator('#future-source').selectOption(statement.id);
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'担当者としてFutureを再確認したと記録',exact:true}).click();await expect(page.locator('#future-status')).toHaveText('INTERVIEW_RECONFIRMED');
 await page.getByText('Futureの履歴',{exact:true}).click();await expect(page.locator('#future-history')).toContainText('SURVEY_STATED');
 await page.getByText('Evidenceの存在を記録',{exact:true}).click();await page.locator('#evidence-content').fill('台帳が存在することを画面共有で確認した');await page.locator('#evidence-voluntary').check();await page.getByRole('button',{name:'Evidenceの存在を保存',exact:true}).click();await expect(page.locator('#sources')).toContainText('Evidence存在観察');
 await page.getByText('担当者がテーマ・確認項目を追加する',{exact:true}).click();await page.locator('#theme-title').fill('採用時の情報共有');await page.locator('#theme-relation').fill('採用を増やす未来のため');await page.getByRole('button',{name:'テーマを追加',exact:true}).click();await expect(page.locator('#themes')).toContainText('採用時の情報共有');
 await page.locator('#plan-text').fill('連絡はどのように行われますか？');await page.getByRole('button',{name:'確認項目を追加',exact:true}).click();await expect(page.locator('#plan-items')).toContainText('連絡はどのように行われますか？');
 page.once('dialog',d=>d.accept());await page.locator('#finish').click();await expect(page.locator('#case-status')).toHaveText('HUMAN_REVIEW_REQUIRED');
 const card=page.locator(`[data-source-id="${transcript.id}"]`);
 // Chromium normalizes trailing fractional zeros (e.g. .110 -> .11). Playwright
 // requires the normalized value; otherwise a valid timestamp can fail fill.
 await card.locator('input[type="datetime-local"]').fill(await page.evaluate(()=>{
  const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
  const input=document.createElement('input');input.type='datetime-local';input.step='0.001';input.value=d.toISOString().slice(0,23);return input.value;
 }));
 page.once('dialog',d=>d.accept());await card.getByRole('button',{name:'取得目的の完了を記録',exact:true}).click();
 await expect(card).toContainText('取得目的完了：');await expect(card).toContainText('原則保持上限：');
 await page.reload();await expect(card).toContainText('取得目的完了：');await expect(card.getByRole('button',{name:'取得目的の完了を記録',exact:true})).toHaveCount(0);
});

test('AI failureでもHuman-onlyの記録・終了が可能',async({page},info)=>{
 const c=await readyCase(h);provider.run=async()=>{throw Error('offline');};
 await page.goto(`${h.url}/admin/it-management-diagnosis-workspace.html?id=${c.id}`);await page.locator('#start').click();await expect(page.locator('#case-status')).toHaveText('DIAGNOSIS_IN_PROGRESS');
 await page.locator('#run-ai').click();await expect(page.locator('#ai-status')).toContainText('AIの実行に失敗しました');await expect(page.locator('#run-ai')).toBeEnabled();
 await page.locator('#statement-content').fill('分からない');await page.getByRole('button',{name:'顧客発言を保存',exact:true}).click();await expect(page.locator('#sources')).toContainText('分からない');
 await page.screenshot({path:info.outputPath('workspace-human-only.png'),fullPage:true});page.once('dialog',d=>d.accept());await page.locator('#finish').click();await expect(page.locator('#case-status')).toHaveText('HUMAN_REVIEW_REQUIRED');
});
