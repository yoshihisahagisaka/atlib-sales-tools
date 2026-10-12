import { test, expect } from '@playwright/test';
import express from 'express';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';

let server: ReturnType<express.Express['listen']>; let url: string;
test.beforeAll(async () => { const app = express(); app.use('/admin', express.static(path.resolve(__dirname, '../public/admin'))); server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve)); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
test.afterAll(async () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

const caseId = '11111111-1111-4111-8111-111111111111'; const reportId = '22222222-2222-4222-8222-222222222222';
const sections = [
  { key: 'FUTURE', title: '01 実現したい会社の未来', entries: ['少人数で成長する', '顧客への価値提供を高める', '働きやすさを保つ'] },
  { key: 'CURRENT_UNDERSTANDING', title: '02 現在どこまで分かっているか', entries: ['状況を一部把握している'] },
  { key: 'LENSES', title: '03 未来に向けて確認することで、改善が期待できること', entries: ['情報の流れを確認する価値がある'] },
  { key: 'UNKNOWNS', title: '04 現時点ではまだ判断できないこと', entries: ['業務の詳細', '情報共有の実態'] },
  { key: 'NEXT_FACTS', title: '05 次に確認する価値があること', entries: ['共有内容'] },
];
const diagnosisMap = sections.map(section => ({ ...section, entries: section.entries.slice(0, 2), overflowCount: Math.max(0, section.entries.length - 2) }));
const fact = { id: 'fact-1', whatToVerify: '共有内容', whyItMattersToFuture: '成長を支えるため', whatMayBecomeKnowable: '改善可能性', lenses: ['MANAGEMENT'], sourceRuleIds: ['rule-1'] };
function draft() { return { id: reportId, version: 1, contentVersion: 1, status: 'REVIEW_REQUIRED', context: { currentState: { id: 'state-1' }, analysisResult: { id: 'analysis-1' }, generatedNarrative: { id: 'narrative-1' }, adoptedNarrative: { source: 'HUMAN_EDITED', id: 'edit-1' } }, content: { formatVersion: 'free-diagnosis-design-v2-report-2', recipient: { organizationDisplayName: 'テスト株式会社' }, diagnosisDate: '2026-10-12T00:00:00.000Z', issuer: { displayName: 'atLIB株式会社' }, sections, diagnosisMap, factCandidates: [fact], assessmentProposal: { status: 'NOT_SELECTED', source: 'ANALYSIS_FACT_CANDIDATES', candidates: [fact] } } }; }

test('Report Presentation renders the fixed introduction, independent customer-result pages, and static next-decision page', async ({ page }) => {
  let data: any = draft(); let patchBody: any;
  await page.route(`**/cases/${caseId}/design-v2/report-drafts/${reportId}`, async route => { if (route.request().method() === 'GET') { await route.fulfill({ json: data }); return; } patchBody = route.request().postDataJSON(); data = { ...data, contentVersion: 2, content: patchBody }; await route.fulfill({ json: data }); });
  await page.goto(`${url}/admin/free-diagnosis-v2-report.html?caseId=${caseId}&reportId=${reportId}`);
  await expect(page.getByRole('heading', { name: '正式レポートの確認' })).toBeVisible();
  await expect(page.locator('.report-cover')).toContainText('会社の未来から、ITを考える。');
  await expect(page.locator('.report-page')).toHaveCount(8);
  const introduction = page.locator('.report-introduction-document');
  await expect(introduction).toContainText('このレポートをお読みいただく前に');
  await expect(introduction).toContainText('このたびは「IT経営KAIZEN 無料診断」をご利用いただき、ありがとうございます。');
  await expect(introduction).toContainText('ITの「良し悪し」を採点する診断ではありません。');
  await expect(introduction).toContainText('本レポートが、これからのITについて考え、経営として次の判断を行うための材料となれば幸いです。');
  await expect(introduction.locator('.report-concept-diagram')).toContainText('01 実現したい会社の未来');
  await expect(introduction.locator('.report-concept-diagram')).toContainText('02 現在どこまで分かっているか');
  await expect(introduction.locator('.report-concept-diagram')).toContainText('04 現時点ではまだ判断できないこと');
  await expect(introduction.locator('.report-concept-diagram')).toContainText('03 未来に向けて確認することで、改善が期待できること');
  await expect(introduction.locator('.report-concept-diagram')).toContainText('技術 ｜ 運用 ｜ 管理');
  await expect(introduction.locator('.report-concept-diagram')).toContainText('05 次に確認する価値があること');
  await expect(introduction.locator('.report-concept-diagram')).toContainText('次の経営判断へ');
  await expect(introduction).not.toContainText('少人数で成長する');
  await expect(introduction).not.toContainText('共有内容');
  await expect(page.locator('.executive-summary, .summary-paragraph, .summary-item, .summary-result, .summary-premise, .summary-results')).toHaveCount(0);
  await expect(page.locator('.diagnosis-map, .map-grid, .map-result')).toHaveCount(0);
  await expect(page.locator('.report-future-page')).toContainText('少人数で成長する');
  await expect(page.locator('.report-current-page')).toContainText('状況を一部把握している');
  await expect(page.locator('.report-improvement-page')).toContainText('情報の流れを確認する価値がある');
  await expect(page.locator('.report-improvement-page .report-interpretation')).toContainText('現時点で「問題がある」と判断した項目ではありません。');
  await expect(page.locator('.report-unknowns-page')).toContainText('業務の詳細');
  await expect(page.locator('.report-unknowns-page .report-interpretation')).toContainText('「分からない」を「判断できる」に変えることが、ここで確認する目的です。');
  await expect(page.locator('.report-facts-page')).toContainText('05次に確認する価値があること');
  await expect(page.locator('.fact-candidate')).toContainText('共有内容');
  await expect(page.locator('.fact-candidate')).not.toContainText('確認すること');
  await expect(page.locator('.fact-candidate')).not.toContainText('なぜ確認する価値があるのか');
  await expect(page.locator('.fact-candidate')).not.toContainText('確認すると何が分かりそうか');
  await expect(page.locator('.report-document')).not.toContainText('今回の無料診断で整理したこと');
  await expect(page.locator('.assessment-bridge')).toHaveCount(0);
  await expect(page.locator('.report-next-decision-document')).toContainText('診断結果を、次の経営判断へ');
  await expect(page.locator('.next-decision-page')).toContainText('診断結果を、次の経営判断へ');
  await expect(page.locator('.service-option')).toHaveCount(4);
  await expect(page.locator('.next-decision-page')).toContainText('IT経営KAIZEN 導入支援');
  await expect(page.locator('.next-decision-page')).toContainText('当社への発注を前提とした診断ではありません');
  await expect(page.locator('.next-decision-page')).toContainText('「技術」「運用」「管理」の3つの視点');
  await expect(page.locator('.next-decision-page')).toContainText('最後に判断するのは経営者です');
  await expect(page.locator('.assessment-flow, .assessment-bridge, .report-proposal, .proposal-facts')).toHaveCount(0);
  await expect(page.locator('.report-document')).not.toContainText('より詳しい診断');
  await expect(page.locator('.report-document')).not.toContainText('TECHNOLOGY');
  await expect(page.locator('.report-document')).not.toContainText('MANAGEMENT');
  await expect(page.locator('[data-section-key], #sectionEditors')).toHaveCount(0);
  await expect(page.getByRole('link', { name: '診断結果の整理に戻る' })).toHaveAttribute('href', new RegExp(`caseId=${caseId}`));
  await page.locator('[data-candidate-id="fact-1"]').check(); await page.locator('[data-customer-expression="fact-1"]').fill('顧客向けの確認対象'); await page.locator('[data-reason="fact-1"]').fill('顧客向けの確認理由'); await page.locator('#durationText').fill('2〜4週間'); await page.locator('#priceExcludingTaxText').fill('個別にご相談のうえお見積り'); await page.getByRole('button', { name: '提案情報を保存' }).first().click();
  await expect.poll(() => patchBody?.assessmentProposal?.selectedCandidateIds).toEqual(['fact-1']);
  expect(patchBody.sections).toEqual(draft().content.sections); expect(patchBody.diagnosisMap).toEqual(draft().content.diagnosisMap); expect(Object.keys(patchBody.assessmentProposal.presentationByCandidateId)).toEqual(['fact-1']);
  await expect(page.locator('.report-next-decision-document')).not.toContainText('顧客向けの確認対象');
  await expect(page.locator('.report-next-decision-document')).not.toContainText('2〜4週間');
  await expect(page.locator('.report-next-decision-document')).not.toContainText('個別にご相談のうえお見積り');
});

test('Report Presentation has no print, PDF, or Approval action', async ({ page }) => {
  const source = readFileSync(path.resolve(__dirname, '../public/admin/free-diagnosis-v2-report.js'), 'utf8'); expect(source).not.toContain('window.print()');
  await page.route(`**/cases/${caseId}/design-v2/report-drafts/${reportId}`, route => route.fulfill({ json: draft() })); await page.goto(`${url}/admin/free-diagnosis-v2-report.html?caseId=${caseId}&reportId=${reportId}`);
  await expect(page.getByText(/PDF|承認/)).toHaveCount(0);
});

test('Post-Hearing opens the reusable Draft without creating a report version per click', async ({ page }) => {
  let ensureCalls = 0; await page.route('**/design-v2/post-hearing-analysis', route => route.fulfill({ json: { originalSurvey: { answers: { q1CompanyContext: { employeeRange: 'EMP_21_50', siteRange: 'SITE_1' }, q2Future: ['BUSINESS_GROWTH'], q3ItExpectations: ['PRODUCTIVITY'], q4CurrentInterest: 'MANAGEMENT_DECISION', q5Visibility: 'VISIBLE_PARTIAL', q6ManagementConnection: 'REPORTED_NOT_DECISION_USABLE', q7InterestThemes: ['AI'] } }, hearingRecords: [], currentCompanyContext: { employeeRange: 'EMP_21_50', siteRange: 'SITE_1' }, currentStructuredState: { q2Future: ['BUSINESS_GROWTH'], q3ItExpectations: ['PRODUCTIVITY'], q4CurrentInterest: 'MANAGEMENT_DECISION', q5Visibility: 'VISIBLE_PARTIAL', q6ManagementConnection: 'REPORTED_NOT_DECISION_USABLE', q7InterestThemes: ['AI'] }, currentStateRevision: { id: 'state-1', revisionNo: 1 }, currentStateDiffFromOriginal: {}, latestAnalysisResult: { analysis: { futureUnderstanding: [], currentUnderstanding: [], lensFindings: [], unknowns: [], hearingViewpoints: [], factCandidates: [] } }, latestGeneratedNarrative: { id: 'generated', content: { future: { heading: '未来', entries: [] }, currentUnderstanding: { heading: '現在', entries: [] }, confirmationAndImprovement: { heading: '改善', entries: [] }, unknowns: { heading: '未確認', entries: [] }, nextFacts: { heading: '次', entries: [] } } }, latestHumanEditedNarrative: null, humanEditedNarrativeStatus: 'NONE', analysisFreshness: 'CURRENT', traceability: { viewpoints: [], analysisItemThemes: {}, narrativeSectionThemes: {} } } }));
  await page.route('**/report-drafts/ensure', async route => { ensureCalls++; await route.fulfill({ json: { id: reportId, version: 1 } }); }); await page.goto(`${url}/admin/free-diagnosis-v2-analysis.html?caseId=${caseId}`); await page.getByRole('button', { name: 'レポートを確認' }).click(); await expect(page).toHaveURL(new RegExp(`reportId=${reportId}`)); expect(ensureCalls).toBe(1);
});
