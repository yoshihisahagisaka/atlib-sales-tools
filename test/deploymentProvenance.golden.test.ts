import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const provenance = require('../scripts/deploy/provenance.cjs');
const SHA = '19cccfa863edd2278f8bf842a2c38bd9b85f39fa';
const DIGEST = 'asia-northeast1-docker.pkg.dev/msp-zabbix/sales-tools/runtime@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const base = { repository: 'yoshihisahagisaka/atlib-sales-tools', git_sha: SHA, cloud_build_id: 'build-123', oci_revision_label: SHA, image_digest: DIGEST, cloud_run_revision: 'sales-tools-staging-00005-abc', cloud_run_revision_label: SHA, timestamp: '2026-09-20T00:00:00.000Z', deploy_actor: 'release-operator' };

test('CS-07: build source requires one exact 40-character Git SHA', () => {
  assert.throws(() => provenance.buildContract({ repository: base.repository, gitSha: 'not-a-sha', sourceCommit: SHA, localHead: SHA }), /GIT_SHA_INVALID/);
  assert.throws(() => provenance.buildContract({ repository: base.repository, gitSha: SHA, sourceCommit: 'a'.repeat(40), localHead: SHA }), /BUILD_SOURCE_SHA_MISMATCH/);
  assert.equal(provenance.buildContract({ repository: base.repository, gitSha: SHA, sourceCommit: SHA, localHead: SHA }).oci_revision_label, SHA);
});

test('CS-07: deploy requires a resolved digest and matching OCI/revision SHA', () => {
  assert.throws(() => provenance.deploymentRecord({ ...base, image_digest: 'sales-tools:latest' }), /IMAGE_DIGEST_REQUIRED/);
  assert.throws(() => provenance.deploymentRecord({ ...base, oci_revision_label: 'b'.repeat(40) }), /OCI_REVISION_SHA_MISMATCH/);
  assert.throws(() => provenance.deploymentRecord({ ...base, cloud_run_revision_label: 'b'.repeat(40) }), /REVISION_LABEL_SHA_MISMATCH/);
});

test('CS-07: deployment record is allowlisted and excludes prohibited material', () => {
  const record = provenance.deploymentRecord(base);
  assert.deepEqual(Object.keys(record).sort(), ['cloud_build_id', 'cloud_run_revision', 'deploy_actor', 'git_sha', 'image_digest', 'oci_revision_label', 'repository', 'timestamp']);
  assert.throws(() => provenance.deploymentRecord({ ...base, secret_value: 'must-not-appear' }), /SANITIZED_RECORD_FORBIDDEN_FIELD/);
});

test('CS-07: runtime build and Cloud Build contract carry the same OCI revision input', () => {
  const root = path.resolve(__dirname, '..');
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  const cloudBuild = fs.readFileSync(path.join(root, 'cloudbuild.provenance.yaml'), 'utf8');
  assert.match(dockerfile, /ARG SOURCE_REVISION\s+LABEL org\.opencontainers\.image\.revision=\$SOURCE_REVISION/);
  assert.match(cloudBuild, /--build-arg=SOURCE_REVISION=\$COMMIT_SHA/);
  assert.match(cloudBuild, /--label=org\.opencontainers\.image\.revision=\$COMMIT_SHA/);
});
