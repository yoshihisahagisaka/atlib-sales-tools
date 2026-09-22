import type {Pool} from 'pg'; import type {InfraVisionPartnerLeadInput,InfraVisionPartnerLeadStatus} from '../domain/infravisionPartnerLead';
export class InfraVisionPartnerLeadRepo {
 constructor(private readonly pool:Pool){}
 async insert(input:InfraVisionPartnerLeadInput):Promise<string>{const {rows}=await this.pool.query<{id:string}>(`INSERT INTO infravision_partner_leads
 (company_name,contact_name,email,phone,business,inquiry,utm_source,utm_medium,utm_campaign,utm_content,utm_term,cta_source,landing_url,referrer,source_ip)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,[input.companyName,input.contactName,input.email,input.phone??null,input.business??null,input.inquiry??null,input.utmSource??null,input.utmMedium??null,input.utmCampaign??null,input.utmContent??null,input.utmTerm??null,input.ctaSource??null,input.landingUrl??null,input.referrer??null,input.sourceIp??null]);if(!rows[0]?.id)throw new Error('lead insert returned no id');return rows[0].id}
 async markScheduled(id:string,eventId:string|null,scheduledAt:string|null):Promise<boolean>{const {rowCount}=await this.pool.query(`UPDATE infravision_partner_leads SET status='scheduled',timerex_event_id=COALESCE($2,timerex_event_id),scheduled_at=COALESCE($3::timestamptz,scheduled_at),updated_at=now() WHERE id=$1`,[id,eventId,scheduledAt]);return (rowCount??0)>0}
 async list(limit=100){const {rows}=await this.pool.query(`SELECT * FROM infravision_partner_leads ORDER BY created_at DESC LIMIT $1`,[limit]);return rows}
 async updateStatus(id:string,status:InfraVisionPartnerLeadStatus):Promise<boolean>{const {rowCount}=await this.pool.query('UPDATE infravision_partner_leads SET status=$2,updated_at=now() WHERE id=$1',[id,status]);return (rowCount??0)>0}
}
