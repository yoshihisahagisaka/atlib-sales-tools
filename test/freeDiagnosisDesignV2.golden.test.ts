import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeFreeDiagnosisV2 } from '../src/domain/freeDiagnosisAnalysisV2';
import type { CurrentStructuredStateV2 } from '../src/domain/freeDiagnosisDesignV2';
import { generateFreeDiagnosisNarrativeV2 } from '../src/domain/freeDiagnosisNarrativeV2';
import { FreeDiagnosisDesignV2ValidationError, projectFreeDiagnosisSemanticV2 } from '../src/domain/freeDiagnosisSemanticProjectionV2';

function state(overrides: Partial<CurrentStructuredStateV2> = {}): CurrentStructuredStateV2 {
  return {
    q1CompanyContext: { employeeRange: '11-30', siteRange: 'ONE' },
    q2Future: ['BUSINESS_GROWTH', 'LEAN_GROWTH'],
    q3ItExpectations: ['PRODUCTIVITY', 'MANAGEMENT_DECISION_SUPPORT'],
    q4CurrentInterest: 'MANAGEMENT_DECISION',
    q5Visibility: 'VISIBLE_PARTIAL',
    q6ManagementConnection: 'REPORTED_NOT_DECISION_USABLE',
    q7InterestThemes: [],
    ...overrides,
  };
}

function texts(items: readonly { text: string }[]): string {
  return items.map((item) => item.text).join('\n');
}

const FORBIDDEN_AUTOMATIC_DECISION_FIELDS = new Set([
  'recommendation',
  'recommendedSolution',
  'solutionDecision',
  'assessmentScope',
  'problem',
  'gap',
  'fact',
  'facts',
  'verifiedFact',
  'factCertification',
]);

function collectObjectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectObjectKeys(item, keys);
    return keys;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      keys.add(key);
      collectObjectKeys(nested, keys);
    }
  }
  return keys;
}

function assertNoAutomaticDecisions(value: unknown): void {
  const keys = collectObjectKeys(value);
  for (const forbidden of FORBIDDEN_AUTOMATIC_DECISION_FIELDS) {
    assert.equal(keys.has(forbidden), false, `unexpected automatic decision field: ${forbidden}`);
  }
}

test('GOLDEN-01: growth, lean operation, and decision usability yield multiple confirmation lenses', () => {
  const result = analyzeFreeDiagnosisV2(state());
  assert.match(texts(result.futureUnderstanding), /事業を拡大しながら、少人数でも無理なく成長・運営/);
  assert.deepEqual(result.lensFindings.map((item) => item.ruleId), ['V2-C-001', 'V2-C-003', 'V2-C-004']);
  assert.ok(result.factCandidates.length >= 3);
});

test('GOLDEN-02: AI interest is a possibility and never an AI recommendation', () => {
  const result = analyzeFreeDiagnosisV2(state({ q7InterestThemes: ['AI'] }));
  assert.ok(result.appliedRuleIds.includes('V2-C-002'));
  assert.match(texts(result.lensFindings), /可能性があります/);
  assert.ok(result.unknowns.some((item) => item.id === 'unknown-automation-applicability'));
  assert.ok(result.hearingViewpoints.some((item) => item.sourceRuleIds.includes('V2-C-002')) || result.factCandidates.some((item) => item.sourceRuleIds.includes('V2-C-002')));
  assertNoAutomaticDecisions(result);
  assert.doesNotMatch(JSON.stringify(result), /AI導入が必要|AIを導入すべき/);
});

test('GOLDEN-03: fully visible and strategically connected is healthy without a forced gap', () => {
  const result = analyzeFreeDiagnosisV2(state({ q5Visibility: 'VISIBLE_FULL', q6ManagementConnection: 'STRATEGICALLY_CONNECTED', q7InterestThemes: ['UNDECIDED'] }));
  assert.equal(result.healthyGuard.noImportantGapIdentified, true);
  assert.equal(result.lensFindings.length, 1); // growth workflow remains a confirmation value, not a gap
  assert.ok(result.appliedRuleIds.includes('V2-C-007'));
});

test('GOLDEN-04: mostly visible and decision usable is also healthy', () => {
  const result = analyzeFreeDiagnosisV2(state({ q5Visibility: 'VISIBLE_MOSTLY', q6ManagementConnection: 'DECISION_USABLE', q7InterestThemes: ['UNDECIDED'] }));
  assert.equal(result.healthyGuard.noImportantGapIdentified, true);
});

test('GOLDEN-05: AI alone does not establish a finding or recommendation', () => {
  const result = analyzeFreeDiagnosisV2(state({ q2Future: ['NO_MAJOR_CHANGE'], q3ItExpectations: ['UNDECIDED'], q5Visibility: 'VISIBLE_FULL', q6ManagementConnection: 'DECISION_USABLE', q7InterestThemes: ['AI'] }));
  assert.equal(result.lensFindings.length, 0);
  assert.match(texts(result.currentUnderstanding), /AI・生成AIに関心があります/);
});

