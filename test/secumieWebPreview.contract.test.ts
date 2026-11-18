import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import path from 'node:path';
import test from 'node:test';
import type { Pool } from 'pg';
import { createPiraPublicRuntime } from '../src/runtime/piraPublicRuntime';

const options = {
  pool: {} as Pool,
  issuer: 'https://issuer.example.test',
  jwksUrl: 'https://issuer.example.test/.well-known/jwks.json',
  unionHost: '127.0.0.1',
  generalHost: 'general.example.test',
  unionInitiativeCode: 'pira-union',
  generalInitiativeCode: 'pira-general',
  generalEnabled: false,
  turnstileSiteKey: 'test-key',
  publicAuthScriptPath: path.resolve(__dirname, '../public/public-service-auth.js'),
  prototypeDir: path.resolve(__dirname, '../prototypes/pira-union-diagnosis-v2'),
};

test('SECU:MIE Web preview is opt-in and never accepts submissions', async () => {
  const prior = process.env.SECUMIE_WEB_PREVIEW_ENABLED;
  try {
    for (const enabled of [false, true]) {
      if (enabled) process.env.SECUMIE_WEB_PREVIEW_ENABLED = 'true';
      else delete process.env.SECUMIE_WEB_PREVIEW_ENABLED;
      const server = createPiraPublicRuntime(options).listen(0, '127.0.0.1');
      try {
        await new Promise<void>(resolve => server.once('listening', resolve));
        const address = server.address() as AddressInfo;
        const base = `http://127.0.0.1:${address.port}`;
        const response = await fetch(`${base}/secu-web/preview`);
        assert.equal(response.status, enabled ? 200 : 404);
        if (enabled) {
          const html = await response.text();
          assert.match(html, /SECU:MIE Web/);
          assert.match(html, /所属組合/);
          assert.match(html, /<fieldset disabled>/);
          assert.match(html, /送信できません/);
          assert.equal(response.headers.get('cache-control'), 'no-store');
          assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
          const post = await fetch(`${base}/secu-web/preview`, { method: 'POST' });
          assert.equal(post.status, 404);
        }
      } finally {
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      }
    }
  } finally {
    if (prior === undefined) delete process.env.SECUMIE_WEB_PREVIEW_ENABLED;
    else process.env.SECUMIE_WEB_PREVIEW_ENABLED = prior;
  }
});
