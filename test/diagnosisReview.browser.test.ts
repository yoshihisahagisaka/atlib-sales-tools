import {test,expect} from '@playwright/test';
import {createDiagnosisHarness} from './support/diagnosisHarness';
import {operator} from './support/preparationFixtures';
import {reviewCase,FakePostDiagnosisProvider,structurerOutput} from './support/reviewFixtures';
let h:Awaited<ReturnType<typeof createDiagnosisHarness>>;const provider=new FakePostDiagnosisProvider();
test.beforeAll(async()=>{h=await createDiagnosisHarness(undefined,undefined,undefined,provider);});test.afterAll(async()=>{await h?.close();});test.beforeEach(async({context})=>{provider.run=async c=>structurerOutput(c);await context.addCookies([{name:'staff_session',value:h.staffCookie.slice('staff_session='.length),url:h.url,httpOnly:true,sameSite:'Lax'}]);});

test('Human Review: AI提案→出典確認→承認・編集・UNKNOWN変換・却下→Assessment確認→完了',async({page},info)=>{
 const c=await reviewCase(h),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${h.url}/admin/it-management-diagnosis-workspace.html?id=${c.id}`);await page.getByRole('link',{name:'Human Reviewへ',exact:true}).click();
 await expect(page.locator('#company')).toHaveText('ABC株式会社様');await expect(page.getByText('提供：atLIB株式会社')).toBeVisible();await expect(page.locator('#future-status')).toHaveText('顧客が目指している会社の姿として回答');
 await page.locator('#run-ai').click();await expect(page.locator('#executions')).toContainText('整理完了');await expect(page.locator('#case-status')).toHaveText('進行状況：分析内容の確認待ち');expect((await h.review.read(c.id,operator)).approved_insights).toHaveLength(0);
 const d=await h.review.read(c.id,operator),card=(type:string)=>page.locator(`[data-proposal-id="${d.proposals.find(p=>p.proposal_type===type).id}"]`);
 await card('OBSERVATION').getByText('もとになった情報を見る',{exact:true}).click();await expect(card('OBSERVATION').locator('details')).toContainText('資料等の存在を確認');
 await card('HYPOTHESIS').getByRole('button',{name:'採用する',exact:true}).click();await expect(page.locator('#approved')).toContainText('[担当者確認済み] 私たちの仮説・気づき');
 await card('OBSERVATION').getByRole('button',{name:'編集して採用する',exact:true}).click();await page.locator('#insight-content').fill('台帳の存在が画面共有で記録されている');await page.locator('#review-reason').fill('存在までの表現にする');await page.locator('#save-insight').click();await expect(page.locator('#approved')).toContainText('台帳の存在が画面共有で記録されている');
 await card('GAP_CANDIDATE').getByRole('button',{name:'まだ分かっていないこととして残す',exact:true}).click();await page.locator('#convert-type').selectOption('UNRESOLVED');await page.locator('#convert-reason').fill('追加の情報が必要');await page.getByRole('button',{name:'まだ分かっていないこととして保存',exact:true}).click();await expect(page.locator('#approved')).toContainText('確認したがまだ分からない');
 await card('ROOT_CAUSE_HYPOTHESIS').getByRole('button',{name:'採用しない',exact:true}).click();await expect(card('ROOT_CAUSE_HYPOTHESIS')).toContainText('不採用');
 await card('EVIDENCE_CANDIDATE').getByRole('button',{name:'採用する',exact:true}).click();await expect(page.locator('#approved')).toContainText('資料・記録等の確認候補');
 await page.getByRole('button',{name:'担当者が確認して候補を作成',exact:true}).click();await page.getByRole('button',{name:'確認候補を保存',exact:true}).click();await expect(page.locator('#assessment-items')).toContainText('管理台帳の更新方法を確認する');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBeTruthy();await page.screenshot({path:info.outputPath('human-review-approved.png'),fullPage:true});
 await page.locator('#leave-unreviewed').check();page.once('dialog',d=>d.accept());await page.locator('#complete').click();await expect(page.locator('#case-status')).toHaveText('進行状況：経営フィードバック資料作成待ち');await expect(page.locator('#completion')).toContainText('分析内容の確認完了：');await expect(page.locator('#run-ai')).toBeDisabled();await expect(page.locator('#editor')).toBeHidden();
 const result=await h.review.read(c.id,operator);expect(result.proposals.map(p=>p.content_json)).toEqual(d.proposals.map(p=>p.content_json));expect(result.assessment_confirmation_items).toHaveLength(1);expect(errors).toEqual([]);await page.screenshot({path:info.outputPath('human-review-completed.png'),fullPage:true});
 await page.goto(`${h.url}/it-management-diagnosis.html#case=${c.id}&token=${c.access_token}`);await expect(page.locator('#survey-success')).toBeVisible();
});

test('Human-only Review: AI失敗→UNKNOWN作成→Supersedeで履歴保持→Review完了',async({page},info)=>{
 const c=await reviewCase(h);provider.run=async()=>{throw Error('offline');};await page.goto(`${h.url}/admin/it-management-diagnosis-review.html?id=${c.id}`);
 await page.locator('#run-ai').click();await expect(page.locator('#ai-status')).toContainText('分析整理に失敗しました');await expect(page.locator('#run-ai')).toBeEnabled();
 await page.locator('#semantic-type').selectOption('UNKNOWN');await page.locator('#unknown-type').selectOption('NOT_REQUIRED_NOW');await page.locator('#insight-title').fill('未確認の担当者');await page.locator('#insight-content').fill('今は担当者を確認していない');await page.locator('#insight-sources').selectOption('SOURCE_RECORD:'+c.source.id);await page.locator('#review-reason').fill('今は解消せずに残す');await page.locator('#save-insight').click();await expect(page.locator('#approved')).toContainText('今回は確認しない');
 const before=await h.review.read(c.id,operator);await page.getByRole('button',{name:'内容を更新する',exact:true}).click();await page.locator('#insight-content').fill('担当者と役割の境界は未確認');await page.locator('#review-reason').fill('確認範囲を明確にする');await page.locator('#save-insight').click();expect((await h.review.read(c.id,operator)).approved_insights[0].version).toBe(2);
 await page.getByText('変更履歴',{exact:true}).click();expect((await h.review.read(c.id,operator)).insight_history.some(i=>i.review_status==='SUPERSEDED')).toBe(true);await expect(page.locator('#history')).toContainText('今は担当者を確認していない');await page.screenshot({path:info.outputPath('human-review-supersede.png'),fullPage:true});
 page.once('dialog',d=>d.accept());await page.locator('#complete').click();await expect(page.locator('#case-status')).toHaveText('進行状況：経営フィードバック資料作成待ち');const report=await h.review.reportContext(c.id,operator);expect(report.insights).toHaveLength(1);expect(report.insights[0].previous_insight_id).toBe(before.approved_insights[0].id);expect(report.insights[0].semantic_type).toBe('UNKNOWN');
});
