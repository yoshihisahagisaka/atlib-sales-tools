import type {
  AssessmentArea,
  PreparationItem,
  PreparationOutput,
} from './paidAssessmentPreparation';

export interface PreparationAgendaAction {
  itemId: string;
  area: AssessmentArea;
  topic: string;
  why: string;
  question: string;
  requestedFrom?: string;
  source: PreparationItem['source'];
  verificationState: 'UNVERIFIED_STATEMENT' | 'UNKNOWN';
  nextActionLabel: string;
}

export interface PreparationAgenda {
  caseId: string;
  future: PreparationOutput['future'];
  sourceRefs: PreparationOutput['sourceRefs'];
  nextActions: PreparationAgendaAction[];
  knownContext: PreparationItem[];
  pendingWithoutQuestion: PreparationItem[];
  counts: { verified: number; toConfirm: number; pendingWithoutQuestion: number };
}

function nonblank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function copySource(source: PreparationItem['source']): PreparationItem['source'] {
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

function requirePreparationShape(preparation: PreparationOutput): void {
  if (!preparation || typeof preparation !== 'object') {
    throw new TypeError('preparation must be an object');
  }
  if (!nonblank(preparation.caseId)) throw new TypeError('preparation.caseId must be nonblank');
  if (!preparation.future || typeof preparation.future !== 'object') {
    throw new TypeError('preparation.future must be an object');
  }
  if (!preparation.future.source || typeof preparation.future.source !== 'object') {
    throw new TypeError('preparation.future.source must be an object');
  }
  if (!preparation.sourceRefs || typeof preparation.sourceRefs !== 'object') {
    throw new TypeError('preparation.sourceRefs must be an object');
  }
  if (!preparation.sourceRefs.decision || typeof preparation.sourceRefs.decision !== 'object') {
    throw new TypeError('preparation.sourceRefs.decision must be an object');
  }
  if (!preparation.sourceRefs.report || typeof preparation.sourceRefs.report !== 'object') {
    throw new TypeError('preparation.sourceRefs.report must be an object');
  }
  if (!Array.isArray(preparation.confirmed)) throw new TypeError('preparation.confirmed must be an array');
  if (!Array.isArray(preparation.toConfirm)) throw new TypeError('preparation.toConfirm must be an array');
  if (!Array.isArray(preparation.unknownWithoutAction)) {
    throw new TypeError('preparation.unknownWithoutAction must be an array');
  }
}

export function buildPaidAssessmentPreparationAgenda(
  preparation: PreparationOutput,
): PreparationAgenda {
  requirePreparationShape(preparation);

  const itemIds = new Set<string>();
  for (const item of preparation.confirmed) {
    if (!item || typeof item !== 'object' || !nonblank(item.id)) {
      throw new TypeError('confirmed item must have a nonblank id');
    }
    if (itemIds.has(item.id)) throw new TypeError(`duplicate item id: ${item.id}`);
    itemIds.add(item.id);
    if (item.state !== 'VERIFIED_REFERENCE') {
      throw new TypeError(`confirmed item ${item.id} must be VERIFIED_REFERENCE`);
    }
  }

  for (const item of preparation.toConfirm) {
    if (!item || typeof item !== 'object' || !nonblank(item.id)) {
      throw new TypeError('toConfirm item must have a nonblank id');
    }
    if (itemIds.has(item.id)) throw new TypeError(`duplicate item id: ${item.id}`);
    itemIds.add(item.id);
    if (item.state !== 'UNVERIFIED_STATEMENT' && item.state !== 'UNKNOWN') {
      throw new TypeError(`toConfirm item ${item.id} must remain unverified`);
    }
    if (!item.confirmation || !nonblank(item.confirmation.question)) {
      throw new TypeError(`toConfirm item ${item.id} requires a nonblank confirmation question`);
    }
  }

  for (const item of preparation.unknownWithoutAction) {
    if (!item || typeof item !== 'object' || !nonblank(item.id)) {
      throw new TypeError('unknownWithoutAction item must have a nonblank id');
    }
    if (itemIds.has(item.id)) throw new TypeError(`duplicate item id: ${item.id}`);
    itemIds.add(item.id);
    if (item.state !== 'UNVERIFIED_STATEMENT' && item.state !== 'UNKNOWN') {
      throw new TypeError(`unknownWithoutAction item ${item.id} must remain unverified`);
    }
    if (item.confirmation !== undefined) {
      throw new TypeError(`unknownWithoutAction item ${item.id} must not contain confirmation`);
    }
  }

  return {
    caseId: preparation.caseId,
    future: {
      statement: preparation.future.statement,
      source: copySource(preparation.future.source),
    },
    sourceRefs: {
      decision: { ...preparation.sourceRefs.decision },
      report: { ...preparation.sourceRefs.report },
    },
    nextActions: preparation.toConfirm.map(item => ({
      itemId: item.id,
      area: item.area,
      topic: item.topic,
      why: item.purpose,
      question: item.confirmation!.question,
      ...(item.confirmation!.requestedFrom === undefined
        ? {}
        : { requestedFrom: item.confirmation!.requestedFrom }),
      source: copySource(item.source),
      verificationState: item.state as PreparationAgendaAction['verificationState'],
      nextActionLabel: '確認する',
    })),
    knownContext: preparation.confirmed.map(copyItem),
    pendingWithoutQuestion: preparation.unknownWithoutAction.map(copyItem),
    counts: {
      verified: preparation.confirmed.length,
      toConfirm: preparation.toConfirm.length,
      pendingWithoutQuestion: preparation.unknownWithoutAction.length,
    },
  };
}
