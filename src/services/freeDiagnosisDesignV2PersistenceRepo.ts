import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { analyzeFreeDiagnosisV2 } from '../domain/freeDiagnosisAnalysisV2';
import type {
  AnalysisResultV2,
  CurrentStructuredStateV2,
  FreeDiagnosisNarrativeV2,
} from '../domain/freeDiagnosisDesignV2';
import { generateFreeDiagnosisNarrativeV2 } from '../domain/freeDiagnosisNarrativeV2';
import { projectFreeDiagnosisSemanticV2 } from '../domain/freeDiagnosisSemanticProjectionV2';
import { contentHash } from '../domain/diagnosisReport';
import {
  buildDesignV2ReportContent,
  DESIGN_V2_REPORT_CONTEXT_VERSION,
  type DesignV2ReportContent,
} from '../domain/freeDiagnosisDesignV2Report';

export const DESIGN_V2_ANALYZER_VERSION = 'free-diagnosis-v2-analyzer-1.0.0';
export const DESIGN_V2_RULE_SET_VERSION = 'free-diagnosis-v2-rules-1.0.0';
export const DESIGN_V2_NARRATIVE_GENERATOR_VERSION = 'free-diagnosis-v2-narrative-1.0.0';

export type DesignV2CurrentStateFields = Omit<CurrentStructuredStateV2, 'q1CompanyContext'>;
export type HumanEditedNarrativeStatusV2 = 'CURRENT' | 'STALE_REVIEW_REQUIRED' | 'NONE';
type FreeDiagnosisAnalyzerV2 = (state: CurrentStructuredStateV2) => AnalysisResultV2;

export class FreeDiagnosisDesignV2PersistenceError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
    this.name = 'FreeDiagnosisDesignV2PersistenceError';
  }
}

export interface OriginalSurveySnapshotV2 {
  id: string;
  caseId: string;
  surveyVersion: string;
  entryChannel: 'CUSTOMER_SELF' | 'STAFF_PROXY';
  answeredByRole: string;
  enteredByUserId: string | null;
  answers: CurrentStructuredStateV2;
  submittedAt: string;
  contentHash: string;
}

export interface CurrentStateRevisionV2 {
  id: string;
  caseId: string;
  revisionNo: number;
  sourceType: 'INITIAL_FROM_ORIGINAL' | 'HUMAN_UPDATE';
  basedOnOriginalSnapshotId: string;
  previousStateId: string | null;
  state: DesignV2CurrentStateFields;
  supplement: Record<string, unknown> | null;
  updatedByUserId: string | null;
  changeReason: string | null;
  createdAt: string;
}

export interface AnalysisResultRecordV2 {
  id: string;
  caseId: string;
  currentStateId: string;
  analyzerVersion: string;
  ruleSetVersion: string;
  analysis: AnalysisResultV2;
  inputHash: string;
  resultHash: string;
}

export interface GeneratedNarrativeRecordV2 {
  id: string;
  caseId: string;
  currentStateId: string;
  analysisResultId: string;
  generatorVersion: string;
  content: FreeDiagnosisNarrativeV2;
  contentHash: string;
}

export interface HumanEditedNarrativeRecordV2 {
  id: string;
  caseId: string;
  generatedNarrativeId: string;
  revisionNo: number;
  content: FreeDiagnosisNarrativeV2;
  editedByUserId: string;
  editReason: string | null;
  contentHash: string;
}

export interface PostHearingAnalysisViewV2 {
  originalSurvey: OriginalSurveySnapshotV2;
  currentStructuredState: CurrentStateRevisionV2;
  currentStateDiffFromOriginal: Partial<Record<keyof DesignV2CurrentStateFields, { original: unknown; current: unknown }>>;
  latestAnalysisResult: AnalysisResultRecordV2;
  latestGeneratedNarrative: GeneratedNarrativeRecordV2;
  latestHumanEditedNarrative: HumanEditedNarrativeRecordV2 | null;
  humanEditedNarrativeStatus: HumanEditedNarrativeStatusV2;
}

export interface InitializeInput {
  caseId: string;
  answers: CurrentStructuredStateV2;
  surveyVersion: string;
  entryChannel: 'CUSTOMER_SELF' | 'STAFF_PROXY';
  answeredByRole: string;
  enteredByUserId?: string | null;
  submittedAt?: Date;
  actor: string;
}

export interface AppendStateInput {
  caseId: string;
  expectedRevision: number;
  state: DesignV2CurrentStateFields;
  supplement?: Record<string, unknown> | null;
  actor: string;
  changeReason?: string | null;
}

export interface AppendHumanEditInput {
  caseId: string;
  generatedNarrativeId: string;
  content: FreeDiagnosisNarrativeV2;
  actor: string;
  editReason?: string | null;
}

export interface ReanalyzeInput {
  caseId: string;
  expectedCurrentStateRevision: number;
  actor: string;
}

export interface HearingRecordV2 {
  id: string;
  planItemRef: string | null;
  statementText: string;
  operatorNoteText: string | null;
  knowledgeState: string;
  structuredAnswer: unknown | null;
  recordedByUserId: string;
  recordedAt: string;
}

export interface DesignV2PersistenceWorkspace {
  originalSurvey: OriginalSurveySnapshotV2;
  currentStructuredState: CurrentStateRevisionV2;
  latestAnalysisResult: AnalysisResultRecordV2 | null;
  latestGeneratedNarrative: GeneratedNarrativeRecordV2 | null;
  latestHumanEditedNarrative: HumanEditedNarrativeRecordV2 | null;
}

export interface DesignV2ReportDraftResult {
  id: string;
  version: number;
  content: DesignV2ReportContent;
  context: Record<string, unknown>;
}

