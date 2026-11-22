import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ActOptionReviewResult } from '../src/domain/paidAssessmentActOptionReview';
import type { ManagementScenarioReview } from '../src/domain/paidAssessmentScenarioComparison';
import {
  reviewPaidAssessmentDecisionSessions,
  type DecisionSessionCandidate,
} from '../src/domain/paidAssessmentDecisionSessionReview';

const priorityHash = 'a'.repeat(64);

function optionResult(): ActOptionReviewResult {
  const base = {
    title: '運用を標準化する',
    description: '手順と責任者を定義する',
    why: '安定運用へ近づけるため',
    area: 'OPERATION' as const,
    lenses: ['STANDARDIZE' as const],
    future: { statement: '安定運用する', source: { kind: 'MANAGEMENT_FEEDBACK' as const, id: 'f', version: 1 } },
    gapIds: ['gap-1'],
    rootCauseHypothesisIds: [],
    expectedChange: { statement: '判断が統一される期待', verificationApproach: '差戻しを確認' },
    assumptions: [],
    dependencies: [],
    risks: [],
    actorCandidates: ['CUSTOMER' as const],
  };
  return {
    options: [
      { ...base, id: 'reviewable-1', state: 'REVIEWABLE', reviewReasons: [] },
      { ...base, id: 'reviewable-2', state: 'REVIEWABLE', reviewReasons: [] },
      { ...base, id: 'needs-1', state: 'NEEDS_CONFIRMATION', reviewReasons: ['ASSUMPTION_REMAINS'] },
      { ...base, id: 'blocked-1', state: 'BLOCKED_BY_GAP_EVIDENCE', reviewReasons: ['GAP_NOT_CONFIRMED:gap-1'] },
    ],
    counts: { REVIEWABLE: 2, NEEDS_CONFIRMATION: 1, BLOCKED_BY_GAP_EVIDENCE: 1 },
  };
}

function scenarioResult(): ManagementScenarioReview {
  const base = {
    title: '安定運用優先',
    managementPriority: {
      statement: '安定運用を優先する',
      source: { kind: 'MANAGEMENT_FEEDBACK' as const, id: 'priority-scenario', version: 2 },
    },
    rationale: '継続性を優先するため',
    expectedDirection: '運用安定化を期待',
    tradeoffs: [],
    risks: [],
    assumptions: [],
    investmentCharacter: 'NOT_ASSESSED' as const,
  };
  return {
    scenarios: [
      { ...base, id: 'scenario-reviewable', optionIds: ['reviewable-1', 'reviewable-2'], state: 'REVIEWABLE', reviewReasons: [] },
      { ...base, id: 'scenario-needs', optionIds: ['reviewable-1', 'needs-1'], state: 'NEEDS_CONFIRMATION', reviewReasons: ['OPTION_NEEDS_CONFIRMATION:needs-1'] },
      { ...base, id: 'scenario-blocked', optionIds: ['reviewable-1', 'blocked-1'], state: 'BLOCKED_BY_OPTION_EVIDENCE', reviewReasons: ['OPTION_BLOCKED:blocked-1'] },
    ],
    counts: { REVIEWABLE: 1, NEEDS_CONFIRMATION: 1, BLOCKED_BY_OPTION_EVIDENCE: 1 },
  };
}

function decision(id: string): DecisionSessionCandidate {
  return {
    id,
    disposition: 'ACT_SELECTION',
    decisionOwnerRef: 'claimed-management-owner-1',
    managementPriority: {
      statement: '事業継続性を優先する',
      source: { kind: 'MANAGEMENT_FEEDBACK', id: `priority-${id}`, version: 3, hash: priorityHash },
    },
    selectedActIds: ['reviewable-1'],
    heldActIds: ['reviewable-2'],
    rationale: 'まず運用標準化を進める判断候補',
    additionalEvidenceNeeded: [],
    nextDecisionTiming: '初回ACTの検証後',
    enteredBy: 'assessment-reviewer-1',
  };
}

test('makes ACT_SELECTION with one reviewable ACT structurally REVIEWABLE without approval claim', () => {
  const result = reviewPaidAssessmentDecisionSessions(optionResult(), scenarioResult(), [decision('selection')]);
  assert.equal(result.decisions[0]!.state, 'REVIEWABLE');
  assert.deepEqual(result.decisions[0]!.reviewReasons, []);
  assert.deepEqual(result.decisions[0]!.selectedActIds, ['reviewable-1']);
  assert.deepEqual(result.decisions[0]!.heldActIds, ['reviewable-2']);
  assert.equal('approved' in result.decisions[0]!, false);
  assert.equal('authenticated' in result.decisions[0]!, false);
  assert.equal('actorAssignment' in result.decisions[0]!, false);
});

