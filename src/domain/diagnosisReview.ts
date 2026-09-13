import { z } from 'zod';
import { DiagnosisError } from './itManagementDiagnosis';
export const REVIEW_PROMPT_VERSION='post-diagnosis-structurer-v1';
export const REVIEW_POLICY_VERSION='free-diagnosis-review-v1';
export const INSIGHT_TYPES=['OBSERVATION','UNKNOWN','HYPOTHESIS','GAP_CANDIDATE','ROOT_CAUSE_HYPOTHESIS','KAIZEN_DIRECTION','EVIDENCE_CANDIDATE'] as const;
export const UNKNOWN_TYPES=['NOT_YET_CONFIRMED','UNRESOLVED','CONTRADICTORY','NOT_REQUIRED_NOW'] as const;
export const AREAS=['技術','運用','管理'] as const;
export const LENSES=['なくす','自動化する','標準化する','任せる','残す','整える'] as const;
const text=z.string().trim().min(1).max(2000),uuid=z.string().uuid();
export const reviewSourceSchema=z.object({source_ref_type:z.enum(['SURVEY_RESPONSE','SOURCE_RECORD']),source_ref_id:uuid,relation:z.enum(['SUPPORTS','CONTRADICTS','RELATED'])}).strict();
export const insightFieldsSchema=z.object({semantic_type:z.enum(INSIGHT_TYPES),title:text.max(200),content:text,unknown_type:z.enum(UNKNOWN_TYPES).nullable(),diagnosis_theme_id:uuid.nullable(),area_tag:z.enum(AREAS).nullable(),improvement_lens:z.enum(LENSES).nullable(),source_refs:z.array(reviewSourceSchema).min(1).max(20)}).strict();
export const insightInputSchema=insightFieldsSchema.refine(p=>(p.semantic_type==='UNKNOWN')===(p.unknown_type!==null),'UNKNOWNにはunknown_typeが必要です。');
export type InsightInput=z.infer<typeof insightInputSchema>;
export const assessmentCandidateSchema=z.object({title:text.max(200),purpose:text,priority:z.number().int().min(1).max(5),diagnosis_theme_id:uuid.nullable(),related_candidate_index:z.number().int().nonnegative().nullable()}).strict();
export const structurerOutputSchema=z.object({insight_candidates:z.array(insightInputSchema).max(30),assessment_confirmation_items:z.array(assessmentCandidateSchema).max(20)}).strict();
export type StructurerOutput=z.infer<typeof structurerOutputSchema>;
export const assessmentInputSchema=z.object({title:text.max(200),purpose:text,priority:z.number().int().min(1).max(5),diagnosis_theme_id:uuid.nullable(),related_insight_id:uuid.nullable().default(null),related_evidence_candidate_id:uuid.nullable().default(null),source_ai_proposal_id:uuid.nullable().default(null),source_ai_execution_id:uuid.nullable().default(null),source_candidate_index:z.number().int().nonnegative().nullable().default(null)}).strict().refine(p=>(p.source_ai_execution_id===null)===(p.source_candidate_index===null));
export type AssessmentInput=z.infer<typeof assessmentInputSchema>;
export const reasonSchema=z.object({reason:z.string().max(2000).default('')}).strict();
export const editReviewSchema=z.object({insight:insightInputSchema,reason:z.string().max(2000).default('')}).strict();
export const convertUnknownSchema=z.object({unknown_type:z.enum(UNKNOWN_TYPES),reason:text}).strict();
export const completeReviewSchema=z.object({expectedVersion:z.number().int().positive(),leave_unreviewed:z.boolean().default(false)}).strict();
const object=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const string={type:'string'},nullable={type:['string','null']};
export const STRUCTURER_JSON_SCHEMA=object({insight_candidates:{type:'array',items:object({semantic_type:{type:'string',enum:INSIGHT_TYPES},title:string,content:string,unknown_type:{...nullable,enum:[...UNKNOWN_TYPES,null]},diagnosis_theme_id:nullable,area_tag:{...nullable,enum:[...AREAS,null]},improvement_lens:{...nullable,enum:[...LENSES,null]},source_refs:{type:'array',items:object({source_ref_type:{type:'string',enum:['SURVEY_RESPONSE','SOURCE_RECORD']},source_ref_id:string,relation:{type:'string',enum:['SUPPORTS','CONTRADICTS','RELATED']}})}})},assessment_confirmation_items:{type:'array',items:object({title:string,purpose:string,priority:{type:'integer'},diagnosis_theme_id:nullable,related_candidate_index:{type:['integer','null']}})}});
/** Rejection guard, not a rule-based diagnosis. Human approval never grants FACT authority. */
export function checkReviewBoundary(content:string) {
 if(/\b(FACT|CONFIRMED_FACT|DECISION|score|maturity|rating|final_root_cause)\b/i.test(content)||/(原因は[^。?？]{1,100}です|を導入すべき|を導入してください|導入を決定|最新である|最新です|正確である|正確です|妥当である|妥当です|実態と一致|適切に運用されている|十分である|十分です|検証済み)/.test(content))throw new DiagnosisError(422,'REVIEW_BOUNDARY_VIOLATION');
}
export function validateStructurerOutput(raw:unknown,sources:Set<string>,themes:Set<string>):StructurerOutput {
 const p=structurerOutputSchema.safeParse(raw);if(!p.success)throw new DiagnosisError(422,'AI_OUTPUT_SCHEMA_INVALID');
 for(const item of p.data.insight_candidates){checkReviewBoundary(item.title+' '+item.content);if(item.diagnosis_theme_id&&!themes.has(item.diagnosis_theme_id))throw new DiagnosisError(422,'AI_THEME_REF_INVALID');for(const ref of item.source_refs)if(!sources.has(`${ref.source_ref_type}:${ref.source_ref_id}`))throw new DiagnosisError(422,'AI_SOURCE_REF_INVALID');}
 for(const item of p.data.assessment_confirmation_items){checkReviewBoundary(item.title+' '+item.purpose);if(item.diagnosis_theme_id&&!themes.has(item.diagnosis_theme_id))throw new DiagnosisError(422,'AI_THEME_REF_INVALID');if(item.related_candidate_index!==null&&item.related_candidate_index>=p.data.insight_candidates.length)throw new DiagnosisError(422,'AI_CANDIDATE_REF_INVALID');}
 return p.data;
}
