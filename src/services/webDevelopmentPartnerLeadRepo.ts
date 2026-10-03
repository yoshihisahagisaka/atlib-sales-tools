import type {Pool} from 'pg'; import type {WebDevelopmentPartnerLeadInput,WebDevelopmentPartnerLeadStatus} from '../domain/webDevelopmentPartnerLead';
export class WebDevelopmentPartnerLeadRepo {
 constructor(private readonly pool:Pool){}
 async insert(input:WebDevelopmentPartnerLeadInput):Promise<string>{const {rows}=await this.pool.query<{id:string}>(`INSERT INTO web_development_partner_leads
 (company_name,contact_name,email,phone,consultation_type,inquiry,utm_source,utm_medium,utm_campaign,utm_content,utm_term,cta_source,landing_url,referrer,source_ip)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,[input.companyName,input.contactName,input.email,input.phone??null,input.consultationType??null,input.inquiry??null,input.utmSource??null,input.utmMedium??null,input.utmCampaign??null,input.utmContent??null,input.utmTerm??null,input.ctaSource??null,input.landingUrl??null,input.referrer??null,input.sourceIp??null]);if(!rows[0]?.id)throw new Error('lead insert returned no id');return rows[0].id}
 async markScheduled(id:string,eventId:string|null,scheduledAt:string|null):Promise<boolean>{const {rowCount}=await this.pool.query(`UPDATE web_development_partner_leads SET status='scheduled',timerex_event_id=COALESCE($2,timerex_event_id),scheduled_at=COALESCE($3::timestamptz,scheduled_at),updated_at=now() WHERE id=$1`,[id,eventId,scheduledAt]);return (rowCount??0)>0}
 async list(limit=100){const {rows}=await this.pool.query(`SELECT * FROM web_development_partner_leads ORDER BY created_at DESC LIMIT $1`,[limit]);return rows}
 async updateStatus(id:string,status:WebDevelopmentPartnerLeadStatus):Promise<boolean>{const {rowCount}=await this.pool.query('UPDATE web_development_partner_leads SET status=$2,updated_at=now() WHERE id=$1',[id,status]);return (rowCount??0)>0}
}




