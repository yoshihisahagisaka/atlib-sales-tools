/**
 * IT経営KAIZEN pre-application questionnaire: aggregate-only KPI contract.
 * This replaces the earlier persistent anonymous-event ledger design.
 * Accepted operations are counted, including a later attempt by the same person.
 */
export type SurveyCountKind = 'STARTED' | 'COMPLETED';
export type SurveyCountBucket = {
  monthJst: string; // YYYY-MM, determined by server clock in Asia/Tokyo
  serviceKey: 'IT_KAIZEN';
  attributionKey: string; // normalized initiative/bucket key, never a person identifier
};
export type SurveyCountSnapshot = SurveyCountBucket & {
  startedCount: number;
  completedCount: number;
};

export function japanYearMonth(at: Date): string {
  if (!Number.isFinite(at.getTime())) throw new Error('INVALID_TIMESTAMP');
  const jst = new Date(at.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function counterColumn(kind: SurveyCountKind): 'started_count' | 'completed_count' {
  switch (kind) {
    case 'STARTED': return 'started_count';
    case 'COMPLETED': return 'completed_count';
  }
}

/**
 * Pure domain decision; authentication is verified by route middleware, not by client flags.
 * The caller must apply the existing IP limiter before calling the DB increment.
 */
export function shouldIncrementNormalCounter(context: {
  acceptedByLimiter: boolean;
  payloadValid: boolean;
  serverVerifiedStaffTest: boolean;
}): boolean {
  return context.acceptedByLimiter && context.payloadValid && !context.serverVerifiedStaffTest;
}

export function addMonthlyCounts(a: SurveyCountSnapshot, b: SurveyCountSnapshot): SurveyCountSnapshot {
  if (a.monthJst !== b.monthJst || a.serviceKey !== b.serviceKey || a.attributionKey !== b.attributionKey) {
    throw new Error('BUCKET_MISMATCH');
  }
  for (const value of [a.startedCount, a.completedCount, b.startedCount, b.completedCount]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('INVALID_COUNT');
  }
  const startedCount = a.startedCount + b.startedCount;
  const completedCount = a.completedCount + b.completedCount;
  if (!Number.isSafeInteger(startedCount) || !Number.isSafeInteger(completedCount)) throw new Error('COUNT_OVERFLOW');
  return { ...a, startedCount, completedCount };
}
