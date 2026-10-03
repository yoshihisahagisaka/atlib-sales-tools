import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { CreateCompanyInput } from '../domain/freeDiagnosisRuleBasedV1';

// Sales Launcher: Company / Contact / Activity only. Owns no Business Web or IT-KAIZEN
// domain data ("共通入口はサービスを起動する、サービスの中身は共通化しない").
export interface SalesActivityCreated {
  companyId: string;
  contactId: string;
  salesActivityId: string;
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
    await this.pool.query(
      `INSERT INTO sales_activity (id,company_id,primary_contact_id,selected_service,created_by_user_id,owner_user_id)
       VALUES ($1,$2,$3,$4,$5,$5)`,
      [salesActivityId, companyId, contactId, input.selectedService, staffEmail],
    );
    return { companyId, contactId, salesActivityId };
  }

  async getSalesActivity(id: string): Promise<{ id: string; companyId: string; primaryContactId: string | null; selectedService: string } | null> {
    const { rows } = await this.pool.query<{ id: string; company_id: string; primary_contact_id: string | null; selected_service: string }>(
      `SELECT id, company_id, primary_contact_id, selected_service FROM sales_activity WHERE id = $1`, [id],
    );
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, companyId: row.company_id, primaryContactId: row.primary_contact_id, selectedService: row.selected_service };
  }
}
