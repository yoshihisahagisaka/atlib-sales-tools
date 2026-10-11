import type { AnalysisResultV2, CompanyContextV2, CurrentStructuredStateV2, FreeDiagnosisNarrativeV2 } from '../domain/freeDiagnosisDesignV2';
import { FreeDiagnosisDesignV2ValidationError } from '../domain/freeDiagnosisSemanticProjectionV2';
import type { FreeDiagnosisRuleBasedCaseRepo } from './freeDiagnosisRuleBasedCaseRepo';
import {
  FreeDiagnosisDesignV2PersistenceError,
  type AppendHumanEditInput,
  type DesignV2CurrentStateFields,
  type FreeDiagnosisDesignV2PersistenceRepo,
} from './freeDiagnosisDesignV2PersistenceRepo';

export type AnalysisFreshnessV2 = 'CURRENT' | 'REANALYSIS_REQUIRED';
export type FieldDiffStatusV2 = 'UNCHANGED' | 'CHANGED' | 'ADDED' | 'REMOVED';

export class FreeDiagnosisDesignV2ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
    this.name = 'FreeDiagnosisDesignV2ApiError';
  }
}

export interface SaveCurrentStateRequestV2 {
  expectedRevision: number;
  state: DesignV2CurrentStateFields;
  q1CompanyContext?: CompanyContextV2;
  supplements?: Record<string, unknown> | null;
  changeReason?: string | null;
}

function currentCompanyContext(original: CompanyContextV2, supplement: Record<string, unknown> | null): CompanyContextV2 {
  const value = supplement?.q1CompanyContext;
  if (!value || typeof value !== 'object') return original;
  const context = value as Record<string, unknown>;
  return typeof context.employeeRange === 'string' && typeof context.siteRange === 'string'
    ? { employeeRange: context.employeeRange, siteRange: context.siteRange } : original;
}

function traceability(analysis: AnalysisResultV2) {
  const ruleQuestions = new Map<string, readonly string[]>();
  [...analysis.futureUnderstanding, ...analysis.currentUnderstanding, ...analysis.lensFindings]
    .forEach(item => ruleQuestions.set(item.ruleId, item.sourceQuestionCodes));
  const viewpoints = analysis.hearingViewpoints.map(item => ({
    id: item.id,
    relatedQuestionCodes: [...new Set(item.sourceRuleIds.flatMap(ruleId => ruleQuestions.get(ruleId) ?? []))],
  }));
  const relatedThemes = (sourceRuleIds: readonly string[]) => analysis.hearingViewpoints
    .filter(viewpoint => viewpoint.sourceRuleIds.some(ruleId => sourceRuleIds.includes(ruleId))).map(viewpoint => viewpoint.id);
  return {
    viewpoints,
    analysisItemThemes: Object.fromEntries([
      ...analysis.lensFindings.map(item => [item.id, relatedThemes([item.ruleId])]),
      ...analysis.unknowns.map(item => [item.id, relatedThemes(item.sourceRuleIds)]),
      ...analysis.factCandidates.map(item => [item.id, relatedThemes(item.sourceRuleIds)]),
    ]),
    narrativeSectionThemes: {
      confirmationAndImprovement: [...new Set(analysis.lensFindings.flatMap(item => relatedThemes([item.ruleId])))],
      unknowns: [...new Set(analysis.unknowns.flatMap(item => relatedThemes(item.sourceRuleIds)))],
      nextFacts: [...new Set(analysis.factCandidates.flatMap(item => relatedThemes(item.sourceRuleIds)))],
    },
  };
}

export interface ReanalyzeRequestV2 {
  expectedCurrentStateRevision: number;
}

export interface SaveNarrativeEditRequestV2 {
  generatedNarrativeId: string;
  content: FreeDiagnosisNarrativeV2;
  editReason?: string | null;
}

function equalValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function fieldDiff(original: unknown, current: unknown): {
  status: FieldDiffStatusV2;
  original: unknown;
  current: unknown;
  added?: unknown[];
  removed?: unknown[];
} {
  if (equalValue(original, current)) return { status: 'UNCHANGED', original, current };
  if (Array.isArray(original) && Array.isArray(current)) {
    const added = current.filter(value => !original.includes(value));
    const removed = original.filter(value => !current.includes(value));
    const status: FieldDiffStatusV2 = original.length === 0 && current.length > 0
      ? 'ADDED' : current.length === 0 && original.length > 0 ? 'REMOVED' : 'CHANGED';
    return { status, original, current, added, removed };
  }
  if (original == null && current != null) return { status: 'ADDED', original, current };
  if (original != null && current == null) return { status: 'REMOVED', original, current };
  return { status: 'CHANGED', original, current };
}

function diffState(original: CurrentStructuredStateV2, current: DesignV2CurrentStateFields) {
  return {
    q2Future: fieldDiff(original.q2Future, current.q2Future),
    q3ItExpectations: fieldDiff(original.q3ItExpectations, current.q3ItExpectations),
    q4CurrentInterest: fieldDiff(original.q4CurrentInterest, current.q4CurrentInterest),
    q5Visibility: fieldDiff(original.q5Visibility, current.q5Visibility),
    q6ManagementConnection: fieldDiff(original.q6ManagementConnection, current.q6ManagementConnection),
    q7InterestThemes: fieldDiff(original.q7InterestThemes, current.q7InterestThemes),
  };
}

