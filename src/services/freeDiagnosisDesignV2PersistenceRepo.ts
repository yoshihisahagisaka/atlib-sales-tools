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

interface InitializeInput {
  caseId: string;
  answers: CurrentStructuredStateV2;
  surveyVersion: string;
  entryChannel: 'CUSTOMER_SELF' | 'STAFF_PROXY';
  answeredByRole: string;
  enteredByUserId?: string | null;
  submittedAt?: Date;
  actor: string;
}

interface AppendStateInput {
  caseId: string;
  expectedRevision: number;
  state: DesignV2CurrentStateFields;
  supplement?: Record<string, unknown> | null;
  actor: string;
  changeReason?: string | null;
}

interface AppendHumanEditInput {
  caseId: string;
  generatedNarrativeId: string;
  content: FreeDiagnosisNarrativeV2;
  actor: string;
  editReason?: string | null;
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
      const currentRow = await client.query<Record<string, unknown>>(
        `INSERT INTO it_management_diagnosis_current_state_revision_v2
         (id,case_id,revision_no,source_type,based_on_original_snapshot_id,previous_state_id,state_json,supplement_json,updated_by_user_id,change_reason)
         VALUES($1,$2,$3,'HUMAN_UPDATE',$4,$5,$6,$7,$8,$9) RETURNING *`,
        [randomUUID(), input.caseId, previous.revisionNo + 1, original.id, previous.id,
          JSON.stringify(stateFields(fullState)), input.supplement == null ? null : JSON.stringify(input.supplement),
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

  async appendDesignV2HumanEditedNarrative(input: AppendHumanEditInput): Promise<HumanEditedNarrativeRecordV2> {
    if (!input.actor.trim()) throw new FreeDiagnosisDesignV2PersistenceError(422, 'ACTOR_REQUIRED');
    if (!input.content || typeof input.content !== 'object') throw new FreeDiagnosisDesignV2PersistenceError(422, 'HUMAN_EDIT_CONTENT_REQUIRED');
    return this.tx(async client => {
      await this.lockCase(client, input.caseId);
      const latest = await this.latestGenerated(client, input.caseId);
      if (!latest) throw new FreeDiagnosisDesignV2PersistenceError(409, 'GENERATED_NARRATIVE_NOT_FOUND');
      if (latest.id !== input.generatedNarrativeId) throw new FreeDiagnosisDesignV2PersistenceError(409, 'STALE_GENERATED_NARRATIVE');
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

  private async latestGenerated(client: PoolClient, caseId: string): Promise<GeneratedNarrativeRecordV2 | null> {
    const result = await client.query<Record<string, unknown>>(
      `SELECT g.* FROM it_management_diagnosis_generated_narrative_v2 g
       JOIN it_management_diagnosis_current_state_revision_v2 s ON s.id=g.current_state_id AND s.case_id=g.case_id
       WHERE g.case_id=$1 ORDER BY s.revision_no DESC,g.created_at DESC LIMIT 1`, [caseId],
    );
    return result.rows[0] ? mapGenerated(result.rows[0]) : null;
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
