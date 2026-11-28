import type {
  PreparationSourceRef
} from './paidAssessmentPreparation';

import type {
  ManagementScenarioReview
} from './paidAssessmentScenarioComparison';

import type {
  DeliverableStatement
} from './paidAssessmentDeliverableProjection';

export type FutureFitRating =
  | 'HIGH'
  | 'SUFFICIENT'
  | 'PARTIAL'
  | 'DIFFICULT'
  | 'NEEDS_CONFIRMATION';

export interface FutureCriterion {
  id: string;
  futureStatementId: string;
  title: string;
  rationale: string;
}

export interface ScenarioFutureFit {
  criterionId: string;
  scenarioId: string;
  rating: FutureFitRating;
  rationale: string;
  sourceRefs: readonly PreparationSourceRef[];
}

export interface ScenarioRecommendation {
  scenarioId: string;
  rationale: string;
  conditions: readonly string[];
  alternativeConditions: readonly string[];
}

export interface FutureScenarioComparisonInput {
  criteria: readonly FutureCriterion[];
  scenarioIds: readonly string[];
  evaluations: readonly ScenarioFutureFit[];
  recommendation?: ScenarioRecommendation;
}

const ratings = new Set<FutureFitRating>([
  'HIGH',
  'SUFFICIENT',
  'PARTIAL',
  'DIFFICULT',
  'NEEDS_CONFIRMATION',
]);

const sourceKinds = new Set([
  'FREE_DIAGNOSIS_REPORT',
  'MANAGEMENT_FEEDBACK',
  'CUSTOMER_STATEMENT',
  'CORE_VERIFIED_REFERENCE',
]);

const scenarioStates = new Set([
  'REVIEWABLE',
  'NEEDS_CONFIRMATION',
  'BLOCKED_BY_OPTION_EVIDENCE',
]);

function requireObject(
  value: unknown,
  field: string,
): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object`);
  }
}

function nonblank(value: unknown, field: string): void {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${field} must be nonblank`);
  }
}

function requireArray(value: unknown, field: string): void {
  if (!Array.isArray(value)) {
    throw new TypeError(`${field} must be an array`);
  }
}

function stringArray(
  values: readonly string[],
  field: string,
): void {
  requireArray(values, field);
  for (const value of values) nonblank(value, field);
}

function validateSource(source: PreparationSourceRef): void {
  requireObject(source, 'source');
  if (!sourceKinds.has(source.kind)) {
    throw new TypeError('Invalid source kind');
  }
  nonblank(source.id, 'source.id');
  if (!Number.isInteger(source.version) || source.version <= 0) {
    throw new TypeError('Invalid source version');
  }
  if (
    source.hash !== undefined &&
    (
      typeof source.hash !== 'string' ||
      !/^[0-9a-f]{64}$/.test(source.hash)
    )
  ) {
    throw new TypeError('Invalid source hash');
  }
}

function key(criterionId: string, scenarioId: string): string {
  return JSON.stringify([criterionId, scenarioId]);
}

