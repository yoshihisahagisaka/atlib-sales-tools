import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import type { Server } from 'node:http';
import { createPublicSurveyCounterRouter } from '../src/routes/publicSurveyCounter';
import type { SurveyMonthlyCounterRepo } from '../src/services/surveyMonthlyCounterRepo';

type FakeRepo = {
  resolveInitiativeId: (_utm: unknown) => Promise<string | null>;
  increment: (input: unknown) => Promise<void>;
};

async function withCounterServer(
  enabled: boolean,
  maxPerHour: number,
  fake: FakeRepo,
  run: (base: string) => Promise<void>,
) {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());
  app.use('/counter', createPublicSurveyCounterRouter(fake as unknown as SurveyMonthlyCounterRepo, enabled, maxPerHour));
  const server: Server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('NO_LISTEN_ADDRESS');
    await run(`http://127.0.0.1:${address.port}/counter/count`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

function post(url: string, body: unknown) {
  return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

test('valid start and completion count separately; repeat visits remain countable', async () => {
  const recorded: unknown[] = [];
  const fake: FakeRepo = {
    resolveInitiativeId: async () => null,
    increment: async input => { recorded.push(input); },
  };
  await withCounterServer(true, 10, fake, async url => {
    for (const kind of ['STARTED', 'COMPLETED', 'STARTED']) {
      const response = await post(url, {kind});
      assert.equal(response.status, 204);
    }
  });
  assert.equal(recorded.length, 3);
});

test('invalid payload, forged test designation and disabled intake never increment', async () => {
  const recorded: unknown[] = [];
  const fake: FakeRepo = {
    resolveInitiativeId: async () => null,
    increment: async input => { recorded.push(input); },
  };
  await withCounterServer(true, 10, fake, async url => {
    assert.equal((await post(url, {kind:'STARTED',isTest:true})).status, 400);
    assert.equal((await post(url+'?test=1', {kind:'STARTED'})).status, 400);
    assert.equal((await post(url, {kind:'STARTED',utm:{source:'  '}})).status, 400);
    assert.equal((await post(url, {kind:'OTHER'})).status, 400);
  });
  await withCounterServer(false, 10, fake, async url => {
    assert.equal((await post(url, {kind:'STARTED'})).status, 403);
  });
  assert.equal(recorded.length, 0);
});

test('existing limiter blocks excess accepted counting requests', async () => {
  let increments = 0;
  const fake: FakeRepo = {
    resolveInitiativeId: async () => null,
    increment: async () => { increments++; },
  };
  await withCounterServer(true, 1, fake, async url => {
    assert.equal((await post(url, {kind:'STARTED'})).status, 204);
    assert.equal((await post(url, {kind:'COMPLETED'})).status, 429);
  });
  assert.equal(increments, 1);
});