test('allows selecting a subset of an explicitly referenced scenario', () => {
  const input = decision('scenario-subset');
  input.selectedScenarioId = 'scenario-reviewable';
  input.selectedActIds = ['reviewable-2'];
  input.heldActIds = ['reviewable-1'];
  const result = reviewPaidAssessmentDecisionSessions(optionResult(), scenarioResult(), [input]);
  assert.equal(result.decisions[0]!.state, 'REVIEWABLE');
  assert.equal(result.decisions[0]!.selectedScenarioId, 'scenario-reviewable');
  assert.deepEqual(result.decisions[0]!.selectedActIds, ['reviewable-2']);
});

test('propagates blocked ACT and scenario evidence with blocked precedence', () => {
  const input = decision('blocked');
  input.selectedActIds = ['blocked-1'];
  input.heldActIds = [];
  input.selectedScenarioId = 'scenario-blocked';
  input.additionalEvidenceNeeded = ['未確認資料'];
  const result = reviewPaidAssessmentDecisionSessions(optionResult(), scenarioResult(), [input]);
  assert.equal(result.decisions[0]!.state, 'BLOCKED_BY_OPTION_EVIDENCE');
  assert.deepEqual(result.decisions[0]!.reviewReasons, [
    'ACT_BLOCKED:blocked-1',
    'SCENARIO_BLOCKED:scenario-blocked',
  ]);
});

test('propagates confirmation-needed ACT, scenario and remaining evidence in order', () => {
  const input = decision('needs');
  input.selectedActIds = ['reviewable-1', 'needs-1'];
  input.heldActIds = [];
  input.selectedScenarioId = 'scenario-needs';
  input.additionalEvidenceNeeded = ['既存ベンダーの対応範囲'];
  const result = reviewPaidAssessmentDecisionSessions(optionResult(), scenarioResult(), [input]);
  assert.equal(result.decisions[0]!.state, 'NEEDS_CONFIRMATION');
  assert.deepEqual(result.decisions[0]!.reviewReasons, [
    'ACT_NEEDS_CONFIRMATION:needs-1',
    'SCENARIO_NEEDS_CONFIRMATION:scenario-needs',
    'ADDITIONAL_EVIDENCE_REMAINS',
  ]);
});

test('accepts ADDITIONAL_EVIDENCE, HOLD and STOP without selected ACT or forced execution', () => {
  const evidence = decision('evidence');
  evidence.disposition = 'ADDITIONAL_EVIDENCE';
  evidence.selectedActIds = [];
  evidence.heldActIds = ['blocked-1'];
  evidence.additionalEvidenceNeeded = ['運用ログ'];
  const hold = decision('hold');
  hold.disposition = 'HOLD';
  hold.selectedActIds = [];
  hold.heldActIds = ['blocked-1'];
  const stop = decision('stop');
  stop.disposition = 'STOP';
  stop.selectedActIds = [];
  stop.heldActIds = ['blocked-1'];

  const result = reviewPaidAssessmentDecisionSessions(optionResult(), scenarioResult(), [evidence, hold, stop]);
  assert.deepEqual(result.decisions.map(value => value.state), ['REVIEWABLE', 'REVIEWABLE', 'REVIEWABLE']);
  assert.ok(result.decisions.every(value => value.selectedActIds.length === 0));
  assert.ok(result.decisions.every(value => value.reviewReasons.length === 0));
});

test('enforces disposition-specific ACT and evidence requirements', () => {
  const noAct = decision('no-act');
  noAct.selectedActIds = [];
  assert.throws(() => reviewPaidAssessmentDecisionSessions(optionResult(), scenarioResult(), [noAct]), /requires selected ACT/);

  for (const disposition of ['ADDITIONAL_EVIDENCE', 'HOLD', 'STOP'] as const) {
    const invalid = decision(`selected-${disposition}`);
    invalid.disposition = disposition;
    if (disposition === 'ADDITIONAL_EVIDENCE') invalid.additionalEvidenceNeeded = ['資料'];
    assert.throws(
      () => reviewPaidAssessmentDecisionSessions(optionResult(), scenarioResult(), [invalid]),
      /requires zero selected ACTs/,
    );
  }

  const missingEvidence = decision('missing-evidence');
  missingEvidence.disposition = 'ADDITIONAL_EVIDENCE';
  missingEvidence.selectedActIds = [];
  missingEvidence.additionalEvidenceNeeded = [];
  assert.throws(
    () => reviewPaidAssessmentDecisionSessions(optionResult(), scenarioResult(), [missingEvidence]),
    /requires evidence list/,
  );
});

