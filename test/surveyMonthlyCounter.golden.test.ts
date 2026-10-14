import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addMonthlyCounts, counterColumn, japanYearMonth, shouldIncrementNormalCounter } from '../src/domain/surveyMonthlyCounter';

test('Japan month boundary is based on JST rather than UTC', () => {
  assert.equal(japanYearMonth(new Date('2026-01-31T14:59:59Z')), '2026-01');
  assert.equal(japanYearMonth(new Date('2026-01-31T15:00:00Z')), '2026-02');
});
test('accepted normal actions count, regardless of repeated human visits', () => {
  assert.equal(shouldIncrementNormalCounter({acceptedByLimiter:true,payloadValid:true,serverVerifiedStaffTest:false}), true);
  assert.equal(shouldIncrementNormalCounter({acceptedByLimiter:false,payloadValid:true,serverVerifiedStaffTest:false}), false);
  assert.equal(shouldIncrementNormalCounter({acceptedByLimiter:true,payloadValid:false,serverVerifiedStaffTest:false}), false);
  assert.equal(shouldIncrementNormalCounter({acceptedByLimiter:true,payloadValid:true,serverVerifiedStaffTest:true}), false);
});
test('started and completed counters are distinct', () => {
  assert.equal(counterColumn('STARTED'), 'started_count');
  assert.equal(counterColumn('COMPLETED'), 'completed_count');
});
test('monthly aggregation preserves counts without identity', () => {
  const a = {monthJst:'2026-10',serviceKey:'IT_KAIZEN' as const,attributionKey:'tbk',startedCount:3,completedCount:2};
  const b = {...a,startedCount:5,completedCount:4};
  assert.deepEqual(addMonthlyCounts(a,b), {...a,startedCount:8,completedCount:6});
  assert.throws(() => addMonthlyCounts(a,{...b,monthJst:'2026-11'}), /BUCKET_MISMATCH/);
});
