import {test,expect} from '@playwright/test';
import {createDiagnosisHarness} from './support/diagnosisHarness';
import {operator} from './support/preparationFixtures';
import {reportCase,FakeReportProvider} from './support/reportFixtures';
import {manualReport} from '../src/domain/diagnosisReport';
let h:Awaited<ReturnType<typeof createDiagnosisHarness>>;const provider=new FakeReportProvider();
test.beforeAll(async()=>{h=await createDiagnosisHarness(undefined,undefined,undefined,undefined,provider);});test.afterAll(async()=>{await h?.close();});
test.beforeEach(async({context})=>{provider.run=async c=>manualReport(c);await context.addCookies([{name:'staff_session',value:h.staffCookie.slice('staff_session='.length),url:h.url,httpOnly:true,sameSite:'Lax'}]);});

test('Report: AI Draft→Grounding→wording→Human approval→Delivery→Raw Feedback完了',async({page},info)=>{
 const c=await reportCase(h),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${h.url}/admin/it-management-diagnosis-detail.html?id=${c.id}`);await page.getByRole('link',{name:'Report / Feedbackへ',exact:true}).click();
 await expect(page.locator('#company')).toHaveText('ABC株式会社様');await expect(page.getByText('無料 IT経営診断 / 提供：atLIB株式会社',{exact:true})).toBeVisible();await expect(page.locator('#tab-assessment')).toBeEnabled();
 await page.locator('#run-ai').click();await expect(page.locator('#executions')).toContainText('SUCCEEDED');await expect(page.locator('#case-status')).toHaveText('REPORT_REVIEW_REQUIRED');await expect(page.locator('#report-sections > section')).toHaveCount(5);await expect(page.locator('#report-future-status')).toHaveText('SURVEY_STATED');
 const block=page.locator('.report-block').filter({hasText:c.hypothesis.id});await block.locator('summary').click();await expect(block.locator('details')).toContainText(c.hypothesis.id);await expect(block.locator('details')).toContainText('HYPOTHESIS / v1');
 await block.getByRole('button',{name:'表現を調整する'}).click();
 const groundedWording=await page.locator('#wording-text').inputValue();
 expect(groundedWording).toContain('Supporting Observation / Context');expect(groundedWording).toContain('Evidence Needed');
 const editedWording=groundedWording.replace('可能性がある\n','可能性があります\n');expect(editedWording).not.toBe(groundedWording);
 await page.locator('#wording-text').fill(editedWording);
 await page.getByRole('button',{name:'表現を保存',exact:true}).click();await expect(page.locator('#content-version')).toHaveText('本文version 2');await expect(page.locator('#report-error')).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBeTruthy();await page.screenshot({path:info.outputPath('report-grounded-draft.png'),fullPage:true});
 page.once('dialog',d=>d.accept());await page.locator('#approve').click();await expect(page.locator('#case-status')).toHaveText('REPORT_APPROVED');await expect(page.locator('#approval-info')).toContainText('operator@atlib.jp');await expect(page.locator('#approve')).toBeDisabled();await expect(block.getByRole('button',{name:'表現を調整する'})).toBeDisabled();
 await page.emulateMedia({media:'print'});await expect(page.locator('#report-preview')).toBeVisible();await expect(page.locator('#run-ai')).toBeHidden();await page.screenshot({path:info.outputPath('report-print.png'),fullPage:true});await page.emulateMedia({media:'screen'});
 page.once('dialog',d=>d.accept());await page.locator('#deliver').click();await expect(page.locator('#case-status')).toHaveText('FEEDBACK_PENDING');const frozen=(await h.report.read(c.id,operator)).reports;
 await page.locator('#tab-feedback').click();await expect(page.locator('#save-feedback')).toBeDisabled();await page.locator('#start-feedback').click();await expect(page.locator('#save-feedback')).toBeEnabled();const raw='  分からないことがあります。\nIT環境は完全に把握できています。  ';await page.locator('#feedback-content').fill(raw);await page.locator('#save-feedback').click();await expect(page.locator('#feedback-sources')).toContainText('IT環境は完全に把握できています。');
 page.once('dialog',d=>d.accept());await page.locator('#complete-feedback').click();await expect(page.locator('#case-status')).toHaveText('FEEDBACK_COMPLETED');await expect(page.locator('#save-feedback')).toBeDisabled();const result=await h.report.read(c.id,operator);expect(result.feedback[0].content).toBe(raw);expect(result.reports).toEqual(frozen);expect(errors).toEqual([]);await page.screenshot({path:info.outputPath('feedback-completed.png'),fullPage:true});
 await page.goto(`${h.url}/it-management-diagnosis.html#case=${c.id}&token=${c.access_token}`);await expect(page.locator('#survey-success')).toBeVisible();
 await page.goto(`${h.url}/admin/it-management-diagnosis.html`);await page.locator('#status-filter').selectOption('FEEDBACK_COMPLETED');await expect(page.getByText('Feedback完了',{exact:true}).first()).toBeAttached();
});

