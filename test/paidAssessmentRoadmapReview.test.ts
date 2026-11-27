import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ActOptionReviewResult } from '../src/domain/paidAssessmentActOptionReview';
import type { DecisionSessionReviewResult } from '../src/domain/paidAssessmentDecisionSessionReview';
import type { InitialActionPlanReview } from '../src/domain/paidAssessmentInitialActionPlan';
import {
  reviewPaidAssessmentRoadmap,
  type RoadmapItemDraft,
} from '../src/domain/paidAssessmentRoadmapReview';

function optionResult(): ActOptionReviewResult {
  const base = {
    title: '運用を標準化する', description: '手順を整理する', why: '安定運用のため',
    area: 'OPERATION' as const, lenses: ['STANDARDIZE' as const],
    future: { statement: '安定運用する', source: { kind: 'MANAGEMENT_FEEDBACK' as const, id: 'future', version: 1 } },
    gapIds: ['gap-1'], rootCauseHypothesisIds: [] as string[],
    expectedChange: { statement: '判断が統一される', verificationApproach: '差戻し件数を確認する' },
    assumptions: [] as string[], dependencies: [] as string[], risks: [] as string[],
    actorCandidates: ['CUSTOMER' as const],
  };
  return {
    options: [
      { ...base, id: 'act-reviewable', state: 'REVIEWABLE', reviewReasons: [] },
      { ...base, id: 'act-needs', state: 'NEEDS_CONFIRMATION', reviewReasons: ['ASSUMPTION_REMAINS'] },
      { ...base, id: 'act-blocked', state: 'BLOCKED_BY_GAP_EVIDENCE', reviewReasons: ['GAP_NOT_CONFIRMED:gap-1'] },
    ],
    counts: { REVIEWABLE: 1, NEEDS_CONFIRMATION: 1, BLOCKED_BY_GAP_EVIDENCE: 1 },
  };
}

function decisionResult(): DecisionSessionReviewResult {
  const base = {
    disposition: 'ACT_SELECTION' as const,
    decisionOwnerRef: 'management-owner',
    managementPriority: {
      statement: '安定運用を優先する',
      source: { kind: 'MANAGEMENT_FEEDBACK' as const, id: 'priority', version: 1 },
    },
    selectedActIds: ['act-reviewable'], heldActIds: [] as string[],
    rationale: '段階的に改善する', additionalEvidenceNeeded: [] as string[],
  };
  return {
    decisions: [
      { ...base, id: 'decision-reviewable', state: 'REVIEWABLE', reviewReasons: [] },
      { ...base, id: 'decision-needs', selectedActIds: ['act-needs'], state: 'NEEDS_CONFIRMATION', reviewReasons: ['ACT_NEEDS_CONFIRMATION:act-needs'] },
      { ...base, id: 'decision-blocked', selectedActIds: ['act-blocked'], state: 'BLOCKED_BY_OPTION_EVIDENCE', reviewReasons: ['ACT_BLOCKED:act-blocked'] },
      { ...base, id: 'decision-hold', disposition: 'HOLD', selectedActIds: [], state: 'REVIEWABLE', reviewReasons: [] },
      { ...base, id: 'decision-stop', disposition: 'STOP', selectedActIds: [], state: 'REVIEWABLE', reviewReasons: [] },
      { ...base, id: 'decision-evidence', disposition: 'ADDITIONAL_EVIDENCE', selectedActIds: [], state: 'REVIEWABLE', reviewReasons: [] },
    ],
    counts: { REVIEWABLE: 4, NEEDS_CONFIRMATION: 1, BLOCKED_BY_OPTION_EVIDENCE: 1 },
  };
}

