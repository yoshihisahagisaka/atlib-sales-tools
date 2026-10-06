import { z } from 'zod';
import { structuredHearingAnswerSchema } from './structuredHearing';

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
export const ACQUISITION_SOURCE_TYPE = ['EVENT', 'REFERRAL', 'WEB', 'OUTBOUND', 'PARTNER', 'EXISTING_CUSTOMER', 'OTHER'] as const;
export const INTAKE_QUESTION_CODE = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7'] as const;
export const INTAKE_CHANNEL = ['SELF', 'PROXY'] as const;
export const RESPONSE_STATE = ['ANSWERED', 'UNKNOWN', 'NOT_IN_POSITION_TO_ANSWER'] as const;
export const RESPONDENT_ROLE = ['MANAGEMENT', 'IT_DECISION_OWNER', 'IT_OR_BUSINESS_STAFF'] as const;
export const KNOWLEDGE_STATE = ['KNOWN', 'AVAILABLE', 'PARTIAL', 'UNKNOWN'] as const;
export type KnowledgeState = typeof KNOWLEDGE_STATE[number];
export type ResponseState = typeof RESPONSE_STATE[number];
export type RespondentRole = typeof RESPONDENT_ROLE[number];

export const Q1_EMPLOYEE_SIZE = ['EMP_1_20', 'EMP_21_50', 'EMP_51_100', 'EMP_101_300', 'EMP_301_PLUS', 'EMP_UNKNOWN'] as const;
export const Q1_LOCATIONS = ['SITE_1', 'SITE_2_3', 'SITE_4_PLUS', 'SITE_NOT_APPLICABLE', 'SITE_UNKNOWN'] as const;
export const Q2_FUTURE_CONTEXT = ['HEADCOUNT_GROWTH', 'SITE_CHANGE', 'NEW_BUSINESS', 'ORG_CHANGE', 'IPO_PREPARATION', 'WORKSTYLE_CHANGE', 'BUSINESS_EXPANSION', 'LEAN_SCALING', 'STABILITY_EFFICIENCY', 'NO_MAJOR_CHANGE', 'OTHER'] as const;
export const Q3_DESIRED_IT_STATE = ['SUPPORT_CHANGE', 'IMPROVE_PRODUCTIVITY', 'PROTECT_BUSINESS', 'ENABLE_MANAGEMENT_DECISION', 'STRATEGIC_IT_USE', 'STABILIZE_IT_OPERATION', 'OPTIMIZE_IT_INVESTMENT', 'UNDECIDED', 'OTHER'] as const;
export const Q4_CURRENT_CONCERN = ['MANAGEMENT_DECISION_CONCERN', 'IT_OPERATION_CONCERN', 'BUSINESS_PROTECTION_CONCERN', 'PRODUCTIVITY_OPPORTUNITY', 'CHANGE_READINESS_CONCERN', 'STRATEGIC_USE_OPPORTUNITY', 'NO_MAJOR_CONCERN', 'OTHER'] as const;
export const Q5_VISIBILITY = ['VISIBLE_ENOUGH', 'MOSTLY_VISIBLE', 'PARTIALLY_VISIBLE', 'VISIBLE_ON_REQUEST', 'LARGELY_UNKNOWN'] as const;
export const Q6_MANAGEMENT_INFORMATION = ['REGULAR_AND_USABLE', 'DELIVERED_NOT_USABLE', 'ON_REQUEST_USABLE', 'NOT_SUFFICIENTLY_DELIVERED', 'INFORMATION_NEED_UNCLEAR'] as const;

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
  attribution: z.object({
    acquisitionSourceType: z.enum(ACQUISITION_SOURCE_TYPE).nullish(),
    acquisitionSourceName: z.string().trim().min(1).max(200).nullish(),
    utmSource: z.string().trim().min(1).max(200).nullish(),
    utmMedium: z.string().trim().min(1).max(200).nullish(),
    utmCampaign: z.string().trim().min(1).max(200).nullish(),
    utmContent: z.string().trim().min(1).max(200).nullish(),
    utmTerm: z.string().trim().min(1).max(200).nullish(),
    landingUrl: z.string().trim().url().max(2000).nullish(),
    referrer: z.string().trim().url().max(2000).nullish(),
  }).strict().refine(value => value.acquisitionSourceType != null && value.acquisitionSourceName != null,
    'ATTRIBUTION_REQUIRES_ACQUISITION_SOURCE_TYPE_AND_NAME').optional(),
}).strict();
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

const intakeAnswerValueSchema = z.union([
  z.object({ employeeSize: z.enum(Q1_EMPLOYEE_SIZE), locations: z.enum(Q1_LOCATIONS) }).strict(),
  z.array(z.enum(Q2_FUTURE_CONTEXT)).min(1).max(Q2_FUTURE_CONTEXT.length),
  z.array(z.enum(Q3_DESIRED_IT_STATE)).min(1).max(Q3_DESIRED_IT_STATE.length),
  z.enum(Q4_CURRENT_CONCERN), z.enum(Q5_VISIBILITY), z.enum(Q6_MANAGEMENT_INFORMATION),
  z.string().trim().min(1).max(4000), z.null(),
]);

