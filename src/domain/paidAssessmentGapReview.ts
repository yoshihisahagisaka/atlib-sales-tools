import type { AssessmentArea, PreparationSourceRef } from './paidAssessmentPreparation';

export type GapReviewState =
  | 'CONFIRMED_DIFFERENCE'
  | 'NO_DIFFERENCE_IDENTIFIED'
  | 'INSUFFICIENT_EVIDENCE';

export interface GapReviewItem {
  id: string;
  area: AssessmentArea;
  futureCriterion: {
    statement: string;
    source: PreparationSourceRef;
  };
  current: {
    statement: string;
    source: PreparationSourceRef;
    verification: 'VERIFIED_REFERENCE' | 'UNVERIFIED_STATEMENT' | 'UNKNOWN';
  };
  comparison: {
    statement: string;
    rationale: string;
    sourceIds: readonly string[];
    assessment: 'DIFFERENCE' | 'NO_DIFFERENCE' | 'UNDETERMINED';
    reviewedBy?: string;
  };
}

export interface GapReviewResult {
  items: Array<GapReviewItem & { state: GapReviewState }>;
  counts: Record<GapReviewState, number>;
}

const areas = new Set<AssessmentArea>(['TECHNOLOGY', 'OPERATION', 'MANAGEMENT']);
const sourceKinds = new Set<PreparationSourceRef['kind']>([
  'FREE_DIAGNOSIS_REPORT',
  'MANAGEMENT_FEEDBACK',
  'CUSTOMER_STATEMENT',
  'CORE_VERIFIED_REFERENCE',
]);
const verificationStates = new Set<GapReviewItem['current']['verification']>([
  'VERIFIED_REFERENCE',
  'UNVERIFIED_STATEMENT',
  'UNKNOWN',
]);
const assessments = new Set<GapReviewItem['comparison']['assessment']>([
  'DIFFERENCE',
  'NO_DIFFERENCE',
  'UNDETERMINED',
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

function stateFor(item: GapReviewItem): GapReviewState {
  if (item.current.verification !== 'VERIFIED_REFERENCE') return 'INSUFFICIENT_EVIDENCE';
  if (item.comparison.assessment === 'DIFFERENCE') return 'CONFIRMED_DIFFERENCE';
  if (item.comparison.assessment === 'NO_DIFFERENCE') return 'NO_DIFFERENCE_IDENTIFIED';
  return 'INSUFFICIENT_EVIDENCE';
}

export function reviewPaidAssessmentGaps(items: readonly GapReviewItem[]): GapReviewResult {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');

  const ids = new Set<string>();
  const reviewedItems: GapReviewResult['items'] = [];
  const counts: Record<GapReviewState, number> = {
    CONFIRMED_DIFFERENCE: 0,
    NO_DIFFERENCE_IDENTIFIED: 0,
    INSUFFICIENT_EVIDENCE: 0,
  };

  for (const item of items) {
    if (!item || typeof item !== 'object') throw new TypeError('item must be an object');
    requireNonblank(item.id, 'item.id');
    if (ids.has(item.id)) throw new TypeError(`duplicate item id: ${item.id}`);
    ids.add(item.id);
    if (!areas.has(item.area)) throw new TypeError(`item ${item.id}.area is invalid`);

    if (!item.futureCriterion || typeof item.futureCriterion !== 'object') {
      throw new TypeError(`item ${item.id}.futureCriterion must be an object`);
    }
    requireNonblank(item.futureCriterion.statement, `item ${item.id}.futureCriterion.statement`);
    validateSource(item.futureCriterion.source, `item ${item.id}.futureCriterion.source`);

    if (!item.current || typeof item.current !== 'object') {
      throw new TypeError(`item ${item.id}.current must be an object`);
    }
    requireNonblank(item.current.statement, `item ${item.id}.current.statement`);
    validateSource(item.current.source, `item ${item.id}.current.source`);
    if (!verificationStates.has(item.current.verification)) {
      throw new TypeError(`item ${item.id}.current.verification is invalid`);
    }
    if (
      item.current.verification === 'VERIFIED_REFERENCE'
      && item.current.source.kind !== 'CORE_VERIFIED_REFERENCE'
    ) {
      throw new TypeError(`verified item ${item.id} requires a CORE_VERIFIED_REFERENCE current source`);
    }

    if (!item.comparison || typeof item.comparison !== 'object') {
      throw new TypeError(`item ${item.id}.comparison must be an object`);
    }
    requireNonblank(item.comparison.statement, `item ${item.id}.comparison.statement`);
    requireNonblank(item.comparison.rationale, `item ${item.id}.comparison.rationale`);
    if (!assessments.has(item.comparison.assessment)) {
      throw new TypeError(`item ${item.id}.comparison.assessment is invalid`);
    }
    if (!Array.isArray(item.comparison.sourceIds) || item.comparison.sourceIds.length === 0) {
      throw new TypeError(`item ${item.id}.comparison.sourceIds must be a nonempty array`);
    }
    for (const sourceId of item.comparison.sourceIds) {
      requireNonblank(sourceId, `item ${item.id}.comparison.sourceIds entry`);
    }
    if (!item.comparison.sourceIds.includes(item.futureCriterion.source.id)) {
      throw new TypeError(`item ${item.id}.comparison.sourceIds must include the Future source`);
    }
    if (!item.comparison.sourceIds.includes(item.current.source.id)) {
      throw new TypeError(`item ${item.id}.comparison.sourceIds must include the current source`);
    }
    if (item.comparison.reviewedBy !== undefined) {
      requireNonblank(item.comparison.reviewedBy, `item ${item.id}.comparison.reviewedBy`);
    }

    const state = stateFor(item);
    counts[state] += 1;
    reviewedItems.push({
      id: item.id,
      area: item.area,
      futureCriterion: {
        statement: item.futureCriterion.statement,
        source: copySource(item.futureCriterion.source),
      },
      current: {
        statement: item.current.statement,
        source: copySource(item.current.source),
        verification: item.current.verification,
      },
      comparison: {
        statement: item.comparison.statement,
        rationale: item.comparison.rationale,
        sourceIds: [...item.comparison.sourceIds],
        assessment: item.comparison.assessment,
        ...(item.comparison.reviewedBy === undefined ? {} : { reviewedBy: item.comparison.reviewedBy }),
      },
      state,
    });
  }

  return { items: reviewedItems, counts };
}
