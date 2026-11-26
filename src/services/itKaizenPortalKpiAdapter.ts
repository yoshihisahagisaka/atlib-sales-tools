import type { Pool } from 'pg';

export interface FiscalYearPeriod {
  kind: 'FISCAL_YEAR';
  fiscalYear: number;
  timeZone: 'Asia/Tokyo';
  from: string;
  toExclusive: string;
}

const MIN_FISCAL_YEAR = 2000;
const MAX_FISCAL_YEAR = 9998;

export function currentJstFiscalYear(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find(part => part.type === type)?.value);
  const year = value('year');
  const month = value('month');
  return month >= 2 ? year : year - 1;
}

export function parseFiscalYear(value: unknown, now: Date): FiscalYearPeriod {
  let fiscalYear: number;
  if (value === undefined) {
    fiscalYear = currentJstFiscalYear(now);
  } else {
    if (typeof value !== 'string' || !/^\d{4}$/.test(value)) throw new Error('INVALID_FISCAL_YEAR');
    fiscalYear = Number(value);
  }
  if (fiscalYear < MIN_FISCAL_YEAR || fiscalYear > MAX_FISCAL_YEAR) throw new Error('INVALID_FISCAL_YEAR');
  return {
    kind: 'FISCAL_YEAR', fiscalYear, timeZone: 'Asia/Tokyo',
    from: `${fiscalYear}-02-01T00:00:00+09:00`,
    toExclusive: `${fiscalYear + 1}-02-01T00:00:00+09:00`,
  };
}

export class ItKaizenPortalKpiAdapter {
  constructor(private readonly pool: Pick<Pool, 'query'>) {}

  async countAcceptedSubjects(period: FiscalYearPeriod): Promise<number> {
    const result = await this.pool.query<{ accepted_count: string }>(
      `SELECT count(DISTINCT diagnosis_case.id)::text AS accepted_count
         FROM it_management_diagnosis_case_v2 diagnosis_case
         JOIN it_management_diagnosis_original_survey_snapshot_v2 original
           ON original.case_id = diagnosis_case.id
        WHERE diagnosis_case.is_internal_test = false
          AND original.submitted_at >= $1::timestamptz
          AND original.submitted_at < $2::timestamptz`,
      [period.from, period.toExclusive],
    );
    const count = Number(result.rows[0]?.accepted_count);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('INVALID_KPI_COUNT');
    return count;
  }
}
