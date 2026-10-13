import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { CreateCompanyInput } from '../domain/freeDiagnosisRuleBasedV1';

// Sales Launcher: Company / Contact / Activity only. Owns no Business Web or IT-KAIZEN
// domain data ("共通入口はサービスを起動する、サービスの中身は共通化しない").
export interface SalesActivityCreated {
  companyId: string;
  contactId: string;
  salesActivityId: string;
  attribution: MarketingAttribution | null;
  referralPersonName: string | null;
}

export interface MarketingAttribution {
  acquisitionSourceType: string | null;
  acquisitionSourceName: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  landingUrl: string | null;
  referrer: string | null;
}

function mapAttribution(row: Record<string, unknown>): MarketingAttribution | null {
  const observed = ['acquisition_source_type','acquisition_source_name','utm_source','utm_medium','utm_campaign','utm_content','utm_term','landing_url','referrer']
    .some(column => row[column] != null);
  if (!observed) return null;
  return { acquisitionSourceType: row.acquisition_source_type as string | null, acquisitionSourceName: row.acquisition_source_name as string | null,
    utmSource: row.utm_source as string | null, utmMedium: row.utm_medium as string | null,
    utmCampaign: row.utm_campaign as string | null, utmContent: row.utm_content as string | null,
    utmTerm: row.utm_term as string | null, landingUrl: row.landing_url as string | null, referrer: row.referrer as string | null };
}

export class FreeDiagnosisSalesLauncherRepo {
  constructor(private readonly pool: Pool) {}

  async createSalesActivity(input: CreateCompanyInput, staffEmail: string): Promise<SalesActivityCreated> {
    const companyId = randomUUID();
    const contactId = randomUUID();
    const salesActivityId = randomUUID();
    await this.pool.query(
      `INSERT INTO company (id,name,corporate_number,created_by_user_id,owner_user_id) VALUES ($1,$2,$3,$4,$4)`,
      [companyId, input.name, input.corporateNumber ?? null, staffEmail],
    );
    await this.pool.query(
      `INSERT INTO contact (id,company_id,name,email,phone,job_title) VALUES ($1,$2,$3,$4,$5,$6)`,
      [contactId, companyId, input.contact.name, input.contact.email ?? null, input.contact.phone ?? null, input.contact.jobTitle ?? null],
    );
    const attribution = input.attribution ?? null;
    await this.pool.query(
      `INSERT INTO sales_activity (id,company_id,primary_contact_id,selected_service,created_by_user_id,owner_user_id,
        acquisition_source_type,acquisition_source_name,utm_source,utm_medium,utm_campaign,utm_content,utm_term,landing_url,referrer,referral_person_name)
       VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [salesActivityId, companyId, contactId, input.selectedService, staffEmail,
        attribution?.acquisitionSourceType ?? null, attribution?.acquisitionSourceName ?? null,
        attribution?.utmSource ?? null, attribution?.utmMedium ?? null, attribution?.utmCampaign ?? null,
        attribution?.utmContent ?? null, attribution?.utmTerm ?? null, attribution?.landingUrl ?? null, attribution?.referrer ?? null,
        input.referralPersonName ?? null],
    );
    const savedAttribution: MarketingAttribution | null = attribution ? {
      acquisitionSourceType: attribution.acquisitionSourceType ?? null, acquisitionSourceName: attribution.acquisitionSourceName ?? null,
      utmSource: attribution.utmSource ?? null, utmMedium: attribution.utmMedium ?? null,
      utmCampaign: attribution.utmCampaign ?? null, utmContent: attribution.utmContent ?? null,
      utmTerm: attribution.utmTerm ?? null, landingUrl: attribution.landingUrl ?? null, referrer: attribution.referrer ?? null,
    } : null;
    return { companyId, contactId, salesActivityId,
      attribution: savedAttribution && Object.values(savedAttribution).some(value => value != null) ? savedAttribution : null,
      referralPersonName: input.referralPersonName ?? null };
  }

  async getSalesActivity(id: string): Promise<{ id: string; companyId: string; primaryContactId: string | null; selectedService: string; attribution: MarketingAttribution | null; referralPersonName: string | null } | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM sales_activity WHERE id = $1`, [id],
    );
    const row = rows[0];
    if (!row) return null;
    return { id: row.id as string, companyId: row.company_id as string, primaryContactId: row.primary_contact_id as string | null,
      selectedService: row.selected_service as string, attribution: mapAttribution(row), referralPersonName: row.referral_person_name as string | null };
  }

