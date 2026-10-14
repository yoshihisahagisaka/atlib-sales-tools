import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeSurveyUtm, resolveSurveyInitiative, surveyAttributionBucket } from '../src/domain/surveyCounterAttribution';

const tbk = {
  initiativeId:'e5a126af-9817-4a73-8b7e-8ed46f9732ad',
  serviceKey:'IT_KAIZEN' as const, isActive:true,
  source:'tbk',medium:'flyer',campaign:'202610_tbk',content:'itkaizen_a4',term:null,
};

test('exact five-UTM matching maps to registered IT initiative', () => {
  const utm = normalizeSurveyUtm({source:'tbk',medium:'flyer',campaign:'202610_tbk',content:'itkaizen_a4'});
  assert.equal(resolveSurveyInitiative(utm,[tbk]),tbk.initiativeId);
  assert.equal(surveyAttributionBucket(tbk.initiativeId),`INITIATIVE:${tbk.initiativeId}`);
});

test('different content, casing, or service never maps to TBK', () => {
  assert.equal(resolveSurveyInitiative(normalizeSurveyUtm({source:'TBK',medium:'flyer',campaign:'202610_tbk',content:'itkaizen_a4'}),[tbk]),null);
  assert.equal(resolveSurveyInitiative(normalizeSurveyUtm({source:'tbk',medium:'flyer',campaign:'202610_tbk',content:'different'}),[tbk]),null);
  assert.equal(resolveSurveyInitiative(normalizeSurveyUtm({source:'tbk',medium:'flyer',campaign:'202610_tbk',content:'itkaizen_a4'}),[{...tbk,serviceKey:'BUSINESS_WEB'}]),null);
  assert.equal(surveyAttributionBucket(null),'UNMATCHED');
});

test('no invalid or ambiguous UTM matching', () => {
  assert.throws(()=>normalizeSurveyUtm({source:' '.repeat(2)}),/INVALID_UTM/);
  assert.throws(()=>resolveSurveyInitiative(normalizeSurveyUtm({source:'tbk',medium:'flyer',campaign:'202610_tbk',content:'itkaizen_a4'}),[tbk,{...tbk,initiativeId:'other'}]),/AMBIGUOUS_INITIATIVE/);
});
