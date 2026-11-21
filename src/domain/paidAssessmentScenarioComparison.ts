import type {
  ActOptionReviewResult,
  ActOptionReviewState,
} from './paidAssessmentActOptionReview';
import type { PreparationSourceRef } from './paidAssessmentPreparation';

export interface ManagementScenarioCandidate {
  id: string;
  title: string;
  managementPriority: { statement: string; source: PreparationSourceRef };
  rationale: string;
  optionIds: readonly string[];
  expectedDirection: string;
  tradeoffs: readonly string[];
  risks: readonly string[];
  assumptions: readonly string[];
  investmentCharacter: 'NOT_ASSESSED' | 'QUALITATIVE_ONLY' | 'EVIDENCE_BACKED_RANGE';
  investmentNote?: string;
  investmentEvidence?: PreparationSourceRef;
  authoredBy?: string;
}

export type ScenarioReviewState =
  | 'REVIEWABLE'
  | 'NEEDS_CONFIRMATION'
  | 'BLOCKED_BY_OPTION_EVIDENCE';

export interface ManagementScenarioReview {
  scenarios: Array<ManagementScenarioCandidate & {
    state: ScenarioReviewState;
    reviewReasons: string[];
  }>;
  counts: Record<ScenarioReviewState, number>;
}

const optionStates = new Set<ActOptionReviewState>([
  'REVIEWABLE',
  'NEEDS_CONFIRMATION',
  'BLOCKED_BY_GAP_EVIDENCE',
]);
const investmentCharacters = new Set<ManagementScenarioCandidate['investmentCharacter']>([
  'NOT_ASSESSED',
  'QUALITATIVE_ONLY',
  'EVIDENCE_BACKED_RANGE',
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

function validateStringArray(value: readonly string[], field: string): void {
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array`);
  for (const entry of value) requireNonblank(entry, `${field} entry`);
}

export function reviewPaidAssessmentScenarios(
  options: ActOptionReviewResult,
  scenarios: readonly ManagementScenarioCandidate[],
): ManagementScenarioReview {
  if (!options || typeof options !== 'object' || !Array.isArray(options.options)) {
    throw new TypeError('options.options must be an array');
  }
  if (!Array.isArray(scenarios)) throw new TypeError('scenarios must be an array');

  const optionsById = new Map<string, ActOptionReviewState>();
  for (const option of options.options) {
    if (!option || typeof option !== 'object') throw new TypeError('option must be an object');
    requireNonblank(option.id, 'option.id');
    if (optionsById.has(option.id)) throw new TypeError(`duplicate option id: ${option.id}`);
    if (!optionStates.has(option.state)) throw new TypeError(`option ${option.id}.state is invalid`);
    optionsById.set(option.id, option.state);
  }

  const scenarioIds = new Set<string>();
  const reviewed: ManagementScenarioReview['scenarios'] = [];
  const counts: Record<ScenarioReviewState, number> = {
    REVIEWABLE: 0,
    NEEDS_CONFIRMATION: 0,
    BLOCKED_BY_OPTION_EVIDENCE: 0,
  };

  for (const scenario of scenarios) {
    if (!scenario || typeof scenario !== 'object') throw new TypeError('scenario must be an object');
    requireNonblank(scenario.id, 'scenario.id');
    if (scenarioIds.has(scenario.id)) throw new TypeError(`duplicate scenario id: ${scenario.id}`);
    scenarioIds.add(scenario.id);
    requireNonblank(scenario.title, `scenario ${scenario.id}.title`);
    if (!scenario.managementPriority || typeof scenario.managementPriority !== 'object') {
      throw new TypeError(`scenario ${scenario.id}.managementPriority must be an object`);
    }
    requireNonblank(
      scenario.managementPriority.statement,
      `scenario ${scenario.id}.managementPriority.statement`,
    );
    validateSource(
      scenario.managementPriority.source,
      `scenario ${scenario.id}.managementPriority.source`,
    );
    requireNonblank(scenario.rationale, `scenario ${scenario.id}.rationale`);
    requireNonblank(scenario.expectedDirection, `scenario ${scenario.id}.expectedDirection`);
    if (scenario.authoredBy !== undefined) {
      requireNonblank(scenario.authoredBy, `scenario ${scenario.id}.authoredBy`);
    }

    if (!Array.isArray(scenario.optionIds) || scenario.optionIds.length === 0) {
      throw new TypeError(`scenario ${scenario.id}.optionIds must be a nonempty array`);
    }
    const linkedOptions = new Set<string>();
    for (const optionId of scenario.optionIds) {
      requireNonblank(optionId, `scenario ${scenario.id}.optionIds entry`);
      if (linkedOptions.has(optionId)) {
        throw new TypeError(`scenario ${scenario.id} has duplicate optionId: ${optionId}`);
      }
      if (!optionsById.has(optionId)) {
        throw new TypeError(`scenario ${scenario.id} has unknown optionId: ${optionId}`);
      }
      linkedOptions.add(optionId);
    }

    validateStringArray(scenario.tradeoffs, `scenario ${scenario.id}.tradeoffs`);
    validateStringArray(scenario.risks, `scenario ${scenario.id}.risks`);
    validateStringArray(scenario.assumptions, `scenario ${scenario.id}.assumptions`);
    if (!investmentCharacters.has(scenario.investmentCharacter)) {
      throw new TypeError(`scenario ${scenario.id}.investmentCharacter is invalid`);
    }
    if (scenario.investmentNote !== undefined) {
      requireNonblank(scenario.investmentNote, `scenario ${scenario.id}.investmentNote`);
    }
    if (scenario.investmentEvidence !== undefined) {
      validateSource(scenario.investmentEvidence, `scenario ${scenario.id}.investmentEvidence`);
    }
    if (
      scenario.investmentCharacter === 'QUALITATIVE_ONLY'
      && scenario.investmentNote === undefined
    ) {
      throw new TypeError(`scenario ${scenario.id} QUALITATIVE_ONLY requires investmentNote`);
    }
    if (scenario.investmentCharacter === 'EVIDENCE_BACKED_RANGE') {
      if (scenario.investmentNote === undefined) {
        throw new TypeError(`scenario ${scenario.id} EVIDENCE_BACKED_RANGE requires investmentNote`);
      }
      if (scenario.investmentEvidence === undefined) {
        throw new TypeError(`scenario ${scenario.id} EVIDENCE_BACKED_RANGE requires investmentEvidence`);
      }
    }

    const blockedReasons = scenario.optionIds
      .filter((optionId: string) => optionsById.get(optionId) === 'BLOCKED_BY_GAP_EVIDENCE')
      .map((optionId: string) => `OPTION_BLOCKED:${optionId}`);
    let state: ScenarioReviewState;
    let reviewReasons: string[];
    if (blockedReasons.length > 0) {
      state = 'BLOCKED_BY_OPTION_EVIDENCE';
      reviewReasons = blockedReasons;
    } else {
      reviewReasons = scenario.optionIds
        .filter((optionId: string) => optionsById.get(optionId) === 'NEEDS_CONFIRMATION')
        .map((optionId: string) => `OPTION_NEEDS_CONFIRMATION:${optionId}`);
      if (scenario.assumptions.length > 0) reviewReasons.push('ASSUMPTION_REMAINS');
      state = reviewReasons.length > 0 ? 'NEEDS_CONFIRMATION' : 'REVIEWABLE';
    }

    counts[state] += 1;
    reviewed.push({
      id: scenario.id,
      title: scenario.title,
      managementPriority: {
        statement: scenario.managementPriority.statement,
        source: copySource(scenario.managementPriority.source),
      },
      rationale: scenario.rationale,
      optionIds: [...scenario.optionIds],
      expectedDirection: scenario.expectedDirection,
      tradeoffs: [...scenario.tradeoffs],
      risks: [...scenario.risks],
      assumptions: [...scenario.assumptions],
      investmentCharacter: scenario.investmentCharacter,
      ...(scenario.investmentNote === undefined ? {} : { investmentNote: scenario.investmentNote }),
      ...(scenario.investmentEvidence === undefined
        ? {}
        : { investmentEvidence: copySource(scenario.investmentEvidence) }),
      ...(scenario.authoredBy === undefined ? {} : { authoredBy: scenario.authoredBy }),
      state,
      reviewReasons,
    });
  }

  return { scenarios: reviewed, counts };
}