  async listSalesActivities(filters: { acquisitionSourceName?: string; utmCampaign?: string; initiativeId?: string }) {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT s.*, c.name AS company_name, contact.name AS contact_name,
              latest_case.id AS diagnosis_case_id, latest_case.status AS diagnosis_case_status, latest_case.version AS diagnosis_case_version,
              latest_case.created_at AS diagnosis_case_created_at, latest_case.updated_at AS diagnosis_case_updated_at,
              design_v2_original.id AS design_v2_original_id, design_v2_original.entry_channel AS design_v2_entry_channel,
              intake_origin.entry_channel AS v1_entry_channel,
              latest_design_v2_report.id AS design_v2_report_id, latest_design_v2_report.version AS design_v2_report_version,
              latest_design_v2_report.status AS design_v2_report_status,
              matched_initiative.initiative_id, matched_initiative.initiative_name, matched_initiative.is_active AS initiative_is_active
       FROM sales_activity s JOIN company c ON c.id=s.company_id
       LEFT JOIN contact ON contact.id=s.primary_contact_id
       LEFT JOIN LATERAL (
         SELECT id,status,version,created_at,updated_at FROM it_management_diagnosis_case_v2
         WHERE sales_activity_id=s.id ORDER BY created_at DESC LIMIT 1
       ) latest_case ON true
       LEFT JOIN it_management_diagnosis_original_survey_snapshot_v2 design_v2_original
         ON design_v2_original.case_id=latest_case.id
       LEFT JOIN LATERAL (
         SELECT raw_value_json->'provenance'->>'channel' AS entry_channel
         FROM hearing_intake_response_v2
         WHERE case_id=latest_case.id ORDER BY created_at ASC LIMIT 1
       ) intake_origin ON true
       LEFT JOIN LATERAL (
         SELECT id,version,status FROM diagnosis_reports
          WHERE it_management_diagnosis_case_v2_id=latest_case.id AND policy_version='design-v2'
          ORDER BY version DESC LIMIT 1
       ) latest_design_v2_report ON true
       LEFT JOIN LATERAL (
         SELECT initiative_id,initiative_name,is_active FROM marketing_initiative i
         WHERE i.service_key=s.selected_service
           AND s.utm_source IS NOT DISTINCT FROM i.utm_source AND s.utm_medium IS NOT DISTINCT FROM i.utm_medium
           AND s.utm_campaign IS NOT DISTINCT FROM i.utm_campaign AND s.utm_content IS NOT DISTINCT FROM i.utm_content
           AND s.utm_term IS NOT DISTINCT FROM i.utm_term
           AND (i.is_active OR s.created_at < i.updated_at)
         LIMIT 1
       ) matched_initiative ON true
       WHERE ($1::text IS NULL OR s.acquisition_source_name=$1) AND ($2::text IS NULL OR s.utm_campaign=$2)
         AND ($3::uuid IS NULL OR matched_initiative.initiative_id=$3)
       ORDER BY s.created_at DESC, s.id DESC LIMIT 100`,
      [filters.acquisitionSourceName ?? null, filters.utmCampaign ?? null, filters.initiativeId ?? null],
    );
    return rows.map(row => ({ id: row.id, companyName: row.company_name, contactName: row.contact_name ?? null, selectedService: row.selected_service,
      createdAt: row.created_at, updatedAt: row.diagnosis_case_updated_at ?? row.created_at,
      attribution: mapAttribution(row), diagnosisCaseId: row.diagnosis_case_id,
      diagnosisCaseStatus: row.diagnosis_case_status, diagnosisCaseVersion: row.diagnosis_case_version,
      receivedAt: row.diagnosis_case_created_at ?? row.created_at, isDesignV2: row.design_v2_original_id != null,
      entryChannel: row.design_v2_entry_channel ?? row.v1_entry_channel ?? null,
      marketingInitiative: row.initiative_id ? { id: row.initiative_id, name: row.initiative_name, isActive: row.initiative_is_active } : null,
      latestDesignV2Report: row.design_v2_report_id ? { id: row.design_v2_report_id, version: row.design_v2_report_version, status: row.design_v2_report_status } : null }));
  }
}
