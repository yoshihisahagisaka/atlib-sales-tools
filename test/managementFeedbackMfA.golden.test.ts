import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {futureKnowledgeStatus,futureReportText,insightReportText,manualReport,validateReportOutput,type ReportContext,type ReportInsight} from '../src/domain/diagnosisReport';

function insight(semantic_type:ReportInsight['semantic_type'],content:string,unknown_type:ReportInsight['unknown_type']=null):ReportInsight{
 return {id:randomUUID(),version:1,semantic_type,title:content,content,unknown_type,area_tag:null,improvement_lens:null,report_text:insightReportText({semantic_type,content,unknown_type})};
}

function context(statement:string):ReportContext{
 const knowledge_status=futureKnowledgeStatus(statement);
 return {
  organization_display_name:'Synthetic株式会社様',provider_display_name:'atLIB株式会社',
  future:{id:randomUUID(),version:1,statement,time_horizon:'1〜3年',intent_status:'SURVEY_STATED',knowledge_status,report_text:futureReportText({statement,time_horizon:'1〜3年',intent_status:'SURVEY_STATED',knowledge_status})},
  insights:[
   insight('OBSERVATION','組織変更が予定されている'),
   insight('UNKNOWN','経営者が実現したいFUTUREは未確認','NOT_YET_CONFIRMED'),
   insight('HYPOTHESIS','役割分担を確認する必要がある可能性があります'),
   insight('GAP_CANDIDATE','Futureに対して責任と権限の確認が必要な可能性があります'),
  ],
  assessment_confirmation_items:[],
 };
}

test('MF-A: Q01 分からない is projected as explicit FUTURE UNKNOWN without fabricated future',()=>{
 const ctx=context('分からない');
 assert.equal(ctx.future.knowledge_status,'UNKNOWN');
 assert.equal(ctx.future.report_text,'目指している会社の姿は現時点で未確認です。経営フィードバックまでに経営者の言葉を確認します。');
 assert.equal(ctx.future.report_text.includes('分からない（1〜3年）'),false);
 const report=manualReport(ctx);
 assert.deepEqual(validateReportOutput(report,ctx),report);
 assert.equal(report.sections[0]!.blocks[0]!.text,ctx.future.report_text);
});

test('MF-A: mixed Q01 including 分からない remains UNKNOWN rather than overstating intent',()=>{
 assert.equal(futureKnowledgeStatus('売上・事業を成長させたい / 分からない'),'UNKNOWN');
});

test('MF-A: Page 2 contains Observation/UNKNOWN only; Hypothesis is shown on WHY',()=>{
 const ctx=context('社員が本来の仕事に集中できる会社にしたい');
 const report=manualReport(ctx);
 const current=report.sections.find(s=>s.section_key==='CURRENT_AND_UNKNOWN')!;
 const why=report.sections.find(s=>s.section_key==='ROOT_CAUSE_AND_KAIZEN')!;
 assert.equal(current.title,'2. 今、確認できていること / 3. まだ分かっていないこと');
 assert.ok(current.blocks.some(b=>b.text.startsWith('確認できていること（Human Review済み）：')));
 assert.ok(current.blocks.some(b=>b.text.startsWith('まだ分かっていないこと（NOT_YET_CONFIRMED）：')));
 assert.equal(current.blocks.some(b=>b.text.startsWith('仮説：')),false);
 assert.ok(why.blocks.some(b=>b.text.startsWith('仮説：')));
 assert.deepEqual(validateReportOutput(report,ctx),report);
});
