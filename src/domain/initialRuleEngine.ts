import type { ManagementFocus } from './freeDiagnosisRuleBasedV1';
import type { IntakeSemanticProjection } from './intakeSemanticProjection';

export type InitialRuleRole = 'PRIMARY' | 'RELATED' | 'OPPORTUNITY';
export interface InitialRuleFocus { focus: ManagementFocus; role: InitialRuleRole; verificationPurpose: string; grounds: readonly string[]; }
export interface RelevanceReference { focus: ManagementFocus; grounds: readonly string[]; }
export interface InitialRuleResult { focusItems: readonly InitialRuleFocus[]; relevanceReferences: readonly RelevanceReference[]; authorityConfirmationCandidates: IntakeSemanticProjection['authorityConfirmationCandidates']; noImportantConfirmation: boolean; problemFindings: readonly never[]; assessmentEscalated: false; }

const FUTURE_RELEVANCE: Record<string, readonly ManagementFocus[]> = {
  HEADCOUNT_GROWTH: ['M05_GROWTH_CHANGE_ADAPTATION', 'M02_IT_OPERATION_CONTINUITY', 'M04_BUSINESS_PRODUCTIVITY'],
  SITE_CHANGE: ['M05_GROWTH_CHANGE_ADAPTATION', 'M02_IT_OPERATION_CONTINUITY'],
  NEW_BUSINESS: ['M05_GROWTH_CHANGE_ADAPTATION', 'M06_IT_STRATEGIC_USE', 'M01_IT_MANAGEMENT_JUDGMENT'],
  ORG_CHANGE: ['M05_GROWTH_CHANGE_ADAPTATION', 'M02_IT_OPERATION_CONTINUITY', 'M01_IT_MANAGEMENT_JUDGMENT'],
  IPO_PREPARATION: ['M03_BUSINESS_DEFENSE_CONTINUITY', 'M01_IT_MANAGEMENT_JUDGMENT', 'M05_GROWTH_CHANGE_ADAPTATION'],
  WORKSTYLE_CHANGE: ['M05_GROWTH_CHANGE_ADAPTATION', 'M04_BUSINESS_PRODUCTIVITY', 'M03_BUSINESS_DEFENSE_CONTINUITY'],
  BUSINESS_EXPANSION: ['M05_GROWTH_CHANGE_ADAPTATION', 'M06_IT_STRATEGIC_USE', 'M03_BUSINESS_DEFENSE_CONTINUITY'],
  LEAN_SCALING: ['M04_BUSINESS_PRODUCTIVITY', 'M02_IT_OPERATION_CONTINUITY'],
  STABILITY_EFFICIENCY: ['M04_BUSINESS_PRODUCTIVITY', 'M02_IT_OPERATION_CONTINUITY'],
};
const DESIRED_STATE_RELEVANCE: Record<string, readonly ManagementFocus[]> = {
  ENABLE_MANAGEMENT_DECISION: ['M01_IT_MANAGEMENT_JUDGMENT'], STABILIZE_IT_OPERATION: ['M02_IT_OPERATION_CONTINUITY'],
  PROTECT_BUSINESS: ['M03_BUSINESS_DEFENSE_CONTINUITY'], IMPROVE_PRODUCTIVITY: ['M04_BUSINESS_PRODUCTIVITY'],
  SUPPORT_CHANGE: ['M05_GROWTH_CHANGE_ADAPTATION'], STRATEGIC_IT_USE: ['M06_IT_STRATEGIC_USE'], OPTIMIZE_IT_INVESTMENT: ['M01_IT_MANAGEMENT_JUDGMENT'],
};

const purpose = (focus: ManagementFocus): string => `${focus}_CONFIRMATION`;
function add(items: InitialRuleFocus[], focus: ManagementFocus, role: InitialRuleRole, grounds: readonly string[]): void {
  const existing = items.find(x => x.focus === focus);
  if (existing) { if (role === 'PRIMARY' && existing.role !== 'PRIMARY') existing.role = role; return; }
  items.push({ focus, role, verificationPurpose: purpose(focus), grounds });
}

export function runInitialRule(input: IntakeSemanticProjection): InitialRuleResult {
  const items: InitialRuleFocus[] = [];
  const relevance = new Map<ManagementFocus, string[]>();
  for (const future of input.futureReference) for (const focus of FUTURE_RELEVANCE[future] ?? []) relevance.set(focus, [...(relevance.get(focus) ?? []), `Q2:${future}`]);
  for (const desiredState of input.desiredState) for (const focus of DESIRED_STATE_RELEVANCE[desiredState] ?? []) relevance.set(focus, [...(relevance.get(focus) ?? []), `Q3:${desiredState}`]);
  const direct = input.focusCandidates[0];
  const desired = new Set(input.desiredState); const future = new Set(input.futureReference);
  const q6 = input.managementInformation;
  const managementDecisionNeed = desired.has('ENABLE_MANAGEMENT_DECISION');
  const q6NeedsManagementConfirmation = q6?.usability === 'INSUFFICIENT' || q6?.delivery === 'INSUFFICIENT' || q6?.delivery === 'UNCONFIRMED';

  // The approved Golden 2 specifies that a decision-usability confirmation can lead M01,
  // while the direct strategic-use concern remains related. This is confirmation, not a problem.
  if (q6NeedsManagementConfirmation && managementDecisionNeed) add(items, 'M01_IT_MANAGEMENT_JUDGMENT', 'PRIMARY', ['Q6', 'Q3']);
  if (direct) add(items, direct, items.length ? 'RELATED' : 'PRIMARY', ['Q4']);

  if (direct === 'M05_GROWTH_CHANGE_ADAPTATION' && (future.has('HEADCOUNT_GROWTH') || future.has('SITE_CHANGE'))) add(items, 'M02_IT_OPERATION_CONTINUITY', 'RELATED', ['Q2', 'M05_DEPENDENCY']);
  if (direct === 'M03_BUSINESS_DEFENSE_CONTINUITY' && managementDecisionNeed) add(items, 'M01_IT_MANAGEMENT_JUDGMENT', 'RELATED', ['Q3', 'M03_DEPENDENCY']);
  if (direct === 'M06_IT_STRATEGIC_USE' && managementDecisionNeed) add(items, 'M01_IT_MANAGEMENT_JUDGMENT', items.length ? 'RELATED' : 'PRIMARY', ['Q3', 'M06_DEPENDENCY']);

  // A healthy case may surface productivity as an opportunity but must not force a primary focus.
  if (!direct && desired.has('IMPROVE_PRODUCTIVITY') && q6?.usability === 'USABLE') add(items, 'M04_BUSINESS_PRODUCTIVITY', 'OPPORTUNITY', ['Q3']);

  return { focusItems: items, relevanceReferences: [...relevance.entries()].map(([focus, grounds]) => ({ focus, grounds })), authorityConfirmationCandidates: input.authorityConfirmationCandidates, noImportantConfirmation: !items.some(x => x.role === 'PRIMARY' || x.role === 'RELATED') && input.authorityConfirmationCandidates.length === 0, problemFindings: [], assessmentEscalated: false };
}
