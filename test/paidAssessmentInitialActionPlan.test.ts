import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ActOptionReviewResult } from '../src/domain/paidAssessmentActOptionReview';
import type { DecisionSessionReviewResult } from '../src/domain/paidAssessmentDecisionSessionReview';
import {
  reviewPaidAssessmentInitialActions,
  type InitialActionDraft,
} from '../src/domain/paidAssessmentInitialActionPlan';

function optionResult(): ActOptionReviewResult {
  const base = {
    title: '標準化する', description: '手順を標準化する', why: '安定運用のため',
    area: 'OPERATION' as const, lenses: ['STANDARDIZE' as const],
    future: { statement: '安定運用する', source: { kind: 'MANAGEMENT_FEEDBACK' as const, id: 'future', version: 1 } },
    gapIds: ['gap-1'], rootCauseHypothesisIds: [] as string[],
    expectedChange: { statement: '判断が統一される', verificationApproach: '差戻し件数を確認' },
    assumptions: [] as string[], dependencies: [] as string[], risks: [] as string[],
    actorCandidates: ['CUSTOMER' as const],
  };
  return {
    options: [
      { ...base, id: 'act-reviewable', state: 'REVIEWABLE', reviewReasons: [] },
      { ...base, id: 'act-needs', state: 'NEEDS_CONFIRMATION', reviewReasons: ['ASSUMPTION_REMAINS'] },
      { ...base, id: 'act-blocked', state: 'BLOCKED_BY_GAP_EVIDENCE', reviewReasons: ['GAP_NOT_CONFIRMED:gap-1'] },
      { ...base, id: 'act-held', state: 'REVIEWABLE', reviewReasons: [] },
    ],
    counts: { REVIEWABLE: 2, NEEDS_CONFIRMATION: 1, BLOCKED_BY_GAP_EVIDENCE: 1 },
  };
}

function decisionResult(): DecisionSessionReviewResult {
  const base = {
    disposition: 'ACT_SELECTION' as const,
    decisionOwnerRef: 'management-owner-1',
    managementPriority: {
      statement: '安定運用を優先する',
      source: { kind: 'MANAGEMENT_FEEDBACK' as const, id: 'priority', version: 1 },
    },
    selectedActIds: ['act-reviewable'], heldActIds: ['act-held'],
    rationale: '最初の改善対象とする', additionalEvidenceNeeded: [] as string[],
  };
  return {
    decisions: [
      { ...base, id: 'decision-reviewable', state: 'REVIEWABLE', reviewReasons: [] },
      { ...base, id: 'decision-needs', selectedActIds: ['act-needs'], state: 'NEEDS_CONFIRMATION', reviewReasons: ['ACT_NEEDS_CONFIRMATION:act-needs'] },
      { ...base, id: 'decision-blocked', selectedActIds: ['act-blocked'], state: 'BLOCKED_BY_OPTION_EVIDENCE', reviewReasons: ['ACT_BLOCKED:act-blocked'] },
      { ...base, id: 'decision-mixed-blocked', selectedActIds: ['act-blocked'], state: 'BLOCKED_BY_OPTION_EVIDENCE', reviewReasons: ['ACT_BLOCKED:act-blocked'] },
      { ...base, id: 'decision-hold', disposition: 'HOLD', selectedActIds: [], state: 'REVIEWABLE', reviewReasons: [] },
      { ...base, id: 'decision-stop', disposition: 'STOP', selectedActIds: [], state: 'REVIEWABLE', reviewReasons: [] },
      { ...base, id: 'decision-evidence', disposition: 'ADDITIONAL_EVIDENCE', selectedActIds: [], state: 'REVIEWABLE', reviewReasons: [] },
    ],
    counts: { REVIEWABLE: 4, NEEDS_CONFIRMATION: 1, BLOCKED_BY_OPTION_EVIDENCE: 2 },
  };
}

