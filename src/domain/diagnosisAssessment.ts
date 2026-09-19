import {z} from 'zod';
import {insightFieldsSchema} from './diagnosisReview';
export const ASSESSMENT_STATUSES=['NOT_PROPOSED','PROPOSED','PENDING','ACCEPTED','DECLINED'] as const;
export const assessmentCommandSchema=z.object({expectedVersion:z.number().int().positive(),reason:z.string().max(2000).default('')}).strict();
export const handoffCommandSchema=assessmentCommandSchema.extend({handoff_id:z.string().uuid()}).strict();
const uuid=z.string().uuid(),text=z.string(),version=z.number().int().positive();
// Validate without the input schema's trim transforms: snapshots preserve stored text exactly.
const insight=insightFieldsSchema.extend({id:uuid,version,review_status:z.literal('HUMAN_APPROVED'),title:text.min(1).max(200),content:text.min(1).max(2000)}).strict().refine(i=>(i.semantic_type==='UNKNOWN')===(i.unknown_type!==null));
export const handoffSnapshotSchema=z.object({
 schema_version:z.literal(1),generated_at:z.string().datetime(),
 organization:z.object({id:uuid,display_name:text}).strict(),provider_display_name:z.literal('atLIB株式会社'),
 diagnosis_case_id:uuid,entry_channel:z.enum(['WEB','SALES_VISIT']),diagnosis_status:z.enum(['FEEDBACK_COMPLETED','CLOSED']),assessment_status:z.literal('ACCEPTED'),
 future:z.object({id:uuid,version,statement:text,time_horizon:text.nullable(),intent_status:z.enum(['SURVEY_STATED','INTERVIEW_RECONFIRMED'])}).strict(),
 report:z.object({id:uuid,version,status:z.enum(['APPROVED','DELIVERED']),approval_snapshot_hash:text.regex(/^[a-f0-9]{64}$/),content_hash:text.regex(/^[a-f0-9]{64}$/)}).strict(),
 insights:z.array(insight),
 assessment_confirmation_items:z.array(z.object({id:uuid,title:text,purpose:text,priority:z.number().int().min(1).max(5),status:z.literal('OPEN'),diagnosis_theme_id:uuid.nullable(),related_insight_id:uuid.nullable(),related_evidence_candidate_id:uuid.nullable()}).strict()),
 themes:z.array(z.object({id:uuid,title:text,future_relation:text}).strict()),
}).strict();
export type HandoffSnapshot=z.infer<typeof handoffSnapshotSchema>;
