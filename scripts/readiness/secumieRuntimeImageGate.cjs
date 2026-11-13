#!/usr/bin/env node
'use strict';

// Local-only OTP / PIRA image preflight. This tool never pushes, deploys,
// creates GCP resources, or reads application secrets.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const PLATFORM = 'linux/amd64';
const TARGETS = Object.freeze([
  { target: 'otp-runtime', name: 'secumie-otp-runtime' },
  { target: 'pira-runtime', name: 'secumie-pira-runtime' },
]);

function assertRevision(revision) {
  if (!/^[a-f0-9]{40}$/.test(revision)) {
    throw new Error(`Expected a full, lowercase Git SHA-1 revision; got: ${revision}`);
  }
  return revision;
}

function imageTag(name, revision) {
  return `local/${name}:pr46-${revision.slice(0, 12)}`;
}

function buildPlan(revision) {
  assertRevision(revision);
  return TARGETS.map(({ target, name }) => {
    const image = imageTag(name, revision);
    return {
      target,
      image,
      build: [
        'buildx', 'build', '--platform', PLATFORM, '--load',
        '--file', 'Dockerfile.secumie', '--target', target,
        '--build-arg', `SOURCE_REVISION=${revision}`, '--tag', image, '.',
      ],
      scan: [
        'scout', 'cves', '--platform', PLATFORM,
        '--only-severity', 'critical,high', '--exit-code', image,
      ],
    };
  });
}

function run(program, args, { capture = false } = {}) {
  const result = spawnSync(program, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = capture ? `\n${(result.stderr || '').trim()}` : '';
    throw new Error(`${program} ${args.slice(0, 3).join(' ')} exited ${result.status}${detail}`);
  }
  return capture ? result.stdout.trim() : '';
}

function checkImageIdentity(image, revision) {
  const platform = run('docker', ['image', 'inspect', image, '--format', '{{.Os}}/{{.Architecture}}'], { capture: true });
  if (platform !== PLATFORM) throw new Error(`${image}: unexpected platform ${platform}`);

  const labelsText = run('docker', ['image', 'inspect', image, '--format', '{{json .Config.Labels}}'], { capture: true });
  const labels = JSON.parse(labelsText);
  const builtRevision = labels && labels['org.opencontainers.image.revision'];
  if (builtRevision !== revision) {
    throw new Error(`${image}: source revision label differs from Git HEAD`);
  }

  const id = run('docker', ['image', 'inspect', image, '--format', '{{.Id}}'], { capture: true });
  if (!/^sha256:[a-f0-9]{64}$/.test(id)) throw new Error(`${image}: invalid local image ID`);
  return id;
}

function main(argv = process.argv.slice(2)) {
  if (argv.some((value) => value !== '--dry-run')) {
    throw new Error('Only supported option: --dry-run');
  }
  const dryRun = argv.includes('--dry-run');
  const revision = assertRevision(run('git', ['rev-parse', 'HEAD'], { capture: true }));
  const pending = run('git', ['status', '--porcelain', '--untracked-files=normal'], { capture: true });
  if (pending && !dryRun) {
    throw new Error('Working tree has local changes. Commit or separate them before building traceable images.');
  }
  const plan = buildPlan(revision);
  console.log(`SECU:MIE OTP/PIRA local image gate: revision=${revision}, platform=${PLATFORM}`);
  if (dryRun) {
    if (pending) console.log('NOTE: working tree is not clean (dry-run only).');
    for (const item of plan) {
      console.log(`docker ${item.build.join(' ')}`);
      console.log(`docker image inspect ${item.image} --format {{.Os}}/{{.Architecture}}`);
      console.log(`docker image inspect ${item.image} --format {{json .Config.Labels}}`);
      console.log(`docker ${item.scan.join(' ')}`);
    }
    return;
  }

  run('docker', ['info', '--format', '{{.ServerVersion}}'], { capture: true });
  run('docker', ['buildx', 'version']);
  run('docker', ['scout', 'version']);
  for (const item of plan) {
    console.log(`\n=== Building ${item.target} ===`);
    run('docker', item.build);
    const imageId = checkImageIdentity(item.image, revision);
    console.log(`Image identity PASS: ${item.image} / ${imageId}`);
    console.log(`=== Scanning ${item.target} (Critical / High only) ===`);
    run('docker', item.scan);
    console.log(`Security gate PASS: ${item.image} / Critical 0, High 0`);
  }
  console.log('\nLOCAL GATE PASS. These are local image IDs, not immutable registry digests.');
  console.log('No image was pushed or deployed; GCP, DB, DNS, IAM and Production remain unchanged.');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`LOCAL GATE STOP: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { assertRevision, buildPlan, checkImageIdentity, imageTag, main };
