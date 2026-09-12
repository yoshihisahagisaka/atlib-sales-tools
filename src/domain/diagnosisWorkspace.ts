import { z } from 'zod';
import { DiagnosisError } from './itManagementDiagnosis';

export const INTERVIEW_PROMPT_VERSION = 'interview-assistant-v1';
export const INTERVIEW_POLICY_VERSION = 'free-diagnosis-interview-v1';
export const SOURCE_TYPES = ['INTERVIEW_STATEMENT','OPERATOR_NOTE','TRANSCRIPT','SCREEN_SHARED_INFORMATION','DOCUMENT_EXISTENCE_OBSERVED'] as const;
export type SourceType = typeof SOURCE_TYPES[number];
const text = z.string().min(1).max(2000).refine(s => s.trim().length > 0);
// Raw content is validated, never trimmed, rewritten or semantically classified.
export const rawSourceSchema = z.object({
 content: z.string().max(20000).refine(s=>s.trim().length>0),
 speaker_participant_id: z.string().uuid().nullable().default(null),
 occurred_at: z.string().datetime({offset:true}).nullable().default(null),
 parent_source_record_id: z.string().uuid().nullable().default(null),
 external_reference: z.string().max(1000).nullable().default(null),
}).strict();
export const evidenceExistenceSchema = rawSourceSchema.extend({ voluntarily_presented: z.literal(true) }).strict();
export const reconfirmFutureSchema = z.object({ statement: text, time_horizon: z.string().max(200).nullable().default(null),
 source_record_id: z.string().uuid(), expectedVersion: z.number().int().positive() }).strict();
export const resolutionSchema = z.object({ action: z.enum(['ASK','LATER','UNNECESSARY']) }).strict();
export type RawSourceInput = z.infer<typeof rawSourceSchema>;
export type ReconfirmInput = z.infer<typeof reconfirmFutureSchema>;
export const SUGGESTION_TYPES = ['FOLLOW_UP','CLARIFY','CHECK_UNKNOWN','CHECK_CONTRADICTION','NEW_THEME'] as const;
const refSchema = z.object({ source_ref_type: z.enum(['SURVEY_RESPONSE','SOURCE_RECORD']), source_ref_id: z.string().uuid(), relation: z.enum(['SUPPORTS','CONTRADICTS','RELATED']) }).strict();
export const interviewOutputSchema = z.object({ suggestions: z.array(z.object({ suggestion_type: z.enum(SUGGESTION_TYPES), text, purpose: text,
 related_theme_id: z.string().uuid().nullable(), source_refs: z.array(refSchema).min(1).max(10) }).strict()).max(5) }).strict();
export type InterviewOutput = z.infer<typeof interviewOutputSchema>;
const object = (properties: Record<string,unknown>) => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const string = {type:'string'};
export const INTERVIEW_JSON_SCHEMA = object({suggestions:{type:'array',items:object({
 suggestion_type:{type:'string',enum:SUGGESTION_TYPES},text:string,purpose:string,related_theme_id:{type:['string','null']},
 source_refs:{type:'array',items:object({source_ref_type:{type:'string',enum:['SURVEY_RESPONSE','SOURCE_RECORD']},source_ref_id:string,relation:{type:'string',enum:['SUPPORTS','CONTRADICTS','RELATED']}})}
})}});
export function validateInterviewOutput(raw: unknown, sources: Set<string>, themes: Set<string>): InterviewOutput {
 const parsed=interviewOutputSchema.safeParse(raw);
 if (!parsed.success) throw new DiagnosisError(422,'AI_OUTPUT_SCHEMA_INVALID');
 for (const s of parsed.data.suggestions) {
  for (const ref of s.source_refs) if (!sources.has(`${ref.source_ref_type}:${ref.source_ref_id}`)) throw new DiagnosisError(422,'AI_SOURCE_REF_INVALID');
  if (s.related_theme_id && !themes.has(s.related_theme_id)) throw new DiagnosisError(422,'AI_THEME_REF_INVALID');
  const content=s.text+' '+s.purpose;
  if (/\b(FACT|CONFIRMED_FACT|score|maturity|rating|final_root_cause|verified|accurate|validity|currentness)\b/i.test(content)
   || /(原因は[^。?？]{1,100}です|を導入すべき|を導入してください|導入を推奨|サービスを推奨|御社は[^。?？]{0,40}(属人化している|管理できていません)|正確|最新|妥当|適切に運用|検証済み|実態と一致)/.test(content)) throw new DiagnosisError(422,'AI_OUTPUT_BOUNDARY_VIOLATION');
 }
 return parsed.data;
}
