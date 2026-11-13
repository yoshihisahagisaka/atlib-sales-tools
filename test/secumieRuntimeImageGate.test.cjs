'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { assertRevision, buildPlan, imageTag } = require('../scripts/readiness/secumieRuntimeImageGate.cjs');

const SHA = '1234567890abcdef1234567890abcdef12345678';

test('requires full Git commit for image provenance', () => {
  assert.equal(assertRevision(SHA), SHA);
  assert.throws(() => assertRevision('1234567'), /full, lowercase/);
  assert.throws(() => assertRevision(SHA.toUpperCase()), /full, lowercase/);
});

test('uses distinct local tags for OTP and PIRA', () => {
  assert.equal(imageTag('secumie-otp-runtime', SHA), 'local/secumie-otp-runtime:pr46-1234567890ab');
  const plan = buildPlan(SHA);
  assert.deepEqual(plan.map(({ target }) => target), ['otp-runtime', 'pira-runtime']);
  assert.notEqual(plan[0].image, plan[1].image);
});

test('builds pinned Dockerfile targets for linux/amd64 without publishing', () => {
  for (const { target, image, build } of buildPlan(SHA)) {
    assert.deepEqual(build, [
      'buildx', 'build', '--platform', 'linux/amd64', '--load',
      '--file', 'Dockerfile.secumie', '--target', target,
      '--build-arg', `SOURCE_REVISION=${SHA}`, '--tag', image, '.',
    ]);
    assert.ok(!build.includes('--push'));
    assert.ok(!build.includes('registry'));
  }
});

test('fails scans on Critical or High findings via Docker Scout exit code', () => {
  for (const { image, scan } of buildPlan(SHA)) {
    assert.deepEqual(scan, [
      'scout', 'cves', '--platform', 'linux/amd64',
      '--only-severity', 'critical,high', '--exit-code', image,
    ]);
  }
});
