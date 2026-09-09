import type { Pool } from 'pg';
import {
  aiDriftFlag,
  finalFactValue,
  focusFactSummary,
  type FocusFactSummary,
  type HandlerFactStatus,
  type PreSurveySnapshot,
  type RoleGapDistribution,
  type RoleGapStatus,
} from '../domain/kaizenAssessment';

export type ReviewStatus = 'new' | 'contacted' | 'closed';
export type InputSource = 'staff' | 'prospect';
export type WorkflowStage =
  | 'pre_survey'
  | 'briefed'
  | 'interviewing'
  | 'items_review'
  | 'structured'
  | 'report_draft'
  | 'report_final';

// ---------------------------------------------------------------------------
// JSONB blob 型（AI service 境界で zod 検証済みのものを、そのまま保存/読み出しする）
// ---------------------------------------------------------------------------

export interface InterviewBlob {
  transcript: string;
  handlerMemo: string;
  navHistory: { at: string; aiRunSeq: number; nextQuestion: string }[];
  lastAnalyzedAt: string | null;
  aiRunSeq: number;
}

export interface RoleGapBlob {
  aiRaw: { current: RoleGapDistribution; ideal: RoleGapDistribution };
  aiEstimate: { current: RoleGapDistribution; ideal: RoleGapDistribution; filledCats: string[] } | null;
  handler: { current: Record<string, number>; ideal: Record<string, number> } | null;
  diff: RoleGapDistribution | null;
  evidenceSufficiency: 'sufficient' | 'insufficient';
  status: RoleGapStatus;
  currentSum: number;
  idealSum: number;
  note: string;
}

export interface MaturityBlob {
  areas: {
    areaId: string;
    label: string;
    aiScore: number | null;
    handlerScore: number | null;
    anchorMet: string;
    evidence: string;
  }[];
  overallGap: number | null;
  source: 'ai' | 'handler';
}

export interface AiRunLogEntry {
  step: 'pre_brief' | 'analyze' | 'structure' | 'report_draft';
  model: string;
  at: string;
  durationMs: number;
  ok: boolean;
  error?: string;
}

export interface AssessmentInsertInput {
  inputSource: InputSource;
  source?: string;
  companyName: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  employeeBand?: string | null;
  hearingDate?: string | null;
  staffEmail?: string | null;
  sourceIp?: string | null;
  catalogVersion: string;
  preSurvey: PreSurveySnapshot;
}

export interface AssessmentListItem {
  id: string;
  inputSource: InputSource;
  source: string;
  companyName: string;
  contactName: string | null;
  employeeBand: string | null;
  hearingDate: string | null;
  staffEmail: string | null;
  workflowStage: WorkflowStage;
  reviewStatus: ReviewStatus;
  hasPreBrief: boolean;
  convertedToAssessment: boolean;
  assessmentCaseCode: string | null;
  createdAt: string;
  focusSummary: FocusFactSummary;
}

export interface FactRow {
  itemCode: string;
  catalogVersion: string;
  aiValue: string | null;
  aiStandardCode: string | null;
  aiConfidence: 'high' | 'mid' | 'low' | null;
  aiEvidenceQuote: string | null;
  aiEvidenceSourceType: 'transcript' | 'handler_memo' | 'none' | null;
  aiFlag: 'ok' | 'unknown' | 'conflict' | 'needs_confirmation' | null;
  aiFollowupQuestion: string | null;
  aiInFocus: boolean;
  aiFocusReason: string | null;
  aiExtractedAt: string | null;
  aiRunSeq: number;
  handlerStatus: HandlerFactStatus;
  handlerValue: string | null;
  handlerStandardCode: string | null;
  handlerNote: string | null;
  handlerBy: string | null;
  handlerAt: string | null;
  /** 算出値（保存しない）。 */
  finalValue: string | null;
  aiDrift: boolean;
}