export class FreeDiagnosisDesignV2ApiService {
  constructor(
    private readonly cases: FreeDiagnosisRuleBasedCaseRepo,
    private readonly persistence: FreeDiagnosisDesignV2PersistenceRepo,
  ) {}

  private async requireCase(caseId: string) {
    const kase = await this.cases.getCase(caseId);
    if (!kase) throw new FreeDiagnosisDesignV2ApiError(404, 'CASE_NOT_FOUND');
    return kase;
  }

  private mapPersistenceError(error: unknown): never {
    if (error instanceof FreeDiagnosisDesignV2ApiError) throw error;
    if (error instanceof FreeDiagnosisDesignV2ValidationError) {
      throw new FreeDiagnosisDesignV2ApiError(400, 'INVALID_SEMANTIC_STATE');
    }
    if (error instanceof FreeDiagnosisDesignV2PersistenceError) {
      throw new FreeDiagnosisDesignV2ApiError(error.status, error.code);
    }
    throw error;
  }

  async getWorkspace(caseId: string) {
    const kase = await this.requireCase(caseId);
    const [workspace, hearingRecords] = await Promise.all([
      this.persistence.getDesignV2PersistenceWorkspace(caseId),
      this.persistence.listDesignV2HearingRecords(caseId),
    ]);
    if (!workspace) throw new FreeDiagnosisDesignV2ApiError(404, 'DESIGN_V2_NOT_INITIALIZED');
    const analysisFreshness: AnalysisFreshnessV2 = workspace.latestAnalysisResult && workspace.latestGeneratedNarrative
      ? 'CURRENT' : 'REANALYSIS_REQUIRED';
    const humanEditedNarrativeStatus = workspace.latestHumanEditedNarrative == null
      ? 'NONE'
      : analysisFreshness === 'CURRENT'
        && workspace.latestGeneratedNarrative?.id === workspace.latestHumanEditedNarrative.generatedNarrativeId
        ? 'CURRENT' : 'STALE_REVIEW_REQUIRED';
    const currentQ1 = currentCompanyContext(workspace.originalSurvey.answers.q1CompanyContext, workspace.currentStructuredState.supplement);
    return {
      case: kase,
      originalSurvey: workspace.originalSurvey,
      hearingRecords,
      currentStructuredState: workspace.currentStructuredState.state,
      currentCompanyContext: currentQ1,
      currentStateRevision: {
        id: workspace.currentStructuredState.id,
        revisionNo: workspace.currentStructuredState.revisionNo,
        sourceType: workspace.currentStructuredState.sourceType,
        supplement: workspace.currentStructuredState.supplement,
        updatedByUserId: workspace.currentStructuredState.updatedByUserId,
        changeReason: workspace.currentStructuredState.changeReason,
      },
      currentStateDiffFromOriginal: {
        q1CompanyContext: fieldDiff(workspace.originalSurvey.answers.q1CompanyContext, currentQ1),
        ...diffState(workspace.originalSurvey.answers, workspace.currentStructuredState.state),
      },
      latestAnalysisResult: workspace.latestAnalysisResult,
      latestGeneratedNarrative: workspace.latestGeneratedNarrative,
      latestHumanEditedNarrative: workspace.latestHumanEditedNarrative,
      humanEditedNarrativeStatus,
      analysisFreshness,
      traceability: workspace.latestAnalysisResult ? traceability(workspace.latestAnalysisResult.analysis) : null,
    };
  }

  async saveCurrentState(caseId: string, request: SaveCurrentStateRequestV2, actor: string) {
    await this.requireCase(caseId);
    try {
      return await this.persistence.appendDesignV2CurrentStateRevision({
        caseId, expectedRevision: request.expectedRevision, state: request.state,
        supplement: {
          ...(request.supplements ?? {}),
          ...(request.q1CompanyContext ? { q1CompanyContext: request.q1CompanyContext } : {}),
        }, changeReason: request.changeReason, actor,
      });
    } catch (error) {
      return this.mapPersistenceError(error);
    }
  }

  async reanalyze(caseId: string, request: ReanalyzeRequestV2, actor: string) {
    await this.requireCase(caseId);
    try {
      return await this.persistence.reanalyzeDesignV2CurrentState({
        caseId, expectedCurrentStateRevision: request.expectedCurrentStateRevision, actor,
      });
    } catch (error) {
      if (error instanceof FreeDiagnosisDesignV2PersistenceError || error instanceof FreeDiagnosisDesignV2ApiError) {
        return this.mapPersistenceError(error);
      }
      throw new FreeDiagnosisDesignV2ApiError(500, 'ANALYSIS_FAILED');
    }
  }

  async saveNarrativeEdit(caseId: string, request: SaveNarrativeEditRequestV2, actor: string) {
    await this.requireCase(caseId);
    const input: AppendHumanEditInput = {
      caseId, generatedNarrativeId: request.generatedNarrativeId,
      content: request.content, editReason: request.editReason, actor,
    };
    try {
      return await this.persistence.appendDesignV2HumanEditedNarrative(input);
    } catch (error) {
      return this.mapPersistenceError(error);
    }
  }
}
