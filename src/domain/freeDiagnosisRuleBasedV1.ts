import { z } from 'zod';

// IT経営KAIZEN 無料診断 Rule-Based v1. See
// docs/free-diagnosis-rule-based-v1-business-design-canonical-20261003.md and
// docs/free-diagnosis-rule-based-v1-implementation-specification-20261003.md.
// Deterministic only: nothing in this module calls an AI provider.

export class RuleBasedV1Error extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}

export const MANAGEMENT_FOCUS = [
  'H00_MANAGEMENT_DISCOVERY', 'M01_IT_MANAGEMENT_JUDGMENT', 'M02_IT_OPERATION_CONTINUITY',
  'M03_BUSINESS_DEFENSE_CONTINUITY', 'M04_BUSINESS_PRODUCTIVITY', 'M05_GROWTH_CHANGE_ADAPTATION',
  'M06_IT_STRATEGIC_USE',
] as const;
export type ManagementFocus = typeof MANAGEMENT_FOCUS[number];

export const SELECTED_SERVICE = ['IT_KAIZEN', 'BUSINESS_WEB'] as const;
export const INTAKE_QUESTION_CODE = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7'] as const;
export const INTAKE_CHANNEL = ['SELF', 'PROXY'] as const;
export const KNOWLEDGE_STATE = ['KNOWN', 'AVAILABLE', 'PARTIAL', 'UNKNOWN'] as const;
export type KnowledgeState = typeof KNOWLEDGE_STATE[number];

// 顧客向け表示名（内部enumをそのまま露出しない。Doc UI Wireframe §Screen State設計方針）。
export const KNOWLEDGE_STATE_LABEL_JA: Record<KnowledgeState, string> = {
  KNOWN: '今回確認できた',
  AVAILABLE: '追加確認すれば分かる',
  PARTIAL: '一部、追加確認が必要',
  UNKNOWN: '今回まだ確認できていない',
};

export const CASE_STATUS = [
  'APPLICATION_STARTED', 'INTAKE_IN_PROGRESS', 'INTAKE_COMPLETED', 'FOCUS_SELECTED',
  'BOOKING_PENDING', 'PREPARATION_IN_PROGRESS', 'HEARING_IN_PROGRESS', 'HEARING_ORGANIZING',
  'HEARING_COMPLETED', 'RULE_ANALYSIS_IN_PROGRESS', 'HUMAN_REVIEW_REQUIRED', 'ANALYSIS_REJECTED',
  'ANALYSIS_APPROVED', 'PRELIMINARY_SCOPE_READY',
] as const;
export type CaseStatus = typeof CASE_STATUS[number];

export const createCompanySchema = z.object({
  name: z.string().trim().min(1).max(200),
  corporateNumber: z.string().trim().min(1).max(50).nullish(),
  contact: z.object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().nullish(),
    phone: z.string().trim().min(1).max(50).nullish(),
    jobTitle: z.string().trim().min(1).max(100).nullish(),
  }),
  selectedService: z.enum(SELECTED_SERVICE),
}).strict();
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const intakeAnswerSchema = z.object({
  questionCode: z.enum(INTAKE_QUESTION_CODE),
  channel: z.enum(INTAKE_CHANNEL),
  value: z.unknown(),
}).strict();
export type IntakeAnswerInput = z.infer<typeof intakeAnswerSchema>;

export const REQUIRED_INTAKE_QUESTION_CODES: readonly string[] = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'];
// Q7 (60分で特に相談したいこと) is optional per Business Design Canonical §4.

export const focusSelectionObjectSchema = z.object({
  primaryFocus: z.enum(MANAGEMENT_FOCUS),
  secondaryFocus: z.enum(MANAGEMENT_FOCUS).nullish(),
});
const refineDistinctFocus = <T extends { primaryFocus: ManagementFocus; secondaryFocus?: ManagementFocus | null }>(p: T) =>
  p.secondaryFocus == null || p.secondaryFocus !== p.primaryFocus;
export const focusSelectionSchema = focusSelectionObjectSchema.strict()
  .refine(refineDistinctFocus, 'secondaryFocusはprimaryFocusと異なる必要があります。');
export type FocusSelectionInput = z.infer<typeof focusSelectionSchema>;

export const recordStatementSchema = z.object({
  planItemRef: z.string().trim().min(1).max(100).nullish(),
  statementText: z.string().trim().min(1).max(4000),
  operatorNoteText: z.string().trim().min(1).max(4000).nullish(),
  knowledgeState: z.enum(KNOWLEDGE_STATE),
  requiresIndividualConfirmation: z.boolean().default(false),
}).strict();
export type RecordStatementInput = z.infer<typeof recordStatementSchema>;
