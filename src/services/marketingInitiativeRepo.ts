import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export type MarketingInitiativeInput = {
  initiativeName: string;
  serviceKey: 'IT_KAIZEN' | 'BUSINESS_WEB';
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
};

export class MarketingInitiativeError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

const hearingCompletedStatuses = [
  'HEARING_COMPLETED','RULE_ANALYSIS_IN_PROGRESS','HUMAN_REVIEW_REQUIRED','ANALYSIS_REJECTED','ANALYSIS_APPROVED',
  'PRELIMINARY_SCOPE_READY','REPORT_REVIEW_REQUIRED','REPORT_APPROVED','FEEDBACK_PENDING','FEEDBACK_COMPLETED','CLOSED',
];

function map(row: Record<string, unknown>) {
  return {
    initiativeId: row.initiative_id, initiativeName: row.initiative_name, serviceKey: row.service_key,
    utmSource: row.utm_source, utmMedium: row.utm_medium, utmCampaign: row.utm_campaign,
    utmContent: row.utm_content, utmTerm: row.utm_term, isActive: row.is_active,
    createdBy: row.created_by, updatedBy: row.updated_by, createdAt: row.created_at, updatedAt: row.updated_at,
    kpi: {
      applications: Number(row.applications ?? 0), customerSelf: Number(row.customer_self ?? 0),
      staffProxy: Number(row.staff_proxy ?? 0), hearingCompleted: Number(row.hearing_completed ?? 0),
      reportCreated: Number(row.report_created ?? 0), reportApproved: Number(row.report_approved ?? 0),
    },
  };
}

export class MarketingInitiativeRepo {
  constructor(private readonly pool: Pool) {}

  async create(input: MarketingInitiativeInput, actor: string) {
    try {
      const { rows } = await this.pool.query<Record<string, unknown>>(
        `INSERT INTO marketing_initiative
          (initiative_id,initiative_name,service_key,utm_source,utm_medium,utm_campaign,utm_content,utm_term,created_by,updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING *`,
        [randomUUID(), input.initiativeName, input.serviceKey, input.utmSource ?? null, input.utmMedium ?? null,
          input.utmCampaign ?? null, input.utmContent ?? null, input.utmTerm ?? null, actor],
      );
      return map(rows[0]!);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new MarketingInitiativeError(409, 'INITIATIVE_UTM_ALREADY_REGISTERED');
      throw error;
    }
  }

  async deactivate(id: string, actor: string) {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `UPDATE marketing_initiative SET is_active=false,updated_by=$2,updated_at=now()
       WHERE initiative_id=$1 AND is_active=true RETURNING *`, [id, actor],
    );
    if (rows[0]) return map(rows[0]);
    const existing = await this.pool.query<Record<string, unknown>>(`SELECT * FROM marketing_initiative WHERE initiative_id=$1`, [id]);
    if (!existing.rows[0]) throw new MarketingInitiativeError(404, 'INITIATIVE_NOT_FOUND');
    return map(existing.rows[0]!);
  }

  async list() {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT i.*,
         count(DISTINCT s.id) FILTER (WHERE latest_case.id IS NULL OR latest_case.is_internal_test=false) AS applications,
         count(DISTINCT latest_case.id) FILTER (WHERE latest_case.is_internal_test=false AND original.entry_channel='CUSTOMER_SELF') AS customer_self,
         count(DISTINCT latest_case.id) FILTER (WHERE latest_case.is_internal_test=false AND original.entry_channel='STAFF_PROXY') AS staff_proxy,
         count(DISTINCT latest_case.id) FILTER (WHERE latest_case.is_internal_test=false AND latest_case.status=ANY($1::text[])) AS hearing_completed,
         count(DISTINCT latest_case.id) FILTER (WHERE latest_case.is_internal_test=false AND latest_report.id IS NOT NULL) AS report_created,
         count(DISTINCT latest_case.id) FILTER (WHERE latest_case.is_internal_test=false AND latest_report.status IN ('APPROVED','DELIVERED')) AS report_approved
       FROM marketing_initiative i
       LEFT JOIN sales_activity s ON s.selected_service=i.service_key
        AND s.utm_source IS NOT DISTINCT FROM i.utm_source AND s.utm_medium IS NOT DISTINCT FROM i.utm_medium
        AND s.utm_campaign IS NOT DISTINCT FROM i.utm_campaign AND s.utm_content IS NOT DISTINCT FROM i.utm_content
        AND s.utm_term IS NOT DISTINCT FROM i.utm_term
        AND (i.is_active OR s.created_at < i.updated_at)
       LEFT JOIN it_management_diagnosis_case_v2 latest_case ON latest_case.sales_activity_id=s.id
       LEFT JOIN it_management_diagnosis_original_survey_snapshot_v2 original ON original.case_id=latest_case.id
       LEFT JOIN LATERAL (
         SELECT id,status FROM diagnosis_reports WHERE it_management_diagnosis_case_v2_id=latest_case.id AND policy_version='design-v2'
         ORDER BY version DESC LIMIT 1
       ) latest_report ON true
       GROUP BY i.initiative_id ORDER BY i.created_at DESC,i.initiative_id DESC`, [hearingCompletedStatuses],
    );
    return rows.map(map);
  }
}
