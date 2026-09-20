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
  if (command === 'record') {
    console.log(JSON.stringify(deploymentRecord(input)));
    return;
  }
  fail('COMMAND_INVALID');
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error instanceof Error ? error.message : 'PROVENANCE_FAILED'); process.exitCode = 1; }
}

module.exports = { buildContract, deploymentRecord, requireSha, requireDigest };