function draft(id = 'action-1'): InitialActionDraft {
  return {
    id,
    decisionSessionId: 'decision-reviewable',
    actId: 'act-reviewable',
    title: '運用手順の棚卸し',
    purpose: '標準化対象を明確にする',
    sequence: 1,
    targetWindow: 'DAYS_1_30',
    prerequisites: ['関係者への事前連絡'],
    actorProposal: { label: '業務責任者候補', rationale: '現行手順を把握しているため' },
    deliverable: '現行手順一覧',
    expectedChange: '標準化対象が合意できる',
    verificationApproach: '一覧のレビュー記録を確認する',
    openQuestions: [],
    authoredBy: 'assessment-reviewer-1',
  };
}

test('classifies a human-authored action for a selected ACT as REVIEWABLE_DRAFT', () => {
  const result = reviewPaidAssessmentInitialActions(optionResult(), decisionResult(), [draft()]);
  assert.equal(result.actions[0]!.state, 'REVIEWABLE_DRAFT');
  assert.deepEqual(result.actions[0]!.reviewReasons, []);
  assert.deepEqual(result.actions[0]!.actorProposal, {
    label: '業務責任者候補', rationale: '現行手順を把握しているため',
  });
  assert.equal('assignedActor' in result.actions[0]!, false);
  assert.equal('workId' in result.actions[0]!, false);
  assert.equal('startDate' in result.actions[0]!, false);
});

test('gives blocked decision and ACT evidence precedence in deterministic order', () => {
  const input = draft();
  input.decisionSessionId = 'decision-mixed-blocked';
  input.actId = 'act-blocked';
  input.openQuestions = ['開始条件を確認する'];
  const result = reviewPaidAssessmentInitialActions(optionResult(), decisionResult(), [input]);
  assert.equal(result.actions[0]!.state, 'BLOCKED_BY_DECISION_EVIDENCE');
  assert.deepEqual(result.actions[0]!.reviewReasons, [
    'DECISION_BLOCKED:decision-mixed-blocked',
    'ACT_BLOCKED:act-blocked',
  ]);
});

test('propagates confirmation-needed decision, ACT and action questions in order', () => {
  const input = draft();
  input.decisionSessionId = 'decision-needs';
  input.actId = 'act-needs';
  input.openQuestions = ['確認担当者は誰か'];
  const result = reviewPaidAssessmentInitialActions(optionResult(), decisionResult(), [input]);
  assert.equal(result.actions[0]!.state, 'NEEDS_CONFIRMATION');
  assert.deepEqual(result.actions[0]!.reviewReasons, [
    'DECISION_NEEDS_CONFIRMATION:decision-needs',
    'ACT_NEEDS_CONFIRMATION:act-needs',
    'ACTION_QUESTIONS_REMAIN',
  ]);
});

test('rejects non-selection decisions and unknown, held, or unselected ACT references', () => {
  for (const decisionSessionId of ['decision-hold', 'decision-stop', 'decision-evidence']) {
    const input = draft();
    input.decisionSessionId = decisionSessionId;
    assert.throws(() => reviewPaidAssessmentInitialActions(optionResult(), decisionResult(), [input]), /not ACT_SELECTION/);
  }
  const unknownDecision = draft();
  unknownDecision.decisionSessionId = 'missing';
  assert.throws(() => reviewPaidAssessmentInitialActions(optionResult(), decisionResult(), [unknownDecision]), /unknown decision/);
  const unknownAct = draft();
  unknownAct.actId = 'missing';
  assert.throws(() => reviewPaidAssessmentInitialActions(optionResult(), decisionResult(), [unknownAct]), /unknown ACT/);
  const held = draft();
  held.actId = 'act-held';
  assert.throws(() => reviewPaidAssessmentInitialActions(optionResult(), decisionResult(), [held]), /held ACT/);
  const unselected = draft();
  unselected.actId = 'act-needs';
  assert.throws(() => reviewPaidAssessmentInitialActions(optionResult(), decisionResult(), [unselected]), /unselected ACT/);
});

test('allows multiple ordered actions per ACT and LATER or TO_BE_DECIDED windows', () => {
  const first = draft('first');
  first.sequence = 2;
  first.targetWindow = 'LATER';
  const second = draft('second');
  second.sequence = 1;
  second.targetWindow = 'TO_BE_DECIDED';
  const result = reviewPaidAssessmentInitialActions(optionResult(), decisionResult(), [first, second]);
  assert.deepEqual(result.actions.map(value => value.id), ['first', 'second']);
  assert.deepEqual(result.actions.map(value => value.sequence), [2, 1]);
  assert.deepEqual(result.actions.map(value => value.targetWindow), ['LATER', 'TO_BE_DECIDED']);
});

