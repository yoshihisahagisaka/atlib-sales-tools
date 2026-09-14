import { z } from 'zod';
import type { FutureKnowledgeStatus } from './diagnosisReport';

export const managementFeedbackRouteSchema=z.enum(['DIRECT_ACT','FOCUSED_CONFIRMATION','DESIGN_ASSESSMENT','STOP_HOLD']);
export type ManagementFeedbackRoute=z.infer<typeof managementFeedbackRouteSchema>;

export const managementFeedbackDecisionSchema=z.object({
  expectedVersion:z.number().int().min(0),
  route:managementFeedbackRouteSchema,
  materialDecision:z.string().trim().min(1).max(2000),
  nextAction:z.string().trim().min(1).max(2000),
  customerRestatementSourceId:z.string().uuid().nullable().optional(),
}).strict();

export interface ManagementFeedbackDecisionSnapshot {
  // Optional additions preserve the immutable MF-C v1 records without backfill.
  snapshot_version?:2;
  decision?:{id:string;version:number;route:ManagementFeedbackRoute;material_decision:string;next_action:string;decided_by_user_id:string;decided_at:string;supersedes_decision_id:string|null};
  report:{id:string;version:number;content_version:number;content_hash:string;approval_snapshot_hash:string};
  future:{id:string;version:number;intent_status:string;statement:string|null;knowledge_status?:FutureKnowledgeStatus}|null;
  insight_refs:Array<{id:string;version:number;semantic_type:string;unknown_type:string|null}>;
  unknown_refs:string[];
  gap_refs:string[];
  hypothesis_refs:string[];
  evidence_needed_refs:string[];
  customer_restatement_source_id:string|null;
  observation_refs?:string[];
  evidence_candidate_refs?:string[];
  why_connections?:Array<{hypothesis_id:string;supporting_insight_refs:string[];evidence_confirmation_refs:string[]}>;
}
