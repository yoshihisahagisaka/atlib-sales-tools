import type {
  ActOptionReviewResult,
  ActOptionReviewState,
} from './paidAssessmentActOptionReview';
import type {
  DecisionSessionDisposition,
  DecisionSessionReviewResult,
  DecisionSessionReviewState,
} from './paidAssessmentDecisionSessionReview';

export interface InitialActionDraft {
  id: string;
  decisionSessionId: string;
  actId: string;
  title: string;
  purpose: string;
  sequence: number;
  targetWindow: 'DAYS_1_30' | 'DAYS_31_60' | 'DAYS_61_90' | 'LATER' | 'TO_BE_DECIDED';
  prerequisites: readonly string[];
  actorProposal?: { label: string; rationale: string };
  deliverable: string;
  expectedChange: string;
  verificationApproach: string;
  openQuestions: readonly string[];
  authoredBy?: string;
}

export type InitialActionReviewState =
  | 'REVIEWABLE_DRAFT'
  | 'NEEDS_CONFIRMATION'
  | 'BLOCKED_BY_DECISION_EVIDENCE';

export interface InitialActionPlanReview {
  actions: Array<InitialActionDraft & {
    state: InitialActionReviewState;
    reviewReasons: string[];
  }>;
  counts: Record<InitialActionReviewState, number>;
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
const targetWindows = new Set<InitialActionDraft['targetWindow']>([
  'DAYS_1_30',
  'DAYS_31_60',
  'DAYS_61_90',
  'LATER',
  'TO_BE_DECIDED',
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

export function reviewPaidAssessmentInitialActions(
  options: ActOptionReviewResult,
  decisions: DecisionSessionReviewResult,
  drafts: readonly InitialActionDraft[],
): InitialActionPlanReview {
  if (!options || typeof options !== 'object' || !Array.isArray(options.options)) {
    throw new TypeError('options.options must be an array');
  }
  if (!decisions || typeof decisions !== 'object' || !Array.isArray(decisions.decisions)) {
    throw new TypeError('decisions.decisions must be an array');
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
    heldActIds: Set<string>;
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
    for (const selectedId of selectedActIds) {
      if (!optionsById.has(selectedId)) {
        throw new TypeError(`decision ${decision.id} has unknown selected ACT id: ${selectedId}`);
      }
      if (heldActIds.has(selectedId)) {
        throw new TypeError(`decision ${decision.id} ACT is both selected and held: ${selectedId}`);
      }
    }
    for (const heldId of heldActIds) {
      if (!optionsById.has(heldId)) {
        throw new TypeError(`decision ${decision.id} has unknown held ACT id: ${heldId}`);
      }
    }
    decisionsById.set(decision.id, {
      disposition: decision.disposition,
      state: decision.state,
      selectedActIds,
      heldActIds,
    });
  }

  const actionIds = new Set<string>();
  const actions: InitialActionPlanReview['actions'] = [];
  const counts: Record<InitialActionReviewState, number> = {
    REVIEWABLE_DRAFT: 0,
    NEEDS_CONFIRMATION: 0,
    BLOCKED_BY_DECISION_EVIDENCE: 0,
  };

  for (const draft of drafts) {
    if (!draft || typeof draft !== 'object') throw new TypeError('draft must be an object');
    requireNonblank(draft.id, 'draft.id');
    if (actionIds.has(draft.id)) throw new TypeError(`duplicate action id: ${draft.id}`);
    actionIds.add(draft.id);
    requireNonblank(draft.decisionSessionId, `draft ${draft.id}.decisionSessionId`);
    requireNonblank(draft.actId, `draft ${draft.id}.actId`);
    requireNonblank(draft.title, `draft ${draft.id}.title`);
    requireNonblank(draft.purpose, `draft ${draft.id}.purpose`);
    if (!Number.isInteger(draft.sequence) || draft.sequence <= 0) {
      throw new TypeError(`draft ${draft.id}.sequence must be a positive integer`);
    }
    if (!targetWindows.has(draft.targetWindow)) {
      throw new TypeError(`draft ${draft.id}.targetWindow is invalid`);
    }
    validateStringArray(draft.prerequisites, `draft ${draft.id}.prerequisites`);
    if (draft.actorProposal !== undefined) {
      if (!draft.actorProposal || typeof draft.actorProposal !== 'object') {
        throw new TypeError(`draft ${draft.id}.actorProposal must be an object`);
      }
      requireNonblank(draft.actorProposal.label, `draft ${draft.id}.actorProposal.label`);
      requireNonblank(draft.actorProposal.rationale, `draft ${draft.id}.actorProposal.rationale`);
    }
    requireNonblank(draft.deliverable, `draft ${draft.id}.deliverable`);
    requireNonblank(draft.expectedChange, `draft ${draft.id}.expectedChange`);
    requireNonblank(draft.verificationApproach, `draft ${draft.id}.verificationApproach`);
    validateStringArray(draft.openQuestions, `draft ${draft.id}.openQuestions`);
    if (draft.authoredBy !== undefined) requireNonblank(draft.authoredBy, `draft ${draft.id}.authoredBy`);

    const optionState = optionsById.get(draft.actId);
    if (!optionState) throw new TypeError(`draft ${draft.id} has unknown ACT id: ${draft.actId}`);
    const decision = decisionsById.get(draft.decisionSessionId);
    if (!decision) {
      throw new TypeError(`draft ${draft.id} has unknown decision session id: ${draft.decisionSessionId}`);
    }
    if (decision.disposition !== 'ACT_SELECTION') {
      throw new TypeError(`draft ${draft.id} decision is not ACT_SELECTION: ${draft.decisionSessionId}`);
    }
    if (!decision.selectedActIds.has(draft.actId)) {
      if (decision.heldActIds.has(draft.actId)) {
        throw new TypeError(`draft ${draft.id} refers to held ACT: ${draft.actId}`);
      }
      throw new TypeError(`draft ${draft.id} refers to unselected ACT: ${draft.actId}`);
    }

    let state: InitialActionReviewState;
    let reviewReasons: string[];
    if (
      decision.state === 'BLOCKED_BY_OPTION_EVIDENCE'
      || optionState === 'BLOCKED_BY_GAP_EVIDENCE'
    ) {
      state = 'BLOCKED_BY_DECISION_EVIDENCE';
      reviewReasons = [];
      if (decision.state === 'BLOCKED_BY_OPTION_EVIDENCE') {
        reviewReasons.push(`DECISION_BLOCKED:${draft.decisionSessionId}`);
      }
      if (optionState === 'BLOCKED_BY_GAP_EVIDENCE') {
        reviewReasons.push(`ACT_BLOCKED:${draft.actId}`);
      }
    } else {
      reviewReasons = [];
      if (decision.state === 'NEEDS_CONFIRMATION') {
        reviewReasons.push(`DECISION_NEEDS_CONFIRMATION:${draft.decisionSessionId}`);
      }
      if (optionState === 'NEEDS_CONFIRMATION') {
        reviewReasons.push(`ACT_NEEDS_CONFIRMATION:${draft.actId}`);
      }
      if (draft.openQuestions.length > 0) reviewReasons.push('ACTION_QUESTIONS_REMAIN');
      state = reviewReasons.length > 0 ? 'NEEDS_CONFIRMATION' : 'REVIEWABLE_DRAFT';
    }

    counts[state] += 1;
    actions.push({
      id: draft.id,
      decisionSessionId: draft.decisionSessionId,
      actId: draft.actId,
      title: draft.title,
      purpose: draft.purpose,
      sequence: draft.sequence,
      targetWindow: draft.targetWindow,
      prerequisites: [...draft.prerequisites],
      ...(draft.actorProposal === undefined
        ? {}
        : { actorProposal: { ...draft.actorProposal } }),
      deliverable: draft.deliverable,
      expectedChange: draft.expectedChange,
      verificationApproach: draft.verificationApproach,
      openQuestions: [...draft.openQuestions],
      ...(draft.authoredBy === undefined ? {} : { authoredBy: draft.authoredBy }),
      state,
      reviewReasons,
    });
  }

  return { actions, counts };
}
