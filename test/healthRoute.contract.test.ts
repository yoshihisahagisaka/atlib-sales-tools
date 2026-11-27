import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

test('health routes are public, return the compatibility body, and precede staff auth', async () => {
  const source = await readFile(path.join(process.cwd(), 'src/server.ts'), 'utf8');
  const health = "app.get('/health', (_req, res) => res.status(200).send('ok'));";
  const healthz = "app.get('/healthz', (_req, res) => res.status(200).send('ok'));";
  const healthIndex = source.indexOf(health);
  const healthzIndex = source.indexOf(healthz);
  const authIndex = source.indexOf("app.use('/auth'");
  const adminGateIndex = source.indexOf("app.use('/api/admin/", healthzIndex);

  assert.ok(healthIndex >= 0, 'GET /health must remain wired to HTTP 200 text ok');
  assert.ok(healthzIndex > healthIndex, 'GET /healthz must remain as the compatibility route');
  assert.ok(authIndex > healthzIndex, 'health routes must not require Staff authentication');
  assert.ok(adminGateIndex > healthzIndex, 'health routes must precede Staff-only APIs');
});