export function buildFutureScenarioComparison(
  statements: readonly DeliverableStatement[],
  scenarios: ManagementScenarioReview,
  input: FutureScenarioComparisonInput,
) {
  requireArray(statements, 'statements');
  requireObject(scenarios, 'scenarios');
  requireArray(scenarios.scenarios, 'scenarios.scenarios');
  requireObject(input, 'input');
  requireArray(input.criteria, 'criteria');
  requireArray(input.scenarioIds, 'scenarioIds');
  requireArray(input.evaluations, 'evaluations');

  const statementIds = new Set<string>();
  const futures = new Map<string, DeliverableStatement>();

  for (const statement of statements) {
    requireObject(statement, 'statement');
    nonblank(statement.id, 'statement.id');

    if (statementIds.has(statement.id)) {
      throw new TypeError('Duplicate statement');
    }
    statementIds.add(statement.id);

    if (statement.kind === 'FUTURE') {
      nonblank(statement.text, 'future.text');
      requireArray(statement.sourceRefs, 'future.sourceRefs');
      if (statement.sourceRefs.length === 0) {
        throw new TypeError('FUTURE requires source');
      }
      statement.sourceRefs.forEach(validateSource);
      futures.set(statement.id, statement);
    }
  }

  const availableScenarios =
    new Map<string, ManagementScenarioReview['scenarios'][number]>();

  for (const scenario of scenarios.scenarios) {
    requireObject(scenario, 'scenario');
    nonblank(scenario.id, 'scenario.id');
    nonblank(scenario.title, 'scenario.title');

    if (availableScenarios.has(scenario.id)) {
      throw new TypeError('Duplicate upstream scenario');
    }
    if (!scenarioStates.has(scenario.state)) {
      throw new TypeError('Invalid scenario state');
    }

    stringArray(scenario.reviewReasons, 'scenario.reviewReasons');
    availableScenarios.set(scenario.id, scenario);
  }

  const criterionIds = new Set<string>();

  for (const criterion of input.criteria) {
    requireObject(criterion, 'criterion');
    nonblank(criterion.id, 'criterion.id');
    nonblank(criterion.futureStatementId, 'futureStatementId');
    nonblank(criterion.title, 'criterion.title');
    nonblank(criterion.rationale, 'criterion.rationale');

    if (criterionIds.has(criterion.id)) {
      throw new TypeError('Duplicate criterion');
    }
    if (!futures.has(criterion.futureStatementId)) {
      throw new TypeError('Unknown FUTURE reference');
    }

    criterionIds.add(criterion.id);
  }

  const selectedScenarios = new Set<string>();

  for (const id of input.scenarioIds) {
    nonblank(id, 'scenarioId');

    if (selectedScenarios.has(id)) {
      throw new TypeError('Duplicate scenario');
    }
    if (!availableScenarios.has(id)) {
      throw new TypeError('Unknown scenario');
    }

    selectedScenarios.add(id);
  }

  const evaluations = new Map<string, ScenarioFutureFit>();

  for (const evaluation of input.evaluations) {
    requireObject(evaluation, 'evaluation');

    if (!criterionIds.has(evaluation.criterionId)) {
      throw new TypeError('Unknown criterion');
    }

    if (!selectedScenarios.has(evaluation.scenarioId)) {
      throw new TypeError('Unknown comparison scenario');
    }

    if (!ratings.has(evaluation.rating)) {
      throw new TypeError('Invalid rating');
    }

    nonblank(evaluation.rationale, 'evaluation.rationale');
    requireArray(evaluation.sourceRefs, 'evaluation.sourceRefs');
    evaluation.sourceRefs.forEach(validateSource);

    if (
      evaluation.rating !== 'NEEDS_CONFIRMATION' &&
      evaluation.sourceRefs.length === 0
    ) {
      throw new TypeError('Evaluation requires source');
    }

    const id = key(evaluation.criterionId, evaluation.scenarioId);

    if (evaluations.has(id)) {
      throw new TypeError('Duplicate evaluation');
    }

    evaluations.set(id, evaluation);
  }

  if (input.recommendation !== undefined) {
    const recommendation = input.recommendation;
    requireObject(recommendation, 'recommendation');

    if (!selectedScenarios.has(recommendation.scenarioId)) {
      throw new TypeError('Unknown recommended scenario');
    }

    nonblank(recommendation.rationale, 'recommendation.rationale');
    stringArray(recommendation.conditions, 'conditions');
    stringArray(
      recommendation.alternativeConditions,
      'alternativeConditions',
    );
  }

  // Review states remain independent of future-fit ratings.
  // A recommendation never establishes a customer decision.
  return structuredClone({
    scenarios: input.scenarioIds.map(
      id => availableScenarios.get(id)!,
    ),
    rows: input.criteria.map(criterion => ({
      criterion,
      future: futures.get(criterion.futureStatementId)!,
      cells: input.scenarioIds.map(scenarioId => ({
        scenarioId,
        evaluation:
          evaluations.get(key(criterion.id, scenarioId)) ?? null,
      })),
    })),
    recommendation: input.recommendation ?? null,
  });
}