function actionResult(): InitialActionPlanReview {
  const base = {
    title: '手順を棚卸しする', purpose: '標準化対象を明確にする', sequence: 1,
    targetWindow: 'DAYS_1_30' as const, prerequisites: [] as string[],
    deliverable: '現行手順一覧', expectedChange: '標準化対象が明確になる',
    verificationApproach: '一覧をレビューする', openQuestions: [] as string[],
  };
  return {
    actions: [
      { ...base, id: 'action-reviewable', decisionSessionId: 'decision-reviewable', actId: 'act-reviewable', state: 'REVIEWABLE_DRAFT', reviewReasons: [] },
      { ...base, id: 'action-needs', decisionSessionId: 'decision-needs', actId: 'act-needs', state: 'NEEDS_CONFIRMATION', reviewReasons: ['ACTION_QUESTIONS_REMAIN'] },
      { ...base, id: 'action-blocked', decisionSessionId: 'decision-blocked', actId: 'act-blocked', state: 'BLOCKED_BY_DECISION_EVIDENCE', reviewReasons: ['DECISION_BLOCKED:decision-blocked'] },
      { ...base, id: 'action-other-act', decisionSessionId: 'decision-needs', actId: 'act-needs', state: 'REVIEWABLE_DRAFT', reviewReasons: [] },
      { ...base, id: 'action-other-decision', decisionSessionId: 'decision-needs', actId: 'act-reviewable', state: 'REVIEWABLE_DRAFT', reviewReasons: [] },
    ],
    counts: { REVIEWABLE_DRAFT: 3, NEEDS_CONFIRMATION: 1, BLOCKED_BY_DECISION_EVIDENCE: 1 },
  };
}

function draft(id = 'roadmap-1'): RoadmapItemDraft {
  return {
    id,
    actId: 'act-reviewable',
    decisionSessionId: 'decision-reviewable',
    initialActionIds: ['action-reviewable'],
    horizon: 'MONTHS_1_3',
    commitment: 'SELECTED_ACT_DRAFT',
    sequence: 1,
    purpose: '運用標準化を段階的に進める',
    expectedChange: '運用判断が統一される可能性がある',
    verificationApproach: '差戻し件数を比較する',
    prerequisites: ['現行手順を確認する'],
    dependencies: ['関係者レビュー'],
    risks: ['現場負荷'],
    reassessmentTrigger: '初動の検証結果というNEW FACTが得られた時',
    openQuestions: [],
    authoredBy: 'assessment-reviewer',
  };
}

test('makes a selected ACT with a matching decision and initial action REVIEWABLE_DRAFT', () => {
  const result = reviewPaidAssessmentRoadmap(optionResult(), decisionResult(), actionResult(), [draft()]);
  assert.equal(result.items[0]!.state, 'REVIEWABLE_DRAFT');
  assert.deepEqual(result.items[0]!.reviewReasons, []);
  assert.equal(result.items[0]!.horizon, 'MONTHS_1_3');
  assert.equal('approved' in result.items[0]!, false);
  assert.equal('scheduledDate' in result.items[0]!, false);
  assert.equal('actorAssignment' in result.items[0]!, false);
});

test('allows a selected ACT in a later horizon without initial actions or forced 90-day completion', () => {
  const input = draft();
  input.horizon = 'MONTHS_10_12';
  input.initialActionIds = [];
  const result = reviewPaidAssessmentRoadmap(optionResult(), decisionResult(), actionResult(), [input]);
  assert.equal(result.items[0]!.state, 'REVIEWABLE_DRAFT');
  assert.deepEqual(result.items[0]!.initialActionIds, []);
  assert.equal('completionDate' in result.items[0]!, false);
});

test('keeps a beyond-12-month future candidate unselected pending a new decision', () => {
  const input = draft();
  input.commitment = 'FUTURE_CANDIDATE';
  delete input.decisionSessionId;
  input.initialActionIds = [];
  input.horizon = 'BEYOND_12_MONTHS';
  const result = reviewPaidAssessmentRoadmap(optionResult(), decisionResult(), actionResult(), [input]);
  assert.equal(result.items[0]!.state, 'NEEDS_CONFIRMATION');
  assert.deepEqual(result.items[0]!.reviewReasons, ['FUTURE_ACT_REQUIRES_NEW_DECISION']);
});

