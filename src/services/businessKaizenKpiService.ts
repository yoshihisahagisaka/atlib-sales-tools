import type { Pool } from 'pg';

export type BusinessKaizenKpiPeriod = {
  from: string;
  toExclusive: string;
  timeZone: 'Asia/Tokyo';
  fiscalYearStartMonth: 2;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
function validDate(value: string): boolean {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year! < 2000 || year! > 2100) return false;
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}
function nextDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + 1)).toISOString().slice(0, 10);
}
export function resolveBusinessKaizenKpiPeriod(input: { from?: string; to?: string; fiscalYear?: number }): BusinessKaizenKpiPeriod | null {
  let from: string, toExclusiveDate: string;
  if (input.fiscalYear !== undefined && input.from === undefined && input.to === undefined) {
    if (!Number.isInteger(input.fiscalYear) || input.fiscalYear < 2000 || input.fiscalYear > 2100) return null;
    from = `${input.fiscalYear}-02-01`;
    toExclusiveDate = `${input.fiscalYear + 1}-02-01`;
  } else if (input.fiscalYear === undefined && input.from !== undefined && input.to !== undefined && validDate(input.from) && validDate(input.to)) {
    from = input.from;
    toExclusiveDate = nextDate(input.to);
    if (from >= toExclusiveDate) return null;
  } else return null;
  return {
    from: `${from}T00:00:00+09:00`,
    toExclusive: `${toExclusiveDate}T00:00:00+09:00`,
    timeZone: 'Asia/Tokyo',
    fiscalYearStartMonth: 2,
  };
}

type AggregateRow = Record<string, string | number | null>;

export class BusinessKaizenKpiService {
  constructor(private readonly pool: Pool) {}

