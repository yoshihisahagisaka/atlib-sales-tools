import type {
  ManagementScenarioReview,
} from './paidAssessmentScenarioComparison';

import type {
  YenRange,
  buildScenarioInvestmentComparison,
} from './paidAssessmentInvestmentComparison';

type ReviewedScenario =
  ManagementScenarioReview['scenarios'][number];

type Investment =
  ReturnType<typeof buildScenarioInvestmentComparison>;

type InvestmentEntry =
  NonNullable<Investment['columns'][number]['entry']>;

export interface ScenarioPlanYearInput {
  year: number;
  title: string;
  purpose: string;
  activities: readonly string[];
  optionIds: readonly string[];
  expectedChange: string;
  verificationApproach: string;
  prerequisites: readonly string[];
  risks: readonly string[];
  reassessmentTrigger: string;
  openQuestions: readonly string[];

  // Full annual cost, including one-time and recurring costs.
  // Do not enter amounts already derived from the investment comparison.
  annualYen: YenRange | null;
  costBasis: string | null;
}

export interface ScenarioPlanInput {
  scenarioId: string;
  years: readonly ScenarioPlanYearInput[];
}

export interface ScenarioPlansInput {
  plans: readonly ScenarioPlanInput[];
}

function requireObject(value: unknown, field: string): void {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new TypeError(`${field} must be an object`);
  }
}

