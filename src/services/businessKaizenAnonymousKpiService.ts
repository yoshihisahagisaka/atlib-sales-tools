import type { Pool } from 'pg';

export type AnonymousEventType = 'diagnosis_start' | 'diagnosis_complete';
export type AnonymousKpiEnvironment = 'PRODUCTION' | 'TEST';
export type UtmInput = { utmSource?: string; utmMedium?: string; utmCampaign?: string; utmContent?: string; utmTerm?: string };
export type TurnstileOutcome = { success: boolean; action?: string; hostname?: string };
export type TurnstileVerifier = (token: string) => Promise<TurnstileOutcome>;
export type AnonymousKpiConfig = {
  enabled: boolean; secret: string; environment: AnonymousKpiEnvironment;
  allowedOrigins: string[]; allowedHostnames: string[];
};

const utmColumns = ['utmSource','utmMedium','utmCampaign','utmContent','utmTerm'] as const;
const dbColumns = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'] as const;

export async function verifyTurnstileToken(secret: string, token: string, fetchImpl: typeof fetch = globalThis.fetch): Promise<TurnstileOutcome> {
  if (!secret || !token || token.length > 2048) return { success: false };
  try {
    const body = new URLSearchParams({ secret, response: token });
    const response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { success: false };
    const value = await response.json() as TurnstileOutcome;
    return { success: value.success === true, action: value.action, hostname: value.hostname?.toLowerCase() };
  } catch { return { success: false }; }
}

function jstDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
function normalize(value: string | undefined): string | null { return value?.trim() || null; }
function hostnameForOrigin(origin: string): string | null { try { return new URL(origin).hostname.toLowerCase(); } catch { return null; } }

export class BusinessKaizenAnonymousKpiService {
  constructor(private readonly pool: Pool, readonly config: AnonymousKpiConfig,
    private readonly verify: TurnstileVerifier = token => verifyTurnstileToken(config.secret, token),
    private readonly now: () => Date = () => new Date()) {}

  async receive(input: { eventType: AnonymousEventType; turnstileToken: string } & UtmInput, origin: string): Promise<'RECORDED' | 'DISABLED' | 'REJECTED'> {
    if (!this.config.enabled) return 'DISABLED';
    if (!this.config.allowedOrigins.includes(origin)) return 'REJECTED';
    const outcome = await this.verify(input.turnstileToken);
    const hostname = outcome.hostname?.toLowerCase();
    if (!outcome.success || outcome.action !== input.eventType || !hostname ||
      !this.config.allowedHostnames.includes(hostname) || hostnameForOrigin(origin) !== hostname) return 'REJECTED';
    const values = utmColumns.map(key => normalize(input[key]));
    const hasUtm = values.some(value => value !== null);
    let classification: 'REGISTERED' | 'UNATTRIBUTED' | 'OTHER' = hasUtm ? 'OTHER' : 'UNATTRIBUTED';
    let approved: Array<string | null> = [null,null,null,null,null];
    if (hasUtm) {
      const match = await this.pool.query<Record<string, string | null>>(`
        SELECT utm_source,utm_medium,utm_campaign,utm_content,utm_term
          FROM marketing_initiative
         WHERE service_key='BUSINESS_WEB' AND is_active=true
           AND utm_source IS NOT DISTINCT FROM $1 AND utm_medium IS NOT DISTINCT FROM $2
           AND utm_campaign IS NOT DISTINCT FROM $3 AND utm_content IS NOT DISTINCT FROM $4
           AND utm_term IS NOT DISTINCT FROM $5
         LIMIT 1`, values);
      if (match.rows[0]) { classification = 'REGISTERED'; approved = dbColumns.map(key => match.rows[0]![key] ?? null); }
    }
    await this.pool.query(`
      INSERT INTO business_kaizen_anonymous_kpi_daily
        (event_date_jst,event_type,environment,origin,utm_classification,utm_source,utm_medium,utm_campaign,utm_content,utm_term,event_count)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1)
      ON CONFLICT (event_date_jst,event_type,environment,origin,utm_classification,utm_source,utm_medium,utm_campaign,utm_content,utm_term)
      DO UPDATE SET event_count=business_kaizen_anonymous_kpi_daily.event_count+1,updated_at=now()`,
    [jstDate(this.now()),input.eventType,this.config.environment,origin,classification,...approved]);
    return 'RECORDED';
  }

  async read(period: { from: string; to: string; environment?: AnonymousKpiEnvironment; origin?: string }) {
    const values: unknown[] = [period.from, period.to];
    const conditions = ['event_date_jst >= $1::date','event_date_jst <= $2::date'];
    if (period.environment) { values.push(period.environment); conditions.push(`environment=$${values.length}`); }
    if (period.origin) { values.push(period.origin); conditions.push(`origin=$${values.length}`); }
    const { rows } = await this.pool.query<Record<string, unknown>>(`
      SELECT environment,origin,utm_classification,utm_source,utm_medium,utm_campaign,utm_content,utm_term,
        sum(event_count) FILTER(WHERE event_type='diagnosis_start')::bigint AS starts,
        sum(event_count) FILTER(WHERE event_type='diagnosis_complete')::bigint AS completes
      FROM business_kaizen_anonymous_kpi_daily WHERE ${conditions.join(' AND ')}
      GROUP BY environment,origin,utm_classification,utm_source,utm_medium,utm_campaign,utm_content,utm_term
      ORDER BY environment,origin,utm_classification,utm_source NULLS FIRST,utm_medium NULLS FIRST,utm_campaign NULLS FIRST,utm_content NULLS FIRST,utm_term NULLS FIRST`, values);
    const items = rows.map(row => {
      const starts = Number(row.starts ?? 0), completes = Number(row.completes ?? 0);
      return { environment: row.environment, origin: row.origin, utmClassification: row.utm_classification,
        utmSource: row.utm_source, utmMedium: row.utm_medium, utmCampaign: row.utm_campaign,
        utmContent: row.utm_content, utmTerm: row.utm_term, diagnosisStartCount: starts,
        diagnosisCompleteCount: completes, eventCountRatio: starts === 0 ? null : completes / starts };
    });
    return { period: { from: period.from, to: period.to, timeZone: 'Asia/Tokyo', fiscalYearStartMonth: 2 },
      ratioMeaning: 'diagnosis_complete event count / diagnosis_start event count; not a person-level conversion rate', items };
  }
}
