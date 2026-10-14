/**
 * Sales Tools shared information page: pure KPI window and volume-ratio helpers.
 * No database access, applicant identity, event ingestion or cross-service aggregation.
 * Time windows are Japan calendar months; all timestamps are UTC ISO instants.
 */
export type KpiWindowKey = 'currentMonth' | 'trailingThreeMonths' | 'cumulative';
export type KpiWindow = { startInclusive: string; endExclusive: string; label: string };
export type KpiWindowSet = Record<KpiWindowKey, KpiWindow>;

const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;

function japanMonthStartUtc(year: number, monthIndex: number): string {
  return new Date(Date.UTC(year, monthIndex, 1) - TOKYO_OFFSET_MS).toISOString();
}

/** All windows use the same as-of instant; cumulative is bounded by coverageStart. */
export function buildJapanKpiWindows(asOfIso: string, coverageStartIso: string): KpiWindowSet {
  const asOf = new Date(asOfIso);
  const coverage = new Date(coverageStartIso);
  if (!Number.isFinite(asOf.getTime()) || !Number.isFinite(coverage.getTime())) throw new Error('INVALID_TIMESTAMP');
  if (coverage.getTime() > asOf.getTime()) throw new Error('COVERAGE_AFTER_AS_OF');
  const japan = new Date(asOf.getTime() + TOKYO_OFFSET_MS);
  const y = japan.getUTCFullYear();
  const m = japan.getUTCMonth();
  // End is exclusive; one millisecond after asOf includes events at the snapshot instant.
  const endExclusive = new Date(asOf.getTime() + 1).toISOString();
  // A newly instrumented metric must not claim coverage before instrumentation began.
  const effectiveStart = (calendarStart: string): string =>
    new Date(Math.max(Date.parse(calendarStart), coverage.getTime())).toISOString();
  return {
    currentMonth: { startInclusive: effectiveStart(japanMonthStartUtc(y, m)), endExclusive, label: '今月' },
    trailingThreeMonths: { startInclusive: effectiveStart(japanMonthStartUtc(y, m - 2)), endExclusive, label: '過去3か月' },
    cumulative: { startInclusive: coverage.toISOString(), endExclusive, label: '累計（計測開始以降）' },
  };
}

export function inKpiWindow(occurredAtIso: string, window: KpiWindow): boolean {
  const t = Date.parse(occurredAtIso);
  if (!Number.isFinite(t)) return false;
  return t >= Date.parse(window.startInclusive) && t < Date.parse(window.endExclusive);
}

/**
 * A period volume ratio, not an individual conversion rate or Case cohort rate.
 * Null means undefined (zero denominator); do not silently turn missing data into 0.
 */
export function periodVolumeRatio(numerator: number, denominator: number): number | null {
  if (!Number.isSafeInteger(numerator) || numerator < 0 || !Number.isSafeInteger(denominator) || denominator < 0) {
    throw new Error('INVALID_COUNT');
  }
  return denominator === 0 ? null : numerator / denominator;
}

