import type {Pool} from 'pg';
import {DiagnosisError,type Actor} from '../domain/itManagementDiagnosis';

type Status='OBSERVED'|'NOT_OBSERVED'|'NOT_DERIVABLE'|'INCOMPLETE';
function metric<T>(value:T|null,status:Status='OBSERVED',classification='DERIVED') {return {classification,status,value};}
const observedCount=(n:number)=>metric(n>0?n:null,n>0?'OBSERVED':'NOT_OBSERVED');
const iso=(v:Date|string)=>new Date(v).toISOString();
function duration(start?:{id:string;at:Date|string},end?:{id:string;at:Date|string}){
 const seconds=start&&end?(new Date(end.at).getTime()-new Date(start.at).getTime())/1000:null;
 return {...metric(seconds!==null&&seconds>=0?seconds:null,!start&&!end?'NOT_OBSERVED':seconds===null||seconds<0?'INCOMPLETE':'OBSERVED'),unit:'seconds',semantics:'RECORDED_ELAPSED_NOT_ACTIVE_LABOR',start:start?{id:start.id,at:iso(start.at)}:null,end:end?{id:end.id,at:iso(end.at)}:null};
}
const approvalCommands=new Set(['AcceptAIProposal','EditAndAcceptAIProposal','ApproveAIProposal','ApproveAIProposalWithEdit','ConvertProposalToUnknown','CreateHumanInsight','CreateAssessmentConfirmationItem','ConfirmDiagnosisPlan','CompleteHumanReview','ApproveReport']);
const correctionCommands=new Set(['EditAndAcceptAIProposal','ApproveAIProposalWithEdit','ConvertProposalToUnknown']);
const auditCommands=[...approvalCommands,...correctionCommands,'RejectAIProposal','ResolveInterviewSuggestion','UpdateReportWording','CreateHumanReportDraft','StartFeedback','CompleteFeedback','MarkReportDelivered','RecordManagementFeedbackDecision','ProposeAssessment'];
interface Audit {id:string;command:string;created_at:Date;tick:string;action:string|null;report_id:string|null;decision_id:string|null}
interface Decision {id:string;version:number;route_code:string;supersedes_decision_id:string|null;decided_at:Date;context_hash:string;customer_restatement_source_id:string|null}
interface Report {id:string;source_ai_execution_id:string|null;created_at:Date;approved_at:Date|null}
interface Transition {id:string;to_status:string;command:string;created_at:Date;tick:string}

