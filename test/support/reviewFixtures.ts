import type { PostDiagnosisProvider } from '../../src/services/postDiagnosisProvider';
import type { PostDiagnosisContext } from '../../src/services/postDiagnosisContext';
import { INSIGHT_TYPES,type StructurerOutput,type InsightInput } from '../../src/domain/diagnosisReview';
import { startedCase } from './workspaceFixtures';
import { operator } from './preparationFixtures';
import type { createDiagnosisHarness } from './diagnosisHarness';
export function structurerOutput(c:PostDiagnosisContext):StructurerOutput{
 const source=c.sources[0];return {insight_candidates:INSIGHT_TYPES.map(semantic_type=>({semantic_type,title:semantic_type+'の候補',content:semantic_type==='OBSERVATION'?'端末管理台帳の存在を画面共有で確認したと記録されている':semantic_type==='UNKNOWN'?'情報の更新担当者は未確認':'情報共有の方法と目指す未来に差がある可能性',unknown_type:semantic_type==='UNKNOWN'?'NOT_YET_CONFIRMED':null,diagnosis_theme_id:c.themes[0]?.id??null,area_tag:'運用',improvement_lens:'整える',source_refs:[{source_ref_type:source?'SOURCE_RECORD':'SURVEY_RESPONSE',source_ref_id:source?.id??c.responses[0]!.id,relation:'RELATED'}]})),assessment_confirmation_items:[{title:'管理台帳の更新方法を確認する',purpose:'Assessmentで必要な情報を確認する',priority:1,diagnosis_theme_id:c.themes[0]?.id??null,related_candidate_index:6}]};
}
export class FakePostDiagnosisProvider implements PostDiagnosisProvider{
 readonly provider='fake';readonly model='deterministic-post-diagnosis';calls=0;
 run:(c:PostDiagnosisContext,s:AbortSignal)=>Promise<unknown>=async c=>structurerOutput(c);
 structure(c:PostDiagnosisContext,s:AbortSignal){this.calls++;return this.run(c,s);}
}
export async function reviewCase(h:Awaited<ReturnType<typeof createDiagnosisHarness>>){const c=await startedCase(h);
 const source=await h.workspace.addSource(c.id,operator,'INTERVIEW_STATEMENT',{content:'分からないことがあります'});
 await h.workspace.addSource(c.id,operator,'DOCUMENT_EXISTENCE_OBSERVED',{content:'端末管理台帳の存在を画面共有で確認した',voluntarily_presented:true});
 await h.workspace.transition(c.id,operator,'FINISH',(await h.workspace.read(c.id,operator)).version);return {...c,source};
}
export function humanInsight(sourceId:string):InsightInput{return {semantic_type:'UNKNOWN',title:'担当者が残す未確認事項',content:'担当者が誰かは分からない',unknown_type:'UNRESOLVED',diagnosis_theme_id:null,area_tag:null,improvement_lens:null,source_refs:[{source_ref_type:'SOURCE_RECORD',source_ref_id:sourceId,relation:'RELATED'}]};}
