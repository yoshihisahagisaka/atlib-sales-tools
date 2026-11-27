import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ActOptionReviewResult } from '../src/domain/paidAssessmentActOptionReview';
import {
  reviewPaidAssessmentScenarios,
  type ManagementScenarioCandidate,
} from '../src/domain/paidAssessmentScenarioComparison';

const hashes = {
  priority: 'a'.repeat(64),
  investment: 'b'.repeat(64),
};

function options(): ActOptionReviewResult {
  const base = {
    title: '定型運用を標準化する',
    description: '手順と責任者を定義する',
    why: '安定運用へ近づけるため',
    area: 'OPERATION' as const,
    lenses: ['STANDARDIZE' as const],
    future: {
      statement: '人を増やさず安定運用する',
      source: { kind: 'MANAGEMENT_FEEDBACK' as const, id: 'future-1', version: 2 },
    },
    gapIds: ['gap-1'],
    rootCauseHypothesisIds: [],
    expectedChange: { statement: '判断が統一されることを期待する', verificationApproach: '差戻しを確認する' },
    assumptions: [],
    dependencies: [],
    risks: [],
    actorCandidates: ['CUSTOMER' as const],
  };
  return {
    options: [
      { ...base, id: 'reviewable-1', state: 'REVIEWABLE', reviewReasons: [] },
      {
        ...base,
        id: 'needs-1',
        state: 'NEEDS_CONFIRMATION',
        reviewReasons: ['ASSUMPTION_REMAINS'],
      },
      {
        ...base,
        id: 'blocked-1',
        state: 'BLOCKED_BY_GAP_EVIDENCE',
        reviewReasons: ['GAP_NOT_CONFIRMED:gap-1'],
      },
      { ...base, id: 'reviewable-2', state: 'REVIEWABLE', reviewReasons: [] },
    ],
    counts: { REVIEWABLE: 2, NEEDS_CONFIRMATION: 1, BLOCKED_BY_GAP_EVIDENCE: 1 },
  };
}

function scenario(id: string): ManagementScenarioCandidate {
  return {
    id,
    title: '安定運用を優先するシナリオ',
    managementPriority: {
      statement: '事業継続性と安定運用を優先する',
      source: { kind: 'MANAGEMENT_FEEDBACK', id: `priority-${id}`, version: 3, hash: hashes.priority },
    },
    rationale: '運用停止リスクを先に低減するACT構成を比較するため',
    optionIds: ['reviewable-1'],
    expectedDirection: '定型運用のばらつきが減る方向を期待する',
    tradeoffs: ['短期的に手順整備の負荷が発生する'],
    risks: ['過度な標準化により例外対応が遅くなる可能性'],
    assumptions: [],
    investmentCharacter: 'NOT_ASSESSED',
    authoredBy: 'assessment-reviewer-1',
  };
}

test('makes a single human-authored scenario with one reviewable option REVIEWABLE', () => {
  const input = scenario('single');
  const result = reviewPaidAssessmentScenarios(options(), [input]);

  assert.equal(result.scenarios[0]!.state, 'REVIEWABLE');
  assert.deepEqual(result.scenarios[0]!.reviewReasons, []);
  assert.deepEqual(result.scenarios[0]!.optionIds, ['reviewable-1']);
  assert.deepEqual(result.scenarios[0]!.managementPriority, input.managementPriority);
  assert.deepEqual(result.counts, {
    REVIEWABLE: 1,
    NEEDS_CONFIRMATION: 0,
    BLOCKED_BY_OPTION_EVIDENCE: 0,
  });
});

