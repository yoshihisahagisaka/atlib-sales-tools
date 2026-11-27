import type {
  ActOptionReviewResult,
  ActOptionReviewState,
} from './paidAssessmentActOptionReview';
import type {
  DecisionSessionDisposition,
  DecisionSessionReviewResult,
  DecisionSessionReviewState,
} from './paidAssessmentDecisionSessionReview';
import type {
  InitialActionPlanReview,
  InitialActionReviewState,
} from './paidAssessmentInitialActionPlan';

export type RoadmapHorizon =
  | 'MONTHS_1_3'
  | 'MONTHS_4_6'
  | 'MONTHS_7_9'
  | 'MONTHS_10_12'
  | 'BEYOND_12_MONTHS'
  | 'TO_BE_DECIDED';

export type RoadmapCommitment = 'SELECTED_ACT_DRAFT' | 'FUTURE_CANDIDATE';

export interface RoadmapItemDraft {
  id: string;
  actId: string;
  decisionSessionId?: string;
  initialActionIds: readonly string[];
  horizon: RoadmapHorizon;
  commitment: RoadmapCommitment;
  sequence: number;
  purpose: string;
  expectedChange: string;
  verificationApproach: string;
  prerequisites: readonly string[];
  dependencies: readonly string[];
  risks: readonly string[];
  reassessmentTrigger: string;
  openQuestions: readonly string[];
  authoredBy?: string;
}

export type RoadmapReviewState =
  | 'REVIEWABLE_DRAFT'
  | 'NEEDS_CONFIRMATION'
  | 'BLOCKED_BY_EVIDENCE';

export interface RoadmapReviewResult {
  items: Array<RoadmapItemDraft & {
    state: RoadmapReviewState;
    reviewReasons: string[];
  }>;
  counts: Record<RoadmapReviewState, number>;
}

const optionStates = new Set<ActOptionReviewState>([
  'REVIEWABLE',
  'NEEDS_CONFIRMATION',
  'BLOCKED_BY_GAP_EVIDENCE',
]);
const decisionStates = new Set<DecisionSessionReviewState>([
  'REVIEWABLE',
  'NEEDS_CONFIRMATION',
  'BLOCKED_BY_OPTION_EVIDENCE',
]);
const dispositions = new Set<DecisionSessionDisposition>([
  'ACT_SELECTION',
  'ADDITIONAL_EVIDENCE',
  'HOLD',
  'STOP',
]);
const actionStates = new Set<InitialActionReviewState>([
  'REVIEWABLE_DRAFT',
  'NEEDS_CONFIRMATION',
  'BLOCKED_BY_DECISION_EVIDENCE',
]);
const horizons = new Set<RoadmapHorizon>([
  'MONTHS_1_3',
  'MONTHS_4_6',
  'MONTHS_7_9',
  'MONTHS_10_12',
  'BEYOND_12_MONTHS',
  'TO_BE_DECIDED',
]);
const commitments = new Set<RoadmapCommitment>([
  'SELECTED_ACT_DRAFT',
  'FUTURE_CANDIDATE',
]);

