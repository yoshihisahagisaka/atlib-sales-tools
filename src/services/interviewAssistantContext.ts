import type { PoolClient } from 'pg';
import { buildPreDiagnosisContext } from './preDiagnosisContext';

/** Bounded raw excerpts, explicitly typed. No contact details, staff identity or secrets. */
export async function buildInterviewAssistantContext(c: PoolClient, id: string) {
 const survey = await buildPreDiagnosisContext(c,id);
 const {rows:cases}=await c.query('SELECT plan_snapshot_json FROM diagnosis_cases WHERE id=$1',[id]);
 const {rows:themes}=await c.query<{id:string;title:string;description:string;future_relation:string}>(`SELECT id,title,description,future_relation FROM diagnosis_themes WHERE diagnosis_case_id=$1 AND status='ACTIVE' ORDER BY priority_order LIMIT 100`,[id]);
 const {rows:plan}=await c.query(`SELECT id,diagnosis_theme_id,item_type,text,purpose FROM diagnosis_plan_items WHERE diagnosis_case_id=$1 AND status='ACTIVE' ORDER BY priority_order LIMIT 100`,[id]);
 const {rows:sources}=await c.query<{id:string;source_type:string;content:string;is_excerpt:boolean;parent_source_record_id:string|null}>(`SELECT id,source_type,left(content,2000) AS content,length(content)>2000 AS is_excerpt,parent_source_record_id FROM source_records WHERE diagnosis_case_id=$1 ORDER BY created_at DESC,id DESC LIMIT 20`,[id]);
 const {rows:unknowns}=await c.query(`SELECT p.id,p.proposal_type,p.content_json FROM ai_proposals p JOIN ai_executions e ON e.id=p.ai_execution_id WHERE p.diagnosis_case_id=$1 AND e.process_type='PRE_DIAGNOSIS_ORGANIZER' AND p.proposal_type IN ('UNKNOWN','HYPOTHESIS') AND p.status IN ('GENERATED','UNDER_REVIEW','ACCEPTED','ACCEPTED_WITH_EDIT') ORDER BY p.created_at DESC LIMIT 10`,[id]);
 const {rows:recent}=await c.query(`SELECT p.id,p.status,p.content_json FROM ai_proposals p JOIN ai_executions e ON e.id=p.ai_execution_id WHERE p.diagnosis_case_id=$1 AND e.process_type='INTERVIEW_ASSISTANT' ORDER BY p.created_at DESC,p.display_order LIMIT 10`,[id]);
 // Snapshot includes only plan business fields; audit staff principals stay in DB.
 const snapshot=cases[0]?.plan_snapshot_json;
 const confirmed_plan=snapshot ? {
  themes:snapshot.themes.slice(0,100).map((t: any)=>({id:t.id,title:t.title,description:t.description,future_relation:t.future_relation})),
  plan_items:snapshot.plan_items.slice(0,100).map((p: any)=>({id:p.id,diagnosis_theme_id:p.diagnosis_theme_id,item_type:p.item_type,text:p.text,purpose:p.purpose})),
 } : null;
 return { future:survey.future,questions:survey.questions,responses:survey.responses,confirmed_plan,themes,plan_items:plan,sources,preparation_unknowns_and_hypotheses:unknowns,recent_suggestions:recent };
}
export type InterviewContext = Awaited<ReturnType<typeof buildInterviewAssistantContext>>;
export function interviewSourceKeys(context: InterviewContext) {
 return new Set([...context.responses.map(r=>`SURVEY_RESPONSE:${r.id}`),...context.sources.map(r=>`SOURCE_RECORD:${r.id}`)]);
}