test('GOLDEN-06: security interest is not a security-risk assertion', () => {
  const result = analyzeFreeDiagnosisV2(state({
    q2Future: ['NO_MAJOR_CHANGE'],
    q3ItExpectations: ['UNDECIDED'],
    q4CurrentInterest: 'UNDECIDED',
    q5Visibility: 'VISIBLE_FULL',
    q6ManagementConnection: 'DECISION_USABLE',
    q7InterestThemes: ['SECURITY'],
  }));
  assert.ok(result.appliedRuleIds.includes('V2-C-008'));
  assert.match(texts(result.currentUnderstanding), /セキュリティに関心/);
  assertNoAutomaticDecisions(result);
  assert.doesNotMatch(JSON.stringify(result), /セキュリティリスクがある|リスクが存在/);
});

test('GOLDEN-07: low visibility is recognition and confirmation need, never FACT', () => {
  const result = analyzeFreeDiagnosisV2(state({ q5Visibility: 'LOW_VISIBILITY' }));
  assert.match(texts(result.currentUnderstanding), /確認しても分からないことがあるという認識/);
  assert.ok(result.unknowns.some((item) => item.id === 'unknown-growth-operation-detail'));
  assertNoAutomaticDecisions(result);
  assert.doesNotMatch(JSON.stringify(result), /確定FACT|検証済みFACT/);
});

test('GOLDEN-08: managed but not reported produces management confirmation', () => {
  const result = analyzeFreeDiagnosisV2(state({ q6ManagementConnection: 'MANAGED_NOT_REPORTED' }));
  assert.ok(result.appliedRuleIds.includes('V2-C-005'));
  assert.match(texts(result.lensFindings), /どの情報がどの頻度で共有/);
  assert.ok(result.unknowns.some((item) => item.id === 'unknown-management-sharing-detail'));
});

test('GOLDEN-09: reported but not decision-usable produces a distinct confirmation', () => {
  const result = analyzeFreeDiagnosisV2(state({ q6ManagementConnection: 'REPORTED_NOT_DECISION_USABLE' }));
  assert.ok(result.appliedRuleIds.includes('V2-C-004'));
  assert.match(texts(result.lensFindings), /経営判断に使える形/);
  assert.ok(result.unknowns.some((item) => item.id === 'unknown-management-report-detail'));
});

test('GOLDEN-10: strategically connected does not generate a gap', () => {
  const result = analyzeFreeDiagnosisV2(state({ q5Visibility: 'VISIBLE_FULL', q6ManagementConnection: 'STRATEGICALLY_CONNECTED', q2Future: ['NO_MAJOR_CHANGE'], q3ItExpectations: ['UNDECIDED'], q7InterestThemes: ['UNDECIDED'] }));
  assert.equal(result.healthyGuard.noImportantGapIdentified, true);
  assert.equal(result.lensFindings.length, 0);
});

test('GOLDEN-11: undecided future is not a problem', () => {
  const result = analyzeFreeDiagnosisV2(state({ q2Future: ['UNDECIDED'], q3ItExpectations: ['UNDECIDED'], q4CurrentInterest: 'UNDECIDED', q5Visibility: 'VISIBLE_FULL', q6ManagementConnection: 'DECISION_USABLE', q7InterestThemes: ['UNDECIDED'] }));
  assert.ok(result.appliedRuleIds.includes('V2-C-010'));
  assert.ok(result.unknowns.some((item) => item.id === 'unknown-future'));
  assertNoAutomaticDecisions(result);
});

test('GOLDEN-12: undecided interest yields no recommendation', () => {
  const before = analyzeFreeDiagnosisV2(state({ q7InterestThemes: [] }));
  const result = analyzeFreeDiagnosisV2(state({ q7InterestThemes: ['UNDECIDED'] }));
  assert.deepEqual(result.futureUnderstanding, before.futureUnderstanding);
  assert.deepEqual(result.currentUnderstanding, before.currentUnderstanding);
  assertNoAutomaticDecisions(result);
});

test('GOLDEN-13: one information-flow finding contains technology, operation, and management lenses', () => {
  const result = analyzeFreeDiagnosisV2(state({ q7InterestThemes: ['AI'] }));
  const informationFlow = result.lensFindings.find((item) => item.ruleId === 'V2-C-011');
  assert.deepEqual(informationFlow?.lenses, ['TECHNOLOGY', 'OPERATION', 'MANAGEMENT']);
});

