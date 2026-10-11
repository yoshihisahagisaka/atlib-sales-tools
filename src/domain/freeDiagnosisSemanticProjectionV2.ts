import {
  CURRENT_INTEREST_CODES_V2,
  type CurrentStructuredStateV2,
  FUTURE_CODES_V2,
  INTEREST_THEME_CODES_V2,
  IT_EXPECTATION_CODES_V2,
  MANAGEMENT_CONNECTION_CODES_V2,
  VISIBILITY_CODES_V2,
} from './freeDiagnosisDesignV2';

export class FreeDiagnosisDesignV2ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FreeDiagnosisDesignV2ValidationError';
  }
}

function normalizeSelection<T extends string>(
  values: readonly T[],
  allowed: readonly T[],
  question: string,
  maximum: number,
  exclusive: readonly T[],
): readonly T[] {
  const invalid = values.find((value) => !allowed.includes(value));
  if (invalid !== undefined) throw new FreeDiagnosisDesignV2ValidationError(`${question} has unsupported code: ${invalid}`);
  const unique = [...new Set(values)];
  if (unique.length > maximum) throw new FreeDiagnosisDesignV2ValidationError(`${question} allows at most ${maximum} selections`);
  if (unique.some((value) => exclusive.includes(value)) && unique.length !== 1) {
    throw new FreeDiagnosisDesignV2ValidationError(`${question} exclusive answer cannot be combined with another answer`);
  }
  return allowed.filter((value) => unique.includes(value));
}

function assertSingle<T extends string>(value: T, allowed: readonly T[], question: string): T {
  if (!allowed.includes(value)) throw new FreeDiagnosisDesignV2ValidationError(`${question} has unsupported code: ${value}`);
  return value;
}

/**
 * Deterministically validates and normalizes the Design v2 survey vocabulary.
 * It does not infer facts, gaps, or recommendations.
 */
export function projectFreeDiagnosisSemanticV2(input: CurrentStructuredStateV2): CurrentStructuredStateV2 {
  return {
    q1CompanyContext: {
      employeeRange: input.q1CompanyContext.employeeRange,
      siteRange: input.q1CompanyContext.siteRange,
    },
    q2Future: normalizeSelection(input.q2Future, FUTURE_CODES_V2, 'Q2', FUTURE_CODES_V2.length, ['NO_MAJOR_CHANGE', 'UNDECIDED']),
    q3ItExpectations: normalizeSelection(input.q3ItExpectations, IT_EXPECTATION_CODES_V2, 'Q3', 2, ['UNDECIDED']),
    q4CurrentInterest: assertSingle(input.q4CurrentInterest, CURRENT_INTEREST_CODES_V2, 'Q4'),
    q5Visibility: assertSingle(input.q5Visibility, VISIBILITY_CODES_V2, 'Q5'),
    q6ManagementConnection: assertSingle(input.q6ManagementConnection, MANAGEMENT_CONNECTION_CODES_V2, 'Q6'),
    q7InterestThemes: normalizeSelection(input.q7InterestThemes, INTEREST_THEME_CODES_V2, 'Q7', 3, ['UNDECIDED']),
  };
}