test('propagates blocked decision, ACT and actions with deterministic precedence and order', () => {
  const input = draft();
  input.actId = 'act-blocked';
  input.decisionSessionId = 'decision-blocked';
  input.initialActionIds = ['action-blocked'];
  input.openQuestions = ['実施時期はいつか'];
  const result = reviewPaidAssessmentRoadmap(optionResult(), decisionResult(), actionResult(), [input]);
  assert.equal(result.items[0]!.state, 'BLOCKED_BY_EVIDENCE');
  assert.deepEqual(result.items[0]!.reviewReasons, [
    'DECISION_BLOCKED:decision-blocked',
    'ACT_BLOCKED:act-blocked',
    'ACTION_BLOCKED:action-blocked',
  ]);
});

test('propagates confirmation-needed decision, ACT, action and roadmap questions in order', () => {
  const input = draft();
  input.actId = 'act-needs';
  input.decisionSessionId = 'decision-needs';
  input.initialActionIds = ['action-needs'];
  input.openQuestions = ['再評価責任者を確認する'];
  const result = reviewPaidAssessmentRoadmap(optionResult(), decisionResult(), actionResult(), [input]);
  assert.equal(result.items[0]!.state, 'NEEDS_CONFIRMATION');
  assert.deepEqual(result.items[0]!.reviewReasons, [
    'DECISION_NEEDS_CONFIRMATION:decision-needs',
    'ACT_NEEDS_CONFIRMATION:act-needs',
    'ACTION_NEEDS_CONFIRMATION:action-needs',
    'ROADMAP_QUESTIONS_REMAIN',
  ]);
});

test('rejects non-selection decisions and dangling or mismatched ACT and action references', () => {
  for (const decisionSessionId of ['decision-hold', 'decision-stop', 'decision-evidence']) {
    const input = draft();
    input.decisionSessionId = decisionSessionId;
    assert.throws(() => reviewPaidAssessmentRoadmap(optionResult(), decisionResult(), actionResult(), [input]), /not ACT_SELECTION/);
  }
  const unknownAct = draft();
  unknownAct.actId = 'missing';
  assert.throws(() => reviewPaidAssessmentRoadmap(optionResult(), decisionResult(), actionResult(), [unknownAct]), /unknown ACT/);
  const unselected = draft();
  unselected.actId = 'act-needs';
  assert.throws(() => reviewPaidAssessmentRoadmap(optionResult(), decisionResult(), actionResult(), [unselected]), /not selected/);
  const unknownAction = draft();
  unknownAction.initialActionIds = ['missing'];
  assert.throws(() => reviewPaidAssessmentRoadmap(optionResult(), decisionResult(), actionResult(), [unknownAction]), /unknown initial action/);
  const actMismatch = draft();
  actMismatch.initialActionIds = ['action-other-act'];
  assert.throws(() => reviewPaidAssessmentRoadmap(optionResult(), decisionResult(), actionResult(), [actMismatch]), /ACT mismatch/);
  const decisionMismatch = draft();
  decisionMismatch.initialActionIds = ['action-other-decision'];
  assert.throws(() => reviewPaidAssessmentRoadmap(optionResult(), decisionResult(), actionResult(), [decisionMismatch]), /decision mismatch/);
});

