import type { AssessmentArea, PreparationSourceRef } from './paidAssessmentPreparation';
import type { GapReviewResult, GapReviewState } from './paidAssessmentGapReview';
import type {
  RootCauseReviewResult,
  RootCauseReviewState,
} from './paidAssessmentRootCauseReview';

export type ActDesignLens =
  | 'ELIMINATE'
  | 'AUTOMATE'
  | 'STANDARDIZE'
  | 'DELEGATE'
  | 'RETAIN'
  | 'ORGANIZE';

export type ActOptionReviewState =
  | 'REVIEWABLE'
  | 'NEEDS_CONFIRMATION'
  | 'BLOCKED_BY_GAP_EVIDENCE';

export interface ActOptionCandidate {
  id: string;
  title: string;
  description: string;
  why: string;
  area: AssessmentArea;
  lenses: readonly ActDesignLens[];
  future: { statement: string; source: PreparationSourceRef };
  gapIds: readonly string[];
  rootCauseHypothesisIds: readonly string[];
  expectedChange: { statement: string; verificationApproach: string };
  assumptions: readonly string[];
  dependencies: readonly string[];
  risks: readonly string[];
  actorCandidates: readonly (
    | 'CUSTOMER'
    | 'EXISTING_VENDOR'
    | 'OTHER_VENDOR'
    | 'ATLIB'
    | 'COMBINATION'
  )[];
  authoredBy?: string;
}

export interface ActOptionReviewResult {
  options: Array<ActOptionCandidate & {
    state: ActOptionReviewState;
    reviewReasons: string[];
  }>;
  counts: Record<ActOptionReviewState, number>;
}

