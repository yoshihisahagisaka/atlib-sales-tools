import type {
  DeliverableProjection,
} from '../domain/paidAssessmentDeliverableProjection';

import {
  money,
} from './paidAssessmentInvestmentDisplay';

export function buildScenarioPlanDisplay(
  projection: DeliverableProjection,
) {
  const plans = projection.scenarioPlans;

  if (plans === undefined) return undefined;

  if (projection.futureComparison === undefined) {
    throw new TypeError('Missing future comparison');
  }

  const scenarios = projection.futureComparison.scenarios;

  if (plans.plans.length !== scenarios.length) {
    throw new TypeError('Scenario plan count mismatch');
  }

  const columns = plans.plans.map((column, index) => {
    const scenario = scenarios[index];

    if (!scenario || scenario.id !== column.scenarioId) {
      throw new TypeError('Scenario plan order mismatch');
    }

    const plan = column.plan;

    const status = scenario.state === 'BLOCKED_BY_OPTION_EVIDENCE'
      ? '実現条件の確認が必要'
      : (
          scenario.state === 'NEEDS_CONFIRMATION' ||
          plan === null ||
          plan.uncoveredOptionIds.length > 0 ||
          plan.years.some(year => year.openQuestions.length > 0)
        )
        ? '追加確認が必要'
        : null;

    return {
      scenarioId: scenario.id,
      title: scenario.title,
      status,
      plan: plan === null
        ? null
        : {
            summary:
              `${plan.years.length}年間合計：${money(plan.planTotalYen)}`,
            investmentEvidence: plan.investmentEvidence,
            uncoveredOptionIds: [...plan.uncoveredOptionIds],
            years: plan.years.map(year => ({
              year: year.year,
              title: year.title,
              heading: `${year.year}年目｜${year.title}`,
              purpose: year.purpose,
              activities: [...year.activities],
              expectedChange: year.expectedChange,
              verificationApproach: year.verificationApproach,
              prerequisites: [...year.prerequisites],
              risks: [...year.risks],
              reassessmentTrigger: year.reassessmentTrigger,
              openQuestions: [...year.openQuestions],
              optionIds: [...year.optionIds],
              annualAmount: money(year.annualYen),
              costBasis: year.costBasis,
              costLabel:
                year.costOrigin === 'DERIVED_FROM_COMPARISON'
                  ? '一定費用から算出'
                  : year.costOrigin === 'EVIDENCE_BACKED_ESTIMATE'
                    ? '年度別試算'
                    : '費用未算定',
            })),
          },
    };
  });

  return {
    scope: plans.scope,
    taxLabel: plans.taxBasis === 'EXCLUDING_TAX'
      ? '税別'
      : '税込',
    columns,
  };
}

export type ScenarioPlanDisplay = NonNullable<
  ReturnType<typeof buildScenarioPlanDisplay>
>;