test('enforces future-candidate boundaries and rejects malformed roadmap fields', () => {
  const futureWithDecision = draft();
  futureWithDecision.commitment = 'FUTURE_CANDIDATE';
  futureWithDecision.initialActionIds = [];
  assert.throws(() => reviewPaidAssessmentRoadmap(optionResult(), decisionResult(), actionResult(), [futureWithDecision]), /must not have decisionSessionId/);
  const futureWithAction = draft();
  futureWithAction.commitment = 'FUTURE_CANDIDATE';
  delete futureWithAction.decisionSessionId;
  assert.throws(() => reviewPaidAssessmentRoadmap(optionResult(), decisionResult(), actionResult(), [futureWithAction]), /zero initial actions/);
  const missingDecision = draft();
  delete missingDecision.decisionSessionId;
  assert.throws(() => reviewPaidAssessmentRoadmap(optionResult(), decisionResult(), actionResult(), [missingDecision]), /requires decisionSessionId/);

  const mutations: Array<(value: RoadmapItemDraft) => void> = [
    value => { value.sequence = 0; },
    value => { value.sequence = 1.5; },
    value => { (value as { horizon: string }).horizon = 'YEAR_1'; },
    value => { (value as { commitment: string }).commitment = 'COMMITTED'; },
    value => { value.purpose = ' '; },
    value => { value.expectedChange = ''; },
    value => { value.verificationApproach = ' '; },
    value => { value.reassessmentTrigger = ''; },
    value => { value.prerequisites = [' ']; },
    value => { value.dependencies = ['']; },
    value => { value.risks = [' ']; },
    value => { value.openQuestions = ['']; },
    value => { value.authoredBy = ' '; },
    value => { value.initialActionIds = ['action-reviewable', 'action-reviewable']; },
  ];
  for (const mutate of mutations) {
    const invalid = draft();
    mutate(invalid);
    assert.throws(() => reviewPaidAssessmentRoadmap(optionResult(), decisionResult(), actionResult(), [invalid]), TypeError);
  }
});

test('rejects duplicate roadmap and upstream IDs or invalid upstream states', () => {
  assert.throws(
    () => reviewPaidAssessmentRoadmap(optionResult(), decisionResult(), actionResult(), [draft('same'), draft('same')]),
    /duplicate roadmap item id/,
  );
  const options = optionResult();
  options.options.push({ ...options.options[0]! });
  assert.throws(() => reviewPaidAssessmentRoadmap(options, decisionResult(), actionResult(), []), /duplicate option id/);
  const decisions = decisionResult();
  (decisions.decisions[0] as { state: string }).state = 'APPROVED';
  assert.throws(() => reviewPaidAssessmentRoadmap(optionResult(), decisions, actionResult(), []), /state is invalid/);
  const actions = actionResult();
  (actions.actions[0] as { state: string }).state = 'EXECUTED';
  assert.throws(() => reviewPaidAssessmentRoadmap(optionResult(), decisionResult(), actions, []), /state is invalid/);
});

test('accepts zero items and preserves order, inputs, deep detachment, and deterministic results', () => {
  assert.deepEqual(reviewPaidAssessmentRoadmap(optionResult(), decisionResult(), actionResult(), []), {
    items: [], counts: { REVIEWABLE_DRAFT: 0, NEEDS_CONFIRMATION: 0, BLOCKED_BY_EVIDENCE: 0 },
  });
  const firstDraft = draft('first');
  const secondDraft = draft('second');
  secondDraft.sequence = 2;
  secondDraft.horizon = 'TO_BE_DECIDED';
  const drafts = [firstDraft, secondDraft];
  const options = optionResult();
  const decisions = decisionResult();
  const actions = actionResult();
  const before = structuredClone({ drafts, options, decisions, actions });
  const first = reviewPaidAssessmentRoadmap(options, decisions, actions, drafts);
  const second = reviewPaidAssessmentRoadmap(options, decisions, actions, drafts);
  assert.deepEqual(first, second);
  assert.deepEqual({ drafts, options, decisions, actions }, before);
  assert.deepEqual(first.items.map(value => value.id), ['first', 'second']);
  assert.notEqual(first.items, drafts);
  assert.notEqual(first.items[0], drafts[0]);
  assert.notEqual(first.items[0]!.initialActionIds, drafts[0]!.initialActionIds);
  assert.notEqual(first.items[0]!.prerequisites, drafts[0]!.prerequisites);
  assert.notEqual(first.items[0]!.dependencies, drafts[0]!.dependencies);
  assert.notEqual(first.items[0]!.risks, drafts[0]!.risks);
  assert.notEqual(first.items[0]!.openQuestions, drafts[0]!.openQuestions);
});
