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
  acquisitionSourceType: string;
  acquisitionSourceName: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  landingUrl: string | null;
  referrer: string | null;
}

function mapAttribution(row: Record<string, unknown>): MarketingAttribution | null {
  if (!row.acquisition_source_type) return null;
  return { acquisitionSourceType: row.acquisition_source_type as string, acquisitionSourceName: row.acquisition_source_name as string,
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
    return { companyId, contactId, salesActivityId, attribution: attribution ? {
      acquisitionSourceType: attribution.acquisitionSourceType!, acquisitionSourceName: attribution.acquisitionSourceName!,
      utmSource: attribution.utmSource ?? null, utmMedium: attribution.utmMedium ?? null,
      utmCampaign: attribution.utmCampaign ?? null, utmContent: attribution.utmContent ?? null,
      utmTerm: attribution.utmTerm ?? null, landingUrl: attribution.landingUrl ?? null, referrer: attribution.referrer ?? null,
    } : null, referralPersonName: input.referralPersonName ?? null };
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

  async listSalesActivities(filters: { acquisitionSourceName?: string; utmCampaign?: string }) {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT s.*, c.name AS company_name, latest_case.id AS diagnosis_case_id, latest_case.status AS diagnosis_case_status
       FROM sales_activity s JOIN company c ON c.id=s.company_id
       LEFT JOIN LATERAL (
         SELECT id,status FROM it_management_diagnosis_case_v2
         WHERE sales_activity_id=s.id ORDER BY created_at DESC LIMIT 1
       ) latest_case ON true
       WHERE ($1::text IS NULL OR s.acquisition_source_name=$1) AND ($2::text IS NULL OR s.utm_campaign=$2)
       ORDER BY s.created_at DESC, s.id DESC LIMIT 100`, [filters.acquisitionSourceName ?? null, filters.utmCampaign ?? null],
    );
    return rows.map(row => ({ id: row.id, companyName: row.company_name, selectedService: row.selected_service,
      createdAt: row.created_at, attribution: mapAttribution(row), diagnosisCaseId: row.diagnosis_case_id,
      diagnosisCaseStatus: row.diagnosis_case_status }));
  }
}