function nonblank(
  value: unknown,
  field: string,
): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${field} must be nonblank`);
  }
}

function strings(
  values: readonly string[],
  field: string,
): string[] {
  if (!Array.isArray(values)) {
    throw new TypeError(`${field} must be an array`);
  }

  for (const value of values) nonblank(value, field);

  return [...values];
}

function range(
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

  return { min: value.min, max: value.max };
}

function sum(
  values: readonly (YenRange | null)[],
): YenRange | null {
  if (
    values.length === 0 ||
    values.some(value => value === null)
  ) {
    return null;
  }

  let min = 0;
  let max = 0;

  for (const value of values) {
    min += value!.min;
    max += value!.max;
  }

  if (
    !Number.isSafeInteger(min) ||
    !Number.isSafeInteger(max)
  ) {
    throw new TypeError('Annual investment total exceeds safe range');
  }

  return { min, max };
}

function deriveAnnual(
  year: number,
  investment: InvestmentEntry,
): YenRange | null {
  if (year === 1) {
    return range(investment.firstYearYen, 'first year');
  }

  if (investment.monthlyYen === null) return null;

  return sum(
    Array.from(
      { length: 12 },
      () => investment.monthlyYen,
    ),
  );
}

function annualInvestment(
  year: ScenarioPlanYearInput,
  investment: InvestmentEntry | null,
) {
  const entered = range(year.annualYen, 'annualYen');

  if (
    investment !== null &&
    investment.monthlyPattern === 'CONSTANT_36_MONTHS' &&
    year.year <= 3
  ) {
    if (entered !== null || year.costBasis !== null) {
      throw new TypeError(
        'Annual cost must use existing constant investment comparison',
      );
    }

    const annualYen = deriveAnnual(
      year.year,
      investment,
    );

    return {
      annualYen,
      costBasis: annualYen === null
        ? null
        : '既存投資比較の36か月一定条件から算出',
      costOrigin: annualYen === null
        ? 'NOT_ASSESSED' as const
        : 'DERIVED_FROM_COMPARISON' as const,
    };
  }

  if (entered === null) {
    if (year.costBasis !== null) {
      nonblank(year.costBasis, 'costBasis');
    }

    return {
      annualYen: null,
      costBasis: year.costBasis,
      costOrigin: 'NOT_ASSESSED' as const,
    };
  }

  if (
    investment === null ||
    investment.investmentEvidence === null
  ) {
    throw new TypeError(
      'Annual investment requires existing investment evidence',
    );
  }

  nonblank(year.costBasis, 'costBasis');

  if (
    year.year === 1 &&
    investment.initialYen !== null &&
    (
      entered.min < investment.initialYen.min ||
      entered.max < investment.initialYen.max
    )
  ) {
    throw new TypeError(
      'First annual cost must include initial investment',
    );
  }

  return {
    annualYen: entered,
    costBasis: year.costBasis,
    costOrigin: 'EVIDENCE_BACKED_ESTIMATE' as const,
  };
}

export function buildScenarioPlans(
  scenarios: readonly ReviewedScenario[],
  investment: Investment,
  input: ScenarioPlansInput,
) {
  requireObject(input, 'scenario plans');

  if (!Array.isArray(input.plans)) {
    throw new TypeError('plans must be an array');
  }

  const scenariosById = new Map(
    scenarios.map(s => [s.id, s]),
  );

  const investmentsById = new Map(
    investment.columns.map(c => [c.scenarioId, c.entry]),
  );

  const byId = new Map<string, ScenarioPlanInput>();

  for (const plan of input.plans) {
    requireObject(plan, 'plan');

    nonblank(plan.scenarioId, 'scenarioId');

    if (!scenariosById.has(plan.scenarioId)) {
      throw new TypeError('Unknown plan scenario');
    }

    if (byId.has(plan.scenarioId)) {
      throw new TypeError('Duplicate plan scenario');
    }

    byId.set(plan.scenarioId, plan);
  }

  const plans = scenarios.map(scenario => {
    const plan = byId.get(scenario.id);

    if (plan === undefined) {
      return {
        scenarioId: scenario.id,
        plan: null,
      };
    }

    if (
      !Array.isArray(plan.years) ||
      plan.years.length < 2
    ) {
      throw new TypeError(
        'Multi-year plan requires at least two years',
      );
    }

    const cost = investmentsById.get(scenario.id) ?? null;

    const allowedOptions = new Set(scenario.optionIds);
    const coveredOptions = new Set<string>();

    const years = plan.years.map(
      (year: ScenarioPlanYearInput, index: number) => {
        requireObject(year, 'plan year');

        if (year.year !== index + 1) {
          throw new TypeError(
            'Plan years must be consecutive from year one',
          );
        }

        nonblank(year.title, 'year title');
        nonblank(year.purpose, 'year purpose');
        nonblank(year.expectedChange, 'expectedChange');
        nonblank(year.verificationApproach, 'verificationApproach');
        nonblank(year.reassessmentTrigger, 'reassessmentTrigger');

        const activities = strings(
          year.activities,
          'activities',
        );

        if (activities.length === 0) {
          throw new TypeError('activities must not be empty');
        }

        const optionIds = strings(
          year.optionIds,
          'optionIds',
        );

        const seen = new Set<string>();

        for (const id of optionIds) {
          if (!allowedOptions.has(id)) {
            throw new TypeError(
              'Plan option does not belong to scenario',
            );
          }

          if (seen.has(id)) {
            throw new TypeError('Duplicate annual option');
          }

          seen.add(id);
          coveredOptions.add(id);
        }

        const annual = annualInvestment(year, cost);

        if (
          annual.costOrigin === 'EVIDENCE_BACKED_ESTIMATE' &&
          (
            scenario.investmentCharacter !== 'EVIDENCE_BACKED_RANGE' ||
            !scenario.investmentNote?.trim()
          )
        ) {
          throw new TypeError(
            'Annual investment requires evidence-backed scenario estimate',
          );
        }

        return {
          year: year.year,
          title: year.title,
          purpose: year.purpose,
          activities,
          optionIds,
          expectedChange: year.expectedChange,
          verificationApproach: year.verificationApproach,
          prerequisites: strings(
            year.prerequisites, 'prerequisites',
          ),
          risks: strings(year.risks, 'risks'),
          reassessmentTrigger: year.reassessmentTrigger,
          openQuestions: strings(
            year.openQuestions, 'openQuestions',
          ),
          ...annual,
        };
      },
    );

    const annualCosts = years.map(y => y.annualYen);

    const threeYearYen = years.length >= 3
      ? sum(annualCosts.slice(0, 3))
      : null;

    const evidence = cost?.investmentEvidence ?? null;

    return {
      scenarioId: scenario.id,
      plan: {
        years,
        firstYearYen: range(
          years[0]!.annualYen, 'first year cost',
        ),
        threeYearYen,
        planTotalYen: sum(annualCosts),
        investmentEvidence: evidence === null
          ? null
          : { ...evidence },
        uncoveredOptionIds: scenario.optionIds.filter(
          id => !coveredOptions.has(id),
        ),
      },
    };
  });

  return {
    currency: investment.currency,
    scope: investment.scope,
    taxBasis: investment.taxBasis,
    plans,
  };
}
