import type { Pool } from 'pg';
import type { AnswerSnapshot, AxisId, SuggestedServiceHit } from '../domain/freeHearingAssessment';

export type ReviewStatus = 'new' | 'contacted' | 'closed';
export type InputSource = 'staff' | 'prospect';

/** scores JSONB 列の中身（軸別素点・正規化スコア・各種フラグ・シートコメント）。 */
export interface AssessmentScores {
  axisRaw: Record<AxisId, number>;
  axisNormalized: Record<AxisId, number>;
  unknownCount: number;
  visibilityGapFlag: boolean;
  securityUrgentFlag: boolean;
  /** 結果シート下部のルールベースコメント（submit時に buildSheetComments で確定・凍結）。 */
  sheetComments: string[];
}

export interface FreeHearingAssessmentInput {
  inputSource: InputSource;
  companyName: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  hearingDate?: string | null; // 'YYYY-MM-DD'
  staffEmail?: string | null;
  sourceIp?: string | null;
  questionSetVersion: string;
  answers: AnswerSnapshot[];
  scores: AssessmentScores;
  suggestedServices: SuggestedServiceHit[];
}

export interface FreeHearingAssessmentListItem {
  id: string;
  inputSource: InputSource;
  companyName: string;
  contactName: string | null;
  hearingDate: string | null;
  staffEmail: string | null;
  scores: AssessmentScores;
  suggestedServices: SuggestedServiceHit[];
  convertedToAssessment: boolean;
  assessmentCaseCode: string | null;
  reviewStatus: ReviewStatus;
  createdAt: string;
}

export interface FreeHearingAssessmentDetail extends FreeHearingAssessmentListItem {
  email: string | null;
  phone: string | null;
  sourceIp: string | null;
  questionSetVersion: string;
  answers: AnswerSnapshot[];
}

interface ListRow {
  id: string;
  input_source: InputSource;
  company_name: string;
  contact_name: string | null;
  hearing_date: string | null;
  staff_email: string | null;
  scores: AssessmentScores;
  suggested_services: SuggestedServiceHit[];
  converted_to_assessment: boolean;
  assessment_case_code: string | null;
  review_status: ReviewStatus;
  created_at: string;
}

interface DetailRow extends ListRow {
  email: string | null;
  phone: string | null;
  source_ip: string | null;
  question_set_version: string;
  answers: AnswerSnapshot[];
}

/**
 * free_hearing_assessments への問い合わせを一手に引き受けるリポジトリ。
 * answers/scores/suggested_services はJSONB列で、node-postgresが自動でJSオブジェクトに
 * デシリアライズして返す（読み取り側でJSON.parseは不要）。書き込み側はJSON.stringifyが必要。
 * hearing_date は ::text にキャストして 'YYYY-MM-DD' 文字列で受け渡す。
 */
export class FreeHearingAssessmentRepo {
  constructor(private readonly pool: Pool) {}

  async insertAssessment(input: FreeHearingAssessmentInput): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO free_hearing_assessments
         (input_source, company_name, contact_name, email, phone, hearing_date, staff_email, source_ip,
          question_set_version, answers, scores, suggested_services)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        input.inputSource,
        input.companyName,
        input.contactName ?? null,
        input.email ?? null,
        input.phone ?? null,
        input.hearingDate ?? null,
        input.staffEmail ?? null,
        input.sourceIp ?? null,
        input.questionSetVersion,
        JSON.stringify(input.answers),
        JSON.stringify(input.scores),
        JSON.stringify(input.suggestedServices),
      ],
    );
    const id = rows[0]?.id;
    if (!id) throw new Error('insertAssessment: insert returned no id');
    return id;
  }

  async listAssessments(opts: {
    status?: ReviewStatus;
    inputSource?: InputSource;
    limit: number;
    offset: number;
  }): Promise<{ items: FreeHearingAssessmentListItem[]; total: number }> {
    const params: unknown[] = [];
    const conditions: string[] = [];
    if (opts.status) {
      params.push(opts.status);
      conditions.push(`review_status = $${params.length}`);
    }
    if (opts.inputSource) {
      params.push(opts.inputSource);
      conditions.push(`input_source = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows: countRows } = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM free_hearing_assessments ${where}`,
      params,
    );
    const total = Number(countRows[0]?.count ?? 0);

    params.push(opts.limit, opts.offset);
    const { rows } = await this.pool.query<ListRow>(
      `SELECT id, input_source, company_name, contact_name, hearing_date::text AS hearing_date, staff_email,
              scores, suggested_services, converted_to_assessment, assessment_case_code, review_status,
              created_at
       FROM free_hearing_assessments
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return { items: rows.map(mapListRow), total };
  }

  async findById(id: string): Promise<FreeHearingAssessmentDetail | null> {
    const { rows } = await this.pool.query<DetailRow>(
      `SELECT id, input_source, company_name, contact_name, email, phone,
              hearing_date::text AS hearing_date, staff_email, source_ip,
              question_set_version, answers, scores, suggested_services,
              converted_to_assessment, assessment_case_code, review_status, created_at
       FROM free_hearing_assessments WHERE id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      ...mapListRow(row),
      email: row.email,
      phone: row.phone,
      sourceIp: row.source_ip,
      questionSetVersion: row.question_set_version,
      answers: row.answers,
    };
  }

  /** 対応状況の更新。存在しないidの場合はfalseを返す（呼び出し側で404にする）。 */
  async updateReviewStatus(id: string, status: ReviewStatus): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'UPDATE free_hearing_assessments SET review_status = $1, updated_at = now() WHERE id = $2',
      [status, id],
    );
    return (rowCount ?? 0) > 0;
  }

  /** 有償アセスメント診断への転換トラッキング（フェーズ1は手動更新）。 */
  async updateConversion(
    id: string,
    input: { convertedToAssessment: boolean; assessmentCaseCode: string | null },
  ): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE free_hearing_assessments
       SET converted_to_assessment = $1, assessment_case_code = $2, updated_at = now()
       WHERE id = $3`,
      [input.convertedToAssessment, input.assessmentCaseCode, id],
    );
    return (rowCount ?? 0) > 0;
  }
}

function mapListRow(row: ListRow): FreeHearingAssessmentListItem {
  return {
    id: row.id,
    inputSource: row.input_source,
    companyName: row.company_name,
    contactName: row.contact_name,
    hearingDate: row.hearing_date,
    staffEmail: row.staff_email,
    scores: row.scores,
    suggestedServices: row.suggested_services,
    convertedToAssessment: row.converted_to_assessment,
    assessmentCaseCode: row.assessment_case_code,
    reviewStatus: row.review_status,
    createdAt: row.created_at,
  };
}
