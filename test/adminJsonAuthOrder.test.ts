import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createIpRateLimiter } from '../src/middleware/rateLimit';
import { requireStaffAuth } from '../src/middleware/staffAuth';
import { StaffAuthService } from '../src/services/staffAuthService';

test('staff JSON paths authenticate before parsing larger bodies', async () => {
  const auth = new StaffAuthService('test-secret');
  const app = express();
  app.use(cookieParser());
  const gate = [createIpRateLimiter({ windowMs: 60_000, maxRequests: 100 }), requireStaffAuth(auth)];
  app.use('/api/admin-15mb', ...gate, express.json({ limit: '15mb' }));
  app.use('/api/admin-2mb', ...gate, express.json({ limit: '2mb' }));
  app.post('/api/admin-15mb', (_req, res) => res.sendStatus(204));
  app.post('/api/admin-2mb', (_req, res) => res.sendStatus(204));
  app.use((error: { type?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error.type === 'entity.too.large') return res.sendStatus(413);
    return res.sendStatus(500);
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  const json = (bytes: number) => JSON.stringify({ data: 'x'.repeat(bytes) });
  try {
    const anonymous = await fetch(`${base}/api/admin-15mb`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: json(2_100_000) });
    assert.equal(anonymous.status, 401);
    const invalid = await fetch(`${base}/api/admin-2mb`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'staff_session=invalid' }, body: json(10) });
    assert.equal(invalid.status, 401);
    const cookie = `staff_session=${auth.issueSessionToken({ email: 'staff@example.test' })}`;
    const valid = await fetch(`${base}/api/admin-15mb`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: json(2_100_000) });
    assert.equal(valid.status, 204);
    const tooLarge = await fetch(`${base}/api/admin-2mb`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: json(2_100_000) });
    assert.equal(tooLarge.status, 413);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
