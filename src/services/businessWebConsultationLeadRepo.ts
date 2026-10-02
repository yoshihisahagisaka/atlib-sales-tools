import type { Pool } from 'pg';
import type { ConsultationPreparation, ConsultationLeadStatus, DiagnosisSnapshot } from '../domain/businessWebConsultation';

export interface BusinessWebConsultationLeadInput {
  companyName: string; personName: string; email: string; phone?: string; consultationNote?: string; privacyConsent: true; diagnosisTransferConsent: true;
  consentWordingVersion: string; idempotencyKey: string; snapshot: DiagnosisSnapshot; preparation: ConsultationPreparation;
  utmSource?: string; utmMedium?: string; utmCampaign?: string; utmContent?: string; utmTerm?: string; ctaSource?: string; landingUrl?: string; referrer?: string; sourceIp?: string;
}
export class BusinessWebConsultationLeadRepo {
  constructor(private readonly pool: Pool) {}
  async insertOrGet(input: BusinessWebConsultationLeadInput): Promise<{ id: string; created: boolean }> {
    const result = await this.pool.query<{ id: string }>(`INSERT INTO business_web_consultation_leads
      (company_name,person_name,email,phone,consultation_note,privacy_consent,diagnosis_transfer_consent,consent_wording_version,idempotency_key,diagnosis_snapshot,preparation_result,utm_source,utm_medium,utm_campaign,utm_content,utm_term,cta_source,landing_url,referrer,source_ip)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`, [input.companyName,input.personName,input.email,input.phone ?? null,input.consultationNote ?? null,input.privacyConsent,input.diagnosisTransferConsent,input.consentWordingVersion,input.idempotencyKey,JSON.stringify(input.snapshot),JSON.stringify(input.preparation),input.utmSource ?? null,input.utmMedium ?? null,input.utmCampaign ?? null,input.utmContent ?? null,input.utmTerm ?? null,input.ctaSource ?? null,input.landingUrl ?? null,input.referrer ?? null,input.sourceIp ?? null]);
    if (result.rows[0]?.id) return { id: result.rows[0].id, created: true };
    const existing = await this.pool.query<{ id: string }>('SELECT id FROM business_web_consultation_leads WHERE idempotency_key=$1', [input.idempotencyKey]);
    if (!existing.rows[0]?.id) throw new Error('consultation lead idempotency lookup failed');
    return { id: existing.rows[0].id, created: false };
  }
  async updateStatus(id: string, status: ConsultationLeadStatus): Promise<boolean> { const result = await this.pool.query('UPDATE business_web_consultation_leads SET status=$2,updated_at=now() WHERE id=$1', [id,status]); return (result.rowCount ?? 0) > 0; }
  async list(status?: ConsultationLeadStatus) { const q=status?'WHERE status=$1':''; const r=await this.pool.query(`SELECT id,company_name,person_name,status,scheduled_at,diagnosis_snapshot,created_at FROM business_web_consultation_leads ${q} ORDER BY created_at DESC LIMIT 200`,status?[status]:[]); return r.rows; }
  async findById(id:string) { const r=await this.pool.query('SELECT * FROM business_web_consultation_leads WHERE id=$1',[id]); return r.rows[0]??null; }
}
