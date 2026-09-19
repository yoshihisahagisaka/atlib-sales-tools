import {z} from 'zod';
import {applicationSchema,SURVEY_QUESTIONS,validateAnswer,DiagnosisError} from './itManagementDiagnosis';
export const SALES_CONSENT_VERSION='SALES-ANALYZE-RETURN-v1';
const notes=z.array(z.string().trim().min(1).max(4000)).max(30);
export const salesIntakeSchema=z.object({
 customer:applicationSchema.extend({contactName:z.string().trim().max(200),email:z.union([z.literal(''),z.string().trim().email().max(254)])}),
 customerStatements:notes,unknowns:notes,salespersonNotes:notes,
 surveyAnswers:z.record(z.union([z.string(),z.array(z.string())])),
 conversationAt:z.string().datetime({offset:true}).nullable().optional(),
}).strict();
export const salesConsentSchema=z.object({expectedVersion:z.number().int().positive(),customerAgreed:z.literal(true),customerReference:z.string().trim().min(1).max(200)}).strict();
export function parseSalesIntake(raw:unknown){
 const p=salesIntakeSchema.safeParse(raw);if(!p.success)throw new DiagnosisError(422,'会社・連絡先・会話内容の入力を確認してください。');
 for(const [code,value] of Object.entries(p.data.surveyAnswers)){
  const q=SURVEY_QUESTIONS.find(q=>q.question_code===code);if(!q)throw new DiagnosisError(422,'質問を確認してください。');validateAnswer(q,value);
 }
 return p.data;
}
