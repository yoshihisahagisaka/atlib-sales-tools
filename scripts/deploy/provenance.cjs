'use strict';

const { execFileSync } = require('node:child_process');

const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/;
const FORBIDDEN = /secret|password|customer|token|oauth|environment|env(?:ironment)?/i;

function fail(code) { throw new Error(code); }
function requireSha(value, code = 'GIT_SHA_INVALID') {
  if (typeof value !== 'string' || !SHA.test(value)) fail(code);
  return value;
}
function requireDigest(value) {
  if (typeof value !== 'string' || !DIGEST.test(value)) fail('IMAGE_DIGEST_REQUIRED');
  return value;
}
function requireText(value, code) {
  if (typeof value !== 'string' || !value.trim()) fail(code);
  return value;
}
function requireTimestamp(value) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) fail('TIMESTAMP_INVALID');
  return value;
}
function assertNoForbidden(value, key = '') {
  if (FORBIDDEN.test(key)) fail('SANITIZED_RECORD_FORBIDDEN_FIELD');
  if (Array.isArray(value)) value.forEach((entry) => assertNoForbidden(entry));
  else if (value && typeof value === 'object') {
    for (const [childKey, child] of Object.entries(value)) assertNoForbidden(child, childKey);
  }
}
function currentHead() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}
function assertCleanReviewedSource({ gitSha, cwd = process.cwd(), execFile = execFileSync }) {
  requireSha(gitSha);
  const status = execFile('git', ['status', '--porcelain', '--untracked-files=all'], { cwd, encoding: 'utf8' });
  if (status.trim()) fail('DIRTY_WORKTREE');
  const head = execFile('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  if (head !== gitSha) fail('BUILD_SOURCE_SHA_MISMATCH');
  return Object.freeze({ git_sha: gitSha, local_head: head, tracked_content_only: true });
}
function createReviewedSource({ gitSha, output, cwd = process.cwd(), execFile = execFileSync }) {
  const source = assertCleanReviewedSource({ gitSha, cwd, execFile });
  requireText(output, 'ARCHIVE_OUTPUT_REQUIRED');
  execFile('git', ['archive', '--format=tar.gz', `--output=${output}`, gitSha], { cwd, encoding: 'utf8' });
  return Object.freeze({ ...source, archive: output });
}
function buildContract({ repository, gitSha, sourceCommit, localHead = currentHead() }) {
  requireText(repository, 'REPOSITORY_REQUIRED');
  requireSha(gitSha);
  requireSha(sourceCommit, 'SOURCE_COMMIT_INVALID');
  requireSha(localHead, 'LOCAL_HEAD_INVALID');
  if (gitSha !== sourceCommit || gitSha !== localHead) fail('BUILD_SOURCE_SHA_MISMATCH');
  return Object.freeze({
    repository,
    git_sha: gitSha,
    source_commit: sourceCommit,
    oci_revision_label: gitSha,
    docker_build_arg: `SOURCE_REVISION=${gitSha}`,
    deployment_identity: 'IMAGE_DIGEST_REQUIRED',
  });
}
function deploymentRecord(input) {
  const allowed = new Set(['repository', 'git_sha', 'cloud_build_id', 'oci_revision_label', 'image_digest', 'cloud_run_revision', 'timestamp', 'deploy_actor', 'cloud_run_revision_label']);
  for (const key of Object.keys(input)) if (!allowed.has(key)) fail('SANITIZED_RECORD_FORBIDDEN_FIELD');
  assertNoForbidden(input);
  const gitSha = requireSha(input.git_sha);
  if (requireSha(input.oci_revision_label, 'OCI_REVISION_INVALID') !== gitSha) fail('OCI_REVISION_SHA_MISMATCH');
  if (requireSha(input.cloud_run_revision_label, 'REVISION_LABEL_INVALID') !== gitSha) fail('REVISION_LABEL_SHA_MISMATCH');
  return Object.freeze({
    repository: requireText(input.repository, 'REPOSITORY_REQUIRED'),
    git_sha: gitSha,
    cloud_build_id: requireText(input.cloud_build_id, 'CLOUD_BUILD_ID_REQUIRED'),
    oci_revision_label: input.oci_revision_label,
    image_digest: requireDigest(input.image_digest),
    cloud_run_revision: requireText(input.cloud_run_revision, 'CLOUD_RUN_REVISION_REQUIRED'),
    timestamp: requireTimestamp(input.timestamp),
    deploy_actor: requireText(input.deploy_actor, 'DEPLOY_ACTOR_REQUIRED'),
  });
}
function migrationExecutionRecord(input) {
  const allowed = new Set(['repository', 'git_sha', 'cloud_build_id', 'migration_oci_revision', 'migration_image_digest', 'job_name', 'execution_name', 'started_at', 'completed_at', 'actor', 'result']);
  for (const key of Object.keys(input)) if (!allowed.has(key)) fail('SANITIZED_RECORD_FORBIDDEN_FIELD');
  assertNoForbidden(input);
  const gitSha = requireSha(input.git_sha);
  if (requireSha(input.migration_oci_revision, 'MIGRATION_OCI_REVISION_INVALID') !== gitSha) fail('MIGRATION_OCI_SHA_MISMATCH');
  const result = requireText(input.result, 'MIGRATION_RESULT_REQUIRED');
  if (!['PASS', 'FAIL'].includes(result)) fail('MIGRATION_RESULT_INVALID');
  return Object.freeze({
    repository: requireText(input.repository, 'REPOSITORY_REQUIRED'), git_sha: gitSha,
    cloud_build_id: requireText(input.cloud_build_id, 'CLOUD_BUILD_ID_REQUIRED'),
    migration_oci_revision: input.migration_oci_revision,
    migration_image_digest: requireDigest(input.migration_image_digest),
    job_name: requireText(input.job_name, 'MIGRATION_JOB_REQUIRED'),
    execution_name: requireText(input.execution_name, 'MIGRATION_EXECUTION_REQUIRED'),
    started_at: requireTimestamp(input.started_at), completed_at: requireTimestamp(input.completed_at),
    actor: requireText(input.actor, 'MIGRATION_ACTOR_REQUIRED'), result,
  });
}
function imageArtifactContract({ gitSha, runtimeOciRevision, runtimeImageDigest, migrationOciRevision, migrationImageDigest }) {
  const sha = requireSha(gitSha);
  if (requireSha(runtimeOciRevision, 'RUNTIME_OCI_REVISION_INVALID') !== sha) fail('RUNTIME_OCI_SHA_MISMATCH');
  if (requireSha(migrationOciRevision, 'MIGRATION_OCI_REVISION_INVALID') !== sha) fail('MIGRATION_OCI_SHA_MISMATCH');
  return Object.freeze({ git_sha: sha, runtime_image_digest: requireDigest(runtimeImageDigest), migration_image_digest: requireDigest(migrationImageDigest) });
}
function requireMigrationPass(migrationRecord) {
  if (!migrationRecord || migrationRecord.result !== 'PASS') fail('MIGRATION_PASS_REQUIRED_BEFORE_RUNTIME_DEPLOY');
  return true;
}
function argsToObject(args) {
  const result = {};
  for (const arg of args) {
    const match = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (!match) fail('CLI_ARGUMENT_INVALID');
    result[match[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = match[2];
  }
  return result;
}
function main(args) {
  const [command, ...rest] = args;
  const input = argsToObject(rest);
  if (command === 'build-contract') {
    const record = buildContract({ repository: input.repository, gitSha: input.gitSha, sourceCommit: input.sourceCommit, localHead: input.localHead || currentHead() });
    console.log(JSON.stringify(record));
    return;
  }
  if (command === 'reviewed-source') {
    console.log(JSON.stringify(createReviewedSource({ gitSha: input.gitSha, output: input.output })));
    return;
  }
  if (command === 'record') {
    console.log(JSON.stringify(deploymentRecord(input)));
    return;
  }
  if (command === 'migration-record') {
    console.log(JSON.stringify(migrationExecutionRecord(input)));
    return;
  }
  fail('COMMAND_INVALID');
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error instanceof Error ? error.message : 'PROVENANCE_FAILED'); process.exitCode = 1; }
}

module.exports = { assertCleanReviewedSource, createReviewedSource, buildContract, deploymentRecord, migrationExecutionRecord, imageArtifactContract, requireMigrationPass, requireSha, requireDigest };
