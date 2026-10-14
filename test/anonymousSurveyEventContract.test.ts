import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  validateAnonymousSurveyEvent, anonymousSurveyEventDedupKey,
} from '../src/domain/anonymousSurveyEventContract';

const input = {
  eventType: 'SURVEY_STARTED',
  surveyInstanceId: 'e5a126af-9817-4a73-8b7e-8ed46f9732ad',
  attribution: { source: 'tbk', medium: 'flyer', campaign: '202610_tbk' },
};

test('public survey telemetry is normal, without applicant identity', () => {
  const e = validateAnonymousSurveyEvent(input, { mode: 'PUBLIC', staffAuthenticated: false });
  assert.equal(e.isTest, false);
  assert.equal(e.attribution?.campaign, '202610_tbk');
  assert.equal(anonymousSurveyEventDedupKey(e), input.surveyInstanceId + ':SURVEY_STARTED');
});

test('authenticated staff test is excluded via trusted server context', () => {
  const e = validateAnonymousSurveyEvent(input, { mode: 'STAFF_TEST', staffAuthenticated: true });
  assert.equal(e.isTest, true);
});

test('unauthenticated test mode is rejected', () => {
  assert.throws(() => validateAnonymousSurveyEvent(input, {
    mode: 'STAFF_TEST', staffAuthenticated: false,
  }), /STAFF_AUTH_REQUIRED_FOR_TEST/);
});

test('client cannot forge isTest or submit identity or survey answers', () => {
  const context = { mode: 'PUBLIC' as const, staffAuthenticated: false };
  for (const addition of [
    { isTest: true },
    { companyName: 'Example Inc' },
    { email: 'example@example.com' },
    { caseId: 'some-case' },
    { answers: { Q1: 'secret' } },
    { idempotencyKey: 'application-key' },
  ]) {
    assert.throws(() => validateAnonymousSurveyEvent({ ...input, ...addition }, context));
  }
});

test('invalid event type, invalid token and unexpected attribution fields are rejected', () => {
  const context = { mode: 'PUBLIC' as const, staffAuthenticated: false };
  assert.throws(() => validateAnonymousSurveyEvent({ ...input, eventType: 'APPLICATION_ACCEPTED' }, context));
  assert.throws(() => validateAnonymousSurveyEvent({ ...input, surveyInstanceId: 'guessable' }, context));
  assert.throws(() => validateAnonymousSurveyEvent({
    ...input, attribution: { ...input.attribution, referrer: 'https://private.example/' },
  }, context));
});
