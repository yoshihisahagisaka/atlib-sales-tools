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


import {
  buildFutureScenarioComparison,
  type FutureScenarioComparisonInput,
} from '../src/domain/paidAssessmentFutureFitComparison';

import type {
  DeliverableStatement,
} from '../src/domain/paidAssessmentDeliverableProjection';

function futureStatements(): DeliverableStatement[] {
  return [{
    id: 'future-1',
    kind: 'FUTURE',
    text: '人員増加だけに頼らず持続的に成長する',
    sourceRefs: [{
      kind: 'MANAGEMENT_FEEDBACK',
      id: 'future-source',
      version: 1,
    }],
    relatedRefs: [],
  }];
}

function reviewedScenarios() {
  const a = scenario('a');
  const b = scenario('b');
  const c = scenario('c');

  a.title = '現状活用型';
  b.title = '段階的改善型';
  c.title = '積極的変革型';

  c.optionIds = ['blocked-1'];

  return reviewPaidAssessmentScenarios(options(), [a, b, c]);
}

function comparison(): FutureScenarioComparisonInput {
  return {
    criteria: [{
      id: 'efficiency',
      futureStatementId: 'future-1',
      title: '社員が本来の業務に集中する',
      rationale: '事業成長に必要な時間を確保する',
    }],
    scenarioIds: ['a', 'b', 'c'],
    evaluations: [
      {
        criterionId: 'efficiency',
        scenarioId: 'a',
        rating: 'PARTIAL',
        rationale: '一部の作業を改善する',
        sourceRefs: [{
          kind: 'CUSTOMER_STATEMENT',
          id: 'evidence-a',
          version: 1,
        }],
      },
      {
        criterionId: 'efficiency',
        scenarioId: 'b',
        rating: 'HIGH',
        rationale: '標準化と効率化を段階的に進める',
        sourceRefs: [{
          kind: 'CORE_VERIFIED_REFERENCE',
          id: 'evidence-b',
          version: 1,
        }],
      },
      {
        criterionId: 'efficiency',
        scenarioId: 'c',
        rating: 'NEEDS_CONFIRMATION',
        rationale: '移行条件の追加確認が必要',
        sourceRefs: [],
      },
    ],
    recommendation: {
      scenarioId: 'b',
      rationale: '事業運営を維持しながら改善を進める',
      conditions: ['段階的に改善効果を確認する'],
      alternativeConditions: ['予算制約がある場合は現状活用型'],
    },
  };
}

function build(input = comparison()) {
  return buildFutureScenarioComparison(
    futureStatements(), reviewedScenarios(), input,
  );
}

test('preserves future-first matrix and explicit recommendation', () => {
  const result = build();
  assert.deepEqual(result.scenarios.map(s => s.id), ['a', 'b', 'c']);
  assert.equal(result.rows[0]!.future.id, 'future-1');
  assert.deepEqual(
    result.rows[0]!.cells.map(c => c.evaluation?.rating),
    ['PARTIAL', 'HIGH', 'NEEDS_CONFIRMATION'],
  );
  assert.equal(result.recommendation?.scenarioId, 'b');
  assert.equal('winner' in result, false);
  assert.equal('score' in result, false);
  assert.equal('decision' in result, false);
});

test('supports all five human-authored rating kinds', () => {
  for (const rating of [
    'HIGH', 'SUFFICIENT', 'PARTIAL',
    'DIFFICULT', 'NEEDS_CONFIRMATION',
  ] as const) {
    const input = comparison();
    input.evaluations = [{
      ...input.evaluations[0]!,
      rating,
    }];
    assert.equal(build(input).rows[0]!.cells[0]!.evaluation?.rating, rating);
  }
});

test('preserves missing evaluations instead of inventing ratings', () => {
  const input = comparison();
  input.evaluations = input.evaluations.slice(0, 1);
  const result = build(input);
  assert.equal(result.rows[0]!.cells[1]!.evaluation, null);
  assert.equal(result.rows[0]!.cells[2]!.evaluation, null);
});

