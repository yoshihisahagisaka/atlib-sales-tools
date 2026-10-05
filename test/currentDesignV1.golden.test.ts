import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intakeAnswerEnvelopeSchema, type RespondentRole } from '../src/domain/freeDiagnosisRuleBasedV1';
import { projectIntakeSemantics, recognitionDifferenceCandidates } from '../src/domain/intakeSemanticProjection';
import { runInitialRule } from '../src/domain/initialRuleEngine';

type Answer = Parameters<typeof intakeAnswerEnvelopeSchema.parse>[0];
const respondent = { role: 'MANAGEMENT' as const };
function answer(questionCode: string, answerValue: unknown, responseState: 'ANSWERED' | 'UNKNOWN' | 'NOT_IN_POSITION_TO_ANSWER' = 'ANSWERED', role: RespondentRole = respondent.role): Answer {
  return { schemaVersion: 1, questionCode, answerValue, responseState, respondent: { role }, provenance: { channel: 'SELF', source: 'CUSTOMER_SELF' } };
}
function result(items: Answer[]) { return runInitialRule(projectIntakeSemantics(items.map(x => intakeAnswerEnvelopeSchema.parse(x)))); }
function focuses(items: Answer[]) { return result(items).focusItems.map(x => [x.focus, x.role]); }

test('Golden 1: Growth / Change selects PRIMARY M05 and RELATED M02 without M01 explosion', () => {
  const r = result([
    answer('Q2', ['HEADCOUNT_GROWTH', 'SITE_CHANGE']), answer('Q3', ['SUPPORT_CHANGE']),
    answer('Q4', 'CHANGE_READINESS_CONCERN'), answer('Q5', 'VISIBLE_ON_REQUEST'), answer('Q6', 'NOT_SUFFICIENTLY_DELIVERED'),
  ]);
  assert.deepEqual(focuses([
    answer('Q2', ['HEADCOUNT_GROWTH', 'SITE_CHANGE']), answer('Q3', ['SUPPORT_CHANGE']), answer('Q4', 'CHANGE_READINESS_CONCERN'), answer('Q5', 'VISIBLE_ON_REQUEST'), answer('Q6', 'NOT_SUFFICIENTLY_DELIVERED'),
  ]), [['M05_GROWTH_CHANGE_ADAPTATION', 'PRIMARY'], ['M02_IT_OPERATION_CONTINUITY', 'RELATED']]);
  assert.equal(r.noImportantConfirmation, false);
});

test('Golden 2: delivered information can be available while decision usability is insufficient', () => {
  const answers = [answer('Q2', ['NEW_BUSINESS', 'HEADCOUNT_GROWTH']), answer('Q3', ['STRATEGIC_IT_USE', 'ENABLE_MANAGEMENT_DECISION']), answer('Q4', 'STRATEGIC_USE_OPPORTUNITY'), answer('Q5', 'VISIBLE_ENOUGH'), answer('Q6', 'DELIVERED_NOT_USABLE')];
  const projection = projectIntakeSemantics(answers.map(x => intakeAnswerEnvelopeSchema.parse(x)));
  assert.deepEqual(projection.managementInformation, { delivery: 'AVAILABLE', usability: 'INSUFFICIENT' });
  assert.deepEqual(focuses(answers), [['M01_IT_MANAGEMENT_JUDGMENT', 'PRIMARY'], ['M06_IT_STRATEGIC_USE', 'RELATED']]);
});

test('Golden 3: healthy case permits no important confirmation and no forced assessment', () => {
  const r = result([answer('Q2', ['STABILITY_EFFICIENCY']), answer('Q3', ['IMPROVE_PRODUCTIVITY', 'STABILIZE_IT_OPERATION']), answer('Q4', 'NO_MAJOR_CONCERN'), answer('Q5', 'VISIBLE_ENOUGH'), answer('Q6', 'REGULAR_AND_USABLE')]);
  assert.equal(r.focusItems.some(x => x.role === 'PRIMARY'), false);
  assert.equal(r.noImportantConfirmation, true);
  assert.equal(r.assessmentEscalated, false);
});

test('Golden 4: IPO selects M03 primary and M01 related without security finding or forced assessment', () => {
  const r = result([answer('Q2', ['IPO_PREPARATION']), answer('Q3', ['PROTECT_BUSINESS', 'ENABLE_MANAGEMENT_DECISION']), answer('Q4', 'BUSINESS_PROTECTION_CONCERN'), answer('Q5', 'VISIBLE_ON_REQUEST'), answer('Q6', 'ON_REQUEST_USABLE')]);
  assert.deepEqual(r.focusItems.map(x => [x.focus, x.role]), [['M03_BUSINESS_DEFENSE_CONTINUITY', 'PRIMARY'], ['M01_IT_MANAGEMENT_JUDGMENT', 'RELATED']]);
  assert.equal(r.problemFindings.length, 0);
  assert.equal(r.assessmentEscalated, false);
});

