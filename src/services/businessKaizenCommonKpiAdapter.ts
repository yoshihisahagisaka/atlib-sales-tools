import type { Pool } from 'pg';

export type BusinessKaizenCommonMilestoneCode =
  | 'ENTRY_ACCEPTED'
  | 'MEETING_SCHEDULED'
  | 'PAID_SERVICE_PROPOSED'
  | 'PAID_SERVICE_WON';

export type BusinessKaizenCommonKpiSubject = {
  ref: {
    businessLine: 'BUSINESS_KAIZEN';
    subjectType: 'BUSINESS_DIAGNOSIS';
    subjectId: string;
  };
  companyId: string | null;
  contactId: string | null;
  enteredAt: string;
  entryChannel: 'CUSTOMER_SELF' | 'STAFF_PROXY';
  acquisitionChannel: 'WEB' | 'REFERRAL' | 'EVENT' | 'OUTBOUND' | 'PARTNER' | 'EXISTING_CUSTOMER' | 'OTHER' | null;
  marketingInitiativeId: null;
  attribution: {
    source: string | null;
    medium: string | null;
    campaign: string | null;
    content: string | null;
    term: string | null;
    referrer: string | null;
    landingPath: string | null;
  };
  ownerId: string | null;
  milestones: Array<{ code: BusinessKaizenCommonMilestoneCode; firstReachedAt: string }>;
  outcomeCategory: null;
  dispositionReason: string | null;
  closedAt: string | null;
  commercialEvents: Array<{
    eventId: string;
    type: 'PROPOSED' | 'WON';
    /** GAP: free-form service_name has no approved common serviceCode mapping. */
    serviceCode: null;
    sourceServiceName: string;
    occurredAt: string;
    amount: number | null;
    currency: string | null;
  }>;
  drillDownPath: string;
};

type SourceRow = Record<string, any>;
const milestoneOrder: BusinessKaizenCommonMilestoneCode[] = [
  'ENTRY_ACCEPTED', 'MEETING_SCHEDULED', 'PAID_SERVICE_PROPOSED', 'PAID_SERVICE_WON',
];

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function landingPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = value.startsWith('/') ? new URL(value, 'https://adapter.invalid') : new URL(value);
    return url.pathname;
  } catch {
    return null;
  }
}

export class BusinessKaizenCommonKpiAdapter {
  constructor(private readonly pool: Pool) {}

  async listAcceptedSubjects(): Promise<BusinessKaizenCommonKpiSubject[]> {
    const result = await this.pool.query<SourceRow>(`
      WITH accepted AS (
        SELECT diagnosis_id,min(reached_at) AS accepted_at
          FROM business_kaizen_diagnosis_stage_history
         WHERE stage='ACCEPTED'
         GROUP BY diagnosis_id
      )
      SELECT d.id,d.entry_channel,d.company_id,d.contact_id,d.owner_user_email,
             d.outcome_reason,d.closed_at,a.accepted_at,
             l.utm_source AS lead_utm_source,l.utm_medium AS lead_utm_medium,
             l.utm_campaign AS lead_utm_campaign,l.utm_content AS lead_utm_content,
             l.utm_term AS lead_utm_term,l.referrer AS lead_referrer,l.landing_url AS lead_landing_url,
             s.acquisition_source_type AS activity_acquisition_source_type,
             s.utm_source AS activity_utm_source,s.utm_medium AS activity_utm_medium,
             s.utm_campaign AS activity_utm_campaign,s.utm_content AS activity_utm_content,
             s.utm_term AS activity_utm_term,s.referrer AS activity_referrer,s.landing_url AS activity_landing_url,
             COALESCE((
               SELECT jsonb_agg(jsonb_build_object('stage',h.stage,'reachedAt',h.reached_at)
                                ORDER BY h.reached_at,h.id)
                 FROM business_kaizen_diagnosis_stage_history h WHERE h.diagnosis_id=d.id
             ),'[]'::jsonb) AS stage_history,
             COALESCE((
               SELECT jsonb_agg(jsonb_build_object('id',e.id,'type',e.event_type,
                         'serviceName',e.service_name,'occurredAt',e.occurred_at,
                         'amount',e.amount,'currency',e.currency)
                                ORDER BY e.occurred_at,e.id)
                 FROM business_kaizen_commercial_events e WHERE e.diagnosis_id=d.id
             ),'[]'::jsonb) AS commercial_events
        FROM accepted a
        JOIN business_kaizen_diagnoses d ON d.id=a.diagnosis_id
        LEFT JOIN business_web_consultation_leads l ON l.id=d.consultation_lead_id
        LEFT JOIN sales_activity s ON s.id=d.sales_activity_id
       ORDER BY a.accepted_at,d.id
    `);
    return result.rows.map(row => this.map(row));
  }

  private map(row: SourceRow): BusinessKaizenCommonKpiSubject {
    const self = row.entry_channel === 'CUSTOMER_SELF';
    const prefix = self ? 'lead_' : 'activity_';
    const stages = Array.isArray(row.stage_history) ? row.stage_history : [];
    const sourceEvents = Array.isArray(row.commercial_events) ? row.commercial_events : [];
    const milestones = new Map<BusinessKaizenCommonMilestoneCode, string>();
    milestones.set('ENTRY_ACCEPTED', iso(row.accepted_at));
    for (const stage of stages) {
      if (stage.stage === 'SCHEDULED' && !milestones.has('MEETING_SCHEDULED'))
        milestones.set('MEETING_SCHEDULED', iso(stage.reachedAt));
    }
    for (const event of sourceEvents) {
      const code = event.type === 'PROPOSED' ? 'PAID_SERVICE_PROPOSED'
        : event.type === 'WON' ? 'PAID_SERVICE_WON' : null;
      if (code && !milestones.has(code)) milestones.set(code, iso(event.occurredAt));
    }
    const subjectId = String(row.id);
    return {
      ref: { businessLine: 'BUSINESS_KAIZEN', subjectType: 'BUSINESS_DIAGNOSIS', subjectId },
      companyId: self ? null : row.company_id ?? null,
      contactId: self ? null : row.contact_id ?? null,
      enteredAt: iso(row.accepted_at),
      entryChannel: row.entry_channel,
      acquisitionChannel: self ? null : row.activity_acquisition_source_type ?? null,
      marketingInitiativeId: null,
      attribution: {
        source: row[`${prefix}utm_source`] ?? null,
        medium: row[`${prefix}utm_medium`] ?? null,
        campaign: row[`${prefix}utm_campaign`] ?? null,
        content: row[`${prefix}utm_content`] ?? null,
        term: row[`${prefix}utm_term`] ?? null,
        referrer: row[`${prefix}referrer`] ?? null,
        landingPath: landingPath(row[`${prefix}landing_url`]),
      },
      ownerId: row.owner_user_email ?? null,
      milestones: milestoneOrder.flatMap(code => {
        const firstReachedAt = milestones.get(code);
        return firstReachedAt ? [{ code, firstReachedAt }] : [];
      }),
      outcomeCategory: null,
      dispositionReason: row.outcome_reason ?? null,
      closedAt: row.closed_at == null ? null : iso(row.closed_at),
      commercialEvents: sourceEvents.map(event => ({
        eventId: String(event.id), type: event.type, serviceCode: null,
        sourceServiceName: String(event.serviceName), occurredAt: iso(event.occurredAt),
        amount: event.amount == null ? null : Number(event.amount), currency: event.currency ?? null,
      })),
      drillDownPath: `/admin/business-kaizen-diagnosis-detail.html?id=${encodeURIComponent(subjectId)}`,
    };
  }
}