test('supports zero, one and multiple explicit scenarios', () => {
  assert.deepEqual(build({
    criteria: [],
    scenarioIds: [],
    evaluations: [],
  }).scenarios, []);

  const input = comparison();
  input.scenarioIds = ['b'];
  input.evaluations = input.evaluations.filter(e => e.scenarioId === 'b');
  assert.equal(build(input).scenarios.length, 1);
});

test('rejects unknown future, criterion and scenario references', () => {
  const a = comparison();
  a.criteria = [{ ...a.criteria[0]!, futureStatementId: 'missing' }];
  assert.throws(() => build(a), /Unknown FUTURE/);

  const b = comparison();
  b.scenarioIds = ['missing'];
  assert.throws(() => build(b), /Unknown scenario/);

  const c = comparison();
  c.evaluations = [{ ...c.evaluations[0]!, criterionId: 'missing' }];
  assert.throws(() => build(c), /Unknown criterion/);
});

test('rejects duplicate criteria, scenarios and evaluations', () => {
  const a = comparison();
  a.criteria = [...a.criteria, a.criteria[0]!];
  assert.throws(() => build(a), /Duplicate criterion/);

  const b = comparison();
  b.scenarioIds = ['a', 'a'];
  assert.throws(() => build(b), /Duplicate scenario/);

  const c = comparison();
  c.evaluations = [...c.evaluations, c.evaluations[0]!];
  assert.throws(() => build(c), /Duplicate evaluation/);
});

test('requires evidence references for non-unknown ratings', () => {
  const input = comparison();
  input.evaluations = [{ ...input.evaluations[0]!, sourceRefs: [] }];
  assert.throws(() => build(input), /Evaluation requires source/);
});

test('rejects malformed provenance and invalid ratings', () => {
  const a = comparison();
  a.evaluations = [{
    ...a.evaluations[0]!,
    sourceRefs: [{
      kind: 'CUSTOMER_STATEMENT',
      id: 'bad',
      version: 0,
    }],
  }];
  assert.throws(() => build(a), /Invalid source version/);

  const b = comparison();
  b.evaluations = [{
    ...b.evaluations[0]!,
    rating: 'INVALID' as never,
  }];
  assert.throws(() => build(b), /Invalid rating/);
});

test('requires a reason and an existing explicit recommendation', () => {
  const a = comparison();
  a.recommendation = { ...a.recommendation!, rationale: '' };
  assert.throws(() => build(a), /nonblank/);

  const b = comparison();
  b.recommendation = { ...b.recommendation!, scenarioId: 'missing' };
  assert.throws(() => build(b), /Unknown recommended scenario/);
});

test('preserves blocked upstream state even with a high fit rating', () => {
  const input = comparison();
  input.evaluations = [{
    ...input.evaluations[1]!,
    scenarioId: 'c',
  }];
  const result = build(input);

  assert.equal(result.scenarios[2]!.state, 'BLOCKED_BY_OPTION_EVIDENCE');
  assert.equal(result.rows[0]!.cells[2]!.evaluation?.rating, 'HIGH');
});

test('does not automatically recommend a scenario', () => {
  const input = comparison();
  delete input.recommendation;
  assert.equal(build(input).recommendation, null);
});

test('is deterministic, immutable and deeply detached', () => {
  const input = comparison();
  const before = structuredClone(input);
  const result = build(input);

  assert.deepEqual(result, build(input));
  assert.deepEqual(input, before);

  result.rows[0]!.criterion.title = 'modified';
  assert.deepEqual(input, before);
});

test('rejects a non-FUTURE statement as a comparison origin', () => {
  const statements = futureStatements();
  statements[0]!.kind = 'PROPOSAL';

  assert.throws(
    () => buildFutureScenarioComparison(
      statements, reviewedScenarios(), comparison(),
    ),
    /Unknown FUTURE/,
  );
});
