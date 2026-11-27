import type {
  ActOptionReviewResult,
  ActOptionReviewState,
} from './paidAssessmentActOptionReview';
import type {
  ManagementScenarioReview,
  ScenarioReviewState,
} from './paidAssessmentScenarioComparison';
import type { PreparationSourceRef } from './paidAssessmentPreparation';

export type DecisionSessionDisposition =
  | 'ACT_SELECTION'
  | 'ADDITIONAL_EVIDENCE'
  | 'HOLD'
  | 'STOP';

export type DecisionSessionReviewState =
  | 'REVIEWABLE'
  | 'NEEDS_CONFIRMATION'
  | 'BLOCKED_BY_OPTION_EVIDENCE';

export interface DecisionSessionCandidate {
  id: string;
  disposition: DecisionSessionDisposition;
  decisionOwnerRef: string;
  managementPriority: { statement: string; source: PreparationSourceRef };
  selectedScenarioId?: string;
  selectedActIds: readonly string[];
  heldActIds: readonly string[];
  rationale: string;
  additionalEvidenceNeeded: readonly string[];
  nextDecisionTiming?: string;
  enteredBy?: string;
}

export interface DecisionSessionReviewResult {
  decisions: Array<DecisionSessionCandidate & {
    state: DecisionSessionReviewState;
    reviewReasons: string[];
  }>;
  counts: Record<DecisionSessionReviewState, number>;
}