test('preserves multiple explicit priorities without ranking or selecting a winner', () => {
  const continuity = scenario('continuity');
  const efficiency = scenario('efficiency');
  efficiency.title = '社員工数削減を優先するシナリオ';
  efficiency.managementPriority.statement = '社員の手作業削減を優先する';
  efficiency.optionIds = ['reviewable-2', 'reviewable-1'];
  const result = reviewPaidAssessmentScenarios(options(), [continuity, efficiency]);

  assert.deepEqual(result.scenarios.map(value => value.id), ['continuity', 'efficiency']);
  assert.deepEqual(result.scenarios[1]!.optionIds, ['reviewable-2', 'reviewable-1']);
  assert.equal('rank' in result.scenarios[0]!, false);
  assert.equal('winner' in result.scenarios[0]!, false);
  assert.equal('recommended' in result.scenarios[0]!, false);
});

test('reflects options needing confirmation and explicit assumptions with exact reasons', () => {
  const input = scenario('needs-confirmation');
  input.optionIds = ['reviewable-1', 'needs-1'];
  input.assumptions = ['既存ベンダーが追加作業に対応できること'];
  const result = reviewPaidAssessmentScenarios(options(), [input]);

  assert.equal(result.scenarios[0]!.state, 'NEEDS_CONFIRMATION');
  assert.deepEqual(result.scenarios[0]!.reviewReasons, [
    'OPTION_NEEDS_CONFIRMATION:needs-1',
    'ASSUMPTION_REMAINS',
  ]);
});

test('blocked option takes precedence over reviewable and confirmation-needed options', () => {
  const input = scenario('blocked');
  input.optionIds = ['reviewable-1', 'blocked-1', 'needs-1'];
  input.assumptions = ['追加確認事項'];
  const result = reviewPaidAssessmentScenarios(options(), [input]);

  assert.equal(result.scenarios[0]!.state, 'BLOCKED_BY_OPTION_EVIDENCE');
  assert.deepEqual(result.scenarios[0]!.reviewReasons, ['OPTION_BLOCKED:blocked-1']);
});

test('accepts zero scenarios without forcing comparison alternatives', () => {
  assert.deepEqual(reviewPaidAssessmentScenarios(options(), []), {
    scenarios: [],
    counts: { REVIEWABLE: 0, NEEDS_CONFIRMATION: 0, BLOCKED_BY_OPTION_EVIDENCE: 0 },
  });
});

test('rejects missing, duplicate or dangling option IDs and invalid upstream states', () => {
  const empty = scenario('empty-options');
  empty.optionIds = [];
  assert.throws(() => reviewPaidAssessmentScenarios(options(), [empty]), /nonempty array/);

  const duplicate = scenario('duplicate-options');
  duplicate.optionIds = ['reviewable-1', 'reviewable-1'];
  assert.throws(() => reviewPaidAssessmentScenarios(options(), [duplicate]), /duplicate optionId/);

  const dangling = scenario('dangling');
  dangling.optionIds = ['missing'];
  assert.throws(() => reviewPaidAssessmentScenarios(options(), [dangling]), /unknown optionId/);

  const duplicateUpstream = options();
  duplicateUpstream.options.push({ ...duplicateUpstream.options[0]! });
  assert.throws(() => reviewPaidAssessmentScenarios(duplicateUpstream, []), /duplicate option id/);

  const invalidState = options();
  (invalidState.options[0] as { state: string }).state = 'APPROVED';
  assert.throws(() => reviewPaidAssessmentScenarios(invalidState, []), /state is invalid/);
});

test('rejects malformed scenario identity, priority source, investment enum and list entries', () => {
  const mutations: Array<(value: ManagementScenarioCandidate) => void> = [
    value => { value.title = ' '; },
    value => { value.managementPriority.statement = ''; },
    value => { (value.managementPriority.source as { kind: string }).kind = 'DOCUMENT'; },
    value => { value.managementPriority.source.version = 0; },
    value => { value.managementPriority.source.hash = 'A'.repeat(64); },
    value => { (value as { investmentCharacter: string }).investmentCharacter = 'FIXED_PRICE'; },
    value => { value.tradeoffs = ['']; },
    value => { value.risks = [' ']; },
    value => { value.assumptions = ['']; },
  ];
  for (const mutate of mutations) {
    const invalid = scenario('invalid');
    mutate(invalid);
    assert.throws(() => reviewPaidAssessmentScenarios(options(), [invalid]), TypeError);
  }

  assert.throws(
    () => reviewPaidAssessmentScenarios(options(), [scenario('same'), scenario('same')]),
    /duplicate scenario id/,
  );
});

