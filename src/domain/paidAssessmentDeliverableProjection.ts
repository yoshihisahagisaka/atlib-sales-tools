import type { PreparationSourceRef } from './paidAssessmentPreparation';
import {
  buildScenarioPlans,
  type ScenarioPlansInput,
} from './paidAssessmentScenarioPlan';
import {
  buildScenarioInvestmentComparison,
  type ScenarioInvestmentComparisonInput,
} from './paidAssessmentInvestmentComparison';
import {
  buildFutureScenarioComparison,
  type FutureScenarioComparisonInput,
} from './paidAssessmentFutureFitComparison';
import type { GapReviewResult, GapReviewState } from './paidAssessmentGapReview';
import type {
  RootCauseReviewResult,
  RootCauseReviewState,
} from './paidAssessmentRootCauseReview';
import type {
  ActOptionReviewResult,
  ActOptionReviewState,
} from './paidAssessmentActOptionReview';
import type {
  ManagementScenarioReview,
  ScenarioReviewState,
} from './paidAssessmentScenarioComparison';
import type {
  DecisionSessionReviewResult,
  DecisionSessionReviewState,
} from './paidAssessmentDecisionSessionReview';
import type {
  InitialActionPlanReview,
  InitialActionReviewState,
} from './paidAssessmentInitialActionPlan';
import type {
  RoadmapReviewResult,
  RoadmapReviewState,
} from './paidAssessmentRoadmapReview';

export type DeliverableStatementKind =
  | 'FUTURE'
  | 'VERIFIED_FACT_REFERENCE'
  | 'CUSTOMER_STATEMENT'
  | 'UNKNOWN'
  | 'OBSERVATION'
  | 'RISK_IMPACT'
  | 'HYPOTHESIS'
  | 'PROPOSAL'
  | 'DECISION_CANDIDATE'
  | 'EXPECTED_CHANGE';

export type DeliverableRelatedKind =
  | 'GAP'
  | 'ROOT_CAUSE'
  | 'ACT_OPTION'
  | 'SCENARIO'
  | 'DECISION_CANDIDATE'
  | 'INITIAL_ACTION'
  | 'ROADMAP'
  | 'STATEMENT';

export interface DeliverableRelatedRef {
  kind: DeliverableRelatedKind;
  id: string;
}

export interface DeliverableStatement {
  id: string;
  kind: DeliverableStatementKind;
  text: string;
  sourceRefs: readonly PreparationSourceRef[];
  relatedRefs: readonly DeliverableRelatedRef[];
}

export interface DeliverableSectionDraft {
  id: string;
  title: string;
  narrative: string;
  statementIds: readonly string[];
}

export interface DeliverableProjectionInput {
  reportId: string;
  customerLabel: string;
  purpose: string;
  statements: readonly DeliverableStatement[];
  sections: readonly DeliverableSectionDraft[];
  gaps: GapReviewResult;
  causes: RootCauseReviewResult;
  options: ActOptionReviewResult;
  scenarios: ManagementScenarioReview;
  decisions: DecisionSessionReviewResult;
  initialActions: InitialActionPlanReview;
  roadmap: RoadmapReviewResult;
  futureComparison?: FutureScenarioComparisonInput;
  investmentComparison?: ScenarioInvestmentComparisonInput;
  scenarioPlans?: ScenarioPlansInput;
}

export type DeliverableReadiness =
  | 'REVIEWABLE_DRAFT'
  | 'NEEDS_CONFIRMATION'
  | 'BLOCKED_BY_EVIDENCE';

export interface DeliverableProjection {
  reportId: string;
  customerLabel: string;
  purpose: string;
  sections: Array<DeliverableSectionDraft & { statements: DeliverableStatement[] }>;
  futureComparison?: ReturnType<typeof buildFutureScenarioComparison>;
  investmentComparison?: ReturnType<typeof buildScenarioInvestmentComparison>;
  scenarioPlans?: ReturnType<typeof buildScenarioPlans>;
  evidenceIndex: Array<{
    statementId: string;
    kind: DeliverableStatementKind;
    sources: PreparationSourceRef[];
  }>;
  references: {
    gapIds: string[];
    causeIds: string[];
    optionIds: string[];
    scenarioIds: string[];
    decisionIds: string[];
    initialActionIds: string[];
    roadmapIds: string[];
  };
  readiness: DeliverableReadiness;
  reviewReasons: string[];
}

