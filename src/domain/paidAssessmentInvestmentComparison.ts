import type {
  PreparationSourceRef,
} from './paidAssessmentPreparation';

import type {
  ManagementScenarioReview,
} from './paidAssessmentScenarioComparison';

export interface YenRange {
  min: number;
  max: number;
}

export interface ScenarioInvestmentEntry {
  scenarioId: string;
  initialYen: YenRange | null;
  monthlyYen: YenRange | null;
  monthlyPattern:
    | 'CONSTANT_36_MONTHS'
    | 'VARIABLE_OR_UNCONFIRMED';
  leadTime: string | null;
  internalEffort: string | null;
  deliveryTeam: string | null;
}

export interface ScenarioInvestmentComparisonInput {
  scope: string;
  taxBasis: 'EXCLUDING_TAX' | 'INCLUDING_TAX';
  entries: readonly ScenarioInvestmentEntry[];
}

type ReviewedScenario =
  ManagementScenarioReview['scenarios'][number];

const sourceKinds = new Set([
  'FREE_DIAGNOSIS_REPORT',
  'MANAGEMENT_FEEDBACK',
  'CUSTOMER_STATEMENT',
  'CORE_VERIFIED_REFERENCE',
]);

function nonblank(
  value: unknown,
  field: string,
): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${field} must be nonblank`);
  }
}

function requireObject(
  value: unknown,
  field: string,
): void {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new TypeError(`${field} must be an object`);
  }
}

function optionalText(
  value: string | null,
  field: string,
): string | null {
  if (value !== null) nonblank(value, field);
  return value;
}

function copyRange(
  value: YenRange | null,
  field: string,
): YenRange | null {
  if (value === null) return null;

  requireObject(value, field);

  if (
    !Number.isSafeInteger(value.min) ||
    !Number.isSafeInteger(value.max) ||
    value.min < 0 ||
    value.max < value.min
  ) {
    throw new TypeError(`${field} is invalid`);
  }

  return {
    min: value.min,
    max: value.max,
  };
}

function copyEvidence(
  source: PreparationSourceRef,
): PreparationSourceRef {
  requireObject(source, 'investment evidence');

  if (!sourceKinds.has(source.kind)) {
    throw new TypeError('Invalid investment evidence kind');
  }

  nonblank(source.id, 'investment evidence id');

  if (
    !Number.isInteger(source.version) ||
    source.version <= 0
  ) {
    throw new TypeError('Invalid investment evidence version');
  }

  if (
    source.hash !== undefined &&
    (
      typeof source.hash !== 'string' ||
      !/^[0-9a-f]{64}$/.test(source.hash)
    )
  ) {
    throw new TypeError('Invalid investment evidence hash');
  }

  return {
    kind: source.kind,
    id: source.id,
    version: source.version,
    ...(source.hash === undefined
      ? {}
      : { hash: source.hash }),
  };
}

function periodTotal(
  initial: YenRange | null,
  monthly: YenRange | null,
  months: number,
  constant: boolean,
): YenRange | null {
  if (!constant || initial === null || monthly === null) {
    return null;
  }

  const min = initial.min + monthly.min * months;
  const max = initial.max + monthly.max * months;

  if (
    !Number.isSafeInteger(min) ||
    !Number.isSafeInteger(max)
  ) {
    throw new TypeError('Investment total exceeds safe range');
  }

  return { min, max };
}

export function buildScenarioInvestmentComparison(
  scenarios: readonly ReviewedScenario[],
  input: ScenarioInvestmentComparisonInput,
) {
  requireObject(input, 'investment comparison');

  nonblank(input.scope, 'investment scope');

  if (
    input.taxBasis !== 'EXCLUDING_TAX' &&
    input.taxBasis !== 'INCLUDING_TAX'
  ) {
    throw new TypeError('Invalid tax basis');
  }

  if (!Array.isArray(input.entries)) {
    throw new TypeError('investment entries must be an array');
  }

  const byScenario = new Map(
    scenarios.map(scenario => [scenario.id, scenario]),
  );

  const entries =
    new Map<string, ScenarioInvestmentEntry>();

  for (const entry of input.entries) {
    requireObject(entry, 'investment entry');
    nonblank(entry.scenarioId, 'scenarioId');

    if (!byScenario.has(entry.scenarioId)) {
      throw new TypeError('Unknown investment scenario');
    }

    if (entries.has(entry.scenarioId)) {
      throw new TypeError('Duplicate investment scenario');
    }

    entries.set(entry.scenarioId, entry);
  }

  const columns = scenarios.map(scenario => {
    const entry = entries.get(scenario.id);

    if (entry === undefined) {
      return {
        scenarioId: scenario.id,
        entry: null,
      };
    }

    const initialYen = copyRange(
      entry.initialYen, 'initialYen',
    );

    const monthlyYen = copyRange(
      entry.monthlyYen, 'monthlyYen',
    );

    if (
      entry.monthlyPattern !== 'CONSTANT_36_MONTHS' &&
      entry.monthlyPattern !== 'VARIABLE_OR_UNCONFIRMED'
    ) {
      throw new TypeError('Invalid monthly pattern');
    }

    const evidence = scenario.investmentEvidence === undefined
      ? null
      : copyEvidence(scenario.investmentEvidence);

    if (
      initialYen !== null ||
      monthlyYen !== null
    ) {
      if (
        scenario.investmentCharacter !==
          'EVIDENCE_BACKED_RANGE' ||
        evidence === null
      ) {
        throw new TypeError(
          'Numeric investment requires existing scenario evidence',
        );
      }

      nonblank(
        scenario.investmentNote,
        'investment note',
      );
    }

    const constant =
      entry.monthlyPattern === 'CONSTANT_36_MONTHS';

    return {
      scenarioId: scenario.id,
      entry: {
        initialYen,
        monthlyYen,
        monthlyPattern: entry.monthlyPattern,
        firstYearYen: periodTotal(
          initialYen, monthlyYen, 12, constant,
        ),
        threeYearYen: periodTotal(
          initialYen, monthlyYen, 36, constant,
        ),
        leadTime: optionalText(
          entry.leadTime, 'leadTime',
        ),
        internalEffort: optionalText(
          entry.internalEffort, 'internalEffort',
        ),
        deliveryTeam: optionalText(
          entry.deliveryTeam, 'deliveryTeam',
        ),
        investmentEvidence: evidence,
      },
    };
  });

  return {
    currency: 'JPY' as const,
    scope: input.scope,
    taxBasis: input.taxBasis,
    columns,
  };
}