test('Golden 5: Lean Scaling selects M04 as opportunity confirmation, not a problem', () => {
  const r = result([answer('Q2', ['LEAN_SCALING']), answer('Q3', ['IMPROVE_PRODUCTIVITY']), answer('Q4', 'PRODUCTIVITY_OPPORTUNITY'), answer('Q5', 'VISIBLE_ENOUGH'), answer('Q6', 'REGULAR_AND_USABLE')]);
  assert.deepEqual(r.focusItems.map(x => [x.focus, x.role]), [['M04_BUSINESS_PRODUCTIVITY', 'PRIMARY']]);
  assert.equal(r.problemFindings.length, 0);
});

test('Guards: Future, Desired State, UNKNOWN, and Q1 quantity alone do not create a problem, focus, or assessment', () => {
  for (const answers of [
    [answer('Q2', ['IPO_PREPARATION'])], [answer('Q3', ['STRATEGIC_IT_USE'])],
    [answer('Q4', null, 'UNKNOWN')], [answer('Q1', { employeeSize: 'EMP_301_PLUS', locations: 'SITE_4_PLUS' })],
  ]) {
    const r = result(answers);
    assert.equal(r.problemFindings.length, 0);
    assert.equal(r.focusItems.length, 0);
    assert.equal(r.assessmentEscalated, false);
  }
});

test('Relevance is preserved without converting Future or Desired State alone into a focus', () => {
  const r = result([answer('Q2', ['NEW_BUSINESS']), answer('Q3', ['STRATEGIC_IT_USE'])]);
  assert.equal(r.focusItems.length, 0);
  assert.deepEqual(r.relevanceReferences.map(x => x.focus), ['M05_GROWTH_CHANGE_ADAPTATION', 'M06_IT_STRATEGIC_USE', 'M01_IT_MANAGEMENT_JUDGMENT']);
});

test('Guards: staff visibility is operational, Q7 is excluded, and not-in-position is authority confirmation not knowledge UNKNOWN', () => {
  const staff = answer('Q5', 'LARGELY_UNKNOWN', 'ANSWERED', 'IT_OR_BUSINESS_STAFF');
  const q7 = answer('Q7', '経営会議の進め方を相談したい');
  const notInPosition = answer('Q6', null, 'NOT_IN_POSITION_TO_ANSWER');
  const projection = projectIntakeSemantics([intakeAnswerEnvelopeSchema.parse(staff), intakeAnswerEnvelopeSchema.parse(q7), intakeAnswerEnvelopeSchema.parse(notInPosition)]);
  assert.deepEqual(projection.visibility, { subject: 'OPERATIONAL', state: 'LARGELY_UNKNOWN' });
  assert.equal(projection.futureReference.length, 0);
  assert.equal(projection.authorityConfirmationCandidates[0]?.questionCode, 'Q6');
  assert.equal(projection.knowledgeUnknownQuestionCodes.includes('Q6'), false);
  assert.equal(runInitialRule(projection).focusItems.length, 0);
});

test('Recognition Difference helper identifies only same-semantic disagreement; structured statements never become FACT', () => {
  const candidates = recognitionDifferenceCandidates([
    { semanticKey: 'management.visibility', value: 'VISIBLE_ENOUGH', respondent: { role: 'MANAGEMENT' }, source: 'HEARING' },
    { semanticKey: 'management.visibility', value: 'LARGELY_UNKNOWN', respondent: { role: 'IT_DECISION_OWNER' }, source: 'HEARING' },
    { semanticKey: 'management.information.delivery', value: 'AVAILABLE', respondent: { role: 'IT_DECISION_OWNER' }, source: 'HEARING' },
    { semanticKey: 'management.decision.usability', value: 'INSUFFICIENT', respondent: { role: 'MANAGEMENT' }, source: 'HEARING' },
  ]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.semanticKey, 'management.visibility');
  assert.equal((candidates[0] as { fact?: unknown }).fact, undefined);
});

test('Guard: operator note is not accepted by the initial rule input contract', () => {
  assert.equal('operatorNoteText' in runInitialRule(projectIntakeSemantics([])), false);
});