const statementKinds = new Set<DeliverableStatementKind>([
  'FUTURE',
  'VERIFIED_FACT_REFERENCE',
  'CUSTOMER_STATEMENT',
  'UNKNOWN',
  'OBSERVATION',
  'RISK_IMPACT',
  'HYPOTHESIS',
  'PROPOSAL',
  'DECISION_CANDIDATE',
  'EXPECTED_CHANGE',
]);
const relatedKinds = new Set<DeliverableRelatedKind>([
  'GAP',
  'ROOT_CAUSE',
  'ACT_OPTION',
  'SCENARIO',
  'DECISION_CANDIDATE',
  'INITIAL_ACTION',
  'ROADMAP',
  'STATEMENT',
]);
const sourceKinds = new Set<PreparationSourceRef['kind']>([
  'FREE_DIAGNOSIS_REPORT',
  'MANAGEMENT_FEEDBACK',
  'CUSTOMER_STATEMENT',
  'CORE_VERIFIED_REFERENCE',
]);
const gapStates = new Set<GapReviewState>([
  'CONFIRMED_DIFFERENCE',
  'NO_DIFFERENCE_IDENTIFIED',
  'INSUFFICIENT_EVIDENCE',
]);
const causeStates = new Set<RootCauseReviewState>([
  'HYPOTHESIS_WITH_VERIFIED_SUPPORT',
  'HYPOTHESIS_CONTESTED',
  'HYPOTHESIS_UNSUBSTANTIATED',
  'BLOCKED_BY_GAP_EVIDENCE',
]);
const optionStates = new Set<ActOptionReviewState>([
  'REVIEWABLE',
  'NEEDS_CONFIRMATION',
  'BLOCKED_BY_GAP_EVIDENCE',
]);
const scenarioStates = new Set<ScenarioReviewState>([
  'REVIEWABLE',
  'NEEDS_CONFIRMATION',
  'BLOCKED_BY_OPTION_EVIDENCE',
]);
const decisionStates = new Set<DecisionSessionReviewState>([
  'REVIEWABLE',
  'NEEDS_CONFIRMATION',
  'BLOCKED_BY_OPTION_EVIDENCE',
]);
const actionStates = new Set<InitialActionReviewState>([
  'REVIEWABLE_DRAFT',
  'NEEDS_CONFIRMATION',
  'BLOCKED_BY_DECISION_EVIDENCE',
]);
const roadmapStates = new Set<RoadmapReviewState>([
  'REVIEWABLE_DRAFT',
  'NEEDS_CONFIRMATION',
  'BLOCKED_BY_EVIDENCE',
]);
const hashPattern = /^[0-9a-f]{64}$/;