test('Human-only: AI failure→manual→meaning edit rejection→Human Review→regeneration→reissue',async({page},info)=>{
 const c=await reportCase(h);provider.run=async()=>{throw Error('offline');};await page.goto(`${h.url}/admin/it-management-diagnosis-review.html?id=${c.id}`);await page.getByRole('link',{name:'Report / Feedbackへ',exact:true}).click();
 await page.locator('#run-ai').click();await expect(page.locator('#ai-status')).toContainText('AI Draft生成に失敗しました');await page.locator('#manual').click();await expect(page.locator('#report-status')).toHaveText('Report v1 / REVIEW_REQUIRED');
 await page.locator('.report-block').filter({hasText:'未確認（UNRESOLVED）'}).getByRole('button',{name:'表現を調整する'}).click();await page.locator('#wording-text').fill('原因は担当者の不在です');await page.getByRole('button',{name:'表現を保存',exact:true}).click();await expect(page.locator('#report-error')).toContainText('意味を変える編集は保存できません');await page.locator('#cancel-wording').click();
 await page.locator('#revision-reason').fill('診断の意味をHuman Reviewで確認');await page.locator('#return-review').check();await page.locator('#request-revision').click();await expect(page.locator('#case-status')).toHaveText('HUMAN_REVIEW_REQUIRED');await expect(page.locator('#approve')).toBeDisabled();await page.locator('#review-link').click();
 await page.locator('#approved').getByRole('button',{name:'Supersede（新versionに置換）',exact:true}).first().click();await page.locator('#insight-content').fill('担当者と役割の境界は未確認');await page.locator('#review-reason').fill('未確認範囲を明確化');await page.locator('#save-insight').click();await expect(page.locator('#approved')).toContainText('担当者と役割の境界は未確認');page.once('dialog',d=>d.accept());await page.locator('#complete').click();await expect(page.locator('#case-status')).toHaveText('REPORT_REVIEW_REQUIRED');await page.locator('#report-link').click();
 await page.locator('#manual').click();await expect(page.locator('#report-status')).toHaveText('Report v2 / REVIEW_REQUIRED');await expect(page.locator('#report-sections')).toContainText('担当者と役割の境界は未確認');page.once('dialog',d=>d.accept());await page.locator('#approve').click();await expect(page.locator('#case-status')).toHaveText('REPORT_APPROVED');const old=(await h.report.read(c.id,operator)).reports[0]!;
 await page.locator('#reissue-reason').fill('再発行の確認');await page.locator('#reissue').click();await expect(page.locator('#report-status')).toHaveText('Report v3 / REVIEW_REQUIRED');await page.locator('#report-version').selectOption(old.id);await expect(page.locator('#report-status')).toHaveText('Report v2 / APPROVED');await expect(page.locator('#approve')).toBeDisabled();expect((await h.report.read(c.id,operator)).reports.find(r=>r.id===old.id)).toEqual(old);
 await page.screenshot({path:info.outputPath('report-reissue-history.png'),fullPage:true});
});

test('AI regeneration selects newest draft and mobile layout remains usable',async({page})=>{
 const c=await reportCase(h);await page.goto(`${h.url}/admin/it-management-diagnosis-report.html?id=${c.id}`);await page.locator('#manual').click();await expect(page.locator('#report-status')).toContainText('v1');await page.locator('#run-ai').click();await expect(page.locator('#report-status')).toHaveText('Report v2 / REVIEW_REQUIRED');await expect(page.locator('#report-error')).toBeHidden();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBeTruthy();
});
