import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregateSurveyMonths, fiscalYearStartMonth, surveyCompletionVolumeRatio } from '../src/domain/surveyMonthlySummary';

test('atLIB fiscal year starts February 1 and January belongs to prior fiscal year', () => {
  assert.equal(fiscalYearStartMonth('2026-10'), '2026-02');
  assert.equal(fiscalYearStartMonth('2027-01'), '2026-02');
  assert.equal(fiscalYearStartMonth('2027-02'), '2027-02');
});

test('monthly, rolling, fiscal, comparable prior fiscal and cumulative counts', () => {
  const rows = [
    {month:'2025-09',startedCount:10,completedCount:7},
    {month:'2025-10',startedCount:20,completedCount:12},
    {month:'2026-02',startedCount:30,completedCount:20},
    {month:'2026-08',startedCount:40,completedCount:30},
    {month:'2026-09',startedCount:50,completedCount:40},
    {month:'2026-10',startedCount:60,completedCount:45},
  ];
  const summary = aggregateSurveyMonths(rows,'2026-10','2025-02');
  assert.deepEqual(summary.currentMonth,{started:60,completed:45,coverage:'FULL_MONTHS'});
  assert.deepEqual(summary.trailingThreeMonths,{started:150,completed:115,coverage:'FULL_MONTHS'});
  assert.deepEqual(summary.currentFiscalYear,{started:180,completed:135,coverage:'FULL_MONTHS'});
  assert.deepEqual(summary.previousFiscalYear,{started:30,completed:19,coverage:'FULL_MONTHS'});
  assert.deepEqual(summary.cumulative,{started:210,completed:154,coverage:'FULL_MONTHS'});
  assert.equal(surveyCompletionVolumeRatio(summary.currentMonth),0.75);
});

test('unmeasured prior fiscal period is not reported as actual zero', () => {
  const summary=aggregateSurveyMonths([{month:'2026-10',startedCount:3,completedCount:2}], '2026-10','2026-10');
  assert.equal(summary.previousFiscalYear.coverage,'NOT_MEASURED');
  assert.equal(summary.previousFiscalYear.started,0);
  assert.equal(summary.currentFiscalYear.coverage,'PARTIAL_MONTHS');
  assert.equal(summary.currentMonth.coverage,'FULL_MONTHS');
});

test('zero denominator is undefined, not zero percent', () => {
  assert.equal(surveyCompletionVolumeRatio({started:0,completed:0}),null);
  assert.throws(()=>aggregateSurveyMonths([], '2026-10','2026-11'),/COVERAGE_AFTER_CURRENT_MONTH/);
});