export interface AssessmentDetail extends Omit<AssessmentListItem, 'focusSummary'> {
  email: string | null;
  phone: string | null;
  sourceIp: string | null;
  catalogVersion: string;
  preSurvey: PreSurveySnapshot;
  aiPreBrief: unknown | null;
  interview: InterviewBlob;
  businesses: unknown[];
  roleGap: RoleGapBlob | null;
  maturity: MaturityBlob | null;
  kaizenHypotheses: unknown[];
  reportDraft: unknown | null;
  aiRunLog: AiRunLogEntry[];
  facts: FactRow[];
  focusSummary: FocusFactSummary;
}

/** AI再解析で upsert する1件分（ai_* のみ。handler_* は絶対に触らない）。 */
export interface AiFactUpsert {
  itemCode: string;
  catalogVersion: string;
  aiValue: string | null;
  aiStandardCode: string | null;
  aiConfidence: 'high' | 'mid' | 'low' | null;
  aiEvidenceQuote: string | null;
  aiEvidenceSourceType: 'transcript' | 'handler_memo' | 'none' | null;
  aiFlag: 'ok' | 'unknown' | 'conflict' | 'needs_confirmation' | null;
  aiFollowupQuestion: string | null;
  aiInFocus: boolean;
  aiFocusReason: string | null;
  aiRunSeq: number;
}

export interface HandlerFactPatch {
  handlerStatus: HandlerFactStatus;
  handlerValue?: string | null;
  handlerStandardCode?: string | null;
  handlerNote?: string | null;
  handlerBy: string;
}

interface AssessmentRow {
  id: string;
  input_source: InputSource;
  source: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  employee_band: string | null;
  hearing_date: string | null;
  staff_email: string | null;
  source_ip: string | null;
  catalog_version: string;
  pre_survey: PreSurveySnapshot;
  ai_pre_brief: unknown | null;
  interview: InterviewBlob;
  businesses: unknown[];
  role_gap: RoleGapBlob | null;
  maturity: MaturityBlob | null;
  kaizen_hypotheses: unknown[];
  report_draft: unknown | null;
  ai_run_log: AiRunLogEntry[];
  workflow_stage: WorkflowStage;
  review_status: ReviewStatus;
  converted_to_assessment: boolean;
  assessment_case_code: string | null;
  created_at: string;
}

interface FactDbRow {
  item_code: string;
  catalog_version: string;
  ai_value: string | null;
  ai_standard_code: string | null;
  ai_confidence: 'high' | 'mid' | 'low' | null;
  ai_evidence_quote: string | null;
  ai_evidence_source_type: 'transcript' | 'handler_memo' | 'none' | null;
  ai_flag: 'ok' | 'unknown' | 'conflict' | 'needs_confirmation' | null;
  ai_followup_question: string | null;
  ai_in_focus: boolean;
  ai_focus_reason: string | null;
  ai_extracted_at: string | null;
  ai_run_seq: number;
  handler_status: HandlerFactStatus;
  handler_value: string | null;
  handler_standard_code: string | null;
  handler_note: string | null;
  handler_by: string | null;
  handler_at: string | null;
}

const EMPTY_INTERVIEW: InterviewBlob = {
  transcript: '',
  handlerMemo: '',
  navHistory: [],
  lastAnalyzedAt: null,
  aiRunSeq: 0,
};

/**
 * kaizen_assessments + kaizen_assessment_facts への問い合わせを引き受けるリポジトリ。
 * services/kaizenDiagnosticRepo.ts と同じ作法（JSONB列は node-postgres が自動でJSにデシリアライズ。
 * 書き込みは JSON.stringify、hearing_date は ::text で 'YYYY-MM-DD' 文字列受け渡し）。
 *
 * facts の再解析 upsert は ON CONFLICT で ai_* だけを更新し、handler_* には一切触れない
 * （担当者の承認/修正がAI再解析で消えないようにするための最重要ポイント）。
 */
export class KaizenAssessmentRepo {
  constructor(private readonly pool: Pool) {}

