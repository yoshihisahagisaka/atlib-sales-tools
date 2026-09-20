import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const provenance = require('../scripts/deploy/provenance.cjs');
const SHA = '19cccfa863edd2278f8bf842a2c38bd9b85f39fa';
const DIGEST = 'asia-northeast1-docker.pkg.dev/msp-zabbix/sales-tools/runtime@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const MIGRATION_DIGEST = 'asia-northeast1-docker.pkg.dev/msp-zabbix/sales-tools/migration@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const base = { repository: 'yoshihisahagisaka/atlib-sales-tools', git_sha: SHA, cloud_build_id: 'build-123', oci_revision_label: SHA, image_digest: DIGEST, cloud_run_revision: 'sales-tools-staging-00005-abc', cloud_run_revision_label: SHA, timestamp: '2026-09-20T00:00:00.000Z', deploy_actor: 'release-operator' };

test('CS-07: build source requires one exact 40-character Git SHA', () => {
  assert.throws(() => provenance.buildContract({ repository: base.repository, gitSha: 'not-a-sha', sourceCommit: SHA, localHead: SHA }), /GIT_SHA_INVALID/);
  assert.throws(() => provenance.buildContract({ repository: base.repository, gitSha: SHA, sourceCommit: 'a'.repeat(40), localHead: SHA }), /BUILD_SOURCE_SHA_MISMATCH/);
  assert.equal(provenance.buildContract({ repository: base.repository, gitSha: SHA, sourceCommit: SHA, localHead: SHA }).oci_revision_label, SHA);
});

test('CS-07 extension: reviewed source rejects dirty worktrees and HEAD/SHA mismatches', () => {
  const calls: string[][] = [];
  const exec = (_file: string, args: string[]) => {
    calls.push(args);
    if (args[0] === 'status') return '';
    if (args[0] === 'rev-parse') return `${SHA}\n`;
    return '';
  };
  assert.deepEqual(provenance.assertCleanReviewedSource({ gitSha: SHA, execFile: exec }).local_head, SHA);
  assert.throws(() => provenance.assertCleanReviewedSource({ gitSha: SHA, execFile: () => ' M src/server.ts\n' }), /DIRTY_WORKTREE/);
  assert.throws(() => provenance.assertCleanReviewedSource({ gitSha: SHA, execFile: (_file: string, args: string[]) => args[0] === 'status' ? '' : `${'b'.repeat(40)}\n` }), /BUILD_SOURCE_SHA_MISMATCH/);
  assert.throws(() => provenance.assertCleanReviewedSource({ gitSha: 'short', execFile: exec }), /GIT_SHA_INVALID/);
  assert.equal(calls[0]?.join(' '), 'status --porcelain --untracked-files=all');
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

test('CS-07 extension: both immutable artifacts require the same Git SHA and resolved digests', () => {
  assert.deepEqual(provenance.imageArtifactContract({ gitSha: SHA, runtimeOciRevision: SHA, runtimeImageDigest: DIGEST, migrationOciRevision: SHA, migrationImageDigest: MIGRATION_DIGEST }), { git_sha: SHA, runtime_image_digest: DIGEST, migration_image_digest: MIGRATION_DIGEST });
  assert.throws(() => provenance.imageArtifactContract({ gitSha: SHA, runtimeOciRevision: SHA, runtimeImageDigest: DIGEST, migrationOciRevision: 'b'.repeat(40), migrationImageDigest: MIGRATION_DIGEST }), /MIGRATION_OCI_SHA_MISMATCH/);
  assert.throws(() => provenance.imageArtifactContract({ gitSha: SHA, runtimeOciRevision: SHA, runtimeImageDigest: 'runtime:tag', migrationOciRevision: SHA, migrationImageDigest: MIGRATION_DIGEST }), /IMAGE_DIGEST_REQUIRED/);
});

test('CS-07 extension: migration execution record is sanitized and gates runtime deployment', () => {
  const migration = provenance.migrationExecutionRecord({ repository: base.repository, git_sha: SHA, cloud_build_id: 'build-123', migration_oci_revision: SHA, migration_image_digest: MIGRATION_DIGEST, job_name: 'sales-tools-staging-migration', execution_name: 'sales-tools-staging-migration-abc', started_at: '2026-09-20T00:00:00.000Z', completed_at: '2026-09-20T00:01:00.000Z', actor: 'release-operator', result: 'PASS' });
  assert.deepEqual(Object.keys(migration).sort(), ['actor', 'cloud_build_id', 'completed_at', 'execution_name', 'git_sha', 'job_name', 'migration_image_digest', 'migration_oci_revision', 'repository', 'result', 'started_at']);
  assert.equal(provenance.requireMigrationPass(migration), true);
  assert.throws(() => provenance.migrationExecutionRecord({ ...migration, environment_value: 'nope' }), /SANITIZED_RECORD_FORBIDDEN_FIELD/);
  assert.throws(() => provenance.requireMigrationPass({ ...migration, result: 'FAIL' }), /MIGRATION_PASS_REQUIRED_BEFORE_RUNTIME_DEPLOY/);
});

test('CS-07 extension: runtime and migration builds carry the same OCI revision input', () => {
  const root = path.resolve(__dirname, '..');
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  const cloudBuild = fs.readFileSync(path.join(root, 'cloudbuild.provenance.yaml'), 'utf8');
  assert.equal((dockerfile.match(/LABEL org\.opencontainers\.image\.revision=\$SOURCE_REVISION/g) || []).length, 2);
  assert.equal((cloudBuild.match(/--build-arg=SOURCE_REVISION=\$\{_GIT_SHA\}/g) || []).length, 2);
  assert.match(cloudBuild, /--target=migration/);
  assert.match(cloudBuild, /images:\n\s+- \$\{_RUNTIME_IMAGE\}:\$\{_GIT_SHA\}\n\s+- \$\{_MIGRATION_IMAGE\}:\$\{_GIT_SHA\}/);
});