const optionStates = new Set<ActOptionReviewState>([
  'REVIEWABLE',
  'NEEDS_CONFIRMATION',
  'BLOCKED_BY_GAP_EVIDENCE',
]);
const scenarioStates = new Set<ScenarioReviewState>([
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
const sourceKinds = new Set<PreparationSourceRef['kind']>([
  'FREE_DIAGNOSIS_REPORT',
  'MANAGEMENT_FEEDBACK',
  'CUSTOMER_STATEMENT',
  'CORE_VERIFIED_REFERENCE',
]);
const hashPattern = /^[0-9a-f]{64}$/;

function requireNonblank(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a nonblank string`);
  }
}

function validateSource(source: PreparationSourceRef, field: string): void {
  if (!source || typeof source !== 'object') throw new TypeError(`${field} must be an object`);
  if (!sourceKinds.has(source.kind)) throw new TypeError(`${field}.kind is invalid`);
  requireNonblank(source.id, `${field}.id`);
  if (!Number.isInteger(source.version) || source.version <= 0) {
    throw new TypeError(`${field}.version must be a positive integer`);
  }
  if (source.hash !== undefined && (typeof source.hash !== 'string' || !hashPattern.test(source.hash))) {
    throw new TypeError(`${field}.hash must be a 64-character lowercase hexadecimal hash`);
  }
}

function copySource(source: PreparationSourceRef): PreparationSourceRef {
  return source.hash === undefined
    ? { kind: source.kind, id: source.id, version: source.version }
    : { kind: source.kind, id: source.id, version: source.version, hash: source.hash };
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

function validateStringArray(values: readonly string[], field: string): void {
  if (!Array.isArray(values)) throw new TypeError(`${field} must be an array`);
  for (const value of values) requireNonblank(value, `${field} entry`);
}

export function reviewPaidAssessmentDecisionSessions(
  options: ActOptionReviewResult,
  scenarios: ManagementScenarioReview,
  candidates: readonly DecisionSessionCandidate[],
): DecisionSessionReviewResult {
  if (!options || typeof options !== 'object' || !Array.isArray(options.options)) {
    throw new TypeError('options.options must be an array');
  }
  if (!scenarios || typeof scenarios !== 'object' || !Array.isArray(scenarios.scenarios)) {
    throw new TypeError('scenarios.scenarios must be an array');
  }
  if (!Array.isArray(candidates)) throw new TypeError('candidates must be an array');

  const optionsById = new Map<string, ActOptionReviewState>();
  for (const option of options.options) {
    if (!option || typeof option !== 'object') throw new TypeError('option must be an object');
    requireNonblank(option.id, 'option.id');
    if (optionsById.has(option.id)) throw new TypeError(`duplicate option id: ${option.id}`);
    if (!optionStates.has(option.state)) throw new TypeError(`option ${option.id}.state is invalid`);
    optionsById.set(option.id, option.state);
  }

  const scenariosById = new Map<string, { state: ScenarioReviewState; optionIds: Set<string> }>();
  for (const scenario of scenarios.scenarios) {
    if (!scenario || typeof scenario !== 'object') throw new TypeError('scenario must be an object');
    requireNonblank(scenario.id, 'scenario.id');
    if (scenariosById.has(scenario.id)) throw new TypeError(`duplicate scenario id: ${scenario.id}`);
    if (!scenarioStates.has(scenario.state)) throw new TypeError(`scenario ${scenario.id}.state is invalid`);
    const scenarioOptionIds = validateUniqueIds(scenario.optionIds, `scenario ${scenario.id}.optionIds`);
    for (const optionId of scenarioOptionIds) {
      if (!optionsById.has(optionId)) {
        throw new TypeError(`scenario ${scenario.id} has unknown option id: ${optionId}`);
      }
    }
    scenariosById.set(scenario.id, { state: scenario.state, optionIds: scenarioOptionIds });
  }

  const decisionIds = new Set<string>();
  const reviewed: DecisionSessionReviewResult['decisions'] = [];
  const counts: Record<DecisionSessionReviewState, number> = {
    REVIEWABLE: 0,
    NEEDS_CONFIRMATION: 0,
    BLOCKED_BY_OPTION_EVIDENCE: 0,
  };

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') throw new TypeError('candidate must be an object');
    requireNonblank(candidate.id, 'candidate.id');
    if (decisionIds.has(candidate.id)) throw new TypeError(`duplicate decision id: ${candidate.id}`);
    decisionIds.add(candidate.id);
    if (!dispositions.has(candidate.disposition)) {
      throw new TypeError(`candidate ${candidate.id}.disposition is invalid`);
    }
    requireNonblank(candidate.decisionOwnerRef, `candidate ${candidate.id}.decisionOwnerRef`);
    if (!candidate.managementPriority || typeof candidate.managementPriority !== 'object') {
      throw new TypeError(`candidate ${candidate.id}.managementPriority must be an object`);
    }
    requireNonblank(
      candidate.managementPriority.statement,
      `candidate ${candidate.id}.managementPriority.statement`,
    );
    validateSource(
      candidate.managementPriority.source,
      `candidate ${candidate.id}.managementPriority.source`,
    );
    requireNonblank(candidate.rationale, `candidate ${candidate.id}.rationale`);
    if (candidate.nextDecisionTiming !== undefined) {
      requireNonblank(candidate.nextDecisionTiming, `candidate ${candidate.id}.nextDecisionTiming`);
    }
    if (candidate.enteredBy !== undefined) {
      requireNonblank(candidate.enteredBy, `candidate ${candidate.id}.enteredBy`);
    }

    const selectedActIds = validateUniqueIds(
      candidate.selectedActIds,
      `candidate ${candidate.id}.selectedActIds`,
    );
    const heldActIds = validateUniqueIds(candidate.heldActIds, `candidate ${candidate.id}.heldActIds`);
    for (const selectedId of selectedActIds) {
      if (heldActIds.has(selectedId)) {
        throw new TypeError(`candidate ${candidate.id} ACT is both selected and held: ${selectedId}`);
      }
    }
    for (const actId of [...selectedActIds, ...heldActIds]) {
      if (!optionsById.has(actId)) {
        throw new TypeError(`candidate ${candidate.id} has unknown ACT id: ${actId}`);
      }
    }
    validateStringArray(
      candidate.additionalEvidenceNeeded,
      `candidate ${candidate.id}.additionalEvidenceNeeded`,
    );

    if (candidate.disposition === 'ACT_SELECTION') {
      if (candidate.selectedActIds.length === 0) {
        throw new TypeError(`candidate ${candidate.id} ACT_SELECTION requires selected ACT`);
      }
    } else if (candidate.selectedActIds.length > 0) {
      throw new TypeError(`candidate ${candidate.id} ${candidate.disposition} requires zero selected ACTs`);
    }
    if (
      candidate.disposition === 'ADDITIONAL_EVIDENCE'
      && candidate.additionalEvidenceNeeded.length === 0
    ) {
      throw new TypeError(`candidate ${candidate.id} ADDITIONAL_EVIDENCE requires evidence list`);
    }

    let selectedScenario: { state: ScenarioReviewState; optionIds: Set<string> } | undefined;
    if (candidate.selectedScenarioId !== undefined) {
      requireNonblank(candidate.selectedScenarioId, `candidate ${candidate.id}.selectedScenarioId`);
      selectedScenario = scenariosById.get(candidate.selectedScenarioId);
      if (!selectedScenario) {
        throw new TypeError(`candidate ${candidate.id} has unknown scenario id: ${candidate.selectedScenarioId}`);
      }
      for (const selectedId of selectedActIds) {
        if (!selectedScenario.optionIds.has(selectedId)) {
          throw new TypeError(`candidate ${candidate.id} selected ACT is not in scenario: ${selectedId}`);
        }
      }
    }

    let state: DecisionSessionReviewState = 'REVIEWABLE';
    let reviewReasons: string[] = [];
    if (candidate.disposition === 'ACT_SELECTION') {
      const blockedReasons = candidate.selectedActIds
        .filter((actId: string) => optionsById.get(actId) === 'BLOCKED_BY_GAP_EVIDENCE')
        .map((actId: string) => `ACT_BLOCKED:${actId}`);
      if (selectedScenario?.state === 'BLOCKED_BY_OPTION_EVIDENCE') {
        blockedReasons.push(`SCENARIO_BLOCKED:${candidate.selectedScenarioId}`);
      }
      if (blockedReasons.length > 0) {
        state = 'BLOCKED_BY_OPTION_EVIDENCE';
        reviewReasons = blockedReasons;
      } else {
        reviewReasons = candidate.selectedActIds
          .filter((actId: string) => optionsById.get(actId) === 'NEEDS_CONFIRMATION')
          .map((actId: string) => `ACT_NEEDS_CONFIRMATION:${actId}`);
        if (selectedScenario?.state === 'NEEDS_CONFIRMATION') {
          reviewReasons.push(`SCENARIO_NEEDS_CONFIRMATION:${candidate.selectedScenarioId}`);
        }
        if (candidate.additionalEvidenceNeeded.length > 0) {
          reviewReasons.push('ADDITIONAL_EVIDENCE_REMAINS');
        }
        state = reviewReasons.length > 0 ? 'NEEDS_CONFIRMATION' : 'REVIEWABLE';
      }
    }

    counts[state] += 1;
    reviewed.push({
      id: candidate.id,
      disposition: candidate.disposition,
      decisionOwnerRef: candidate.decisionOwnerRef,
      managementPriority: {
        statement: candidate.managementPriority.statement,
        source: copySource(candidate.managementPriority.source),
      },
      ...(candidate.selectedScenarioId === undefined
        ? {}
        : { selectedScenarioId: candidate.selectedScenarioId }),
      selectedActIds: [...candidate.selectedActIds],
      heldActIds: [...candidate.heldActIds],
      rationale: candidate.rationale,
      additionalEvidenceNeeded: [...candidate.additionalEvidenceNeeded],
      ...(candidate.nextDecisionTiming === undefined
        ? {}
        : { nextDecisionTiming: candidate.nextDecisionTiming }),
      ...(candidate.enteredBy === undefined ? {} : { enteredBy: candidate.enteredBy }),
      state,
      reviewReasons,
    });
  }

  return { decisions: reviewed, counts };
}