function requireNonblank(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a nonblank string`);
  }
}

function validateStringArray(values: readonly string[], field: string): void {
  if (!Array.isArray(values)) throw new TypeError(`${field} must be an array`);
  for (const value of values) requireNonblank(value, `${field} entry`);
}

function validateUniqueIds(values: readonly string[], field: string): Set<string> {
  if (!Array.isArray(values)) throw new TypeError(`${field} must be an array`);
  const ids = new Set<string>();
  for (const value of values) {
    requireNonblank(value, `${field} entry`);
    if (ids.has(value)) throw new TypeError(`${field} contains duplicate id: ${value}`);
    ids.add(value);
  }
  return ids;
}

export function reviewPaidAssessmentRoadmap(
  options: ActOptionReviewResult,
  decisions: DecisionSessionReviewResult,
  initialActions: InitialActionPlanReview,
  drafts: readonly RoadmapItemDraft[],
): RoadmapReviewResult {
  if (!options || typeof options !== 'object' || !Array.isArray(options.options)) {
    throw new TypeError('options.options must be an array');
  }
  if (!decisions || typeof decisions !== 'object' || !Array.isArray(decisions.decisions)) {
    throw new TypeError('decisions.decisions must be an array');
  }
  if (!initialActions || typeof initialActions !== 'object' || !Array.isArray(initialActions.actions)) {
    throw new TypeError('initialActions.actions must be an array');
  }
  if (!Array.isArray(drafts)) throw new TypeError('drafts must be an array');

  const optionsById = new Map<string, ActOptionReviewState>();
  for (const option of options.options) {
    if (!option || typeof option !== 'object') throw new TypeError('option must be an object');
    requireNonblank(option.id, 'option.id');
    if (optionsById.has(option.id)) throw new TypeError(`duplicate option id: ${option.id}`);
    if (!optionStates.has(option.state)) throw new TypeError(`option ${option.id}.state is invalid`);
    optionsById.set(option.id, option.state);
  }

  const decisionsById = new Map<string, {
    disposition: DecisionSessionDisposition;
    state: DecisionSessionReviewState;
    selectedActIds: Set<string>;
  }>();
  for (const decision of decisions.decisions) {
    if (!decision || typeof decision !== 'object') throw new TypeError('decision must be an object');
    requireNonblank(decision.id, 'decision.id');
    if (decisionsById.has(decision.id)) throw new TypeError(`duplicate decision id: ${decision.id}`);
    if (!dispositions.has(decision.disposition)) {
      throw new TypeError(`decision ${decision.id}.disposition is invalid`);
    }
    if (!decisionStates.has(decision.state)) throw new TypeError(`decision ${decision.id}.state is invalid`);
    const selectedActIds = validateUniqueIds(
      decision.selectedActIds,
      `decision ${decision.id}.selectedActIds`,
    );
    const heldActIds = validateUniqueIds(decision.heldActIds, `decision ${decision.id}.heldActIds`);
    for (const actId of selectedActIds) {
      if (!optionsById.has(actId)) {
        throw new TypeError(`decision ${decision.id} has unknown selected ACT id: ${actId}`);
      }
      if (heldActIds.has(actId)) {
        throw new TypeError(`decision ${decision.id} ACT is both selected and held: ${actId}`);
      }
    }
    for (const actId of heldActIds) {
      if (!optionsById.has(actId)) {
        throw new TypeError(`decision ${decision.id} has unknown held ACT id: ${actId}`);
      }
    }
    decisionsById.set(decision.id, {
      disposition: decision.disposition,
      state: decision.state,
      selectedActIds,
    });
  }

  const actionsById = new Map<string, {
    actId: string;
    decisionSessionId: string;
    state: InitialActionReviewState;
  }>();
  for (const action of initialActions.actions) {
    if (!action || typeof action !== 'object') throw new TypeError('initial action must be an object');
    requireNonblank(action.id, 'initial action.id');
    if (actionsById.has(action.id)) throw new TypeError(`duplicate initial action id: ${action.id}`);
    requireNonblank(action.actId, `initial action ${action.id}.actId`);
    requireNonblank(action.decisionSessionId, `initial action ${action.id}.decisionSessionId`);
    if (!actionStates.has(action.state)) throw new TypeError(`initial action ${action.id}.state is invalid`);
    actionsById.set(action.id, {
      actId: action.actId,
      decisionSessionId: action.decisionSessionId,
      state: action.state,
    });
  }

  const itemIds = new Set<string>();
  const items: RoadmapReviewResult['items'] = [];
  const counts: Record<RoadmapReviewState, number> = {
    REVIEWABLE_DRAFT: 0,
    NEEDS_CONFIRMATION: 0,
    BLOCKED_BY_EVIDENCE: 0,
  };

  for (const draft of drafts) {
    if (!draft || typeof draft !== 'object') throw new TypeError('draft must be an object');
    requireNonblank(draft.id, 'draft.id');
    if (itemIds.has(draft.id)) throw new TypeError(`duplicate roadmap item id: ${draft.id}`);
    itemIds.add(draft.id);
    requireNonblank(draft.actId, `draft ${draft.id}.actId`);
    const optionState = optionsById.get(draft.actId);
    if (!optionState) throw new TypeError(`draft ${draft.id} has unknown ACT id: ${draft.actId}`);
    if (!horizons.has(draft.horizon)) throw new TypeError(`draft ${draft.id}.horizon is invalid`);
    if (!commitments.has(draft.commitment)) throw new TypeError(`draft ${draft.id}.commitment is invalid`);
    if (!Number.isInteger(draft.sequence) || draft.sequence <= 0) {
      throw new TypeError(`draft ${draft.id}.sequence must be a positive integer`);
    }
    requireNonblank(draft.purpose, `draft ${draft.id}.purpose`);
    requireNonblank(draft.expectedChange, `draft ${draft.id}.expectedChange`);
    requireNonblank(draft.verificationApproach, `draft ${draft.id}.verificationApproach`);
    requireNonblank(draft.reassessmentTrigger, `draft ${draft.id}.reassessmentTrigger`);
    validateStringArray(draft.prerequisites, `draft ${draft.id}.prerequisites`);
    validateStringArray(draft.dependencies, `draft ${draft.id}.dependencies`);
    validateStringArray(draft.risks, `draft ${draft.id}.risks`);
    validateStringArray(draft.openQuestions, `draft ${draft.id}.openQuestions`);
    if (draft.authoredBy !== undefined) requireNonblank(draft.authoredBy, `draft ${draft.id}.authoredBy`);
    const initialActionIds = validateUniqueIds(
      draft.initialActionIds,
      `draft ${draft.id}.initialActionIds`,
    );

    let decision: {
      disposition: DecisionSessionDisposition;
      state: DecisionSessionReviewState;
      selectedActIds: Set<string>;
    } | undefined;
    if (draft.commitment === 'SELECTED_ACT_DRAFT') {
      if (draft.decisionSessionId === undefined) {
        throw new TypeError(`draft ${draft.id} SELECTED_ACT_DRAFT requires decisionSessionId`);
      }
      requireNonblank(draft.decisionSessionId, `draft ${draft.id}.decisionSessionId`);
      decision = decisionsById.get(draft.decisionSessionId);
      if (!decision) {
        throw new TypeError(`draft ${draft.id} has unknown decision session id: ${draft.decisionSessionId}`);
      }
      if (decision.disposition !== 'ACT_SELECTION') {
        throw new TypeError(`draft ${draft.id} decision is not ACT_SELECTION: ${draft.decisionSessionId}`);
      }
      if (!decision.selectedActIds.has(draft.actId)) {
        throw new TypeError(`draft ${draft.id} ACT is not selected by decision: ${draft.actId}`);
      }
    } else {
      if (draft.decisionSessionId !== undefined) {
        throw new TypeError(`draft ${draft.id} FUTURE_CANDIDATE must not have decisionSessionId`);
      }
      if (initialActionIds.size > 0) {
        throw new TypeError(`draft ${draft.id} FUTURE_CANDIDATE requires zero initial actions`);
      }
    }

    const linkedActions: Array<{ id: string; state: InitialActionReviewState }> = [];
    for (const actionId of draft.initialActionIds) {
      const action = actionsById.get(actionId);
      if (!action) throw new TypeError(`draft ${draft.id} has unknown initial action id: ${actionId}`);
      if (action.actId !== draft.actId) {
        throw new TypeError(`draft ${draft.id} initial action ACT mismatch: ${actionId}`);
      }
      if (
        draft.commitment === 'SELECTED_ACT_DRAFT'
        && action.decisionSessionId !== draft.decisionSessionId
      ) {
        throw new TypeError(`draft ${draft.id} initial action decision mismatch: ${actionId}`);
      }
      linkedActions.push({ id: actionId, state: action.state });
    }

    let state: RoadmapReviewState;
    let reviewReasons: string[];
    const blockedReasons: string[] = [];
    if (decision?.state === 'BLOCKED_BY_OPTION_EVIDENCE') {
      blockedReasons.push(`DECISION_BLOCKED:${draft.decisionSessionId}`);
    }
    if (optionState === 'BLOCKED_BY_GAP_EVIDENCE') {
      blockedReasons.push(`ACT_BLOCKED:${draft.actId}`);
    }
    for (const action of linkedActions) {
      if (action.state === 'BLOCKED_BY_DECISION_EVIDENCE') {
        blockedReasons.push(`ACTION_BLOCKED:${action.id}`);
      }
    }
    if (blockedReasons.length > 0) {
      state = 'BLOCKED_BY_EVIDENCE';
      reviewReasons = blockedReasons;
    } else {
      reviewReasons = [];
      if (decision?.state === 'NEEDS_CONFIRMATION') {
        reviewReasons.push(`DECISION_NEEDS_CONFIRMATION:${draft.decisionSessionId}`);
      }
      if (optionState === 'NEEDS_CONFIRMATION') {
        reviewReasons.push(`ACT_NEEDS_CONFIRMATION:${draft.actId}`);
      }
      for (const action of linkedActions) {
        if (action.state === 'NEEDS_CONFIRMATION') {
          reviewReasons.push(`ACTION_NEEDS_CONFIRMATION:${action.id}`);
        }
      }
      if (draft.openQuestions.length > 0) reviewReasons.push('ROADMAP_QUESTIONS_REMAIN');
      if (draft.commitment === 'FUTURE_CANDIDATE') {
        reviewReasons.push('FUTURE_ACT_REQUIRES_NEW_DECISION');
      }
      state = reviewReasons.length > 0 ? 'NEEDS_CONFIRMATION' : 'REVIEWABLE_DRAFT';
    }

    counts[state] += 1;
    items.push({
      id: draft.id,
      actId: draft.actId,
      ...(draft.decisionSessionId === undefined
        ? {}
        : { decisionSessionId: draft.decisionSessionId }),
      initialActionIds: [...draft.initialActionIds],
      horizon: draft.horizon,
      commitment: draft.commitment,
      sequence: draft.sequence,
      purpose: draft.purpose,
      expectedChange: draft.expectedChange,
      verificationApproach: draft.verificationApproach,
      prerequisites: [...draft.prerequisites],
      dependencies: [...draft.dependencies],
      risks: [...draft.risks],
      reassessmentTrigger: draft.reassessmentTrigger,
      openQuestions: [...draft.openQuestions],
      ...(draft.authoredBy === undefined ? {} : { authoredBy: draft.authoredBy }),
      state,
      reviewReasons,
    });
  }

  return { items, counts };
}
