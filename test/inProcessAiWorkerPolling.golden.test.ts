import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startInProcessAiWorkerPolling } from '../src/services/inProcessAiWorkerPolling';

function logger() {
  const events: Array<Record<string, unknown>> = [];
  return { events, info: (fields: Record<string, unknown>) => events.push(fields), warn: (fields: Record<string, unknown>) => events.push(fields) };
}

test('disabled in-process polling never claims work and records its non-secret state', () => {
  let calls = 0;
  const log = logger();
  const stop = startInProcessAiWorkerPolling({
    enabled: false,
    logger: log,
    workers: [{ name: 'report', worker: { tick: async () => { calls++; return true; } } }],
  });
  assert.equal(calls, 0);
  assert.deepEqual(log.events, [{ event: 'in_process_ai_workers_disabled' }]);
  stop();
});

test('enabled polling explicitly starts workers and its stop handle prevents later polling', async () => {
  let calls = 0;
  const log = logger();
  const stop = startInProcessAiWorkerPolling({
    enabled: true,
    logger: log,
    intervalMs: 1000,
    workers: [{ name: 'report', worker: { tick: async () => { calls++; return true; } } }],
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.deepEqual(log.events[0], { event: 'in_process_ai_workers_enabled', worker_count: 1 });
  stop();
  const stoppedAt = calls;
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(calls, stoppedAt);
});