  async insert(input: AssessmentInsertInput): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO kaizen_assessments
         (input_source, source, company_name, contact_name, email, phone, employee_band,
          hearing_date, staff_email, source_ip, catalog_version, pre_survey)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        input.inputSource,
        input.source ?? 'joshisu-kaizen-lp-v5',
        input.companyName,
        input.contactName ?? null,
        input.email ?? null,
        input.phone ?? null,
        input.employeeBand ?? null,
        input.hearingDate ?? null,
        input.staffEmail ?? null,
        input.sourceIp ?? null,
        input.catalogVersion,
        JSON.stringify(input.preSurvey),
      ],
    );
    const id = rows[0]?.id;
    if (!id) throw new Error('KaizenAssessmentRepo.insert: no id returned');
    return id;
  }

  async list(opts: {
    status?: ReviewStatus;
    workflowStage?: WorkflowStage;
    inputSource?: InputSource;
    converted?: boolean;
    limit: number;
    offset: number;
  }): Promise<{ items: AssessmentListItem[]; total: number }> {
    const params: unknown[] = [];
    const conditions: string[] = [];
    if (opts.status) {
      params.push(opts.status);
      conditions.push(`a.review_status = $${params.length}`);
    }
    if (opts.workflowStage) {
      params.push(opts.workflowStage);
      conditions.push(`a.workflow_stage = $${params.length}`);
    }
    if (opts.inputSource) {
      params.push(opts.inputSource);
      conditions.push(`a.input_source = $${params.length}`);
    }
    if (opts.converted !== undefined) {
      params.push(opts.converted);
      conditions.push(`a.converted_to_assessment = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows: countRows } = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM kaizen_assessments a ${where}`,
      params,
    );
    const total = Number(countRows[0]?.count ?? 0);

    params.push(opts.limit, opts.offset);
    const { rows } = await this.pool.query<
      AssessmentRow & { fact_rows: FactDbRow[] | null }
    >(
      `SELECT a.id, a.input_source, a.source, a.company_name, a.contact_name, a.employee_band,
              a.hearing_date::text AS hearing_date, a.staff_email, a.workflow_stage, a.review_status,
              (a.ai_pre_brief IS NOT NULL) AS has_pre_brief,
              a.converted_to_assessment, a.assessment_case_code, a.created_at,
              COALESCE(
                (SELECT json_agg(json_build_object(
                   'item_code', f.item_code, 'ai_in_focus', f.ai_in_focus,
                   'ai_flag', f.ai_flag, 'handler_status', f.handler_status))
                 FROM kaizen_assessment_facts f WHERE f.assessment_id = a.id), '[]'::json
              ) AS fact_rows
       FROM kaizen_assessments a
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const items: AssessmentListItem[] = rows.map((r) => {
      const factRows = (r.fact_rows ?? []) as {
        item_code: string;
        ai_in_focus: boolean;
        ai_flag: string | null;
        handler_status: HandlerFactStatus;
      }[];
      return {
        id: r.id,
        inputSource: r.input_source,
        source: r.source,
        companyName: r.company_name,
        contactName: r.contact_name,
        employeeBand: r.employee_band,
        hearingDate: r.hearing_date,
        staffEmail: r.staff_email,
        workflowStage: r.workflow_stage,
        reviewStatus: r.review_status,
        hasPreBrief: (r as unknown as { has_pre_brief: boolean }).has_pre_brief,
        convertedToAssessment: r.converted_to_assessment,
        assessmentCaseCode: r.assessment_case_code,
        createdAt: r.created_at,
        focusSummary: focusFactSummary(
          factRows.map((f) => ({
            itemCode: f.item_code,
            aiInFocus: f.ai_in_focus,
            aiFlag: f.ai_flag,
            handlerStatus: f.handler_status,
          })),
        ),
      };
    });

    return { items, total };
  }

  async findById(id: string): Promise<AssessmentDetail | null> {
    const { rows } = await this.pool.query<AssessmentRow>(
      `SELECT id, input_source, source, company_name, contact_name, email, phone, employee_band,
              hearing_date::text AS hearing_date, staff_email, source_ip, catalog_version,
              pre_survey, ai_pre_brief, interview, businesses, role_gap, maturity,
              kaizen_hypotheses, report_draft, ai_run_log, workflow_stage, review_status,
              converted_to_assessment, assessment_case_code, created_at
       FROM kaizen_assessments WHERE id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) return null;

    const { rows: factRows } = await this.pool.query<FactDbRow>(
      `SELECT item_code, catalog_version, ai_value, ai_standard_code, ai_confidence, ai_evidence_quote,
              ai_evidence_source_type, ai_flag, ai_followup_question, ai_in_focus, ai_focus_reason,
              ai_extracted_at, ai_run_seq, handler_status, handler_value, handler_standard_code,
              handler_note, handler_by, handler_at
       FROM kaizen_assessment_facts WHERE assessment_id = $1 ORDER BY item_code`,
      [id],
    );

    const facts: FactRow[] = factRows.map((f) => {
      const base = {
        handlerStatus: f.handler_status,
        handlerValue: f.handler_value,
        aiValue: f.ai_value,
        aiExtractedAt: f.ai_extracted_at,
        handlerAt: f.handler_at,
      };
      return {
        itemCode: f.item_code,
        catalogVersion: f.catalog_version,
        aiValue: f.ai_value,
        aiStandardCode: f.ai_standard_code,
        aiConfidence: f.ai_confidence,
        aiEvidenceQuote: f.ai_evidence_quote,
        aiEvidenceSourceType: f.ai_evidence_source_type,
        aiFlag: f.ai_flag,
        aiFollowupQuestion: f.ai_followup_question,
        aiInFocus: f.ai_in_focus,
        aiFocusReason: f.ai_focus_reason,
        aiExtractedAt: f.ai_extracted_at,
        aiRunSeq: f.ai_run_seq,
        handlerStatus: f.handler_status,
        handlerValue: f.handler_value,
        handlerStandardCode: f.handler_standard_code,
        handlerNote: f.handler_note,
        handlerBy: f.handler_by,
        handlerAt: f.handler_at,
        finalValue: finalFactValue(base),
        aiDrift: aiDriftFlag(base),
      };
    });

    const focusSummary = focusFactSummary(
      facts.map((f) => ({
        itemCode: f.itemCode,
        aiInFocus: f.aiInFocus,
        aiFlag: f.aiFlag,
        handlerStatus: f.handlerStatus,
      })),
    );

    return {
      id: row.id,
      inputSource: row.input_source,
      source: row.source,
      companyName: row.company_name,
      contactName: row.contact_name,
      email: row.email,
      phone: row.phone,
      employeeBand: row.employee_band,
      hearingDate: row.hearing_date,
      staffEmail: row.staff_email,
      sourceIp: row.source_ip,
      catalogVersion: row.catalog_version,
      workflowStage: row.workflow_stage,
      reviewStatus: row.review_status,
      hasPreBrief: row.ai_pre_brief !== null,
      convertedToAssessment: row.converted_to_assessment,
      assessmentCaseCode: row.assessment_case_code,
      createdAt: row.created_at,
      preSurvey: row.pre_survey,
      aiPreBrief: row.ai_pre_brief,
      interview: row.interview ?? EMPTY_INTERVIEW,
      businesses: row.businesses ?? [],
      roleGap: row.role_gap,
      maturity: row.maturity,
      kaizenHypotheses: row.kaizen_hypotheses ?? [],
      reportDraft: row.report_draft,
      aiRunLog: row.ai_run_log ?? [],
      facts,
      focusSummary,
    };
  }

  /** interview.aiRunSeq を1つ進めて返す（analyze の run_seq に使う）。 */
  async nextAiRunSeq(id: string): Promise<number> {
    const { rows } = await this.pool.query<{ seq: number }>(
      `UPDATE kaizen_assessments
       SET interview = jsonb_set(
             COALESCE(interview, '{}'::jsonb),
             '{aiRunSeq}',
             to_jsonb(COALESCE((interview->>'aiRunSeq')::int, 0) + 1)
           ),
           updated_at = now()
       WHERE id = $1
       RETURNING (interview->>'aiRunSeq')::int AS seq`,
      [id],
    );
    return rows[0]?.seq ?? 1;
  }

  /** AI再解析結果を upsert（ai_* と ai_in_focus / ai_focus_reason のみ。handler_* は不変）。 */
  async upsertAiFacts(assessmentId: string, upserts: AiFactUpsert[]): Promise<void> {
    if (upserts.length === 0) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const u of upserts) {
        await client.query(
          `INSERT INTO kaizen_assessment_facts
             (assessment_id, item_code, catalog_version, ai_value, ai_standard_code, ai_confidence,
              ai_evidence_quote, ai_evidence_source_type, ai_flag, ai_followup_question,
              ai_in_focus, ai_focus_reason, ai_extracted_at, ai_run_seq)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), $13)
           ON CONFLICT (assessment_id, item_code) DO UPDATE SET
             catalog_version = EXCLUDED.catalog_version,
             ai_value = EXCLUDED.ai_value,
             ai_standard_code = EXCLUDED.ai_standard_code,
             ai_confidence = EXCLUDED.ai_confidence,
             ai_evidence_quote = EXCLUDED.ai_evidence_quote,
             ai_evidence_source_type = EXCLUDED.ai_evidence_source_type,
             ai_flag = EXCLUDED.ai_flag,
             ai_followup_question = EXCLUDED.ai_followup_question,
             ai_in_focus = EXCLUDED.ai_in_focus,
             ai_focus_reason = EXCLUDED.ai_focus_reason,
             ai_extracted_at = now(),
             ai_run_seq = EXCLUDED.ai_run_seq,
             updated_at = now()`,
          [
            assessmentId,
            u.itemCode,
            u.catalogVersion,
            u.aiValue,
            u.aiStandardCode,
            u.aiConfidence,
            u.aiEvidenceQuote,
            u.aiEvidenceSourceType,
            u.aiFlag,
            u.aiFollowupQuestion,
            u.aiInFocus,
            u.aiFocusReason,
            u.aiRunSeq,
          ],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** 担当者の承認/修正/保留。存在しない (assessment_id, item_code) は false。 */
  async patchHandlerFact(assessmentId: string, itemCode: string, patch: HandlerFactPatch): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE kaizen_assessment_facts
       SET handler_status = $1,
           handler_value = $2,
           handler_standard_code = $3,
           handler_note = $4,
           handler_by = $5,
           handler_at = now(),
           updated_at = now()
       WHERE assessment_id = $6 AND item_code = $7`,
      [
        patch.handlerStatus,
        patch.handlerValue ?? null,
        patch.handlerStandardCode ?? null,
        patch.handlerNote ?? null,
        patch.handlerBy,
        assessmentId,
        itemCode,
      ],
    );
    return (rowCount ?? 0) > 0;
  }

  async savePreBrief(id: string, preBrief: unknown): Promise<boolean> {
    return this.setJsonbAndStage(id, 'ai_pre_brief', preBrief, 'briefed', ['pre_survey']);
  }

  async saveInterview(id: string, interview: InterviewBlob): Promise<boolean> {
    return this.setJsonbAndStage(id, 'interview', interview, 'interviewing', [
      'pre_survey',
      'briefed',
      'interviewing',
    ]);
  }

  async saveStructure(
    id: string,
    payload: { businesses: unknown[]; roleGap: RoleGapBlob; maturity: MaturityBlob },
  ): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE kaizen_assessments
       SET businesses = $1, role_gap = $2, maturity = $3,
           workflow_stage = CASE WHEN workflow_stage IN ('report_draft','report_final')
                                 THEN workflow_stage ELSE 'structured' END,
           updated_at = now()
       WHERE id = $4`,
      [JSON.stringify(payload.businesses), JSON.stringify(payload.roleGap), JSON.stringify(payload.maturity), id],
    );
    return (rowCount ?? 0) > 0;
  }

  async saveBusinesses(id: string, businesses: unknown[]): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE kaizen_assessments SET businesses = $1, updated_at = now() WHERE id = $2`,
      [JSON.stringify(businesses), id],
    );
    return (rowCount ?? 0) > 0;
  }

  async saveRoleGap(id: string, roleGap: RoleGapBlob): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE kaizen_assessments SET role_gap = $1, updated_at = now() WHERE id = $2`,
      [JSON.stringify(roleGap), id],
    );
    return (rowCount ?? 0) > 0;
  }

  async saveMaturity(id: string, maturity: MaturityBlob): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE kaizen_assessments SET maturity = $1, updated_at = now() WHERE id = $2`,
      [JSON.stringify(maturity), id],
    );
    return (rowCount ?? 0) > 0;
  }

  async saveHypotheses(id: string, hypotheses: unknown[]): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE kaizen_assessments SET kaizen_hypotheses = $1, updated_at = now() WHERE id = $2`,
      [JSON.stringify(hypotheses), id],
    );
    return (rowCount ?? 0) > 0;
  }

  async saveReportDraftGenerated(id: string, reportDraft: unknown, hypotheses: unknown[]): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE kaizen_assessments
       SET report_draft = $1, kaizen_hypotheses = $2,
           workflow_stage = CASE WHEN workflow_stage = 'report_final'
                                 THEN 'report_final' ELSE 'report_draft' END,
           updated_at = now()
       WHERE id = $3`,
      [JSON.stringify(reportDraft), JSON.stringify(hypotheses), id],
    );
    return (rowCount ?? 0) > 0;
  }

  async saveReportDraftEdited(id: string, reportDraft: unknown): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE kaizen_assessments
       SET report_draft = $1, workflow_stage = 'report_final', updated_at = now()
       WHERE id = $2`,
      [JSON.stringify(reportDraft), id],
    );
    return (rowCount ?? 0) > 0;
  }

  async appendAiRunLog(id: string, entry: AiRunLogEntry): Promise<void> {
    await this.pool.query(
      `UPDATE kaizen_assessments
       SET ai_run_log = COALESCE(ai_run_log, '[]'::jsonb) || $1::jsonb,
           updated_at = now()
       WHERE id = $2`,
      [JSON.stringify([entry]), id],
    );
  }

  async updateReviewStatus(id: string, status: ReviewStatus): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE kaizen_assessments SET review_status = $1, updated_at = now() WHERE id = $2`,
      [status, id],
    );
    return (rowCount ?? 0) > 0;
  }

  async updateConversion(
    id: string,
    input: { convertedToAssessment: boolean; assessmentCaseCode: string | null },
  ): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE kaizen_assessments
       SET converted_to_assessment = $1, assessment_case_code = $2, updated_at = now()
       WHERE id = $3`,
      [input.convertedToAssessment, input.assessmentCaseCode, id],
    );
    return (rowCount ?? 0) > 0;
  }

  private async setJsonbAndStage(
    id: string,
    column: 'ai_pre_brief' | 'interview',
    value: unknown,
    nextStage: WorkflowStage,
    advanceFrom: WorkflowStage[],
  ): Promise<boolean> {
    const stageList = advanceFrom.map((s) => `'${s}'`).join(', ');
    const { rowCount } = await this.pool.query(
      `UPDATE kaizen_assessments
       SET ${column} = $1,
           workflow_stage = CASE WHEN workflow_stage IN (${stageList}) THEN $2 ELSE workflow_stage END,
           updated_at = now()
       WHERE id = $3`,
      [JSON.stringify(value), nextStage, id],
    );
    return (rowCount ?? 0) > 0;
  }
}
