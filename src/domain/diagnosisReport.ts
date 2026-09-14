import { createHash,randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DiagnosisError } from './itManagementDiagnosis';
import type { InsightInput } from './diagnosisReview';
export const REPORT_PROMPT_VERSION='report-draft-generator-v2';
export const REPORT_POLICY_VERSION='free-diagnosis-report-v2';
// Internal section keys remain stable for compatibility. Customer/management-facing titles translate them to the Business Launch Gate five-block language.
export const SECTIONS=['FUTURE','CURRENT_AND_UNKNOWN','GAP','ROOT_CAUSE_AND_KAIZEN','NEXT_CONFIRMATION'] as const;
export const SECTION_TITLES:Record<typeof SECTIONS[number],string>={
 FUTURE:'実現したい会社の未来',
 CURRENT_AND_UNKNOWN:'現時点で把握していること / まだ確認が必要なこと',
 GAP:'Futureとの差（Gapの可能性）',
 ROOT_CAUSE_AND_KAIZEN:'WHY：なぜこのGapが起きている可能性があるか',
 NEXT_CONFIRMATION:'NEXT DECISION：次に確認・判断すべきこと',
};
export type FutureKnowledgeStatus='CUSTOMER_STATED'|'UNKNOWN';
export interface ReportInsight {id:string;version:number;semantic_type:InsightInput['semantic_type'];title:string;content:string;unknown_type:InsightInput['unknown_type'];area_tag:InsightInput['area_tag'];improvement_lens:InsightInput['improvement_lens'];report_text:string;why_connection?:{supporting_insight_refs:string[];evidence_confirmation_refs:string[]}}
export interface ReportContext {
 organization_display_name:string;provider_display_name:string;
 future:{id:string;version:number;statement:string;time_horizon:string|null;intent_status:string;knowledge_status:FutureKnowledgeStatus;report_text:string};
 insights:ReportInsight[];
 assessment_confirmation_items:{id:string;title:string;purpose:string;priority:number;status:'OPEN';report_text:string}[];
}
export const SEMANTIC_LABELS:Record<InsightInput['semantic_type'],string>={OBSERVATION:'観察（Human Review済み）',UNKNOWN:'未確認',HYPOTHESIS:'仮説',GAP_CANDIDATE:'Gapの可能性',ROOT_CAUSE_HYPOTHESIS:'Root Cause仮説',KAIZEN_DIRECTION:'KAIZENの方向性（候補）',EVIDENCE_CANDIDATE:'Evidence確認候補'};
export function insightReportText(i:Pick<ReportInsight,'semantic_type'|'content'|'unknown_type'>){return `${SEMANTIC_LABELS[i.semantic_type]}${i.unknown_type?'（'+i.unknown_type+'）':''}：${i.content}`;}
export function whyConnectionReportText(hypothesis:Pick<ReportInsight,'semantic_type'|'content'>,supporting:ReportInsight[],evidence:{title:string;purpose:string}[]){
 return [`${SEMANTIC_LABELS[hypothesis.semantic_type]}：${hypothesis.content}`,`Supporting Observation / Context：${supporting.map(i=>i.content).join(' / ')||'未接続（Human Reviewで確認が必要）'}`,`Evidence Needed：${evidence.map(i=>`${i.title}（${i.purpose}）`).join(' / ')||'未接続（Human Reviewで確認が必要）'}`].join('\n');
}
/** Q01 may validly be "分からない". Treat that as epistemic UNKNOWN, never as a fabricated Future statement. */
export function futureKnowledgeStatus(statement:string):FutureKnowledgeStatus{
 return statement.split('/').map(v=>v.trim()).includes('分からない')?'UNKNOWN':'CUSTOMER_STATED';
}
export function futureReportText(input:{statement:string;time_horizon:string|null;intent_status:string;knowledge_status?:FutureKnowledgeStatus}){
 const status=input.knowledge_status??futureKnowledgeStatus(input.statement);
 if(status==='UNKNOWN') return 'FUTUREは現時点で未確認です。Management Feedbackで経営者の言葉を確認します。';
 return `${input.intent_status==='SURVEY_STATED'?'アンケート回答時点の意図':'対話で再確認した意図'}：${input.statement}${input.time_horizon?'（'+input.time_horizon+'）':''}`;
}
const text=z.string().min(1).max(20000),ids=z.array(z.string().uuid()).max(30);
const blockSchema=z.object({block_type:z.enum(['FUTURE','INSIGHT','ASSESSMENT']),text,insight_refs:ids,assessment_refs:ids}).strict();
export const reportOutputSchema=z.object({sections:z.array(z.object({section_key:z.enum(SECTIONS),title:text.max(200),blocks:z.array(blockSchema).max(100)}).strict()).length(5)}).strict();
export type ReportOutput=z.infer<typeof reportOutputSchema>;
export type StoredReport={sections:{section_key:typeof SECTIONS[number];title:string;blocks:(ReportOutput['sections'][number]['blocks'][number]&{block_id:string;section:typeof SECTIONS[number]})[]}[]};
const object=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const REPORT_JSON_SCHEMA=object({sections:{type:'array',items:object({section_key:{type:'string',enum:SECTIONS},title:{type:'string'},blocks:{type:'array',items:object({block_type:{type:'string',enum:['FUTURE','INSIGHT','ASSESSMENT']},text:{type:'string'},insight_refs:{type:'array',items:{type:'string'}},assessment_refs:{type:'array',items:{type:'string'}}})}})}});
/** Formatting-only equivalence: no model/heuristic decides that a new diagnosis is equivalent. */
export function sameWording(a:string,b:string){
 const normalize=(s:string)=>s.replace(/である(?=。|$)/g,'です').replace(/可能性がある(?=。|$)/g,'可能性があります').replace(/と考えられる(?=。|$)/g,'と考えられます').replace(/確認できていない(?=。|$)/g,'確認できていません')
  .replace(/[\s\u3000]+/g,(space:string,offset:number,whole:string)=>/[A-Za-z0-9０-９]/.test(whole[offset-1]??'')&&/[A-Za-z0-9０-９]/.test(whole[offset+space.length]??'')?' ':'');
 return normalize(a)===normalize(b);
}
function expectedSection(i:ReportInsight):typeof SECTIONS[number]{
 if(i.semantic_type==='GAP_CANDIDATE') return 'GAP';
 // A generic hypothesis is not "known current state". Keep hypotheses on the explicitly hypothetical WHY page.
 if(['HYPOTHESIS','ROOT_CAUSE_HYPOTHESIS'].includes(i.semantic_type)) return 'ROOT_CAUSE_AND_KAIZEN';
 // KAIZEN_DIRECTION is still only a candidate; present it under NEXT DECISION rather than mixing a proposed solution into WHY.
 if(['KAIZEN_DIRECTION','EVIDENCE_CANDIDATE'].includes(i.semantic_type)) return 'NEXT_CONFIRMATION';
 return 'CURRENT_AND_UNKNOWN';
}
export function assertWhyConnectionsReady(context:ReportContext){
 for(const insight of context.insights.filter(i=>['HYPOTHESIS','ROOT_CAUSE_HYPOTHESIS'].includes(i.semantic_type))){
  if(!insight.why_connection?.supporting_insight_refs.length||!insight.why_connection.evidence_confirmation_refs.length)throw new DiagnosisError(409,'WHY_CONNECTION_REVIEW_REQUIRED');
 }
}
export function validateReportOutput(raw:unknown,context:ReportContext):ReportOutput{
 const parsed=reportOutputSchema.safeParse(raw);if(!parsed.success)throw new DiagnosisError(422,'REPORT_SCHEMA_INVALID');
 if(new Set(parsed.data.sections.map(s=>s.section_key)).size!==5)throw new DiagnosisError(422,'REPORT_SECTIONS_INVALID');
 const used=new Set<string>();let futureCount=0;
 for(const section of parsed.data.sections){
  if(!sameWording(section.title,SECTION_TITLES[section.section_key]))throw new DiagnosisError(422,'REPORT_MEANING_CHANGE_REQUIRES_REVIEW');
  for(const block of section.blocks){let expected:string;
   if(new Set(block.insight_refs).size!==block.insight_refs.length||new Set(block.assessment_refs).size!==block.assessment_refs.length)throw new DiagnosisError(422,'REPORT_REFS_INVALID');
   if(block.block_type==='FUTURE'){
    if(section.section_key!=='FUTURE'||block.insight_refs.length||block.assessment_refs.length||++futureCount>1)throw new DiagnosisError(422,'REPORT_REFS_INVALID');expected=context.future.report_text;
   }else if(block.block_type==='ASSESSMENT'){
    if(section.section_key!=='NEXT_CONFIRMATION'||block.insight_refs.length||!block.assessment_refs.length)throw new DiagnosisError(422,'REPORT_REFS_INVALID');
    expected=block.assessment_refs.map(id=>{const a=context.assessment_confirmation_items.find(a=>a.id===id);if(!a)throw new DiagnosisError(422,'REPORT_ASSESSMENT_REF_INVALID');return a.report_text;}).join('\n');
   }else{
    if(!block.insight_refs.length||block.assessment_refs.length)throw new DiagnosisError(422,'REPORT_REFS_INVALID');
    expected=block.insight_refs.map(id=>{const i=context.insights.find(i=>i.id===id);if(!i||expectedSection(i)!==section.section_key)throw new DiagnosisError(422,'REPORT_INSIGHT_REF_INVALID');if(used.has(id))throw new DiagnosisError(422,'REPORT_DUPLICATE_INSIGHT');used.add(id);return i.report_text;}).join('\n');
   }
   if(!sameWording(block.text,expected))throw new DiagnosisError(422,'REPORT_MEANING_CHANGE_REQUIRES_REVIEW');
  }
 }
 if(futureCount!==1)throw new DiagnosisError(422,'REPORT_FUTURE_REQUIRED');
 return parsed.data;
}
export function manualReport(context:ReportContext):ReportOutput{
 return {sections:SECTIONS.map(section_key=>({section_key,title:SECTION_TITLES[section_key],blocks:[
  ...(section_key==='FUTURE'?[{block_type:'FUTURE' as const,text:context.future.report_text,insight_refs:[],assessment_refs:[]}]:[]),
  ...context.insights.filter(i=>expectedSection(i)===section_key).map(i=>({block_type:'INSIGHT' as const,text:i.report_text,insight_refs:[i.id],assessment_refs:[]})),
  ...(section_key==='NEXT_CONFIRMATION'?context.assessment_confirmation_items.map(a=>({block_type:'ASSESSMENT' as const,text:a.report_text,insight_refs:[],assessment_refs:[a.id]})):[]),
 ]}))};
}
export function storeReport(output:ReportOutput):StoredReport{return {sections:output.sections.map(s=>({...s,blocks:s.blocks.map(b=>({...b,block_id:randomUUID(),section:s.section_key}))}))};}
export function reportOutput(stored:StoredReport):ReportOutput{return {sections:stored.sections.map(s=>({...s,blocks:s.blocks.map(({block_id,section,...b})=>b)}))};}
export function contentHash(value:unknown){const ordered=(v:any):any=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;return createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex');}
export const reportCommandSchema=z.object({report_id:z.string().uuid(),expectedVersion:z.number().int().positive()}).strict();
export const wordingSchema=reportCommandSchema.extend({blocks:z.array(z.object({block_id:z.string().uuid(),text}).strict()).min(1).max(200)}).strict();
export const revisionSchema=reportCommandSchema.extend({reason:text.max(2000),return_to_review:z.boolean()}).strict();
export const reissueSchema=z.object({expectedVersion:z.number().int().positive(),reason:text.max(2000)}).strict();
