import { Router } from 'express';
import { z } from 'zod';
import type { BusinessWebConsultationLeadRepo } from '../services/businessWebConsultationLeadRepo';
const statuses=['new','contacted','scheduled','completed','closed'] as const;
const status=z.enum(statuses);
export function createAdminBusinessWebConsultationLeadRouter(repo:BusinessWebConsultationLeadRepo):Router {
 const r=Router();
 r.get('/',async(req,res)=>{const parsed=status.optional().safeParse(req.query.status);if(!parsed.success){res.status(400).json({error:'Invalid query'});return;}const rows=await repo.list(parsed.data);res.json({items:rows.map((x:any)=>({id:x.id,companyName:x.company_name,personName:x.person_name,status:x.status,scheduledAt:x.scheduled_at,createdAt:x.created_at,direction:x.diagnosis_snapshot.direction,directionStatus:x.diagnosis_snapshot.directionStatus}))});});
 r.get('/:id',async(req,res)=>{const item=await repo.findById(req.params.id);if(!item){res.status(404).json({error:'Not found'});return;}res.json({id:item.id,companyName:item.company_name,personName:item.person_name,email:item.email,phone:item.phone,consultationNote:item.consultation_note,status:item.status,scheduledAt:item.scheduled_at,createdAt:item.created_at,consent:{privacy:item.privacy_consent,diagnosisTransfer:item.diagnosis_transfer_consent,wordingVersion:item.consent_wording_version,consentedAt:item.consented_at},tracking:{utmSource:item.utm_source,utmMedium:item.utm_medium,utmCampaign:item.utm_campaign,utmContent:item.utm_content,utmTerm:item.utm_term,ctaSource:item.cta_source,landingUrl:item.landing_url,referrer:item.referrer},snapshot:item.diagnosis_snapshot,preparation:item.preparation_result});});
 r.patch('/:id/status',async(req,res)=>{const parsed=z.object({status}).safeParse(req.body);if(!parsed.success){res.status(400).json({error:'Invalid request'});return;}const ok=await repo.updateStatus(req.params.id,parsed.data.status);if(!ok){res.status(404).json({error:'Not found'});return;}res.status(204).end();}); return r;
}