export interface DesignV2StoredReportDraft {
  id: string;
  version: number;
  contentVersion: number;
  status: string;
  content: DesignV2ReportContent;
  context: Record<string, unknown>;
}

function asJson<T>(value: T | string): T {
  return typeof value === 'string' ? JSON.parse(value) as T : value;
}

function stateFields(state: CurrentStructuredStateV2): DesignV2CurrentStateFields {
  return {
    q2Future: state.q2Future,
    q3ItExpectations: state.q3ItExpectations,
    q4CurrentInterest: state.q4CurrentInterest,
    q5Visibility: state.q5Visibility,
    q6ManagementConnection: state.q6ManagementConnection,
    q7InterestThemes: state.q7InterestThemes,
  };
}

function mapOriginal(row: Record<string, unknown>): OriginalSurveySnapshotV2 {
  return {
    id: row.id as string, caseId: row.case_id as string, surveyVersion: row.survey_version as string,
    entryChannel: row.entry_channel as OriginalSurveySnapshotV2['entryChannel'], answeredByRole: row.answered_by_role as string,
    enteredByUserId: row.entered_by_user_id as string | null,
    answers: asJson(row.answers_json as CurrentStructuredStateV2), submittedAt: new Date(row.submitted_at as string).toISOString(),
    contentHash: row.content_hash as string,
  };
}