test('GOLDEN-14: every fact candidate follows the contract', () => {
  const result = analyzeFreeDiagnosisV2(state());
  for (const candidate of result.factCandidates) {
    assert.ok(candidate.id && candidate.whatToVerify && candidate.whyItMattersToFuture && candidate.whatMayBecomeKnowable);
    assert.ok(candidate.lenses.length > 0 && candidate.sourceRuleIds.length > 0);
  }
});

test('GOLDEN-15: UNKNOWN remains UNKNOWN rather than a problem', () => {
  const input = state({ q5Visibility: 'UNKNOWN', q6ManagementConnection: 'UNKNOWN' });
  const result = analyzeFreeDiagnosisV2(input);
  assert.ok(result.unknowns.length > 0);
  assertNoAutomaticDecisions(result);
  assert.equal(generateFreeDiagnosisNarrativeV2(input, result).unknowns.heading, 'まだ確認できていないこと');
});

test('GOLDEN-16: the same analyzer responds to changed current answers', () => {
  const original = state();
  const before = analyzeFreeDiagnosisV2(original);
  assert.deepEqual(before, analyzeFreeDiagnosisV2(original));
  const after = analyzeFreeDiagnosisV2(state({ q6ManagementConnection: 'MANAGED_NOT_REPORTED' }));
  assert.notDeepEqual(before.appliedRuleIds, after.appliedRuleIds);
  assert.ok(after.appliedRuleIds.includes('V2-C-005'));
});

test('GOLDEN-17: Q5 partial and relies-on-others keep distinct narratives', () => {
  const partial = analyzeFreeDiagnosisV2(state({ q5Visibility: 'VISIBLE_PARTIAL' }));
  const relies = analyzeFreeDiagnosisV2(state({ q5Visibility: 'RELIES_ON_OTHERS' }));
  assert.notEqual(partial.currentUnderstanding.find((item) => item.id === 'visibility')?.text, relies.currentUnderstanding.find((item) => item.id === 'visibility')?.text);
});

test('GOLDEN-18: Q6 reported-unusable and managed-not-reported remain distinct', () => {
  const reported = analyzeFreeDiagnosisV2(state({ q6ManagementConnection: 'REPORTED_NOT_DECISION_USABLE' }));
  const notReported = analyzeFreeDiagnosisV2(state({ q6ManagementConnection: 'MANAGED_NOT_REPORTED' }));
  assert.notEqual(reported.currentUnderstanding.find((item) => item.id === 'management-connection')?.text, notReported.currentUnderstanding.find((item) => item.id === 'management-connection')?.text);
});

test('GOLDEN-19: an interest does not override future, visibility, or management recognition', () => {
  const before = analyzeFreeDiagnosisV2(state({ q7InterestThemes: [] }));
  const result = analyzeFreeDiagnosisV2(state({ q7InterestThemes: ['AI', 'SECURITY'] }));
  assert.deepEqual(result.futureUnderstanding, before.futureUnderstanding);
  assert.deepEqual(
    result.currentUnderstanding.filter((item) => item.sourceQuestionCodes.includes('Q5') || item.sourceQuestionCodes.includes('Q6')),
    before.currentUnderstanding.filter((item) => item.sourceQuestionCodes.includes('Q5') || item.sourceQuestionCodes.includes('Q6')),
  );
});

test('GOLDEN-20: public v2 output never uses legacy M01-M06 identifiers', () => {
  const fixtures = [
    state(),
    state({ q7InterestThemes: ['AI', 'SECURITY'] }),
    state({ q2Future: ['UNDECIDED'], q3ItExpectations: ['UNDECIDED'], q7InterestThemes: ['UNDECIDED'] }),
    state({ q5Visibility: 'VISIBLE_FULL', q6ManagementConnection: 'STRATEGICALLY_CONNECTED', q7InterestThemes: ['SYSTEM_LIFECYCLE'] }),
  ];
  for (const fixture of fixtures) {
    const result = analyzeFreeDiagnosisV2(fixture);
    const narrative = generateFreeDiagnosisNarrativeV2(fixture, result);
    const publicOutput = JSON.stringify({ result, narrative });
    assert.doesNotMatch(publicOutput, /M0[1-6]|Primary Focus|Secondary Focus|primaryFocus|secondaryFocus/);
  }
});

test('projection normalizes deterministically and validates exclusive codes', () => {
  const projected = projectFreeDiagnosisSemanticV2(state({ q2Future: ['LEAN_GROWTH', 'BUSINESS_GROWTH', 'LEAN_GROWTH'] }));
  assert.deepEqual(projected.q2Future, ['BUSINESS_GROWTH', 'LEAN_GROWTH']);
  assert.throws(() => projectFreeDiagnosisSemanticV2(state({ q3ItExpectations: ['UNDECIDED', 'PRODUCTIVITY'] })), FreeDiagnosisDesignV2ValidationError);
});