test('accepts zero action drafts', () => {
  assert.deepEqual(reviewPaidAssessmentInitialActions(optionResult(), decisionResult(), []), {
    actions: [],
    counts: { REVIEWABLE_DRAFT: 0, NEEDS_CONFIRMATION: 0, BLOCKED_BY_DECISION_EVIDENCE: 0 },
  });
});

test('rejects duplicate IDs, invalid sequence or window, malformed actor proposals, and blank text', () => {
  assert.throws(
    () => reviewPaidAssessmentInitialActions(optionResult(), decisionResult(), [draft('same'), draft('same')]),
    /duplicate action id/,
  );
  const mutations: Array<(value: InitialActionDraft) => void> = [
    value => { value.sequence = 0; },
    value => { value.sequence = 1.5; },
    value => { (value as { targetWindow: string }).targetWindow = 'NEXT_WEEK'; },
    value => { value.title = ' '; },
    value => { value.purpose = ''; },
    value => { value.deliverable = ' '; },
    value => { value.expectedChange = ''; },
    value => { value.verificationApproach = ' '; },
    value => { value.prerequisites = ['']; },
    value => { value.openQuestions = [' ']; },
    value => { value.actorProposal = { label: '', rationale: '理由' }; },
    value => { value.actorProposal = { label: '候補', rationale: ' ' }; },
    value => { value.authoredBy = ''; },
  ];
  for (const mutate of mutations) {
    const invalid = draft();
    mutate(invalid);
    assert.throws(() => reviewPaidAssessmentInitialActions(optionResult(), decisionResult(), [invalid]), TypeError);
  }
});

test('rejects contradictory upstream IDs, references, and states', () => {
  const duplicateOptions = optionResult();
  duplicateOptions.options.push({ ...duplicateOptions.options[0]! });
  assert.throws(() => reviewPaidAssessmentInitialActions(duplicateOptions, decisionResult(), []), /duplicate option id/);
  const duplicateDecisions = decisionResult();
  duplicateDecisions.decisions.push({ ...duplicateDecisions.decisions[0]! });
  assert.throws(() => reviewPaidAssessmentInitialActions(optionResult(), duplicateDecisions, []), /duplicate decision id/);
  const invalidOption = optionResult();
  (invalidOption.options[0] as { state: string }).state = 'APPROVED';
  assert.throws(() => reviewPaidAssessmentInitialActions(invalidOption, decisionResult(), []), /state is invalid/);
  const invalidDecision = decisionResult();
  (invalidDecision.decisions[0] as { state: string }).state = 'EXECUTABLE';
  assert.throws(() => reviewPaidAssessmentInitialActions(optionResult(), invalidDecision, []), /state is invalid/);
});

test('is deterministic, preserves input order, does not mutate inputs, and deeply detaches output', () => {
  const firstDraft = draft('first');
  const secondDraft = draft('second');
  secondDraft.sequence = 2;
  const drafts = [firstDraft, secondDraft];
  const options = optionResult();
  const decisions = decisionResult();
  const draftsBefore = structuredClone(drafts);
  const optionsBefore = structuredClone(options);
  const decisionsBefore = structuredClone(decisions);
  const first = reviewPaidAssessmentInitialActions(options, decisions, drafts);
  const second = reviewPaidAssessmentInitialActions(options, decisions, drafts);
  assert.deepEqual(first, second);
  assert.deepEqual(drafts, draftsBefore);
  assert.deepEqual(options, optionsBefore);
  assert.deepEqual(decisions, decisionsBefore);
  assert.deepEqual(first.actions.map(value => value.id), ['first', 'second']);
  assert.notEqual(first.actions, drafts);
  assert.notEqual(first.actions[0], drafts[0]);
  assert.notEqual(first.actions[0]!.prerequisites, drafts[0]!.prerequisites);
  assert.notEqual(first.actions[0]!.openQuestions, drafts[0]!.openQuestions);
  assert.notEqual(first.actions[0]!.actorProposal, drafts[0]!.actorProposal);
});
