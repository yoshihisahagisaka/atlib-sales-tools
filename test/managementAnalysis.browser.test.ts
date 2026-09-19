import {test,expect} from '@playwright/test';
import {createDiagnosisHarness} from './support/diagnosisHarness';
import {managementAnalysisScenario} from './support/managementAnalysisScenario';
import {feedbackCase} from './support/assessmentFixtures';
import {operator} from './support/preparationFixtures';
import {reuseSalesCase} from './support/progressiveReuseScenario';
let h:Awaited<ReturnType<typeof createDiagnosisHarness>>;
test.beforeAll(async()=>{h=await createDiagnosisHarness();});test.afterAll(async()=>{await h?.close();});
test.beforeEach(async({context})=>{await context.addCookies([{name:'staff_session',value:h.staffCookie.slice('staff_session='.length),url:h.url,httpOnly:true,sameSite:'Lax'}]);});
test('SL-A5: ordered analysis, sparse lens, WHY source, Human review and reuse navigation',async({page},info)=>{
 const c=await managementAnalysisScenario(h),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(h.url+'/admin/it-management-diagnosis-review.html?id='+c.id);
 await expect(page.locator('#analysis-future')).toBeVisible();
 expect(await page.locator('#management-analysis > section').evaluateAll(nodes=>nodes.map(n=>n.id))).toEqual(['analysis-future','analysis-known','analysis-unknown','analysis-gap','analysis-why','analysis-kaizen','analysis-next']);
 await expect(page.locator('#analysis-known')).toContainText('内容の正しさを確定したものではありません');
 await expect(page.locator('#analysis-unknown')).toContainText('今回は確認しない');await expect(page.locator('#analysis-gap')).toContainText('候補');await expect(page.locator('#analysis-why')).toContainText('理由についての仮説');
 const why=page.locator('#analysis-why article').first();await why.getByText('もとになった情報を見る',{exact:true}).click();await expect(why.locator('details')).toContainText('記録日時');
 await expect(page.locator('#analysis-lens > section')).toHaveCount(1);await expect(page.locator('#analysis-lens')).toContainText('運用 × 整える');await expect(page.locator('#analysis-unclassified')).toContainText('分類しない改善の選択肢');
 await expect(page.locator('#analysis-decision')).toContainText('判断はまだ記録されていません');
 expect(await page.locator('#management-analysis').innerText()).not.toMatch(/GAP_CANDIDATE|ROOT_CAUSE_HYPOTHESIS|KAIZEN_DIRECTION|semantic_type|SourceRecord|\bFACT\b|\bUNKNOWN\b|[0-9a-f]{8}-[0-9a-f]{4}-/);
 await page.locator('#analysis-why').getByRole('link',{name:'この候補を確認・判断する'}).click();await expect(page.locator('#proposals [tabindex="-1"]')).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();expect(errors).toEqual([]);
 await page.locator('#analysis-kaizen').screenshot({path:info.outputPath('analysis-lens.png')});
 await page.getByRole('link',{name:'取得済みの情報と追加確認を見直す'}).click();await expect(page.locator('#progressive-reuse')).toContainText('次に確認すること');
});
test('SL-A5: no empty-cell penalty and Human route translation without automatic order',async({page})=>{
 const empty=await reuseSalesCase(h.pool);await page.goto(h.url+'/admin/it-management-diagnosis-review.html?id='+empty.id);await expect(page.locator('#analysis-kaizen')).toContainText('該当候補なし。空欄を埋める必要はありません');await expect(page.locator('#analysis-lens > section')).toHaveCount(0);
 const c=await feedbackCase(h,{decision:false});
 const labels={DIRECT_ACT:'改善の実行へ進む',FOCUSED_CONFIRMATION:'絞り込んだ追加確認へ進む',DESIGN_ASSESSMENT:'設計Assessmentを検討する',STOP_HOLD:'今回は止める・保留する'};
 for(const route of Object.keys(labels) as (keyof typeof labels)[]){await h.feedbackDecision.decide(c.id,operator,{expectedVersion:(await h.assessment.read(c.id,operator)).version,route,materialDecision:'経営者が選んだ進め方',nextAction:'次の打ち合わせで確認する'});await page.goto(h.url+'/admin/it-management-diagnosis-review.html?id='+c.id);await expect(page.locator('#analysis-decision')).toContainText(labels[route]);expect(await page.locator('#management-analysis').innerText()).not.toMatch(/DIRECT_ACT|FOCUSED_CONFIRMATION|DESIGN_ASSESSMENT|STOP_HOLD|SourceRecord|semantic_type|\bFACT\b|\bUNKNOWN\b|[0-9a-f]{8}-[0-9a-f]{4}-/);expect((await h.assessment.read(c.id,operator)).assessment_status).toBe('NOT_PROPOSED');}
});
