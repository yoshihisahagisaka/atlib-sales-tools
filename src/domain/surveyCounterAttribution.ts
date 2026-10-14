/**
 * Anonymous survey attribution follows Marketing Initiative v1's five-UTM
 * exact-match semantics (including NULLS NOT DISTINCT).
 * No customer, survey answers, or browser identity are represented here.
 */
export type SurveyUtm = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
};

export type InitiativeUtm = SurveyUtm & {
  initiativeId: string;
  serviceKey: 'IT_KAIZEN' | 'BUSINESS_WEB';
  isActive: boolean;
};

const fields = ['source','medium','campaign','content','term'] as const;

export function normalizeSurveyUtm(raw: Partial<Record<keyof SurveyUtm, unknown>>): SurveyUtm {
  const result = {} as SurveyUtm;
  for (const field of fields) {
    const value = raw[field];
    if (value === undefined || value === null || value === '') {
      result[field] = null;
      continue;
    }
    if (typeof value !== 'string' || !value.trim() || value.length > 200) {
      throw new Error('INVALID_UTM');
    }
    // Keep case and original non-empty value: existing marketing attribution
    // compares stored text exactly, not case-insensitively.
    result[field] = value;
  }
  return result;
}

export function sameSurveyUtm(a: SurveyUtm, b: SurveyUtm): boolean {
  return fields.every(field => a[field] === b[field]);
}

export function resolveSurveyInitiative(
  utm: SurveyUtm,
  initiatives: readonly InitiativeUtm[],
): string | null {
  const matches = initiatives.filter(i =>
    i.serviceKey === 'IT_KAIZEN' && i.isActive && sameSurveyUtm(i, utm));
  if (matches.length > 1) throw new Error('AMBIGUOUS_INITIATIVE');
  return matches[0]?.initiativeId ?? null;
}

/**
 * An unmatched attribution remains a valid counted attempt.
 * The monthly counter can use a separate UNMATCHED bucket without creating
 * an invented marketing initiative or discarding traffic.
 */
export function surveyAttributionBucket(initiativeId: string | null): string {
  return initiativeId === null ? 'UNMATCHED' : `INITIATIVE:${initiativeId}`;
}