test('enforces qualitative notes and evidence-backed range provenance without creating a quote', () => {
  const qualitative = scenario('qualitative');
  qualitative.investmentCharacter = 'QUALITATIVE_ONLY';
  assert.throws(() => reviewPaidAssessmentScenarios(options(), [qualitative]), /requires investmentNote/);
  qualitative.investmentNote = '既存体制内での調整負荷が中心となる可能性';
  assert.equal(reviewPaidAssessmentScenarios(options(), [qualitative]).scenarios[0]!.state, 'REVIEWABLE');

  const backed = scenario('backed');
  backed.investmentCharacter = 'EVIDENCE_BACKED_RANGE';
  backed.investmentNote = '取得済み見積の範囲を比較情報として表示';
  assert.throws(() => reviewPaidAssessmentScenarios(options(), [backed]), /requires investmentEvidence/);
  backed.investmentEvidence = {
    kind: 'CORE_VERIFIED_REFERENCE',
    id: 'investment-evidence-1',
    version: 5,
    hash: hashes.investment,
  };
  const result = reviewPaidAssessmentScenarios(options(), [backed]);
  assert.deepEqual(result.scenarios[0]!.investmentEvidence, backed.investmentEvidence);
  assert.equal('price' in result.scenarios[0]!, false);
  assert.equal('quote' in result.scenarios[0]!, false);
});

test('is deterministic, immutable, order-preserving and deeply detached', () => {
  const firstScenario = scenario('first');
  firstScenario.optionIds = ['reviewable-2', 'reviewable-1'];
  firstScenario.investmentCharacter = 'EVIDENCE_BACKED_RANGE';
  firstScenario.investmentNote = '外部見積に基づく参考レンジ';
  firstScenario.investmentEvidence = {
    kind: 'CORE_VERIFIED_REFERENCE',
    id: 'investment-source',
    version: 4,
    hash: hashes.investment,
  };
  const secondScenario = scenario('second');
  const inputs = [firstScenario, secondScenario];
  const optionInput = options();
  const inputsBefore = structuredClone(inputs);
  const optionsBefore = structuredClone(optionInput);

  const first = reviewPaidAssessmentScenarios(optionInput, inputs);
  const second = reviewPaidAssessmentScenarios(optionInput, inputs);
  assert.deepEqual(first, second);
  assert.deepEqual(inputs, inputsBefore);
  assert.deepEqual(optionInput, optionsBefore);
  assert.deepEqual(first.scenarios.map(value => value.id), ['first', 'second']);
  assert.deepEqual(first.scenarios[0]!.optionIds, ['reviewable-2', 'reviewable-1']);
  assert.notEqual(first.scenarios, inputs);
  assert.notEqual(first.scenarios[0], inputs[0]);
  assert.notEqual(first.scenarios[0]!.managementPriority, inputs[0]!.managementPriority);
  assert.notEqual(first.scenarios[0]!.managementPriority.source, inputs[0]!.managementPriority.source);
  assert.notEqual(first.scenarios[0]!.optionIds, inputs[0]!.optionIds);
  assert.notEqual(first.scenarios[0]!.tradeoffs, inputs[0]!.tradeoffs);
  assert.notEqual(first.scenarios[0]!.risks, inputs[0]!.risks);
  assert.notEqual(first.scenarios[0]!.assumptions, inputs[0]!.assumptions);
  assert.notEqual(first.scenarios[0]!.investmentEvidence, inputs[0]!.investmentEvidence);
});
