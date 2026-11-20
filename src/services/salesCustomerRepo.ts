import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { CreateCompanyInput } from '../domain/freeDiagnosisRuleBasedV1';

export class SalesCustomerError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
  }
}

export type SalesCustomerAttribution = CreateCompanyInput['attribution'];

export interface ExistingCustomerActivityInput {
  companyId: string;
  contactId: string;
  selectedService: 'IT_KAIZEN' | 'BUSINESS_WEB';
  referralPersonName?: string | null;
  attribution?: SalesCustomerAttribution;
}

export interface NewCustomerInput { name: string; corporateNumber?: string | null }
export interface NewContactInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
}

// Shared customer selection only. Service-specific Cases and lifecycle remain
// owned by the selected service.
export class SalesCustomerRepo {
  constructor(private readonly pool: Pool) {}

  async searchCompanies(query: string) {
    const { rows } = await this.pool.query(
      `SELECT id, name, corporate_number AS "corporateNumber",
              owner_user_id AS "ownerUserId", created_at AS "createdAt"
         FROM company
        WHERE strpos(lower(name), lower($1)) > 0 OR corporate_number = $1
        ORDER BY CASE WHEN lower(name) = lower($1) THEN 0 ELSE 1 END, name, id
        LIMIT 30`,
      [query],
    );
    return rows;
  }

  async listContacts(companyId: string) {
    const company = await this.pool.query('SELECT id FROM company WHERE id=$1', [companyId]);
    if (!company.rows.length) throw new SalesCustomerError(404, 'COMPANY_NOT_FOUND');
    const { rows } = await this.pool.query(
      `SELECT id, company_id AS "companyId", name, email, phone,
              job_title AS "jobTitle", created_at AS "createdAt"
         FROM contact WHERE company_id=$1 ORDER BY name, id LIMIT 200`,
      [companyId],
    );
    return rows;
  }

  async createCompany(input: NewCustomerInput, actor: string) {
    const { rows } = await this.pool.query(
      `INSERT INTO company (id,name,corporate_number,created_by_user_id,owner_user_id)
       VALUES ($1,$2,$3,$4,$4)
       RETURNING id,name,corporate_number AS "corporateNumber",owner_user_id AS "ownerUserId"`,
      [randomUUID(), input.name, input.corporateNumber ?? null, actor],
    );
    return rows[0];
  }

  async createContact(companyId: string, input: NewContactInput) {
    const { rows } = await this.pool.query(
      `INSERT INTO contact (id,company_id,name,email,phone,job_title)
       SELECT $1,c.id,$3,$4,$5,$6 FROM company c WHERE c.id=$2
       RETURNING id,company_id AS "companyId",name,email,phone,job_title AS "jobTitle"`,
      [randomUUID(), companyId, input.name, input.email ?? null, input.phone ?? null, input.jobTitle ?? null],
    );
    if (!rows.length) throw new SalesCustomerError(404, 'COMPANY_NOT_FOUND');
    return rows[0];
  }

  async createActivityForExisting(input: ExistingCustomerActivityInput, actor: string) {
    const attribution = input.attribution;
    const { rows } = await this.pool.query(
      `INSERT INTO sales_activity (
         id,company_id,primary_contact_id,selected_service,created_by_user_id,owner_user_id,
         acquisition_source_type,acquisition_source_name,utm_source,utm_medium,utm_campaign,
         utm_content,utm_term,landing_url,referrer,referral_person_name)
       SELECT $1,c.id,ct.id,$4,$5,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
         FROM company c JOIN contact ct ON ct.company_id=c.id AND ct.id=$3 WHERE c.id=$2
       RETURNING id,company_id AS "companyId",primary_contact_id AS "contactId",
                 selected_service AS "selectedService"`,
      [randomUUID(), input.companyId, input.contactId, input.selectedService, actor,
        attribution?.acquisitionSourceType ?? null, attribution?.acquisitionSourceName ?? null,
        attribution?.utmSource ?? null, attribution?.utmMedium ?? null, attribution?.utmCampaign ?? null,
        attribution?.utmContent ?? null, attribution?.utmTerm ?? null, attribution?.landingUrl ?? null,
        attribution?.referrer ?? null, input.referralPersonName ?? null],
    );
    if (!rows.length) {
      const company = await this.pool.query('SELECT id FROM company WHERE id=$1', [input.companyId]);
      if (!company.rows.length) throw new SalesCustomerError(404, 'COMPANY_NOT_FOUND');
      throw new SalesCustomerError(409, 'CONTACT_COMPANY_MISMATCH');
    }
    return { salesActivityId: rows[0].id, companyId: rows[0].companyId,
      contactId: rows[0].contactId, selectedService: rows[0].selectedService };
  }
}