function requireNonblank(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a nonblank string`);
  }
}

function validateSource(source: PreparationSourceRef, field: string): void {
  if (!source || typeof source !== 'object') throw new TypeError(`${field} must be an object`);
  if (!sourceKinds.has(source.kind)) throw new TypeError(`${field}.kind is invalid`);
  requireNonblank(source.id, `${field}.id`);
  if (!Number.isInteger(source.version) || source.version <= 0) {
    throw new TypeError(`${field}.version must be a positive integer`);
  }
  if (source.hash !== undefined && (typeof source.hash !== 'string' || !hashPattern.test(source.hash))) {
    throw new TypeError(`${field}.hash must be a 64-character lowercase hexadecimal hash`);
  }
}

function copySource(source: PreparationSourceRef): PreparationSourceRef {
  return source.hash === undefined
    ? { kind: source.kind, id: source.id, version: source.version }
    : { kind: source.kind, id: source.id, version: source.version, hash: source.hash };
}

function collectStates<T extends string>(
  values: readonly { id: string; state: T }[],
  field: string,
  validStates: ReadonlySet<T>,
): Map<string, T> {
  if (!Array.isArray(values)) throw new TypeError(`${field} must be an array`);
  const byId = new Map<string, T>();
  for (const value of values) {
    if (!value || typeof value !== 'object') throw new TypeError(`${field} entry must be an object`);
    requireNonblank(value.id, `${field} entry.id`);
    if (byId.has(value.id)) throw new TypeError(`${field} contains duplicate id: ${value.id}`);
    if (!validStates.has(value.state)) throw new TypeError(`${field} ${value.id}.state is invalid`);
    byId.set(value.id, value.state);
  }
  return byId;
}

function pushUnique(values: string[], seen: Set<string>, value: string): void {
  if (!seen.has(value)) {
    seen.add(value);
    values.push(value);
  }
}

function copyStatement(statement: DeliverableStatement): DeliverableStatement {
  return {
    id: statement.id,
    kind: statement.kind,
    text: statement.text,
    sourceRefs: statement.sourceRefs.map(copySource),
    relatedRefs: statement.relatedRefs.map(ref => ({ kind: ref.kind, id: ref.id })),
  };
}

export function buildPaidAssessmentDeliverableProjection(
  input: DeliverableProjectionInput,
): DeliverableProjection {
  if (!input || typeof input !== 'object') throw new TypeError('input must be an object');
  requireNonblank(input.reportId, 'reportId');
  requireNonblank(input.customerLabel, 'customerLabel');
  requireNonblank(input.purpose, 'purpose');
  if (!Array.isArray(input.statements)) throw new TypeError('statements must be an array');
  if (!Array.isArray(input.sections)) throw new TypeError('sections must be an array');
  const inputStatements = input.statements as readonly DeliverableStatement[];
  const inputSections = input.sections as readonly DeliverableSectionDraft[];
  if (!input.gaps || typeof input.gaps !== 'object') throw new TypeError('gaps must be an object');
  if (!input.causes || typeof input.causes !== 'object') throw new TypeError('causes must be an object');
  if (!input.options || typeof input.options !== 'object') throw new TypeError('options must be an object');
  if (!input.scenarios || typeof input.scenarios !== 'object') throw new TypeError('scenarios must be an object');
  if (!input.decisions || typeof input.decisions !== 'object') throw new TypeError('decisions must be an object');
  if (!input.initialActions || typeof input.initialActions !== 'object') {
    throw new TypeError('initialActions must be an object');
  }
  if (!input.roadmap || typeof input.roadmap !== 'object') throw new TypeError('roadmap must be an object');

  const upstream = {
    GAP: collectStates(input.gaps.items, 'gaps.items', gapStates),
    ROOT_CAUSE: collectStates(input.causes.hypotheses, 'causes.hypotheses', causeStates),
    ACT_OPTION: collectStates(input.options.options, 'options.options', optionStates),
    SCENARIO: collectStates(input.scenarios.scenarios, 'scenarios.scenarios', scenarioStates),
    DECISION_CANDIDATE: collectStates(input.decisions.decisions, 'decisions.decisions', decisionStates),
    INITIAL_ACTION: collectStates(input.initialActions.actions, 'initialActions.actions', actionStates),
    ROADMAP: collectStates(input.roadmap.items, 'roadmap.items', roadmapStates),
  };

  const statementIds = new Set<string>();
  for (const statement of inputStatements) {
    if (!statement || typeof statement !== 'object') throw new TypeError('statement must be an object');
    requireNonblank(statement.id, 'statement.id');
    if (statementIds.has(statement.id)) throw new TypeError(`duplicate statement id: ${statement.id}`);
    statementIds.add(statement.id);
  }

  const statementById = new Map<string, DeliverableStatement>();
  for (const statement of inputStatements) {
    if (!statementKinds.has(statement.kind)) {
      throw new TypeError(`statement ${statement.id}.kind is invalid`);
    }
    requireNonblank(statement.text, `statement ${statement.id}.text`);
    if (!Array.isArray(statement.sourceRefs)) {
      throw new TypeError(`statement ${statement.id}.sourceRefs must be an array`);
    }
    for (const source of statement.sourceRefs) {
      validateSource(source, `statement ${statement.id}.sourceRefs entry`);
    }
    if (
      statement.kind === 'VERIFIED_FACT_REFERENCE'
      && !statement.sourceRefs.some(source => source.kind === 'CORE_VERIFIED_REFERENCE')
    ) {
      throw new TypeError(`statement ${statement.id} VERIFIED_FACT_REFERENCE requires CORE_VERIFIED_REFERENCE`);
    }
    if (!Array.isArray(statement.relatedRefs)) {
      throw new TypeError(`statement ${statement.id}.relatedRefs must be an array`);
    }
    const relatedRefs = statement.relatedRefs as readonly DeliverableRelatedRef[];
    const relatedKeys = new Set<string>();
    for (const ref of relatedRefs) {
      if (!ref || typeof ref !== 'object') {
        throw new TypeError(`statement ${statement.id}.relatedRefs entry must be an object`);
      }
      if (!relatedKinds.has(ref.kind)) {
        throw new TypeError(`statement ${statement.id}.relatedRefs kind is invalid`);
      }
      requireNonblank(ref.id, `statement ${statement.id}.relatedRefs id`);
      const key = `${ref.kind}\u0000${ref.id}`;
      if (relatedKeys.has(key)) {
        throw new TypeError(`statement ${statement.id} has duplicate related ref: ${ref.kind}:${ref.id}`);
      }
      relatedKeys.add(key);
      const exists = ref.kind === 'STATEMENT'
        ? statementIds.has(ref.id)
        : upstream[ref.kind].has(ref.id);
      if (!exists) {
        throw new TypeError(`statement ${statement.id} has unknown related ref: ${ref.kind}:${ref.id}`);
      }
    }
    statementById.set(statement.id, statement);
  }

  const sectionIds = new Set<string>();
  const sections: DeliverableProjection['sections'] = [];
  for (const section of inputSections) {
    if (!section || typeof section !== 'object') throw new TypeError('section must be an object');
    requireNonblank(section.id, 'section.id');
    if (sectionIds.has(section.id)) throw new TypeError(`duplicate section id: ${section.id}`);
    sectionIds.add(section.id);
    requireNonblank(section.title, `section ${section.id}.title`);
    requireNonblank(section.narrative, `section ${section.id}.narrative`);
    if (!Array.isArray(section.statementIds)) {
      throw new TypeError(`section ${section.id}.statementIds must be an array`);
    }
    const sectionStatementIds = new Set<string>();
    const statements: DeliverableStatement[] = [];
    for (const statementId of section.statementIds) {
      requireNonblank(statementId, `section ${section.id}.statementIds entry`);
      if (sectionStatementIds.has(statementId)) {
        throw new TypeError(`section ${section.id} contains duplicate statement id: ${statementId}`);
      }
      sectionStatementIds.add(statementId);
      const statement = statementById.get(statementId);
      if (!statement) throw new TypeError(`section ${section.id} has unknown statement id: ${statementId}`);
      statements.push(copyStatement(statement));
    }
    sections.push({
      id: section.id,
      title: section.title,
      narrative: section.narrative,
      statementIds: [...section.statementIds],
      statements,
    });
  }

  const references: DeliverableProjection['references'] = {
    gapIds: [],
    causeIds: [],
    optionIds: [],
    scenarioIds: [],
    decisionIds: [],
    initialActionIds: [],
    roadmapIds: [],
  };
  const referenceTargets: Record<Exclude<DeliverableRelatedKind, 'STATEMENT'>, string[]> = {
    GAP: references.gapIds,
    ROOT_CAUSE: references.causeIds,
    ACT_OPTION: references.optionIds,
    SCENARIO: references.scenarioIds,
    DECISION_CANDIDATE: references.decisionIds,
    INITIAL_ACTION: references.initialActionIds,
    ROADMAP: references.roadmapIds,
  };
  const referencedKeys = new Set<string>();
  const blockedReasons: string[] = [];
  const blockedReasonKeys = new Set<string>();
  const confirmationReasons: string[] = [];
  const confirmationReasonKeys = new Set<string>();

  for (const statement of inputStatements) {
    if (statement.sourceRefs.length === 0 && statement.kind !== 'UNKNOWN') {
      pushUnique(
        confirmationReasons,
        confirmationReasonKeys,
        `SOURCE_NOT_PROVIDED:${statement.id}`,
      );
    }
    for (const ref of statement.relatedRefs) {
      if (ref.kind === 'STATEMENT') continue;
      const refKey = `${ref.kind}\u0000${ref.id}`;
      if (!referencedKeys.has(refKey)) {
        referencedKeys.add(refKey);
        referenceTargets[ref.kind].push(ref.id);
      }
      const state = upstream[ref.kind].get(ref.id)!;
      const blocked =
        (ref.kind === 'ROOT_CAUSE' && state === 'BLOCKED_BY_GAP_EVIDENCE')
        || (ref.kind === 'ACT_OPTION' && state === 'BLOCKED_BY_GAP_EVIDENCE')
        || (ref.kind === 'SCENARIO' && state === 'BLOCKED_BY_OPTION_EVIDENCE')
        || (ref.kind === 'DECISION_CANDIDATE' && state === 'BLOCKED_BY_OPTION_EVIDENCE')
        || (ref.kind === 'INITIAL_ACTION' && state === 'BLOCKED_BY_DECISION_EVIDENCE')
        || (ref.kind === 'ROADMAP' && state === 'BLOCKED_BY_EVIDENCE');
      if (blocked) {
        pushUnique(
          blockedReasons,
          blockedReasonKeys,
          `UPSTREAM_BLOCKED:${ref.kind}:${ref.id}`,
        );
      }

      const needsReview =
        (ref.kind === 'GAP' && state === 'INSUFFICIENT_EVIDENCE')
        || (
          ref.kind === 'ROOT_CAUSE'
          && (state === 'HYPOTHESIS_CONTESTED' || state === 'HYPOTHESIS_UNSUBSTANTIATED')
        )
        || (ref.kind === 'ACT_OPTION' && state === 'NEEDS_CONFIRMATION')
        || (ref.kind === 'SCENARIO' && state === 'NEEDS_CONFIRMATION')
        || (ref.kind === 'DECISION_CANDIDATE' && state === 'NEEDS_CONFIRMATION')
        || (ref.kind === 'INITIAL_ACTION' && state === 'NEEDS_CONFIRMATION')
        || (ref.kind === 'ROADMAP' && state === 'NEEDS_CONFIRMATION');
      if (needsReview) {
        pushUnique(
          confirmationReasons,
          confirmationReasonKeys,
          `UPSTREAM_REVIEW_NEEDED:${ref.kind}:${ref.id}`,
        );
      }
      if (ref.kind === 'DECISION_CANDIDATE') {
        pushUnique(
          confirmationReasons,
          confirmationReasonKeys,
          `DECISION_NOT_AUTHENTICATED:DECISION_CANDIDATE:${ref.id}`,
        );
      }
    }
  }

  // Optional comparison data shares the same D1 review boundary.
  // Existing reports without a comparison retain their exact behavior.
  const futureComparison = input.futureComparison === undefined
    ? undefined
    : buildFutureScenarioComparison(
        inputStatements,
        input.scenarios,
        input.futureComparison,
      );

  if (futureComparison !== undefined) {
    if (futureComparison.rows.length === 0) {
      pushUnique(
        confirmationReasons,
        confirmationReasonKeys,
        'FUTURE_COMPARISON_NO_CRITERIA',
      );
    }

    if (futureComparison.scenarios.length === 0) {
      pushUnique(
        confirmationReasons,
        confirmationReasonKeys,
        'FUTURE_COMPARISON_NO_SCENARIOS',
      );
    }

    for (const scenario of futureComparison.scenarios) {
      const refKey = `SCENARIO\u0000${scenario.id}`;

      if (!referencedKeys.has(refKey)) {
        referencedKeys.add(refKey);
        references.scenarioIds.push(scenario.id);
      }

      if (scenario.state === 'BLOCKED_BY_OPTION_EVIDENCE') {
        pushUnique(
          blockedReasons,
          blockedReasonKeys,
          `UPSTREAM_BLOCKED:SCENARIO:${scenario.id}`,
        );
      } else if (scenario.state === 'NEEDS_CONFIRMATION') {
        pushUnique(
          confirmationReasons,
          confirmationReasonKeys,
          `UPSTREAM_REVIEW_NEEDED:SCENARIO:${scenario.id}`,
        );
      }
    }

    for (const row of futureComparison.rows) {
      for (const cell of row.cells) {
        const pair = JSON.stringify([
          row.criterion.id,
          cell.scenarioId,
        ]);

        if (cell.evaluation === null) {
          pushUnique(
            confirmationReasons,
            confirmationReasonKeys,
            `FUTURE_FIT_NOT_EVALUATED:${pair}`,
          );
        } else if (cell.evaluation.rating === 'NEEDS_CONFIRMATION') {
          pushUnique(
            confirmationReasons,
            confirmationReasonKeys,
            `FUTURE_FIT_NEEDS_CONFIRMATION:${pair}`,
          );
        }
      }
    }
  }

  if (
    input.investmentComparison !== undefined &&
    futureComparison === undefined
  ) {
    throw new TypeError(
      'Investment comparison requires future comparison',
    );
  }

  const investmentComparison =
    input.investmentComparison === undefined
      ? undefined
      : buildScenarioInvestmentComparison(
          futureComparison!.scenarios,
          input.investmentComparison,
        );

  if (investmentComparison !== undefined) {
    for (const column of investmentComparison.columns) {
      if (column.entry === null) {
        pushUnique(
          confirmationReasons,
          confirmationReasonKeys,
          `INVESTMENT_COMPARISON_NOT_ENTERED:${column.scenarioId}`,
        );
      }
    }
  }

  if (
    input.scenarioPlans !== undefined &&
    (
      futureComparison === undefined ||
      investmentComparison === undefined
    )
  ) {
    throw new TypeError(
      'Scenario plans require future and investment comparisons',
    );
  }

  const scenarioPlans =
    input.scenarioPlans === undefined
      ? undefined
      : buildScenarioPlans(
          futureComparison!.scenarios,
          investmentComparison!,
          input.scenarioPlans,
        );

  if (scenarioPlans !== undefined) {
    for (const column of scenarioPlans.plans) {
      if (column.plan === null) {
        pushUnique(
          confirmationReasons,
          confirmationReasonKeys,
          `SCENARIO_PLAN_NOT_ENTERED:${column.scenarioId}`,
        );
        continue;
      }

      for (const id of column.plan.uncoveredOptionIds) {
        pushUnique(
          confirmationReasons,
          confirmationReasonKeys,
          `SCENARIO_PLAN_OPTION_NOT_COVERED:${JSON.stringify([column.scenarioId, id])}`,
        );
      }

      for (const year of column.plan.years) {
        if (year.openQuestions.length > 0) {
          pushUnique(
            confirmationReasons,
            confirmationReasonKeys,
            `SCENARIO_PLAN_OPEN_QUESTIONS:${JSON.stringify([column.scenarioId, year.year])}`,
          );
        }

        for (const id of year.optionIds) {
          const state = upstream.ACT_OPTION.get(id);

          if (state === undefined) {
            throw new TypeError('Unknown scenario plan ACT option');
          }

          const refKey = `ACT_OPTION\u0000${id}`;

          if (!referencedKeys.has(refKey)) {
            referencedKeys.add(refKey);
            references.optionIds.push(id);
          }

          if (state === 'BLOCKED_BY_GAP_EVIDENCE') {
            pushUnique(
              blockedReasons,
              blockedReasonKeys,
              `UPSTREAM_BLOCKED:ACT_OPTION:${id}`,
            );
          } else if (state === 'NEEDS_CONFIRMATION') {
            pushUnique(
              confirmationReasons,
              confirmationReasonKeys,
              `UPSTREAM_REVIEW_NEEDED:ACT_OPTION:${id}`,
            );
          }
        }
      }
    }
  }

  if (inputSections.length === 0) {
    pushUnique(confirmationReasons, confirmationReasonKeys, 'NO_SECTIONS');
  }

  let readiness: DeliverableReadiness;
  let reviewReasons: string[];
  if (blockedReasons.length > 0) {
    readiness = 'BLOCKED_BY_EVIDENCE';
    reviewReasons = blockedReasons;
  } else if (confirmationReasons.length > 0) {
    readiness = 'NEEDS_CONFIRMATION';
    reviewReasons = confirmationReasons;
  } else {
    readiness = 'REVIEWABLE_DRAFT';
    reviewReasons = [];
  }

  return {
    reportId: input.reportId,
    customerLabel: input.customerLabel,
    purpose: input.purpose,
    sections,
    evidenceIndex: inputStatements.map(statement => ({
      statementId: statement.id,
      kind: statement.kind,
      sources: statement.sourceRefs.map(copySource),
    })),
    references,
    ...(futureComparison === undefined
      ? {}
      : { futureComparison }),
    ...(investmentComparison === undefined
      ? {}
      : { investmentComparison }),
    ...(scenarioPlans === undefined
      ? {}
      : { scenarioPlans }),
    readiness,
    reviewReasons,
  };
}