function mapState(row: Record<string, unknown>): CurrentStateRevisionV2 {
  return {
    id: row.id as string, caseId: row.case_id as string, revisionNo: Number(row.revision_no),
    sourceType: row.source_type as CurrentStateRevisionV2['sourceType'], basedOnOriginalSnapshotId: row.based_on_original_snapshot_id as string,
    previousStateId: row.previous_state_id as string | null, state: asJson(row.state_json as DesignV2CurrentStateFields),
    supplement: row.supplement_json == null ? null : asJson(row.supplement_json as Record<string, unknown>),
    updatedByUserId: row.updated_by_user_id as string | null, changeReason: row.change_reason as string | null,
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

function mapAnalysis(row: Record<string, unknown>): AnalysisResultRecordV2 {
  return {
    id: row.id as string, caseId: row.case_id as string, currentStateId: row.current_state_id as string,
    analyzerVersion: row.analyzer_version as string, ruleSetVersion: row.rule_set_version as string,
    analysis: asJson(row.analysis_json as AnalysisResultV2), inputHash: row.input_hash as string, resultHash: row.result_hash as string,
  };
}

function mapGenerated(row: Record<string, unknown>): GeneratedNarrativeRecordV2 {
  return {
    id: row.id as string, caseId: row.case_id as string, currentStateId: row.current_state_id as string,
    analysisResultId: row.analysis_result_id as string, generatorVersion: row.generator_version as string,
    content: asJson(row.content_json as FreeDiagnosisNarrativeV2), contentHash: row.content_hash as string,
  };
}

function mapHumanEdit(row: Record<string, unknown>): HumanEditedNarrativeRecordV2 {
  return {
    id: row.id as string, caseId: row.case_id as string, generatedNarrativeId: row.generated_narrative_id as string,
    revisionNo: Number(row.revision_no), content: asJson(row.content_json as FreeDiagnosisNarrativeV2),
    editedByUserId: row.edited_by_user_id as string, editReason: row.edit_reason as string | null, contentHash: row.content_hash as string,
  };
}

export class FreeDiagnosisDesignV2PersistenceRepo {
  constructor(
    private readonly pool: Pool,
    private readonly analyzer: FreeDiagnosisAnalyzerV2 = analyzeFreeDiagnosisV2,
  ) {}

  private async tx<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  private async lockCase(client: PoolClient, caseId: string): Promise<void> {
    const result = await client.query('SELECT id FROM it_management_diagnosis_case_v2 WHERE id=$1 FOR UPDATE', [caseId]);
    if (!result.rows[0]) throw new FreeDiagnosisDesignV2PersistenceError(404, 'CASE_NOT_FOUND');
  }

  private async audit(client: PoolClient, caseId: string, actor: string, command: string, detail: unknown): Promise<void> {
    await client.query(
      'INSERT INTO it_management_diagnosis_case_v2_audit(id,case_id,command,actor_user_id,detail_json) VALUES($1,$2,$3,$4,$5)',
      [randomUUID(), caseId, command, actor, JSON.stringify(detail)],
    );
  }

  private async createAnalysisAndNarrative(
    client: PoolClient, caseId: string, current: CurrentStateRevisionV2, fullState: CurrentStructuredStateV2,
  ): Promise<{ analysis: AnalysisResultRecordV2; generated: GeneratedNarrativeRecordV2 }> {
    const analysisValue = this.analyzer(fullState);
    const analysisId = randomUUID();
    const inputHash = contentHash(fullState);
    const resultHash = contentHash(analysisValue);
    const analysisRow = await client.query<Record<string, unknown>>(
      `INSERT INTO it_management_diagnosis_analysis_result_v2
       (id,case_id,current_state_id,analyzer_version,rule_set_version,analysis_json,input_hash,result_hash)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [analysisId, caseId, current.id, DESIGN_V2_ANALYZER_VERSION, DESIGN_V2_RULE_SET_VERSION,
        JSON.stringify(analysisValue), inputHash, resultHash],
    );
    const narrativeValue = generateFreeDiagnosisNarrativeV2(fullState, analysisValue);
    const generatedRow = await client.query<Record<string, unknown>>(
      `INSERT INTO it_management_diagnosis_generated_narrative_v2
       (id,case_id,current_state_id,analysis_result_id,generator_version,content_json,content_hash)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [randomUUID(), caseId, current.id, analysisId, DESIGN_V2_NARRATIVE_GENERATOR_VERSION,
        JSON.stringify(narrativeValue), contentHash(narrativeValue)],
    );
    return { analysis: mapAnalysis(analysisRow.rows[0]!), generated: mapGenerated(generatedRow.rows[0]!) };
  }

  async initializeDesignV2FromCompletedSurvey(input: InitializeInput): Promise<PostHearingAnalysisViewV2> {
    if (!input.surveyVersion.trim() || !input.answeredByRole.trim() || !input.actor.trim()) {
      throw new FreeDiagnosisDesignV2PersistenceError(422, 'INVALID_INITIALIZATION_METADATA');
    }
    return this.tx(async client => {
      await this.lockCase(client, input.caseId);
      const normalized = projectFreeDiagnosisSemanticV2(input.answers);
      const existing = await client.query('SELECT id FROM it_management_diagnosis_original_survey_snapshot_v2 WHERE case_id=$1', [input.caseId]);
      if (existing.rows[0]) throw new FreeDiagnosisDesignV2PersistenceError(409, 'DESIGN_V2_ALREADY_INITIALIZED');
      const originalRow = await client.query<Record<string, unknown>>(
        `INSERT INTO it_management_diagnosis_original_survey_snapshot_v2
         (id,case_id,survey_version,entry_channel,answered_by_role,entered_by_user_id,answers_json,submitted_at,content_hash)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [randomUUID(), input.caseId, input.surveyVersion, input.entryChannel, input.answeredByRole,
          input.enteredByUserId ?? null, JSON.stringify(normalized), input.submittedAt ?? new Date(), contentHash(normalized)],
      );
      const original = mapOriginal(originalRow.rows[0]!);
      const currentRow = await client.query<Record<string, unknown>>(
        `INSERT INTO it_management_diagnosis_current_state_revision_v2
         (id,case_id,revision_no,source_type,based_on_original_snapshot_id,previous_state_id,state_json,supplement_json,updated_by_user_id,change_reason)
         VALUES($1,$2,1,'INITIAL_FROM_ORIGINAL',$3,NULL,$4,NULL,NULL,NULL) RETURNING *`,
        [randomUUID(), input.caseId, original.id, JSON.stringify(stateFields(normalized))],
      );
      const current = mapState(currentRow.rows[0]!);
      const created = await this.createAnalysisAndNarrative(client, input.caseId, current, normalized);
      await this.audit(client, input.caseId, input.actor, 'CompleteDesignV2OriginalSurvey', {
        original_survey_snapshot_id: original.id, survey_version: original.surveyVersion, entry_channel: original.entryChannel,
      });
      await this.audit(client, input.caseId, input.actor, 'CreateDesignV2CurrentStateRevision', {
        current_state_id: current.id, revision_no: 1, source_type: current.sourceType,
        analysis_result_id: created.analysis.id, generated_narrative_id: created.generated.id,
      });
      return {
        originalSurvey: original, currentStructuredState: current, currentStateDiffFromOriginal: {},
        latestAnalysisResult: created.analysis, latestGeneratedNarrative: created.generated,
        latestHumanEditedNarrative: null, humanEditedNarrativeStatus: 'NONE',
      };
    });
  }

  async appendDesignV2CurrentStateAndReanalyze(input: AppendStateInput): Promise<PostHearingAnalysisViewV2> {
    if (!input.actor.trim()) throw new FreeDiagnosisDesignV2PersistenceError(422, 'ACTOR_REQUIRED');
    return this.tx(async client => {
      await this.lockCase(client, input.caseId);
      const originalResult = await client.query<Record<string, unknown>>(
        'SELECT * FROM it_management_diagnosis_original_survey_snapshot_v2 WHERE case_id=$1', [input.caseId],
      );
      if (!originalResult.rows[0]) throw new FreeDiagnosisDesignV2PersistenceError(409, 'DESIGN_V2_NOT_INITIALIZED');
      const original = mapOriginal(originalResult.rows[0]);
      const latestResult = await client.query<Record<string, unknown>>(
        'SELECT * FROM it_management_diagnosis_current_state_revision_v2 WHERE case_id=$1 ORDER BY revision_no DESC LIMIT 1', [input.caseId],
      );
      const previous = latestResult.rows[0] ? mapState(latestResult.rows[0]) : null;
      if (!previous || previous.revisionNo !== input.expectedRevision) {
        throw new FreeDiagnosisDesignV2PersistenceError(409, 'CURRENT_STATE_REVISION_CONFLICT');
      }
      const fullState = projectFreeDiagnosisSemanticV2({ q1CompanyContext: original.answers.q1CompanyContext, ...input.state });
      const supplement = { ...(previous.supplement ?? {}), ...(input.supplement ?? {}) };
      const currentRow = await client.query<Record<string, unknown>>(
        `INSERT INTO it_management_diagnosis_current_state_revision_v2
         (id,case_id,revision_no,source_type,based_on_original_snapshot_id,previous_state_id,state_json,supplement_json,updated_by_user_id,change_reason)
         VALUES($1,$2,$3,'HUMAN_UPDATE',$4,$5,$6,$7,$8,$9) RETURNING *`,
        [randomUUID(), input.caseId, previous.revisionNo + 1, original.id, previous.id,
          JSON.stringify(stateFields(fullState)), Object.keys(supplement).length ? JSON.stringify(supplement) : null,
          input.actor, input.changeReason ?? null],
      );
      const current = mapState(currentRow.rows[0]!);
      const created = await this.createAnalysisAndNarrative(client, input.caseId, current, fullState);
      await this.audit(client, input.caseId, input.actor, 'CreateDesignV2CurrentStateRevision', {
        current_state_id: current.id, revision_no: current.revisionNo, previous_state_id: previous.id,
        source_type: current.sourceType, analysis_result_id: created.analysis.id, generated_narrative_id: created.generated.id,
      });
      return this.buildView(client, input.caseId);
    });
  }

  async appendDesignV2CurrentStateRevision(input: AppendStateInput): Promise<CurrentStateRevisionV2> {
    if (!input.actor.trim()) throw new FreeDiagnosisDesignV2PersistenceError(422, 'ACTOR_REQUIRED');
    return this.tx(async client => {
      await this.lockCase(client, input.caseId);
      const originalResult = await client.query<Record<string, unknown>>(
        'SELECT * FROM it_management_diagnosis_original_survey_snapshot_v2 WHERE case_id=$1', [input.caseId],
      );
      if (!originalResult.rows[0]) throw new FreeDiagnosisDesignV2PersistenceError(404, 'DESIGN_V2_NOT_INITIALIZED');
      const original = mapOriginal(originalResult.rows[0]);
      const latestResult = await client.query<Record<string, unknown>>(
        'SELECT * FROM it_management_diagnosis_current_state_revision_v2 WHERE case_id=$1 ORDER BY revision_no DESC LIMIT 1', [input.caseId],
      );
      const previous = latestResult.rows[0] ? mapState(latestResult.rows[0]) : null;
      if (!previous || previous.revisionNo !== input.expectedRevision) {
        throw new FreeDiagnosisDesignV2PersistenceError(409, 'CURRENT_STATE_REVISION_CONFLICT');
      }
      const fullState = projectFreeDiagnosisSemanticV2({ q1CompanyContext: original.answers.q1CompanyContext, ...input.state });
      const supplement = { ...(previous.supplement ?? {}), ...(input.supplement ?? {}) };
      const currentRow = await client.query<Record<string, unknown>>(
        `INSERT INTO it_management_diagnosis_current_state_revision_v2
         (id,case_id,revision_no,source_type,based_on_original_snapshot_id,previous_state_id,state_json,supplement_json,updated_by_user_id,change_reason)
         VALUES($1,$2,$3,'HUMAN_UPDATE',$4,$5,$6,$7,$8,$9) RETURNING *`,
        [randomUUID(), input.caseId, previous.revisionNo + 1, original.id, previous.id,
          JSON.stringify(stateFields(fullState)), Object.keys(supplement).length ? JSON.stringify(supplement) : null,
          input.actor, input.changeReason ?? null],
      );
      const current = mapState(currentRow.rows[0]!);
      await this.audit(client, input.caseId, input.actor, 'CreateDesignV2CurrentStateRevision', {
        current_state_id: current.id, revision_no: current.revisionNo, previous_state_id: previous.id,
        source_type: current.sourceType,
      });
      return current;
    });
  }

  async reanalyzeDesignV2CurrentState(input: ReanalyzeInput): Promise<{
    current: CurrentStateRevisionV2;
    analysis: AnalysisResultRecordV2;
    generated: GeneratedNarrativeRecordV2;
    reused: boolean;
  }> {
    if (!input.actor.trim()) throw new FreeDiagnosisDesignV2PersistenceError(422, 'ACTOR_REQUIRED');
    return this.tx(async client => {
      await this.lockCase(client, input.caseId);
      const originals = await client.query<Record<string, unknown>>(
        'SELECT * FROM it_management_diagnosis_original_survey_snapshot_v2 WHERE case_id=$1', [input.caseId],
      );
      const states = await client.query<Record<string, unknown>>(
        'SELECT * FROM it_management_diagnosis_current_state_revision_v2 WHERE case_id=$1 ORDER BY revision_no DESC LIMIT 1', [input.caseId],
      );
      if (!originals.rows[0] || !states.rows[0]) throw new FreeDiagnosisDesignV2PersistenceError(404, 'DESIGN_V2_NOT_INITIALIZED');
      const original = mapOriginal(originals.rows[0]);
      const current = mapState(states.rows[0]);
      if (current.revisionNo !== input.expectedCurrentStateRevision) {
        throw new FreeDiagnosisDesignV2PersistenceError(409, 'CURRENT_STATE_REVISION_CONFLICT');
      }
      const existingAnalysis = await client.query<Record<string, unknown>>(
        `SELECT * FROM it_management_diagnosis_analysis_result_v2
         WHERE current_state_id=$1 AND analyzer_version=$2 AND rule_set_version=$3`,
        [current.id, DESIGN_V2_ANALYZER_VERSION, DESIGN_V2_RULE_SET_VERSION],
      );
      if (existingAnalysis.rows[0]) {
        const existingGenerated = await client.query<Record<string, unknown>>(
          `SELECT * FROM it_management_diagnosis_generated_narrative_v2
           WHERE analysis_result_id=$1 AND generator_version=$2`,
          [existingAnalysis.rows[0].id, DESIGN_V2_NARRATIVE_GENERATOR_VERSION],
        );
        if (!existingGenerated.rows[0]) throw new FreeDiagnosisDesignV2PersistenceError(409, 'DESIGN_V2_GENERATED_NARRATIVE_MISSING');
        return {
          current, analysis: mapAnalysis(existingAnalysis.rows[0]), generated: mapGenerated(existingGenerated.rows[0]), reused: true,
        };
      }
      const fullState = projectFreeDiagnosisSemanticV2({ q1CompanyContext: original.answers.q1CompanyContext, ...current.state });
      const created = await this.createAnalysisAndNarrative(client, input.caseId, current, fullState);
      await this.audit(client, input.caseId, input.actor, 'RunDesignV2Reanalysis', {
        current_state_id: current.id, revision_no: current.revisionNo,
        analysis_result_id: created.analysis.id, generated_narrative_id: created.generated.id,
        analyzer_version: DESIGN_V2_ANALYZER_VERSION, rule_set_version: DESIGN_V2_RULE_SET_VERSION,
        generator_version: DESIGN_V2_NARRATIVE_GENERATOR_VERSION,
      });
      return { current, ...created, reused: false };
    });
  }

  async appendDesignV2HumanEditedNarrative(input: AppendHumanEditInput): Promise<HumanEditedNarrativeRecordV2> {
    if (!input.actor.trim()) throw new FreeDiagnosisDesignV2PersistenceError(422, 'ACTOR_REQUIRED');
    if (!input.content || typeof input.content !== 'object') throw new FreeDiagnosisDesignV2PersistenceError(422, 'HUMAN_EDIT_CONTENT_REQUIRED');
    return this.tx(async client => {
      await this.lockCase(client, input.caseId);
      const latest = await this.latestGenerated(client, input.caseId);
      if (!latest) throw new FreeDiagnosisDesignV2PersistenceError(409, 'GENERATED_NARRATIVE_NOT_FOUND');
      if (latest.id !== input.generatedNarrativeId) throw new FreeDiagnosisDesignV2PersistenceError(409, 'STALE_GENERATED_NARRATIVE');
      const latestState = await client.query<{ id: string }>(
        `SELECT id FROM it_management_diagnosis_current_state_revision_v2
         WHERE case_id=$1 ORDER BY revision_no DESC LIMIT 1`,
        [input.caseId],
      );
      if (!latestState.rows[0] || latest.currentStateId !== latestState.rows[0].id) {
        throw new FreeDiagnosisDesignV2PersistenceError(409, 'STALE_GENERATED_NARRATIVE');
      }
      const revisionResult = await client.query<{ revision_no: number }>(
        `SELECT COALESCE(MAX(revision_no),0)::int + 1 AS revision_no
         FROM it_management_diagnosis_human_edited_narrative_v2 WHERE generated_narrative_id=$1`,
        [input.generatedNarrativeId],
      );
      const row = await client.query<Record<string, unknown>>(
        `INSERT INTO it_management_diagnosis_human_edited_narrative_v2
         (id,case_id,generated_narrative_id,revision_no,content_json,edited_by_user_id,edit_reason,content_hash)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [randomUUID(), input.caseId, input.generatedNarrativeId, revisionResult.rows[0]!.revision_no,
          JSON.stringify(input.content), input.actor, input.editReason ?? null, contentHash(input.content)],
      );
      const edit = mapHumanEdit(row.rows[0]!);
      await this.audit(client, input.caseId, input.actor, 'SaveDesignV2HumanEditedNarrative', {
        human_edited_narrative_id: edit.id, generated_narrative_id: edit.generatedNarrativeId,
        revision_no: edit.revisionNo,
      });
      return edit;
    });
  }

  async getOriginalSurvey(caseId: string): Promise<OriginalSurveySnapshotV2 | null> {
    const result = await this.pool.query<Record<string, unknown>>(
      'SELECT * FROM it_management_diagnosis_original_survey_snapshot_v2 WHERE case_id=$1', [caseId],
    );
    return result.rows[0] ? mapOriginal(result.rows[0]) : null;
  }

  async listCurrentStateRevisions(caseId: string): Promise<CurrentStateRevisionV2[]> {
    const result = await this.pool.query<Record<string, unknown>>(
      'SELECT * FROM it_management_diagnosis_current_state_revision_v2 WHERE case_id=$1 ORDER BY revision_no', [caseId],
    );
    return result.rows.map(mapState);
  }

  async getPostHearingAnalysisView(caseId: string): Promise<PostHearingAnalysisViewV2> {
    const client = await this.pool.connect();
    try { return await this.buildView(client, caseId); } finally { client.release(); }
  }

  async getDesignV2PersistenceWorkspace(caseId: string): Promise<DesignV2PersistenceWorkspace | null> {
    const originals = await this.pool.query<Record<string, unknown>>(
      'SELECT * FROM it_management_diagnosis_original_survey_snapshot_v2 WHERE case_id=$1', [caseId],
    );
    const states = await this.pool.query<Record<string, unknown>>(
      'SELECT * FROM it_management_diagnosis_current_state_revision_v2 WHERE case_id=$1 ORDER BY revision_no DESC LIMIT 1', [caseId],
    );
    if (!originals.rows[0] || !states.rows[0]) return null;
    const current = mapState(states.rows[0]);
    const analyses = await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM it_management_diagnosis_analysis_result_v2
       WHERE case_id=$1 AND current_state_id=$2 AND analyzer_version=$3 AND rule_set_version=$4
       ORDER BY created_at DESC LIMIT 1`,
      [caseId, current.id, DESIGN_V2_ANALYZER_VERSION, DESIGN_V2_RULE_SET_VERSION],
    );
    const analysis = analyses.rows[0] ? mapAnalysis(analyses.rows[0]) : null;
    const generatedRows = analysis ? await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM it_management_diagnosis_generated_narrative_v2
       WHERE case_id=$1 AND current_state_id=$2 AND analysis_result_id=$3 AND generator_version=$4
       ORDER BY created_at DESC LIMIT 1`,
      [caseId, current.id, analysis.id, DESIGN_V2_NARRATIVE_GENERATOR_VERSION],
    ) : { rows: [] as Record<string, unknown>[] };
    const edits = await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM it_management_diagnosis_human_edited_narrative_v2
       WHERE case_id=$1 ORDER BY created_at DESC,revision_no DESC LIMIT 1`, [caseId],
    );
    return {
      originalSurvey: mapOriginal(originals.rows[0]), currentStructuredState: current,
      latestAnalysisResult: analysis,
      latestGeneratedNarrative: generatedRows.rows[0] ? mapGenerated(generatedRows.rows[0]) : null,
      latestHumanEditedNarrative: edits.rows[0] ? mapHumanEdit(edits.rows[0]) : null,
    };
  }

  /**
   * Projects only the latest Design v2 canonical objects into a downstream
   * customer Report Draft.  Hearing records are intentionally not queried.
   */
  async createDesignV2ReportDraft(caseId: string, actor: string): Promise<DesignV2ReportDraftResult> {
    return this.tx(async client => {
      const caseResult = await client.query<Record<string, unknown>>(
        `SELECT c.id,c.version,c.status,co.name AS organization_display_name
           FROM it_management_diagnosis_case_v2 c
           JOIN company co ON co.id=c.company_id
          WHERE c.id=$1 FOR UPDATE`, [caseId],
      );
      const kase = caseResult.rows[0];
      if (!kase) throw new FreeDiagnosisDesignV2PersistenceError(404, 'CASE_NOT_FOUND');

      const originals = await client.query<Record<string, unknown>>(
        'SELECT * FROM it_management_diagnosis_original_survey_snapshot_v2 WHERE case_id=$1', [caseId],
      );
      const states = await client.query<Record<string, unknown>>(
        'SELECT * FROM it_management_diagnosis_current_state_revision_v2 WHERE case_id=$1 ORDER BY revision_no DESC LIMIT 1', [caseId],
      );
      if (!originals.rows[0] || !states.rows[0]) throw new FreeDiagnosisDesignV2PersistenceError(409, 'DESIGN_V2_REPORT_SOURCE_NOT_READY');
      const original = mapOriginal(originals.rows[0]);
      const current = mapState(states.rows[0]);
      const analysisResult = await client.query<Record<string, unknown>>(
        `SELECT * FROM it_management_diagnosis_analysis_result_v2
          WHERE case_id=$1 AND current_state_id=$2 AND analyzer_version=$3 AND rule_set_version=$4
          ORDER BY created_at DESC LIMIT 1`,
        [caseId, current.id, DESIGN_V2_ANALYZER_VERSION, DESIGN_V2_RULE_SET_VERSION],
      );
      if (!analysisResult.rows[0]) throw new FreeDiagnosisDesignV2PersistenceError(409, 'DESIGN_V2_REANALYSIS_REQUIRED');
      const analysis = mapAnalysis(analysisResult.rows[0]);
      const generatedResult = await client.query<Record<string, unknown>>(
        `SELECT * FROM it_management_diagnosis_generated_narrative_v2
          WHERE case_id=$1 AND current_state_id=$2 AND analysis_result_id=$3 AND generator_version=$4
          ORDER BY created_at DESC LIMIT 1`,
        [caseId, current.id, analysis.id, DESIGN_V2_NARRATIVE_GENERATOR_VERSION],
      );
      if (!generatedResult.rows[0]) throw new FreeDiagnosisDesignV2PersistenceError(409, 'DESIGN_V2_REANALYSIS_REQUIRED');
      const generated = mapGenerated(generatedResult.rows[0]);
      const currentEditResult = await client.query<Record<string, unknown>>(
        `SELECT * FROM it_management_diagnosis_human_edited_narrative_v2
          WHERE case_id=$1 AND generated_narrative_id=$2
          ORDER BY revision_no DESC LIMIT 1`, [caseId, generated.id],
      );
      const humanEdit = currentEditResult.rows[0] ? mapHumanEdit(currentEditResult.rows[0]) : null;
      const adopted = humanEdit?.content ?? generated.content;
      const sourceKind = humanEdit ? 'HUMAN_EDITED' : 'SYSTEM_GENERATED';
      const content = buildDesignV2ReportContent({
        organizationDisplayName: kase.organization_display_name as string,
        diagnosisDate: current.createdAt,
        narrative: adopted,
        analysis: analysis.analysis,
      });
      const context: Record<string, unknown> = {
        formatVersion: DESIGN_V2_REPORT_CONTEXT_VERSION,
        caseId,
        originalSurvey: { id: original.id, surveyVersion: original.surveyVersion, contentHash: original.contentHash },
        currentState: {
          id: current.id, revisionNo: current.revisionNo,
          contentHash: contentHash({ state: current.state, supplement: current.supplement }),
        },
        analysisResult: {
          id: analysis.id, analyzerVersion: analysis.analyzerVersion, ruleSetVersion: analysis.ruleSetVersion,
          inputHash: analysis.inputHash, resultHash: analysis.resultHash,
        },
        generatedNarrative: { id: generated.id, generatorVersion: generated.generatorVersion, contentHash: generated.contentHash },
        adoptedNarrative: humanEdit
          ? { source: sourceKind, id: humanEdit.id, revisionNo: humanEdit.revisionNo, contentHash: humanEdit.contentHash, generatedNarrativeId: humanEdit.generatedNarrativeId }
          : { source: sourceKind, id: generated.id, contentHash: generated.contentHash },
      };
      const versionResult = await client.query<{ version: number }>(
        'SELECT COALESCE(MAX(version),0)+1 AS version FROM diagnosis_reports WHERE it_management_diagnosis_case_v2_id=$1', [caseId],
      );
      const reportId = randomUUID();
      const version = Number(versionResult.rows[0]!.version);
      await client.query(
        `INSERT INTO diagnosis_reports
           (id,it_management_diagnosis_case_v2_id,version,status,content_json,context_json,context_hash,prompt_version,policy_version,created_by,created_by_user_id)
         VALUES($1,$2,$3,'REVIEW_REQUIRED',$4,$5,$6,'design-v2-deterministic-projection-1','design-v2','HUMAN',$7)`,
        [reportId, caseId, version, JSON.stringify(content), JSON.stringify(context), contentHash(context), actor],
      );
      await client.query(
        `UPDATE it_management_diagnosis_case_v2
            SET status='REPORT_REVIEW_REQUIRED',version=version+1
          WHERE id=$1`, [caseId],
      );
      await this.audit(client, caseId, actor, 'CreateDesignV2ReportDraft', {
        from_state: kase.status, to_state: 'REPORT_REVIEW_REQUIRED', report_id: reportId, report_version: version,
        current_state_id: current.id, analysis_result_id: analysis.id, generated_narrative_id: generated.id,
        human_edited_narrative_id: humanEdit?.id ?? null, adopted_narrative_source: sourceKind,
      });
      return { id: reportId, version, content, context };
    });
  }

  async getDesignV2ReportDraft(caseId: string, reportId: string): Promise<DesignV2StoredReportDraft> {
    const result = await this.pool.query<Record<string, unknown>>(
      `SELECT id,version,content_version,status,content_json,context_json
         FROM diagnosis_reports
        WHERE id=$1 AND it_management_diagnosis_case_v2_id=$2 AND policy_version='design-v2'`,
      [reportId, caseId],
    );
    if (!result.rows[0]) throw new FreeDiagnosisDesignV2PersistenceError(404, 'DESIGN_V2_REPORT_NOT_FOUND');
    return this.mapDesignV2ReportDraft(result.rows[0]);
  }

  async ensureDesignV2ReportDraft(caseId: string, actor: string): Promise<DesignV2StoredReportDraft> {
    const existing = await this.pool.query<Record<string, unknown>>(
      `SELECT id,version,content_version,status,content_json,context_json
         FROM diagnosis_reports
        WHERE it_management_diagnosis_case_v2_id=$1 AND policy_version='design-v2' AND status='REVIEW_REQUIRED'
        ORDER BY version DESC LIMIT 1`, [caseId],
    );
    if (existing.rows[0]) return this.mapDesignV2ReportDraft(existing.rows[0]);
    const created = await this.createDesignV2ReportDraft(caseId, actor);
    return { id: created.id, version: created.version, contentVersion: 1, status: 'REVIEW_REQUIRED', content: created.content, context: created.context };
  }

  async updateDesignV2ReportDraftPresentation(
    caseId: string,
    reportId: string,
    content: DesignV2ReportContent,
    actor: string,
  ): Promise<DesignV2StoredReportDraft> {
    return this.tx(async client => {
      const result = await client.query<Record<string, unknown>>(
        `SELECT id,version,content_version,status,content_json,context_json
           FROM diagnosis_reports
          WHERE id=$1 AND it_management_diagnosis_case_v2_id=$2 AND policy_version='design-v2'
          FOR UPDATE`, [reportId, caseId],
      );
      if (!result.rows[0]) throw new FreeDiagnosisDesignV2PersistenceError(404, 'DESIGN_V2_REPORT_NOT_FOUND');
      const report = this.mapDesignV2ReportDraft(result.rows[0]);
      if (report.status !== 'REVIEW_REQUIRED') throw new FreeDiagnosisDesignV2PersistenceError(409, 'DESIGN_V2_REPORT_NOT_EDITABLE');
      this.assertDesignV2ReportPresentation(content, report.content);
      const updated = await client.query<Record<string, unknown>>(
        `UPDATE diagnosis_reports
            SET content_json=$3,content_version=content_version+1,updated_at=now()
          WHERE id=$1 AND it_management_diagnosis_case_v2_id=$2
          RETURNING id,version,content_version,status,content_json,context_json`,
        [reportId, caseId, JSON.stringify(content)],
      );
      await this.audit(client, caseId, actor, 'UpdateDesignV2ReportPresentation', {
        report_id: reportId, report_version: report.version,
        previous_content_hash: contentHash(report.content), content_hash: contentHash(content),
      });
      return this.mapDesignV2ReportDraft(updated.rows[0]!);
    });
  }

  async listDesignV2HearingRecords(caseId: string): Promise<HearingRecordV2[]> {
    const result = await this.pool.query<Record<string, unknown>>(
      `SELECT id,plan_item_ref,statement_text,operator_note_text,knowledge_state,structured_answer_json,
              recorded_by_user_id,recorded_at
       FROM hearing_statement_v2 WHERE case_id=$1 ORDER BY recorded_at,id`, [caseId],
    );
    return result.rows.map(row => ({
      id: row.id as string, planItemRef: row.plan_item_ref as string | null,
      statementText: row.statement_text as string, operatorNoteText: row.operator_note_text as string | null,
      knowledgeState: row.knowledge_state as string,
      structuredAnswer: row.structured_answer_json == null ? null : asJson(row.structured_answer_json),
      recordedByUserId: row.recorded_by_user_id as string, recordedAt: new Date(row.recorded_at as string).toISOString(),
    }));
  }

  private async latestGenerated(client: PoolClient, caseId: string): Promise<GeneratedNarrativeRecordV2 | null> {
    const result = await client.query<Record<string, unknown>>(
      `SELECT g.* FROM it_management_diagnosis_generated_narrative_v2 g
       JOIN it_management_diagnosis_current_state_revision_v2 s ON s.id=g.current_state_id AND s.case_id=g.case_id
       WHERE g.case_id=$1 ORDER BY s.revision_no DESC,g.created_at DESC LIMIT 1`, [caseId],
    );
    return result.rows[0] ? mapGenerated(result.rows[0]) : null;
  }

  private mapDesignV2ReportDraft(row: Record<string, unknown>): DesignV2StoredReportDraft {
    return {
      id: row.id as string, version: Number(row.version), contentVersion: Number(row.content_version), status: row.status as string,
      content: asJson(row.content_json as DesignV2ReportContent), context: asJson(row.context_json as Record<string, unknown>),
    };
  }

  private assertDesignV2ReportPresentation(candidate: DesignV2ReportContent, original: DesignV2ReportContent): void {
    if (candidate.formatVersion !== original.formatVersion || candidate.issuer?.displayName !== original.issuer?.displayName) {
      throw new FreeDiagnosisDesignV2PersistenceError(422, 'DESIGN_V2_REPORT_PRESENTATION_INVALID');
    }
    const sameCandidate = (left: typeof candidate.factCandidates[number], right: typeof original.factCandidates[number] | undefined): boolean => right != null
      && left.id === right.id
      && left.whatToVerify === right.whatToVerify
      && left.whyItMattersToFuture === right.whyItMattersToFuture
      && left.whatMayBecomeKnowable === right.whatMayBecomeKnowable
      && left.lenses.length === right.lenses.length && left.lenses.every((value, index) => value === right.lenses[index])
      && left.sourceRuleIds.length === right.sourceRuleIds.length && left.sourceRuleIds.every((value, index) => value === right.sourceRuleIds[index]);
    const originalFacts = new Map(original.factCandidates.map(item => [item.id, item]));
    if (candidate.factCandidates.length !== original.factCandidates.length || candidate.factCandidates.some(item => !sameCandidate(item, originalFacts.get(item.id)))) {
      throw new FreeDiagnosisDesignV2PersistenceError(422, 'DESIGN_V2_REPORT_SOURCE_MUTATION_FORBIDDEN');
    }
    const originalProposalFacts = new Map(original.assessmentProposal.candidates.map(item => [item.id, item]));
    if (candidate.assessmentProposal.candidates.length !== original.assessmentProposal.candidates.length
      || candidate.assessmentProposal.candidates.some(item => !sameCandidate(item, originalProposalFacts.get(item.id)))) {
      throw new FreeDiagnosisDesignV2PersistenceError(422, 'DESIGN_V2_REPORT_SOURCE_MUTATION_FORBIDDEN');
    }
    if (candidate.sections.length !== 5 || candidate.sections.some((section, index) => section.key !== original.sections[index]?.key || section.title !== original.sections[index]?.title || !Array.isArray(section.entries))) {
      throw new FreeDiagnosisDesignV2PersistenceError(422, 'DESIGN_V2_REPORT_PRESENTATION_INVALID');
    }
    const selected = candidate.assessmentProposal?.selectedCandidateIds ?? [];
    if (new Set(selected).size !== selected.length || selected.some(id => !originalFacts.has(id))) {
      throw new FreeDiagnosisDesignV2PersistenceError(422, 'DESIGN_V2_REPORT_FACT_CANDIDATE_INVALID');
    }
    const presentations = candidate.assessmentProposal?.presentationByCandidateId ?? {};
    if (Object.keys(presentations).some(id => !selected.includes(id))) {
      throw new FreeDiagnosisDesignV2PersistenceError(422, 'DESIGN_V2_REPORT_FACT_CANDIDATE_INVALID');
    }
    if (candidate.assessmentProposal?.status !== 'NOT_SELECTED' || candidate.assessmentProposal?.source !== 'ANALYSIS_FACT_CANDIDATES') {
      throw new FreeDiagnosisDesignV2PersistenceError(422, 'DESIGN_V2_REPORT_SOURCE_MUTATION_FORBIDDEN');
    }
  }

  private async buildView(client: PoolClient, caseId: string): Promise<PostHearingAnalysisViewV2> {
    const originals = await client.query<Record<string, unknown>>(
      'SELECT * FROM it_management_diagnosis_original_survey_snapshot_v2 WHERE case_id=$1', [caseId],
    );
    const states = await client.query<Record<string, unknown>>(
      'SELECT * FROM it_management_diagnosis_current_state_revision_v2 WHERE case_id=$1 ORDER BY revision_no DESC LIMIT 1', [caseId],
    );
    if (!originals.rows[0] || !states.rows[0]) throw new FreeDiagnosisDesignV2PersistenceError(404, 'DESIGN_V2_STATE_NOT_FOUND');
    const original = mapOriginal(originals.rows[0]);
    const current = mapState(states.rows[0]);
    const analyses = await client.query<Record<string, unknown>>(
      'SELECT * FROM it_management_diagnosis_analysis_result_v2 WHERE case_id=$1 AND current_state_id=$2 ORDER BY created_at DESC LIMIT 1',
      [caseId, current.id],
    );
    const generated = await this.latestGenerated(client, caseId);
    if (!analyses.rows[0] || !generated) throw new FreeDiagnosisDesignV2PersistenceError(404, 'DESIGN_V2_ANALYSIS_NOT_FOUND');
    const edits = await client.query<Record<string, unknown>>(
      `SELECT * FROM it_management_diagnosis_human_edited_narrative_v2
       WHERE case_id=$1 ORDER BY created_at DESC,revision_no DESC LIMIT 1`, [caseId],
    );
    const edit = edits.rows[0] ? mapHumanEdit(edits.rows[0]) : null;
    const originalFields = stateFields(original.answers);
    const diff: PostHearingAnalysisViewV2['currentStateDiffFromOriginal'] = {};
    for (const key of Object.keys(current.state) as (keyof DesignV2CurrentStateFields)[]) {
      if (contentHash(originalFields[key]) !== contentHash(current.state[key])) diff[key] = { original: originalFields[key], current: current.state[key] };
    }
    return {
      originalSurvey: original, currentStructuredState: current, currentStateDiffFromOriginal: diff,
      latestAnalysisResult: mapAnalysis(analyses.rows[0]), latestGeneratedNarrative: generated,
      latestHumanEditedNarrative: edit,
      humanEditedNarrativeStatus: edit == null ? 'NONE' : edit.generatedNarrativeId === generated.id ? 'CURRENT' : 'STALE_REVIEW_REQUIRED',
    };
  }
}
