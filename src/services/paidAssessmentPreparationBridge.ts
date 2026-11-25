import { contentHash } from '../domain/diagnosisReport';
import { DESIGN_V2_REPORT_FORMAT_VERSION, type DesignV2ReportFactCandidate } from '../domain/freeDiagnosisDesignV2Report';
import type { AssessmentArea, PreparationInput, PreparationOutput, PreparationSourceRef } from '../domain/paidAssessmentPreparation';
import { preparePaidAssessment } from '../domain/paidAssessmentPreparation';
import { buildPaidAssessmentPreparationAgenda, type PreparationAgenda } from '../domain/paidAssessmentPreparationAgenda';
import type { DesignV2StoredReportDraft } from './freeDiagnosisDesignV2PersistenceRepo';
import type { PaidAssessmentSourceHandoff } from './paidAssessmentSourceHandoffRepo';

/** A deliberate staff selection. It is not a FACT verification or paid contract. */
export interface DesignV2PreparationSelection {
  futureEntryIndex: number;
  candidates: readonly {
    candidateId: string;
    area: AssessmentArea;
    confirmationQuestion?: string;
    requestedFrom?: string;
  }[];
}

export interface DesignV2PreparationBridgeResult {
  preparation: PreparationOutput;
  agenda: PreparationAgenda;
}

type DeliveredDesignV2Report = Pick<DesignV2StoredReportDraft, 'id' | 'version' | 'status' | 'content'>;
const AREAS = new Set<AssessmentArea>(['TECHNOLOGY', 'OPERATION', 'MANAGEMENT']);

function nonblank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Pure, read-only connection from an already-authenticated E1 reference to
 * existing Assessment Phase A/B. Callers must fetch current authoritative
 * handoff/report through staff-scoped repos and check the latest Decision.
 */
export function preparePaidAssessmentFromDesignV2(
  handoff: PaidAssessmentSourceHandoff,
  report: DeliveredDesignV2Report,
  selection: DesignV2PreparationSelection,
): DesignV2PreparationBridgeResult {
  const snapshot = handoff?.snapshot;
  const eligibility = snapshot?.eligibility;
  if (!snapshot || snapshot.schemaVersion !== 1 || snapshot.sourceKind !== 'FREE_DIAGNOSIS_DESIGN_V2'
    || !eligibility || !nonblank(handoff.sourceCaseId) || eligibility.caseId !== handoff.sourceCaseId
    || eligibility.feedbackDecision.id !== handoff.feedbackDecisionId
    || eligibility.report.id !== handoff.reportId
    || contentHash(snapshot) !== handoff.snapshotHash) {
    throw new TypeError('E3_HANDOFF_INTEGRITY_MISMATCH');
  }
  if (!report || report.status !== 'DELIVERED' || report.id !== eligibility.report.id
    || report.version !== eligibility.report.version || !report.content
    || report.content.formatVersion !== DESIGN_V2_REPORT_FORMAT_VERSION
    || contentHash(report.content) !== eligibility.report.contentHash) {
    throw new TypeError('E3_REPORT_INTEGRITY_MISMATCH');
  }
  const futureSections = report.content.sections?.filter(section => section.key === 'FUTURE');
  if (!futureSections || futureSections.length !== 1 || !Array.isArray(futureSections[0]!.entries)
    || !selection || !Number.isInteger(selection.futureEntryIndex)
    || selection.futureEntryIndex < 0 || selection.futureEntryIndex >= futureSections[0]!.entries.length) {
    throw new TypeError('E3_FUTURE_SELECTION_INVALID');
  }
  const statement = futureSections[0]!.entries[selection.futureEntryIndex];
  if (!nonblank(statement)) throw new TypeError('E3_FUTURE_SELECTION_INVALID');
  if (!Array.isArray(selection.candidates) || !Array.isArray(report.content.factCandidates)) {
    throw new TypeError('E3_CANDIDATE_SELECTION_INVALID');
  }
  const candidateMap = new Map<string, DesignV2ReportFactCandidate>();
  for (const candidate of report.content.factCandidates) {
    if (!candidate || !nonblank(candidate.id) || !nonblank(candidate.whatToVerify)
      || !nonblank(candidate.whyItMattersToFuture) || candidateMap.has(candidate.id)) {
      throw new TypeError('E3_REPORT_CANDIDATES_INVALID');
    }
    candidateMap.set(candidate.id, candidate);
  }
  const reportSource: PreparationSourceRef = {
    kind: 'FREE_DIAGNOSIS_REPORT',
    id: report.id,
    version: report.version,
    hash: eligibility.report.contentHash,
  };
  const usedIds = new Set<string>();
  const items: PreparationInput['items'][number][] = selection.candidates.map(chosen => {
    if (!chosen || !nonblank(chosen.candidateId) || usedIds.has(chosen.candidateId)
      || !AREAS.has(chosen.area)) {
      throw new TypeError('E3_CANDIDATE_SELECTION_INVALID');
    }
    usedIds.add(chosen.candidateId);
    const candidate = candidateMap.get(chosen.candidateId);
    if (!candidate) throw new TypeError('E3_UNKNOWN_CANDIDATE');
    if (chosen.confirmationQuestion !== undefined && !nonblank(chosen.confirmationQuestion)) {
      throw new TypeError('E3_CONFIRMATION_INVALID');
    }
    if (chosen.requestedFrom !== undefined
      && (!nonblank(chosen.requestedFrom) || chosen.confirmationQuestion === undefined)) {
      throw new TypeError('E3_CONFIRMATION_INVALID');
    }
    return {
      id: candidate.id,
      area: chosen.area,
      topic: candidate.whatToVerify,
      purpose: candidate.whyItMattersToFuture,
      source: { ...reportSource },
      state: 'UNKNOWN',
      ...(chosen.confirmationQuestion === undefined ? {} : {
        confirmation: {
          question: chosen.confirmationQuestion,
          ...(chosen.requestedFrom === undefined ? {} : { requestedFrom: chosen.requestedFrom }),
        },
      }),
    };
  });
  const preparation = preparePaidAssessment({
    caseId: handoff.sourceCaseId,
    decisionRef: {
      id: eligibility.feedbackDecision.id,
      version: eligibility.feedbackDecision.version,
      contextHash: eligibility.feedbackDecision.contextHash,
    },
    reportRef: {
      id: eligibility.report.id,
      version: eligibility.report.version,
      contentHash: eligibility.report.contentHash,
      approvalSnapshotHash: eligibility.report.approvalSnapshotHash,
    },
    future: { statement, source: { ...reportSource } },
    items,
  });
  return {
    preparation,
    agenda: buildPaidAssessmentPreparationAgenda(preparation),
  };
}