/** Metadata whitelist only. Never use the raw-reading aggregate repos for instrumentation. */
export class PilotInstrumentationRepo {
 constructor(private readonly pool:Pool){}
 async read(id:string,actor:Actor){
  if(actor.kind!=='STAFF'||!actor.userId.trim())throw new DiagnosisError(403,'スタッフ認証が必要です。');
  const c=await this.pool.connect();
  try{
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const row=(await c.query<{id:string;version:number;diagnosis_status:string;assessment_status:string}>('SELECT id,version,diagnosis_status,assessment_status FROM diagnosis_cases WHERE id=$1',[id])).rows[0];
   if(!row)throw new DiagnosisError(404,'案件が見つかりません。');
   const executions=(await c.query<{id:string;process_type:string;status:string}>('SELECT id,process_type,status FROM ai_executions WHERE diagnosis_case_id=$1 ORDER BY created_at,id',[id])).rows;
   const proposalCount=Number((await c.query<{n:string}>('SELECT count(*)::text AS n FROM ai_proposals WHERE diagnosis_case_id=$1',[id])).rows[0]!.n);
   const reports=(await c.query<Report>('SELECT id,source_ai_execution_id,created_at,approved_at FROM diagnosis_reports WHERE diagnosis_case_id=$1 ORDER BY version',[id])).rows;
   const audit=(await c.query<Audit>(`SELECT id,command,created_at,extract(epoch FROM created_at)::text AS tick,
    CASE WHEN command='ResolveInterviewSuggestion' THEN detail_json->>'action' END AS action,
    CASE WHEN command IN ('UpdateReportWording','StartFeedback','CompleteFeedback','MarkReportDelivered','ApproveReport') THEN detail_json->>'report_id' END AS report_id,
    CASE WHEN command='RecordManagementFeedbackDecision' THEN detail_json->>'decision_id' END AS decision_id
    FROM diagnosis_audit_logs WHERE diagnosis_case_id=$1 AND actor_type='STAFF' AND command=ANY($2::text[]) ORDER BY created_at,id`,[id,auditCommands])).rows;
   const decisions=(await c.query<Decision>(`SELECT id,version,route_code,supersedes_decision_id,decided_at,context_hash,customer_restatement_source_id FROM management_feedback_decisions WHERE diagnosis_case_id=$1 ORDER BY version`,[id])).rows;
   const statements=(await c.query<{id:string;created_at:Date}>(`SELECT id,created_at FROM source_records WHERE diagnosis_case_id=$1 AND source_type='FEEDBACK_STATEMENT' ORDER BY created_at,id`,[id])).rows;
   const transitions=(await c.query<Transition>(`SELECT id,to_status,command,created_at,extract(epoch FROM created_at)::text AS tick FROM case_transitions WHERE diagnosis_case_id=$1 AND actor_type='STAFF' AND (to_status='HUMAN_REVIEW_REQUIRED' OR command='CompleteHumanReview') ORDER BY created_at,id`,[id])).rows;
   // Select individual coded keys, never arbitrary detail_json (which can contain raw review text).
   const coded=(await c.query<{id:string;created_at:Date;categories:unknown}>(`SELECT id,created_at,jsonb_build_object(
    'confusing_question_codes',detail_json->'confusing_question_codes',
    'unknown_pattern_codes',detail_json->'unknown_pattern_codes',
    'operator_correction_categories',detail_json->'operator_correction_categories',
    'ai_misclassification_categories',detail_json->'ai_misclassification_categories',
    'management_feedback_reaction',detail_json->'management_feedback_reaction',
    'customer_feedback_signal',detail_json->'customer_feedback_signal') AS categories
    FROM diagnosis_audit_logs WHERE diagnosis_case_id=$1 AND actor_type='STAFF' AND command='RecordControlledPilotEvidence' ORDER BY created_at,id`,[id])).rows;
   const last=decisions.at(-1),latestReport=reports.at(-1),aiReportIds=new Set(reports.filter(r=>r.source_ai_execution_id).map(r=>r.id));
   const chainComplete=decisions.every((d,i)=>d.version===i+1&&d.supersedes_decision_id===(decisions[i-1]?.id??null));
   let proposed=metric<boolean>(null,'NOT_OBSERVED');
   if(last){
    const decisionAudit=audit.filter(a=>a.command==='RecordManagementFeedbackDecision'&&a.decision_id===last.id);
    const proposals=audit.filter(a=>a.command==='ProposeAssessment');
    if(last.route_code!=='DESIGN_ASSESSMENT')proposed=metric(false);
    else if(decisionAudit.length!==1)proposed=metric(null,'INCOMPLETE');
    else if(proposals.some(a=>Number(a.tick)>Number(decisionAudit[0]!.tick)))proposed=metric(true);
    else if(proposals.some(a=>a.tick===decisionAudit[0]!.tick)||(!proposals.length&&row.assessment_status!=='NOT_PROPOSED'))proposed=metric(null,'INCOMPLETE');
    else proposed=metric(false);
   }
   const reviewStart=transitions.filter(t=>t.to_status==='HUMAN_REVIEW_REQUIRED').at(-1);
   const reviewEnd=reviewStart?transitions.find(t=>t.command==='CompleteHumanReview'&&Number(t.tick)>=Number(reviewStart.tick)):transitions.filter(t=>t.command==='CompleteHumanReview').at(-1);
   const feedbackEvents=audit.filter(a=>['StartFeedback','CompleteFeedback','MarkReportDelivered'].includes(a.command));
   const feedbackStart=latestReport?feedbackEvents.find(a=>a.command==='StartFeedback'&&a.report_id===latestReport.id):undefined;
   const feedbackEnd=latestReport?feedbackEvents.find(a=>a.command==='CompleteFeedback'&&a.report_id===latestReport.id):undefined;
   const suggestions=proposalCount+aiReportIds.size;
   const result={case:row,coverage:'PERSISTED_APPLICATION_OBSERVATIONS_ONLY',metrics:{
    ai_suggestion_count:suggestions||executions.some(e=>e.status==='SUCCEEDED')?metric(suggestions):metric<number>(null,'NOT_OBSERVED'),
    ai_failure_count:executions.length?metric(executions.filter(e=>e.status==='FAILED').length):metric<number>(null,'NOT_OBSERVED'),
    human_ai_correction_count:observedCount(audit.filter(a=>correctionCommands.has(a.command)||(a.command==='UpdateReportWording'&&aiReportIds.has(a.report_id??''))).length),
    human_ai_rejection_count:observedCount(audit.filter(a=>a.command==='RejectAIProposal'||(a.command==='ResolveInterviewSuggestion'&&a.action==='UNNECESSARY')).length),
    human_approval_count:observedCount(audit.filter(a=>approvalCommands.has(a.command)).length),
    customer_correction_or_restatement_observed:metric(statements.length?true:null,statements.length?'OBSERVED':'NOT_OBSERVED'),
    selected_route:metric(last?.route_code??null,last?'OBSERVED':'NOT_OBSERVED'),
    redecision_count:metric(last&&chainComplete?decisions.length-1:null,!last?'NOT_OBSERVED':chainComplete?'OBSERVED':'INCOMPLETE'),
    assessment_proposed_after_route_c:proposed,
    manual_fallback_count:{...observedCount(audit.filter(a=>a.command==='CreateHumanReportDraft').length),scope:'EXPLICIT_MANUAL_REPORT_DRAFT_COMMANDS_ONLY'},
    feedback_preparation_duration:duration(latestReport?{id:latestReport.id,at:latestReport.created_at}:undefined,latestReport?.approved_at?{id:latestReport.id,at:latestReport.approved_at}:undefined),
    human_review_duration:duration(reviewStart?{id:reviewStart.id,at:reviewStart.created_at}:undefined,reviewEnd?{id:reviewEnd.id,at:reviewEnd.created_at}:undefined),
    feedback_conversation_duration:metric<never>(null,'NOT_DERIVABLE','NOT_DERIVABLE'),
    recorded_feedback_elapsed:duration(feedbackStart?{id:feedbackStart.id,at:feedbackStart.created_at}:undefined,feedbackEnd?{id:feedbackEnd.id,at:feedbackEnd.created_at}:undefined),
    existing_coded_pilot_evidence:metric(coded.length?coded.map(e=>({id:e.id,at:iso(e.created_at),categories:safeCategories(e.categories)})):null,coded.length?'OBSERVED':'NOT_OBSERVED','MANUAL_CODED'),
   },references:{
    decisions:decisions.map(d=>({id:d.id,version:d.version,route:d.route_code,supersedes_decision_id:d.supersedes_decision_id,at:iso(d.decided_at),hash:d.context_hash,customer_restatement_source_id:statements.some(s=>s.id===d.customer_restatement_source_id)?d.customer_restatement_source_id:null})),
    restatements:statements.map(s=>({id:s.id,type:'FEEDBACK_STATEMENT',at:iso(s.created_at)})),
    events:audit.map(a=>({id:a.id,command:a.command,at:iso(a.created_at)})),
   }};
   await c.query('COMMIT');return result;
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
 }
}

function safeCategories(input:unknown){
 const raw=input&&typeof input==='object'?input as Record<string,unknown>:{};
 const out:Record<string,string|string[]>={};
 for(const key of ['confusing_question_codes','unknown_pattern_codes','operator_correction_categories','ai_misclassification_categories']){
  const value=raw[key];if(Array.isArray(value))out[key]=value.filter((v):v is string=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,80}$/.test(v)).slice(0,30);
 }
 for(const [key,allowed] of Object.entries({management_feedback_reaction:['POSITIVE','NEUTRAL','NEGATIVE','NOT_OBSERVED'],customer_feedback_signal:['POSITIVE','NEUTRAL','NEGATIVE','NONE']})){
  const value=raw[key];if(typeof value==='string'&&allowed.includes(value))out[key]=value;
 }
 return out;
}
