export type InfraVisionPartnerLeadStatus='schedule_pending'|'scheduled'|'meeting_completed'|'partnered'|'lost';
export interface InfraVisionPartnerLeadInput {
 companyName:string; contactName:string; email:string; phone?:string|null; business?:string|null; inquiry?:string|null;
 utmSource?:string|null; utmMedium?:string|null; utmCampaign?:string|null; utmContent?:string|null; utmTerm?:string|null;
 ctaSource?:string|null; landingUrl?:string|null; referrer?:string|null; sourceIp?:string|null;
}