const gapStates = new Set<GapReviewState>([
  'CONFIRMED_DIFFERENCE',
  'NO_DIFFERENCE_IDENTIFIED',
  'INSUFFICIENT_EVIDENCE',
]);
const rootCauseStates = new Set<RootCauseReviewState>([
  'HYPOTHESIS_WITH_VERIFIED_SUPPORT',
  'HYPOTHESIS_CONTESTED',
  'HYPOTHESIS_UNSUBSTANTIATED',
  'BLOCKED_BY_GAP_EVIDENCE',
]);
const areas = new Set<AssessmentArea>(['TECHNOLOGY', 'OPERATION', 'MANAGEMENT']);
const lenses = new Set<ActDesignLens>([
  'ELIMINATE',
  'AUTOMATE',
  'STANDARDIZE',
  'DELEGATE',
  'RETAIN',
  'ORGANIZE',
]);
const actors = new Set<ActOptionCandidate['actorCandidates'][number]>([
  'CUSTOMER',
  'EXISTING_VENDOR',
  'OTHER_VENDOR',
  'ATLIB',
  'COMBINATION',
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

export function reviewPaidAssessmentActOptions(
  gaps: GapReviewResult,
  rootCauses: RootCauseReviewResult,
  candidates: readonly ActOptionCandidate[],
): ActOptionReviewResult {
  if (!gaps || typeof gaps !== 'object' || !Array.isArray(gaps.items)) {
    throw new TypeError('gaps.items must be an array');
  }
  if (!rootCauses || typeof rootCauses !== 'object' || !Array.isArray(rootCauses.hypotheses)) {
    throw new TypeError('rootCauses.hypotheses must be an array');
  }
  if (!Array.isArray(candidates)) throw new TypeError('candidates must be an array');

  const gapsById = new Map<string, GapReviewState>();
  for (const gap of gaps.items) {
    if (!gap || typeof gap !== 'object') throw new TypeError('gap must be an object');
    requireNonblank(gap.id, 'gap.id');
    if (gapsById.has(gap.id)) throw new TypeError(`duplicate gap id: ${gap.id}`);
    if (!gapStates.has(gap.state)) throw new TypeError(`gap ${gap.id}.state is invalid`);
    gapsById.set(gap.id, gap.state);
  }

  const causesById = new Map<string, { gapId: string; state: RootCauseReviewState }>();
  for (const cause of rootCauses.hypotheses) {
    if (!cause || typeof cause !== 'object') throw new TypeError('root cause must be an object');
    requireNonblank(cause.id, 'root cause.id');
    if (causesById.has(cause.id)) throw new TypeError(`duplicate root cause id: ${cause.id}`);
    requireNonblank(cause.gapId, `root cause ${cause.id}.gapId`);
    if (!gapsById.has(cause.gapId)) throw new TypeError(`unknown root cause gap id: ${cause.gapId}`);
    if (!rootCauseStates.has(cause.state)) {
      throw new TypeError(`root cause ${cause.id}.state is invalid`);
    }
    causesById.set(cause.id, { gapId: cause.gapId, state: cause.state });
  }

  const optionIds = new Set<string>();
  const reviewed: ActOptionReviewResult['options'] = [];
  const counts: Record<ActOptionReviewState, number> = {
    REVIEWABLE: 0,
    NEEDS_CONFIRMATION: 0,
    BLOCKED_BY_GAP_EVIDENCE: 0,
  };

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') throw new TypeError('candidate must be an object');
    requireNonblank(candidate.id, 'candidate.id');
    if (optionIds.has(candidate.id)) throw new TypeError(`duplicate option id: ${candidate.id}`);
    optionIds.add(candidate.id);
    requireNonblank(candidate.title, `candidate ${candidate.id}.title`);
    requireNonblank(candidate.description, `candidate ${candidate.id}.description`);
    requireNonblank(candidate.why, `candidate ${candidate.id}.why`);
    if (!areas.has(candidate.area)) throw new TypeError(`candidate ${candidate.id}.area is invalid`);

    if (!Array.isArray(candidate.lenses) || candidate.lenses.length === 0 || candidate.lenses.length > 6) {
      throw new TypeError(`candidate ${candidate.id}.lenses must contain 1..6 entries`);
    }
    const candidateLenses = new Set<ActDesignLens>();
    for (const lens of candidate.lenses) {
      if (!lenses.has(lens)) throw new TypeError(`candidate ${candidate.id}.lens is invalid`);
      if (candidateLenses.has(lens)) throw new TypeError(`candidate ${candidate.id} has duplicate lens: ${lens}`);
      candidateLenses.add(lens);
    }

    if (!candidate.future || typeof candidate.future !== 'object') {
      throw new TypeError(`candidate ${candidate.id}.future must be an object`);
    }
    requireNonblank(candidate.future.statement, `candidate ${candidate.id}.future.statement`);
    validateSource(candidate.future.source, `candidate ${candidate.id}.future.source`);

    if (!Array.isArray(candidate.gapIds) || candidate.gapIds.length === 0) {
      throw new TypeError(`candidate ${candidate.id}.gapIds must be a nonempty array`);
    }
    const linkedGapIds = new Set<string>();
    for (const gapId of candidate.gapIds) {
      requireNonblank(gapId, `candidate ${candidate.id}.gapIds entry`);
      if (linkedGapIds.has(gapId)) throw new TypeError(`candidate ${candidate.id} has duplicate gapId: ${gapId}`);
      if (!gapsById.has(gapId)) throw new TypeError(`candidate ${candidate.id} has unknown gapId: ${gapId}`);
      linkedGapIds.add(gapId);
    }

    if (!Array.isArray(candidate.rootCauseHypothesisIds)) {
      throw new TypeError(`candidate ${candidate.id}.rootCauseHypothesisIds must be an array`);
    }
    const linkedCauseIds = new Set<string>();
    for (const causeId of candidate.rootCauseHypothesisIds) {
      requireNonblank(causeId, `candidate ${candidate.id}.rootCauseHypothesisIds entry`);
      if (linkedCauseIds.has(causeId)) {
        throw new TypeError(`candidate ${candidate.id} has duplicate rootCauseHypothesisId: ${causeId}`);
      }
      const cause = causesById.get(causeId);
      if (!cause) throw new TypeError(`candidate ${candidate.id} has unknown root cause: ${causeId}`);
      if (!linkedGapIds.has(cause.gapId)) {
        throw new TypeError(`candidate ${candidate.id} root cause ${causeId} is not linked to an option gap`);
      }
      linkedCauseIds.add(causeId);
    }

    if (!candidate.expectedChange || typeof candidate.expectedChange !== 'object') {
      throw new TypeError(`candidate ${candidate.id}.expectedChange must be an object`);
    }
    requireNonblank(candidate.expectedChange.statement, `candidate ${candidate.id}.expectedChange.statement`);
    requireNonblank(
      candidate.expectedChange.verificationApproach,
      `candidate ${candidate.id}.expectedChange.verificationApproach`,
    );
    validateStringArray(candidate.assumptions, `candidate ${candidate.id}.assumptions`);
    validateStringArray(candidate.dependencies, `candidate ${candidate.id}.dependencies`);
    validateStringArray(candidate.risks, `candidate ${candidate.id}.risks`);

    if (!Array.isArray(candidate.actorCandidates)) {
      throw new TypeError(`candidate ${candidate.id}.actorCandidates must be an array`);
    }
    for (const actor of candidate.actorCandidates) {
      if (!actors.has(actor)) throw new TypeError(`candidate ${candidate.id}.actorCandidate is invalid`);
    }
    if (candidate.authoredBy !== undefined) {
      requireNonblank(candidate.authoredBy, `candidate ${candidate.id}.authoredBy`);
    }

    const blockedGapReasons = candidate.gapIds
      .filter((gapId: string) => gapsById.get(gapId) !== 'CONFIRMED_DIFFERENCE')
      .map((gapId: string) => `GAP_NOT_CONFIRMED:${gapId}`);
    let state: ActOptionReviewState;
    let reviewReasons: string[];
    if (blockedGapReasons.length > 0) {
      state = 'BLOCKED_BY_GAP_EVIDENCE';
      reviewReasons = blockedGapReasons;
    } else {
      const causeReasons = candidate.rootCauseHypothesisIds
        .filter((causeId: string) => (
          causesById.get(causeId)!.state !== 'HYPOTHESIS_WITH_VERIFIED_SUPPORT'
        ))
        .map((causeId: string) => `CAUSE_NOT_ESTABLISHED:${causeId}`);
      reviewReasons = [...causeReasons];
      if (candidate.assumptions.length > 0) reviewReasons.push('ASSUMPTION_REMAINS');
      state = reviewReasons.length > 0 ? 'NEEDS_CONFIRMATION' : 'REVIEWABLE';
    }

    counts[state] += 1;
    reviewed.push({
      id: candidate.id,
      title: candidate.title,
      description: candidate.description,
      why: candidate.why,
      area: candidate.area,
      lenses: [...candidate.lenses],
      future: { statement: candidate.future.statement, source: copySource(candidate.future.source) },
      gapIds: [...candidate.gapIds],
      rootCauseHypothesisIds: [...candidate.rootCauseHypothesisIds],
      expectedChange: { ...candidate.expectedChange },
      assumptions: [...candidate.assumptions],
      dependencies: [...candidate.dependencies],
      risks: [...candidate.risks],
      actorCandidates: [...candidate.actorCandidates],
      ...(candidate.authoredBy === undefined ? {} : { authoredBy: candidate.authoredBy }),
      state,
      reviewReasons,
    });
  }

  return { options: reviewed, counts };
}
