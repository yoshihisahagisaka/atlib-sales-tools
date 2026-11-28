import type {
  DeliverableProjection,
} from '../domain/paidAssessmentDeliverableProjection';

import type {
  YenRange,
} from '../domain/paidAssessmentInvestmentComparison';

type Investment = NonNullable<
  DeliverableProjection['investmentComparison']
>;

type Scenario = NonNullable<
  DeliverableProjection['futureComparison']
>['scenarios'][number];

type Column = Investment['columns'][number];

const yen = new Intl.NumberFormat('ja-JP');

export function money(value: YenRange | null): string {
  if (value === null) return '未算定';

  if (value.min === value.max) {
    return `${yen.format(value.min)}円`;
  }

  return `${yen.format(value.min)}〜${yen.format(value.max)}円`;
}

function total(
  column: Column,
  period: 'firstYearYen' | 'threeYearYen',
  annualPlan?: NonNullable<
    DeliverableProjection['scenarioPlans']
  >['plans'][number]['plan'],
): string {
  if (column.entry === null) return '未入力';

  if (
    column.entry.monthlyPattern ===
    'VARIABLE_OR_UNCONFIRMED'
  ) {
    const annualTotal = annualPlan?.[period];

    return annualTotal !== undefined && annualTotal !== null
      ? `${money(annualTotal)}（年度別試算）`
      : '算出せず（変動・未確認）';
  }

  return money(column.entry[period]);
}

function list(values: readonly string[]): string {
  return values.length > 0
    ? values.join('／')
    : '記載なし';
}

export function buildInvestmentDisplay(
  projection: DeliverableProjection,
) {
  const investment = projection.investmentComparison;

  if (investment === undefined) return undefined;

  if (projection.futureComparison === undefined) {
    throw new TypeError('Missing future comparison');
  }

  const scenarios = projection.futureComparison.scenarios;

  const plans = new Map(
    (projection.scenarioPlans?.plans ?? []).map(
      column => [column.scenarioId, column.plan] as const,
    ),
  );

  const columns = investment.columns.map((column, index) => {
    const scenario = scenarios[index];

    if (
      !scenario ||
      scenario.id !== column.scenarioId
    ) {
      throw new TypeError('Investment scenario order mismatch');
    }

    return {
      scenarioId: scenario.id,
      title: scenario.title,
      status: scenario.state === 'REVIEWABLE'
        ? null
        : scenario.state === 'BLOCKED_BY_OPTION_EVIDENCE'
          ? '実現条件の確認が必要'
          : '追加確認が必要',
      source: column.entry?.investmentEvidence ?? null,
    };
  });

  if (columns.length !== scenarios.length) {
    throw new TypeError('Investment scenario count mismatch');
  }

  function row(
    label: string,
    format: (column: Column, scenario: Scenario) => string,
  ) {
    return {
      label,
      values: investment!.columns.map(
        (column, index) => format(column, scenarios[index]!),
      ),
    };
  }

  function field(
    column: Column,
    key: 'leadTime' | 'internalEffort' | 'deliveryTeam',
  ): string {
    return column.entry === null
      ? '未入力'
      : column.entry[key] ?? '要確認';
  }

  return {
    scope: investment.scope,
    taxLabel: investment.taxBasis === 'EXCLUDING_TAX'
      ? '税別'
      : '税込',
    caveat:
      projection.scenarioPlans === undefined
        ? '合計額は初期投資と月額費用が明らかで、' +
          '月額費用が36か月一定の場合の参考額です。'
        : '合計額は36か月一定の条件、または年度別試算に基づく参考額です。' +
          '未算定分は補完しません。',
    columns,
    groups: [
      {
        title: '投資額',
        rows: [
          row('初期投資', c =>
            c.entry === null
              ? '未入力'
              : money(c.entry.initialYen)),
          row('月額運用費', c =>
            c.entry === null
              ? '未入力'
              : money(c.entry.monthlyYen)),
          row('初年度合計', c =>
            total(c, 'firstYearYen', plans.get(c.scenarioId))),
          row('3年間合計', c =>
            total(c, 'threeYearYen', plans.get(c.scenarioId))),
        ],
      },
      {
        title: '実現条件',
        rows: [
          row('費用の変動条件', c =>
            c.entry === null
              ? '未入力'
              : c.entry.monthlyPattern === 'CONSTANT_36_MONTHS'
                ? '36か月一定の想定'
                : '変動・未確認'),
          row('実施期間', c => field(c, 'leadTime')),
          row('社内の作業負担', c => field(c, 'internalEffort')),
          row('推進体制', c => field(c, 'deliveryTeam')),
        ],
      },
      {
        title: '判断に必要な前提',
        rows: [
          row('投資額の算定条件', (_, s) =>
            s.investmentNote ?? '未提示'),
          row('制約・トレードオフ', (_, s) =>
            list(s.tradeoffs)),
          row('リスク', (_, s) => list(s.risks)),
          row('前提条件', (_, s) => list(s.assumptions)),
        ],
      },
    ],
  };
}

export type InvestmentDisplay = NonNullable<
  ReturnType<typeof buildInvestmentDisplay>
>;
