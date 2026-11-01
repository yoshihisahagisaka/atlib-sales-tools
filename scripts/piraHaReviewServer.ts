import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import express from 'express';

export const HA_REVIEW_CODE = '246810';

export function createPiraHaReviewApp(root = path.resolve(__dirname, '..')) {
  const app = express();
  const challenges = new Set<string>();
  const sessions = new Set<string>();
  const submissions = new Map<string, { states: string[] }>();
  let otpRequests = 0;

  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.use(express.static(path.join(root, 'public')));
  app.get('/pira/pira-e2.html', (_request, response) => {
    const source = readFileSync(path.join(root, 'prototypes/pira-union-diagnosis-v2/pira-e2.html'), 'utf8');
    const reviewBootstrap = '<script>window.publicAuthTurnstileToken=()=>\'ha-review\';</script>';
    response.type('html').set('cache-control', 'no-store').send(source.replace('<head>', `<head>${reviewBootstrap}`));
  });
  app.use('/pira', express.static(path.join(root, 'prototypes/pira-union-diagnosis-v2')));

  app.post('/v1/otp/challenges', (request, response) => {
    otpRequests += 1;
    console.log('PIRA_HA_OTP_REQUEST_RECEIVED');
    if (request.body?.serviceId !== 'pira-union' || typeof request.body?.email !== 'string') {
      return response.status(400).json({ error: { code: 'INVALID_REQUEST' } });
    }
    const challengeId = randomUUID();
    challenges.add(challengeId);
    return response.status(201).json({ challengeId, resendAt: new Date(Date.now() + 60_000).toISOString() });
  });

  app.post('/v1/otp/challenges/:challengeId/verify', (request, response) => {
    if (!challenges.delete(request.params.challengeId) || request.body?.code !== HA_REVIEW_CODE) {
      return response.status(400).json({ error: { code: 'OTP_INVALID' } });
    }
    const sessionId = randomUUID();
    sessions.add(sessionId);
    return response.json({ sessionId, sessionToken: `ha-${randomUUID()}` });
  });

  app.post('/v1/otp/sessions/:sessionId/tokens', (request, response) => {
    if (!sessions.has(request.params.sessionId)) return response.status(401).json({ error: { code: 'SESSION_INVALID' } });
    return response.json({ token: `ha-jwt-${randomUUID()}` });
  });

  app.get('/api/public/pira/v1/intake-contract', (_request, response) => response.json({
    initiativeCode: 'pira-union',
    initiativeKind: 'UNION',
    consent: { version: 'PIRA-UNION-CONSENT-V1.0' },
  }));

  app.post('/api/public/pira/v1/submissions', (request, response) => {
    if (request.body?.accepted !== true || request.body?.consentVersion !== 'PIRA-UNION-CONSENT-V1.0') {
      return response.status(400).json({ error: { code: 'INVALID_CONSENT' } });
    }
    const receiptId = randomUUID();
    submissions.set(receiptId, { states: ['RECEIVED'] });
    return response.status(201).json({ receiptId });
  });

  app.post('/api/public/pira/v1/submissions/:receiptId/state', (request, response) => {
    const submission = submissions.get(request.params.receiptId);
    const state = request.body?.state;
    if (!submission || !['ANSWERING', 'COMPLETED'].includes(state)) {
      return response.status(400).json({ error: { code: 'INVALID_STATE' } });
    }
    submission.states.push(state);
    return response.json({ state });
  });

  app.get('/__ha/status', (_request, response) => response.json({
    mode: 'HA-1-MOCK',
    otpRequests,
    submissions: [...submissions.values()].map(value => value.states),
  }));

  app.get('/', (_request, response) => response.redirect('/pira/pira-e2.html'));
  return app;
}

if (require.main === module) {
  const port = Number(process.env.PIRA_HA_PORT || 4173);
  createPiraHaReviewApp().listen(port, '127.0.0.1', () => {
    console.log(`PIRA_HA_READY:http://127.0.0.1:${port}/pira/pira-e2.html`);
  });
}
