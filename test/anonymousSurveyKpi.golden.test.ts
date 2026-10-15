import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildJapanKpiWindows, inKpiWindow, periodVolumeRatio } from '../src/domain/anonymousSurveyKpi';

test('Japan calendar windows use JST midnight and a shared as-of instant', () => {
  const w = buildJapanKpiWindows('2026-10-14T11:00:00.000Z', '2026-01-01T00:00:00.000Z');
  assert.equal(w.currentMonth.startInclusive, '2026-09-30T15:00:00.000Z');
  assert.equal(w.trailingThreeMonths.startInclusive, '2026-07-31T15:00:00.000Z');
  assert.equal(w.cumulative.startInclusive, '2026-09-20T00:00:00.000Z');
  assert.equal(w.currentMonth.endExclusive, w.cumulative.endExclusive);
  assert.equal(inKpiWindow('2026-09-30T14:59:59.999Z', w.currentMonth), false);
  assert.equal(inKpiWindow('2026-09-30T15:00:00.000Z', w.currentMonth), true);
});

test('cross-year trailing three months and coverage guard', () => {
  const w = buildJapanKpiWindows('2027-01-02T00:00:00.000Z', '2026-09-01T00:00:00.000Z');
  assert.equal(w.trailingThreeMonths.startInclusive, '2026-10-31T15:00:00.000Z');
  assert.throws(() => buildJapanKpiWindows('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z'), /COVERAGE_AFTER_AS_OF/);
});

test('period volume ratios preserve undefined and may exceed 100 percent', () => {
  assert.equal(periodVolumeRatio(30, 100), 0.3);
  assert.equal(periodVolumeRatio(3, 2), 1.5);
  assert.equal(periodVolumeRatio(0, 0), null);
  assert.throws(() => periodVolumeRatio(-1, 2), /INVALID_COUNT/);
});

test('new instrumentation clamps current and three-month windows to actual coverage', () => {
  const w = buildJapanKpiWindows('2026-10-14T11:00:00.000Z', '2026-10-10T02:30:00.000Z');
  assert.equal(w.currentMonth.startInclusive, '2026-10-10T02:30:00.000Z');
  assert.equal(w.trailingThreeMonths.startInclusive, '2026-10-10T02:30:00.000Z');
  assert.equal(w.cumulative.startInclusive, '2026-10-10T02:30:00.000Z');
  assert.equal(inKpiWindow('2026-10-09T23:59:59.999Z', w.currentMonth), false);
});