export const intakeAnswerEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  questionCode: z.enum(INTAKE_QUESTION_CODE),
  answerValue: intakeAnswerValueSchema,
  responseState: z.enum(RESPONSE_STATE),
  respondent: z.object({ contactId: z.string().uuid().optional(), role: z.enum(RESPONDENT_ROLE).optional() }).strict(),
  provenance: z.object({ channel: z.enum(INTAKE_CHANNEL), source: z.enum(['CUSTOMER_SELF', 'SALES_PROXY']) }).strict(),
}).strict().superRefine((value, ctx) => {
  const validAnswered = ((): boolean => {
    if (value.responseState !== 'ANSWERED') return value.answerValue === null;
    switch (value.questionCode) {
      case 'Q1': return typeof value.answerValue === 'object' && value.answerValue !== null && !Array.isArray(value.answerValue) && 'employeeSize' in value.answerValue && 'locations' in value.answerValue;
      case 'Q2': return Array.isArray(value.answerValue) && value.answerValue.every(x => Q2_FUTURE_CONTEXT.includes(x as typeof Q2_FUTURE_CONTEXT[number]));
      case 'Q3': return Array.isArray(value.answerValue) && value.answerValue.every(x => Q3_DESIRED_IT_STATE.includes(x as typeof Q3_DESIRED_IT_STATE[number]));
      case 'Q4': return typeof value.answerValue === 'string' && Q4_CURRENT_CONCERN.includes(value.answerValue as typeof Q4_CURRENT_CONCERN[number]);
      case 'Q5': return typeof value.answerValue === 'string' && Q5_VISIBILITY.includes(value.answerValue as typeof Q5_VISIBILITY[number]);
      case 'Q6': return typeof value.answerValue === 'string' && Q6_MANAGEMENT_INFORMATION.includes(value.answerValue as typeof Q6_MANAGEMENT_INFORMATION[number]);
      case 'Q7': return typeof value.answerValue === 'string';
    }
  })();
  if (!validAnswered) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'INTAKE_ANSWER_VALUE_INVALID_FOR_QUESTION_OR_RESPONSE_STATE' });
  if ((value.provenance.channel === 'SELF') !== (value.provenance.source === 'CUSTOMER_SELF')) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'INTAKE_PROVENANCE_CHANNEL_MISMATCH' });
});
export type IntakeAnswerEnvelopeV1 = z.infer<typeof intakeAnswerEnvelopeSchema>;

export const intakeAnswerSchema = z.object({
  questionCode: z.enum(INTAKE_QUESTION_CODE),
  channel: z.enum(INTAKE_CHANNEL),
  value: intakeAnswerEnvelopeSchema,
}).strict().superRefine((value, ctx) => {
  if (value.questionCode !== value.value.questionCode) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'INTAKE_QUESTION_CODE_MISMATCH' });
  if (value.channel !== value.value.provenance.channel) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'INTAKE_CHANNEL_MISMATCH' });
});
export type IntakeAnswerInput = z.infer<typeof intakeAnswerSchema>;

export const REQUIRED_INTAKE_QUESTION_CODES: readonly string[] = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'];
// Q7 (60分で特に相談したいこと) is optional per Business Design Canonical §4.

const publicText = (max: number) => z.string().trim().min(1).max(max).optional();
export const publicCustomerSelfSubmissionSchema = z.object({
  idempotencyKey: z.string().uuid(),
  company: z.object({ name: z.string().trim().min(1).max(200), corporateNumber: z.string().trim().min(1).max(50).optional() }).strict(),
  contact: z.object({ name: z.string().trim().min(1).max(200), email: z.string().trim().email().max(320), phone: publicText(50), jobTitle: publicText(100), respondentRole: z.enum(RESPONDENT_ROLE) }).strict(),
  answers: z.array(intakeAnswerEnvelopeSchema).min(6).max(7),
  consent: z.object({ privacy: z.literal(true), diagnosisUse: z.literal(true), wordingVersion: z.literal('it_management_public_self_consent_v1') }).strict(),
  attribution: z.object({
    utmSource: publicText(200), utmMedium: publicText(200), utmCampaign: publicText(200), utmContent: publicText(200), utmTerm: publicText(200),
    landingUrl: z.string().trim().url().max(2000).optional(), referrer: z.string().trim().url().max(2000).optional(),
  }).strict(),
}).strict().superRefine((value, ctx) => {
  const codes = value.answers.map(answer => answer.questionCode);
  if (new Set(codes).size !== codes.length || REQUIRED_INTAKE_QUESTION_CODES.some(code => !codes.includes(code as typeof codes[number]))) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['answers'], message: 'PUBLIC_REQUIRED_INTAKE_QUESTIONS_INVALID' });
  for (const answer of value.answers) {
    if (answer.provenance.channel !== 'SELF' || answer.provenance.source !== 'CUSTOMER_SELF') ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['answers'], message: 'PUBLIC_SELF_PROVENANCE_REQUIRED' });
    if (answer.respondent.contactId != null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['answers'], message: 'PUBLIC_CONTACT_ID_MUST_NOT_BE_CLIENT_SUPPLIED' });
  }
});
export type PublicCustomerSelfSubmission = z.infer<typeof publicCustomerSelfSubmissionSchema>;

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
  isNegativeAnswer: z.boolean().default(false),
  structuredAnswer: structuredHearingAnswerSchema.optional(),
}).strict();
export type RecordStatementInput = z.infer<typeof recordStatementSchema>;
