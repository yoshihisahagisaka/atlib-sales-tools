import { z } from 'zod';

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
  report:{id:string;version:number;content_version:number;content_hash:string;approval_snapshot_hash:string};
  future:{id:string;version:number;intent_status:string;statement:string|null}|null;
  insight_refs:Array<{id:string;version:number;semantic_type:string;unknown_type:string|null}>;
  unknown_refs:string[];
  gap_refs:string[];
  hypothesis_refs:string[];
  evidence_needed_refs:string[];
  customer_restatement_source_id:string|null;
}
