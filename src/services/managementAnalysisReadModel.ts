import type {PoolClient} from 'pg';
import {progressiveReuseReadModel} from './progressiveReuseReadModel';
import {buildReportContext} from './reportContext';
import {AREAS,LENSES} from '../domain/diagnosisReview';

/** Application display projection. No semantic inference, ranking, adoption or decision writes. */
export async function managementAnalysisReadModel(c:PoolClient,id:string){
 const reuse=await progressiveReuseReadModel(c,id);
 const report=await c.query('SELECT id FROM diagnosis_futures WHERE diagnosis_case_id=$1 AND is_current',[id]);
 const reportContext=report.rows.length?await buildReportContext(c,id):null;
 const approved=(await c.query(`SELECT i.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('source_ref_type',s.source_ref_type,'source_ref_id',s.source_ref_id,'relation',s.relation)) FROM insight_sources s WHERE s.diagnosis_insight_id=i.id),'[]'::jsonb) AS source_refs FROM diagnosis_insights i WHERE i.diagnosis_case_id=$1 AND i.review_status='HUMAN_APPROVED' ORDER BY i.created_at,i.id`,[id])).rows;
 const proposals=(await c.query(`SELECT p.* FROM ai_proposals p JOIN ai_executions e ON e.id=p.ai_execution_id WHERE p.diagnosis_case_id=$1 AND e.process_type='POST_DIAGNOSIS_STRUCTURER' AND e.status='SUCCEEDED' AND e.validation_status='VALID' AND p.status IN ('GENERATED','UNDER_REVIEW') AND p.title<>'[REDACTED]' ORDER BY p.created_at,p.display_order`,[id])).rows;
 const rawSources=(await c.query('SELECT id,source_type,content,created_at FROM source_records WHERE diagnosis_case_id=$1',[id])).rows;
 const entries=[...reuse.known,...reuse.unknown,...reuse.hypotheses];
 const items=[...approved.map(i=>({...i,approval:'HUMAN_APPROVED' as const})),...proposals.map(p=>({...p.content_json,id:p.id,approval:'PROPOSAL' as const}))].map(i=>({
  id:i.id,title:i.title,content:i.content,semantic_type:i.semantic_type,unknown_type:i.unknown_type,area_tag:i.area_tag,improvement_lens:i.improvement_lens,diagnosis_theme_id:i.diagnosis_theme_id,approval:i.approval,
  // Approved WHY links are exactly the MF-B report projection, never inferred separately here.
  why_connection:i.approval==='HUMAN_APPROVED'?reportContext?.insights.find(r=>r.id===i.id)?.why_connection??null:null,
  sources:(i.source_refs as {source_ref_type:string;source_ref_id:string;relation:string}[]).map(ref=>{
   const found=entries.filter(e=>e.origin.kind===ref.source_ref_type&&e.origin.id===ref.source_ref_id);
   const raw=ref.source_ref_type==='SOURCE_RECORD'?rawSources.find(s=>s.id===ref.source_ref_id):null;
   return {type:ref.source_ref_type,id:ref.source_ref_id,relation:ref.relation,label:found[0]?.origin_label??(raw?.source_type==='TRANSCRIPT'?'会話記録':'元の情報'),text:found.length?found.map(e=>e.text).join('\n'):raw&&raw.content!=='[REDACTED]'?raw.content:'表示できる元の情報はありません。',recorded_at:found[0]?.recorded_at??raw?.created_at??null};
  })
 }));
 const directions=items.filter(i=>i.semantic_type==='KAIZEN_DIRECTION');
 const cells=AREAS.flatMap(area=>LENSES.map(lens=>({area,lens,items:directions.filter(i=>i.area_tag===area&&i.improvement_lens===lens)}))).filter(cell=>cell.items.length);
 const decision=(await c.query(`SELECT route_code,material_decision,next_action,decided_by_user_id,decided_at,version FROM management_feedback_decisions WHERE diagnosis_case_id=$1 ORDER BY version DESC LIMIT 1`,[id])).rows[0]??null;
 return {reuse,items,lens:{cells,unclassified:directions.filter(i=>!AREAS.includes(i.area_tag)||!LENSES.includes(i.improvement_lens))},report_context:reportContext,decision};
}
