/**
 * Aggregate-only IT経営KAIZEN survey count reporting.
 * Each row is a month of confirmed counts, not a person or event record.
 * atLIB fiscal year begins February 1.
 */
export type MonthlySurveyCount = {
  month: string; // YYYY-MM
  startedCount: number;
  completedCount: number;
};

export type CountTotal = { started: number; completed: number };
export type SurveyPeriodKey = 'currentMonth' | 'trailingThreeMonths' | 'currentFiscalYear' | 'previousFiscalYear' | 'cumulative';
export type SurveyPeriodValue = CountTotal & { coverage: 'FULL_MONTHS' | 'PARTIAL_MONTHS' | 'NOT_MEASURED' };
export type SurveyPeriodSummary = Record<SurveyPeriodKey, SurveyPeriodValue>;

function ym(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function validateMonth(value: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new Error('INVALID_MONTH');
}

function subtractMonths(month: string, count: number): string {
  validateMonth(month);
  const [year, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(year, m - 1 - count, 1));
  return ym(d.getUTCFullYear(), d.getUTCMonth() + 1);
}

export function fiscalYearStartMonth(month: string): string {
  validateMonth(month);
  const [year, m] = month.split('-').map(Number);
  return ym(m >= 2 ? year : year - 1, 2);
}

export function aggregateSurveyMonths(
  rows: readonly MonthlySurveyCount[],
  currentMonth: string,
  coverageStartMonth: string,
): SurveyPeriodSummary {
  validateMonth(currentMonth);
  validateMonth(coverageStartMonth);
  if (coverageStartMonth > currentMonth) throw new Error('COVERAGE_AFTER_CURRENT_MONTH');
  const fiscalStart = fiscalYearStartMonth(currentMonth);
  const previousFiscalStart = subtractMonths(fiscalStart, 12);
  const fiscalElapsedMonths = (Number(currentMonth.slice(0, 4)) - Number(fiscalStart.slice(0, 4))) * 12
    + Number(currentMonth.slice(5)) - Number(fiscalStart.slice(5));
  const previousComparableEnd = subtractMonths(currentMonth, 12);
  const windows: Record<SurveyPeriodKey, { from: string; to: string }> = {
    currentMonth: { from: currentMonth, to: currentMonth },
    trailingThreeMonths: { from: subtractMonths(currentMonth, 2), to: currentMonth },
    currentFiscalYear: { from: fiscalStart, to: currentMonth },
    // Same elapsed months in the previous fiscal year, for like-for-like comparison.
    previousFiscalYear: { from: previousFiscalStart, to: previousComparableEnd },
    cumulative: { from: coverageStartMonth, to: currentMonth },
  };
  // Kept explicit for reviewability: current fiscal YTD is elapsed months inclusive.
  if (fiscalElapsedMonths < 0 || fiscalElapsedMonths > 11) throw new Error('INVALID_FISCAL_WINDOW');
  const out = {} as SurveyPeriodSummary;
  for (const key of Object.keys(windows) as SurveyPeriodKey[]) {
    const { from, to } = windows[key];
    let started = 0;
    let completed = 0;
    for (const row of rows) {
      validateMonth(row.month);
      if (![row.startedCount, row.completedCount].every(n => Number.isSafeInteger(n) && n >= 0)) {
        throw new Error('INVALID_COUNT');
      }
      if (row.month < coverageStartMonth || row.month < from || row.month > to || row.month > currentMonth) continue;
      started += row.startedCount;
      completed += row.completedCount;
    }
    if (!Number.isSafeInteger(started) || !Number.isSafeInteger(completed)) throw new Error('COUNT_OVERFLOW');
    const coverage = coverageStartMonth > to ? 'NOT_MEASURED'
      : coverageStartMonth > from ? 'PARTIAL_MONTHS' : 'FULL_MONTHS';
    out[key] = { started, completed, coverage };
  }
  return out;
}

/** A period count ratio, never an individual/person conversion probability. */
export function surveyCompletionVolumeRatio(total: CountTotal): number | null {
  return total.started === 0 ? null : total.completed / total.started;
}
