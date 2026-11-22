export type AssessmentArea = 'TECHNOLOGY' | 'OPERATION' | 'MANAGEMENT';

export type PreparationSourceKind =
  | 'FREE_DIAGNOSIS_REPORT'
  | 'MANAGEMENT_FEEDBACK'
  | 'CUSTOMER_STATEMENT'
  | 'CORE_VERIFIED_REFERENCE';

export interface PreparationSourceRef {
  kind: PreparationSourceKind;
  id: string;
  version: number;
  hash?: string;
}

export interface PreparationItem {
  id: string;
  area: AssessmentArea;
  topic: string;
  purpose: string;
  source: PreparationSourceRef;
  state: 'VERIFIED_REFERENCE' | 'UNVERIFIED_STATEMENT' | 'UNKNOWN';
  confirmation?: { question: string; requestedFrom?: string };
}

export interface PreparationInput {
  caseId: string;
  decisionRef: { id: string; version: number; contextHash: string };
  reportRef: {
    id: string;
    version: number;
    contentHash: string;
    approvalSnapshotHash: string;
  };
  future: { statement: string; source: PreparationSourceRef };
  items: readonly PreparationItem[];
}

export interface PreparationOutput {
  caseId: string;
  sourceRefs: {
    decision: PreparationInput['decisionRef'];
    report: PreparationInput['reportRef'];
  };
  future: PreparationInput['future'];
  confirmed: PreparationItem[];
  toConfirm: PreparationItem[];
  unknownWithoutAction: PreparationItem[];
}

const areas = new Set<AssessmentArea>(['TECHNOLOGY', 'OPERATION', 'MANAGEMENT']);
const sourceKinds = new Set<PreparationSourceKind>([
  'FREE_DIAGNOSIS_REPORT',
  'MANAGEMENT_FEEDBACK',
  'CUSTOMER_STATEMENT',
  'CORE_VERIFIED_REFERENCE',
]);
const states = new Set<PreparationItem['state']>([
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

function requireVersion(value: unknown, field: string): asserts value is number {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new TypeError(`${field} must be a positive integer`);
  }
}

function requireHash(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !hashPattern.test(value)) {
    throw new TypeError(`${field} must be a 64-character lowercase hexadecimal hash`);
  }
}

function validateSource(source: PreparationSourceRef, field: string): void {
  if (!source || typeof source !== 'object') throw new TypeError(`${field} must be an object`);
  if (!sourceKinds.has(source.kind)) throw new TypeError(`${field}.kind is invalid`);
  requireNonblank(source.id, `${field}.id`);
  requireVersion(source.version, `${field}.version`);
  if (source.hash !== undefined) requireHash(source.hash, `${field}.hash`);
}

function copySource(source: PreparationSourceRef): PreparationSourceRef {
  return source.hash === undefined
    ? { kind: source.kind, id: source.id, version: source.version }
    : { kind: source.kind, id: source.id, version: source.version, hash: source.hash };
}

function copyItem(item: PreparationItem): PreparationItem {
  return {
    id: item.id,
    area: item.area,
    topic: item.topic,
    purpose: item.purpose,
    source: copySource(item.source),
    state: item.state,
    ...(item.confirmation === undefined ? {} : {
      confirmation: item.confirmation.requestedFrom === undefined
        ? { question: item.confirmation.question }
        : { question: item.confirmation.question, requestedFrom: item.confirmation.requestedFrom },
    }),
  };
}

export function preparePaidAssessment(input: PreparationInput): PreparationOutput {
  if (!input || typeof input !== 'object') throw new TypeError('input must be an object');
  requireNonblank(input.caseId, 'caseId');

  if (!input.decisionRef || typeof input.decisionRef !== 'object') {
    throw new TypeError('decisionRef must be an object');
  }
  requireNonblank(input.decisionRef.id, 'decisionRef.id');
  requireVersion(input.decisionRef.version, 'decisionRef.version');
  requireHash(input.decisionRef.contextHash, 'decisionRef.contextHash');

  if (!input.reportRef || typeof input.reportRef !== 'object') {
    throw new TypeError('reportRef must be an object');
  }
  requireNonblank(input.reportRef.id, 'reportRef.id');
  requireVersion(input.reportRef.version, 'reportRef.version');
  requireHash(input.reportRef.contentHash, 'reportRef.contentHash');
  requireHash(input.reportRef.approvalSnapshotHash, 'reportRef.approvalSnapshotHash');

  if (!input.future || typeof input.future !== 'object') throw new TypeError('future must be an object');
  requireNonblank(input.future.statement, 'future.statement');
  validateSource(input.future.source, 'future.source');
  if (!Array.isArray(input.items)) throw new TypeError('items must be an array');

  const ids = new Set<string>();
  for (const item of input.items) {
    if (!item || typeof item !== 'object') throw new TypeError('item must be an object');
    requireNonblank(item.id, 'item.id');
    if (ids.has(item.id)) throw new TypeError(`duplicate item id: ${item.id}`);
    ids.add(item.id);
    if (!areas.has(item.area)) throw new TypeError(`item.area is invalid: ${String(item.area)}`);
    requireNonblank(item.topic, `item ${item.id}.topic`);
    requireNonblank(item.purpose, `item ${item.id}.purpose`);
    validateSource(item.source, `item ${item.id}.source`);
    if (!states.has(item.state)) throw new TypeError(`item.state is invalid: ${String(item.state)}`);
    if (item.state === 'VERIFIED_REFERENCE' && item.source.kind !== 'CORE_VERIFIED_REFERENCE') {
      throw new TypeError(`verified item ${item.id} requires a CORE_VERIFIED_REFERENCE source`);
    }
    if (item.confirmation !== undefined) {
      if (!item.confirmation || typeof item.confirmation !== 'object') {
        throw new TypeError(`item ${item.id}.confirmation must be an object`);
      }
      requireNonblank(item.confirmation.question, `item ${item.id}.confirmation.question`);
      if (item.confirmation.requestedFrom !== undefined) {
        requireNonblank(item.confirmation.requestedFrom, `item ${item.id}.confirmation.requestedFrom`);
      }
    }
  }

  const confirmed: PreparationItem[] = [];
  const toConfirm: PreparationItem[] = [];
  const unknownWithoutAction: PreparationItem[] = [];
  for (const item of input.items) {
    const copy = copyItem(item);
    if (item.state === 'VERIFIED_REFERENCE') confirmed.push(copy);
    else if (item.confirmation !== undefined) toConfirm.push(copy);
    else unknownWithoutAction.push(copy);
  }

  return {
    caseId: input.caseId,
    sourceRefs: {
      decision: { ...input.decisionRef },
      report: { ...input.reportRef },
    },
    future: {
      statement: input.future.statement,
      source: copySource(input.future.source),
    },
    confirmed,
    toConfirm,
    unknownWithoutAction,
  };
}