test('rejects dangling, duplicate, overlapping and scenario-mismatched ACT references', () => {
  const unknown = decision('unknown');
  unknown.selectedActIds = ['missing'];
  unknown.heldActIds = [];
  assert.throws(() => reviewPaidAssessmentDecisionSessions(optionResult(), scenarioResult(), [unknown]), /unknown ACT id/);

  const duplicate = decision('duplicate-act');
  duplicate.selectedActIds = ['reviewable-1', 'reviewable-1'];
  assert.throws(() => reviewPaidAssessmentDecisionSessions(optionResult(), scenarioResult(), [duplicate]), /duplicate id/);

  const overlap = decision('overlap');
  overlap.heldActIds = ['reviewable-1'];
  assert.throws(() => reviewPaidAssessmentDecisionSessions(optionResult(), scenarioResult(), [overlap]), /both selected and held/);

  const missingScenario = decision('missing-scenario');
  missingScenario.selectedScenarioId = 'missing';
  assert.throws(() => reviewPaidAssessmentDecisionSessions(optionResult(), scenarioResult(), [missingScenario]), /unknown scenario id/);

  const mismatch = decision('mismatch');
  mismatch.selectedScenarioId = 'scenario-reviewable';
  mismatch.selectedActIds = ['needs-1'];
  mismatch.heldActIds = [];
  assert.throws(() => reviewPaidAssessmentDecisionSessions(optionResult(), scenarioResult(), [mismatch]), /not in scenario/);
});

test('rejects invalid disposition, source, version, hash and upstream IDs or states', () => {
  const mutations: Array<(value: DecisionSessionCandidate) => void> = [
    value => { (value as { disposition: string }).disposition = 'APPROVE'; },
    value => { (value.managementPriority.source as { kind: string }).kind = 'DOCUMENT'; },
    value => { value.managementPriority.source.version = 0; },
    value => { value.managementPriority.source.hash = 'A'.repeat(64); },
    value => { value.decisionOwnerRef = ' '; },
    value => { value.rationale = ''; },
    value => { value.additionalEvidenceNeeded = [' ']; },
  ];
  for (const mutate of mutations) {
    const invalid = decision('invalid');
    mutate(invalid);
    assert.throws(() => reviewPaidAssessmentDecisionSessions(optionResult(), scenarioResult(), [invalid]), TypeError);
  }

  assert.throws(
    () => reviewPaidAssessmentDecisionSessions(optionResult(), scenarioResult(), [decision('same'), decision('same')]),
    /duplicate decision id/,
  );
  const duplicateOptions = optionResult();
  duplicateOptions.options.push({ ...duplicateOptions.options[0]! });
  assert.throws(() => reviewPaidAssessmentDecisionSessions(duplicateOptions, scenarioResult(), []), /duplicate option id/);
  const invalidScenarios = scenarioResult();
  (invalidScenarios.scenarios[0] as { state: string }).state = 'SELECTED';
  assert.throws(() => reviewPaidAssessmentDecisionSessions(optionResult(), invalidScenarios, []), /state is invalid/);
});

test('accepts zero candidates and preserves source, order, immutability and deep detachment', () => {
  assert.deepEqual(reviewPaidAssessmentDecisionSessions(optionResult(), scenarioResult(), []), {
    decisions: [],
    counts: { REVIEWABLE: 0, NEEDS_CONFIRMATION: 0, BLOCKED_BY_OPTION_EVIDENCE: 0 },
  });

  const firstDecision = decision('first');
  firstDecision.selectedActIds = ['reviewable-2', 'reviewable-1'];
  firstDecision.heldActIds = ['needs-1'];
  const secondDecision = decision('second');
  const candidates = [firstDecision, secondDecision];
  const optionInput = optionResult();
  const scenarioInput = scenarioResult();
  const candidatesBefore = structuredClone(candidates);
  const optionsBefore = structuredClone(optionInput);
  const scenariosBefore = structuredClone(scenarioInput);

  const first = reviewPaidAssessmentDecisionSessions(optionInput, scenarioInput, candidates);
  const second = reviewPaidAssessmentDecisionSessions(optionInput, scenarioInput, candidates);
  assert.deepEqual(first, second);
  assert.deepEqual(candidates, candidatesBefore);
  assert.deepEqual(optionInput, optionsBefore);
  assert.deepEqual(scenarioInput, scenariosBefore);
  assert.deepEqual(first.decisions.map(value => value.id), ['first', 'second']);
  assert.deepEqual(first.decisions[0]!.selectedActIds, ['reviewable-2', 'reviewable-1']);
  assert.deepEqual(first.decisions[0]!.managementPriority, candidates[0]!.managementPriority);
  assert.notEqual(first.decisions, candidates);
  assert.notEqual(first.decisions[0], candidates[0]);
  assert.notEqual(first.decisions[0]!.managementPriority, candidates[0]!.managementPriority);
  assert.notEqual(first.decisions[0]!.managementPriority.source, candidates[0]!.managementPriority.source);
  assert.notEqual(first.decisions[0]!.selectedActIds, candidates[0]!.selectedActIds);
  assert.notEqual(first.decisions[0]!.heldActIds, candidates[0]!.heldActIds);
  assert.notEqual(first.decisions[0]!.additionalEvidenceNeeded, candidates[0]!.additionalEvidenceNeeded);
});