  async aggregate(period: BusinessKaizenKpiPeriod) {
    const result = await this.pool.query<AggregateRow>(`
      WITH first_accepted AS (
        SELECT diagnosis_id, min(reached_at) AS accepted_at
          FROM business_kaizen_diagnosis_stage_history
         WHERE stage='ACCEPTED'
         GROUP BY diagnosis_id
      ), cohort AS (
        SELECT d.id,d.entry_channel,d.owner_user_email,d.completed_at,fa.accepted_at
          FROM first_accepted fa
          JOIN business_kaizen_diagnoses d ON d.id=fa.diagnosis_id
         WHERE fa.accepted_at >= $1::timestamptz AND fa.accepted_at < $2::timestamptz
      ), cohort_events AS (
        SELECT e.* FROM business_kaizen_commercial_events e
          JOIN cohort c ON c.id=e.diagnosis_id
         WHERE e.occurred_at >= c.accepted_at
      ), activity_events AS (
        SELECT * FROM business_kaizen_commercial_events
         WHERE occurred_at >= $1::timestamptz AND occurred_at < $2::timestamptz
      )
      SELECT
        (SELECT count(*) FROM cohort) AS cohort_accepted,
        (SELECT count(*) FROM cohort WHERE completed_at IS NOT NULL) AS cohort_completed,
        (SELECT count(DISTINCT diagnosis_id) FROM cohort_events WHERE event_type='PROPOSED') AS cohort_proposed,
        (SELECT count(DISTINCT diagnosis_id) FROM cohort_events WHERE event_type='WON') AS cohort_won,
        (SELECT CASE WHEN count(*)=0 THEN 0 WHEN count(amount)=0 THEN NULL ELSE sum(amount) END FROM cohort_events WHERE event_type='PROPOSED') AS cohort_proposed_amount,
        (SELECT CASE WHEN count(*)=0 THEN 0 WHEN count(amount)=0 THEN NULL ELSE sum(amount) END FROM cohort_events WHERE event_type='WON') AS cohort_won_amount,
        (SELECT count(*) FROM first_accepted WHERE accepted_at >= $1::timestamptz AND accepted_at < $2::timestamptz) AS activity_accepted,
        (SELECT count(*) FROM business_kaizen_diagnoses WHERE completed_at >= $1::timestamptz AND completed_at < $2::timestamptz) AS activity_completed,
        (SELECT count(DISTINCT diagnosis_id) FROM activity_events WHERE event_type='PROPOSED') AS activity_proposed,
        (SELECT count(DISTINCT diagnosis_id) FROM activity_events WHERE event_type='WON') AS activity_won,
        (SELECT count(*) FROM activity_events WHERE event_type='PROPOSED') AS activity_proposed_events,
        (SELECT count(*) FROM activity_events WHERE event_type='WON') AS activity_won_events,
        (SELECT CASE WHEN count(*)=0 THEN 0 WHEN count(amount)=0 THEN NULL ELSE sum(amount) END FROM activity_events WHERE event_type='PROPOSED') AS activity_proposed_amount,
        (SELECT CASE WHEN count(*)=0 THEN 0 WHEN count(amount)=0 THEN NULL ELSE sum(amount) END FROM activity_events WHERE event_type='WON') AS activity_won_amount,
        (SELECT count(*) FROM cohort WHERE entry_channel='CUSTOMER_SELF') AS cohort_self,
        (SELECT count(*) FROM cohort WHERE entry_channel='STAFF_PROXY') AS cohort_proxy,
        (SELECT count(*) FROM cohort WHERE owner_user_email IS NULL) AS cohort_owner_missing,
        (SELECT count(*) FROM activity_events WHERE amount IS NULL) AS activity_amount_unknown,
        (SELECT count(*) FROM business_kaizen_diagnoses d LEFT JOIN first_accepted fa ON fa.diagnosis_id=d.id
          WHERE d.completed_at >= $1::timestamptz AND d.completed_at < $2::timestamptz AND fa.diagnosis_id IS NULL) AS completed_without_accepted,
        (SELECT count(*) FROM business_web_consultation_leads l LEFT JOIN business_kaizen_diagnoses d ON d.consultation_lead_id=l.id
          WHERE l.created_at >= $1::timestamptz AND l.created_at < $2::timestamptz AND d.id IS NULL) AS leads_without_diagnosis
    `, [period.from, period.toExclusive]);
    const row = result.rows[0] ?? {};
    const count = (key: string) => Number(row[key] ?? 0);
    const amount = (key: string) => row[key] === null ? null : Number(row[key]);
    const accepted = count('cohort_accepted');
    const metrics = (prefix: 'cohort' | 'activity') => ({
      acceptedDiagnosisCount: count(`${prefix}_accepted`),
      completedDiagnosisCount: count(`${prefix}_completed`),
      proposedDiagnosisCount: count(`${prefix}_proposed`),
      wonDiagnosisCount: count(`${prefix}_won`),
      proposedAmountTotal: amount(`${prefix}_proposed_amount`),
      wonAmountTotal: amount(`${prefix}_won_amount`),
    });
    return {
      period,
      subject: { businessLine: 'BUSINESS_KAIZEN', subjectType: 'BUSINESS_DIAGNOSIS' },
      cohortFunnel: {
        ...metrics('cohort'),
        acceptedToWonRate: accepted === 0 ? null : count('cohort_won') / accepted,
        byEntryChannel: {
          CUSTOMER_SELF: count('cohort_self'),
          STAFF_PROXY: count('cohort_proxy'),
        },
      },
      activityVolume: {
        ...metrics('activity'),
        proposedEventCount: count('activity_proposed_events'),
        wonEventCount: count('activity_won_events'),
      },
      dataQuality: {
        acceptedDiagnosisOwnerMissingCount: count('cohort_owner_missing'),
        commercialEventAmountUnknownCount: count('activity_amount_unknown'),
        completedWithoutAcceptedCount: count('completed_without_accepted'),
        consultationLeadWithoutDiagnosisCount: count('leads_without_diagnosis'),
      },
    };
  }
}
