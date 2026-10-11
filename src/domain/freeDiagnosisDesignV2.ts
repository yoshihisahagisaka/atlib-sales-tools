/**
 * Free Diagnosis Design v2: domain-only vocabulary.
 *
 * This module deliberately has no dependency on the HA6 persistence, API, or
 * UI contracts. It is the stable input/output boundary for later adapters.
 */

export const FUTURE_CODES_V2 = [
  'BUSINESS_GROWTH',
  'FOCUS_ON_CORE_WORK',
  'LEAN_GROWTH',
  'NEW_BUSINESS_OR_WORKSTYLE',
  'BUSINESS_CONTINUITY',
  'NO_MAJOR_CHANGE',
  'UNDECIDED',
] as const;
export type FutureCodeV2 = (typeof FUTURE_CODES_V2)[number];

export const IT_EXPECTATION_CODES_V2 = [
  'PRODUCTIVITY',
  'LEAN_OPERATION',
  'MANAGEMENT_DECISION_SUPPORT',
  'DATA_USE',
  'CHANGE_READINESS',
  'EMPLOYEE_EXPERIENCE',
  'RESILIENCE',
  'IT_OPERATION_EFFICIENCY',
  'UNDECIDED',
] as const;
export type ItExpectationCodeV2 = (typeof IT_EXPECTATION_CODES_V2)[number];

export const CURRENT_INTEREST_CODES_V2 = [
  'MANAGEMENT_DECISION',
  'PRODUCTIVITY',
  'INFORMATION_AND_DATA',
  'GROWTH_AND_CHANGE',
  'IT_OPERATION_AND_GOVERNANCE',
  'SECURITY_AND_CONTINUITY',
  'UNDECIDED',
] as const;
export type CurrentInterestCodeV2 = (typeof CURRENT_INTEREST_CODES_V2)[number];

export const VISIBILITY_CODES_V2 = [
  'VISIBLE_FULL',
  'VISIBLE_MOSTLY',
  'VISIBLE_PARTIAL',
  'RELIES_ON_OTHERS',
  'LOW_VISIBILITY',
  'UNKNOWN',
] as const;
export type VisibilityCodeV2 = (typeof VISIBILITY_CODES_V2)[number];

export const MANAGEMENT_CONNECTION_CODES_V2 = [
  'UNMANAGED_OR_NOT_VISIBLE',
  'MANAGED_NOT_REPORTED',
  'REPORTED_NOT_DECISION_USABLE',
  'DECISION_USABLE',
  'STRATEGICALLY_CONNECTED',
  'UNKNOWN',
] as const;
export type ManagementConnectionCodeV2 = (typeof MANAGEMENT_CONNECTION_CODES_V2)[number];

export const INTEREST_THEME_CODES_V2 = [
  'AI',
  'AUTOMATION',
  'DATA_VISIBILITY',
  'SECURITY',
  'IT_LITERACY',
  'SYSTEM_LIFECYCLE',
  'CLOUD',
  'IT_COST',
  'IT_ORGANIZATION',
  'SYSTEM_INTEGRATION',
  'WORKSTYLE',
  'UNDECIDED',
] as const;
export type InterestThemeCodeV2 = (typeof INTEREST_THEME_CODES_V2)[number];

export type LensV2 = 'TECHNOLOGY' | 'OPERATION' | 'MANAGEMENT';
export type EpistemicTypeV2 = 'DIRECT_RECOGNITION' | 'POSSIBILITY' | 'CONFIRMATION_VALUE' | 'UNKNOWN';

export interface CompanyContextV2 {
  employeeRange: string;
  siteRange: string;
}

/** The normalized structured answer consumed by Design v2 rules. */
export interface CurrentStructuredStateV2 {
  q1CompanyContext: CompanyContextV2;
  q2Future: readonly FutureCodeV2[];
  q3ItExpectations: readonly ItExpectationCodeV2[];
  q4CurrentInterest: CurrentInterestCodeV2;
  q5Visibility: VisibilityCodeV2;
  q6ManagementConnection: ManagementConnectionCodeV2;
  q7InterestThemes: readonly InterestThemeCodeV2[];
}

export type FreeDiagnosisSurveyAnswersV2 = CurrentStructuredStateV2;

export interface NarrativeBlockV2 {
  id: string;
  ruleId: string;
  text: string;
  epistemicType: EpistemicTypeV2;
  sourceQuestionCodes: readonly string[];
}

export interface LensFindingV2 {
  id: string;
  ruleId: string;
  text: string;
  lenses: readonly LensV2[];
  sourceQuestionCodes: readonly string[];
}

export interface UnknownItemV2 {
  id: string;
  text: string;
  lenses: readonly LensV2[];
  sourceRuleIds: readonly string[];
}

export interface HearingViewpointV2 {
  id: string;
  label: string;
  whyUseful: string;
  lenses: readonly LensV2[];
  exampleQuestions?: readonly string[];
  sourceRuleIds: readonly string[];
}

export interface FactCandidateV2 {
  id: string;
  whatToVerify: string;
  whyItMattersToFuture: string;
  whatMayBecomeKnowable: string;
  lenses: readonly LensV2[];
  sourceRuleIds: readonly string[];
}

export interface HealthyGuardV2 {
  noImportantGapIdentified: boolean;
  reasons: readonly string[];
}

export interface AnalysisResultV2 {
  futureUnderstanding: readonly NarrativeBlockV2[];
  currentUnderstanding: readonly NarrativeBlockV2[];
  lensFindings: readonly LensFindingV2[];
  unknowns: readonly UnknownItemV2[];
  hearingViewpoints: readonly HearingViewpointV2[];
  factCandidates: readonly FactCandidateV2[];
  healthyGuard: HealthyGuardV2;
  appliedRuleIds: readonly string[];
}

export interface NarrativeSectionV2 {
  heading: string;
  entries: readonly string[];
}

export interface FreeDiagnosisNarrativeV2 {
  future: NarrativeSectionV2;
  currentUnderstanding: NarrativeSectionV2;
  confirmationAndImprovement: NarrativeSectionV2;
  unknowns: NarrativeSectionV2;
  nextFacts: NarrativeSectionV2;
}
