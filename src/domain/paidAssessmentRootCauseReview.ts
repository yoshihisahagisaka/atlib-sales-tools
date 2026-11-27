import type { GapReviewResult, GapReviewState } from './paidAssessmentGapReview';
import type { PreparationSourceRef } from './paidAssessmentPreparation';

export interface RootCauseEvidenceRef {
  source: PreparationSourceRef;
  relation: 'SUPPORTS' | 'CONTRADICTS';
  verification: 'VERIFIED_REFERENCE' | 'UNVERIFIED_STATEMENT' | 'UNKNOWN';
  note: string;
}

export interface RootCauseHypothesis {
  id: string;
  gapId: string;
  statement: string;
  rationale: string;
  evidence: readonly RootCauseEvidenceRef[];
  openQuestions: readonly string[];
  proposedBy?: string;
}

export type RootCauseReviewState =
  | 'HYPOTHESIS_WITH_VERIFIED_SUPPORT'
  | 'HYPOTHESIS_CONTESTED'
  | 'HYPOTHESIS_UNSUBSTANTIATED'
  | 'BLOCKED_BY_GAP_EVIDENCE';

export interface RootCauseReviewResult {
  hypotheses: Array<RootCauseHypothesis & { state: RootCauseReviewState }>;
  counts: Record<RootCauseReviewState, number>;
}

const gapStates = new Set<GapReviewState>([
  'CONFIRMED_DIFFERENCE',
  'NO_DIFFERENCE_IDENTIFIED',
  'INSUFFICIENT_EVIDENCE',
]);
const sourceKinds = new Set<PreparationSourceRef['kind']>([
  'FREE_DIAGNOSIS_REPORT',
  'MANAGEMENT_FEEDBACK',
  'CUSTOMER_STATEMENT',
  'CORE_VERIFIED_REFERENCE',
]);
const relations = new Set<RootCauseEvidenceRef['relation']>(['SUPPORTS', 'CONTRADICTS']);
const verificationStates = new Set<RootCauseEvidenceRef['verification']>([
  'VERIFIED_REFERENCE',
  'UNVERIFIED_STATEMENT',
  'UNKNOWN',
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

function reviewState(
  gapState: GapReviewState,
  evidence: readonly RootCauseEvidenceRef[],
): RootCauseReviewState {
  if (gapState !== 'CONFIRMED_DIFFERENCE') return 'BLOCKED_BY_GAP_EVIDENCE';
  const hasVerifiedContradiction = evidence.some(item => (
    item.verification === 'VERIFIED_REFERENCE' && item.relation === 'CONTRADICTS'
  ));
  if (hasVerifiedContradiction) return 'HYPOTHESIS_CONTESTED';
  const hasVerifiedSupport = evidence.some(item => (
    item.verification === 'VERIFIED_REFERENCE' && item.relation === 'SUPPORTS'
  ));
  if (hasVerifiedSupport) return 'HYPOTHESIS_WITH_VERIFIED_SUPPORT';
  return 'HYPOTHESIS_UNSUBSTANTIATED';
}

export function reviewPaidAssessmentRootCauses(
  gaps: GapReviewResult,
  hypotheses: readonly RootCauseHypothesis[],
): RootCauseReviewResult {
  if (!gaps || typeof gaps !== 'object' || !Array.isArray(gaps.items)) {
    throw new TypeError('gaps.items must be an array');
  }
  if (!Array.isArray(hypotheses)) throw new TypeError('hypotheses must be an array');

  const gapsById = new Map<string, GapReviewState>();
  for (const gap of gaps.items) {
    if (!gap || typeof gap !== 'object') throw new TypeError('gap must be an object');
    requireNonblank(gap.id, 'gap.id');
    if (gapsById.has(gap.id)) throw new TypeError(`duplicate gap id: ${gap.id}`);
    if (!gapStates.has(gap.state)) throw new TypeError(`gap ${gap.id}.state is invalid`);
    gapsById.set(gap.id, gap.state);
  }

  const hypothesisIds = new Set<string>();
  const reviewed: RootCauseReviewResult['hypotheses'] = [];
  const counts: Record<RootCauseReviewState, number> = {
    HYPOTHESIS_WITH_VERIFIED_SUPPORT: 0,
    HYPOTHESIS_CONTESTED: 0,
    HYPOTHESIS_UNSUBSTANTIATED: 0,
    BLOCKED_BY_GAP_EVIDENCE: 0,
  };

  for (const hypothesis of hypotheses) {
    if (!hypothesis || typeof hypothesis !== 'object') throw new TypeError('hypothesis must be an object');
    requireNonblank(hypothesis.id, 'hypothesis.id');
    if (hypothesisIds.has(hypothesis.id)) {
      throw new TypeError(`duplicate hypothesis id: ${hypothesis.id}`);
    }
    hypothesisIds.add(hypothesis.id);
    requireNonblank(hypothesis.gapId, `hypothesis ${hypothesis.id}.gapId`);
    const gapState = gapsById.get(hypothesis.gapId);
    if (gapState === undefined) throw new TypeError(`unknown gap id: ${hypothesis.gapId}`);
    requireNonblank(hypothesis.statement, `hypothesis ${hypothesis.id}.statement`);
    requireNonblank(hypothesis.rationale, `hypothesis ${hypothesis.id}.rationale`);
    if (hypothesis.proposedBy !== undefined) {
      requireNonblank(hypothesis.proposedBy, `hypothesis ${hypothesis.id}.proposedBy`);
    }
    if (!Array.isArray(hypothesis.evidence)) {
      throw new TypeError(`hypothesis ${hypothesis.id}.evidence must be an array`);
    }
    if (!Array.isArray(hypothesis.openQuestions)) {
      throw new TypeError(`hypothesis ${hypothesis.id}.openQuestions must be an array`);
    }
    for (const question of hypothesis.openQuestions) {
      requireNonblank(question, `hypothesis ${hypothesis.id}.openQuestions entry`);
    }

    for (const evidence of hypothesis.evidence) {
      if (!evidence || typeof evidence !== 'object') {
        throw new TypeError(`hypothesis ${hypothesis.id}.evidence entry must be an object`);
      }
      validateSource(evidence.source, `hypothesis ${hypothesis.id}.evidence.source`);
      if (!relations.has(evidence.relation)) {
        throw new TypeError(`hypothesis ${hypothesis.id}.evidence.relation is invalid`);
      }
      if (!verificationStates.has(evidence.verification)) {
        throw new TypeError(`hypothesis ${hypothesis.id}.evidence.verification is invalid`);
      }
      if (
        evidence.verification === 'VERIFIED_REFERENCE'
        && evidence.source.kind !== 'CORE_VERIFIED_REFERENCE'
      ) {
        throw new TypeError('VERIFIED_REFERENCE evidence requires a CORE_VERIFIED_REFERENCE source');
      }
      requireNonblank(evidence.note, `hypothesis ${hypothesis.id}.evidence.note`);
    }

    const state = reviewState(gapState, hypothesis.evidence);
    counts[state] += 1;
    reviewed.push({
      id: hypothesis.id,
      gapId: hypothesis.gapId,
      statement: hypothesis.statement,
      rationale: hypothesis.rationale,
      evidence: hypothesis.evidence.map((evidence: RootCauseEvidenceRef) => ({
        source: copySource(evidence.source),
        relation: evidence.relation,
        verification: evidence.verification,
        note: evidence.note,
      })),
      openQuestions: [...hypothesis.openQuestions],
      ...(hypothesis.proposedBy === undefined ? {} : { proposedBy: hypothesis.proposedBy }),
      state,
    });
  }

  return { hypotheses: reviewed, counts };
}
