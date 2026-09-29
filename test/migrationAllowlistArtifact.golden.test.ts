import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(__dirname, '..');
const script = require('../scripts/migration/buildAllowlistArtifact.cjs') as {
  verify(root: string, manifestPath: string): unknown;
  verifyRuntimeBuild(root: string): unknown;
};
const candidatePath = path.join(root, 'migration-allowlists', 'staging-p2-10.candidate.json');

function gitBlob(relativePath: string): Buffer { return execFileSync('git', ['show', `HEAD:${relativePath}`]); }

function fixtureRoot(mutator?: (manifest: any) => void): {root: string; manifestPath: string} {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-allowlist-'));
  const sourceManifest = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
  const manifest = JSON.parse(JSON.stringify(sourceManifest));
  mutator?.(manifest);
  fs.mkdirSync(path.join(fixture, 'migration-allowlists', 'evidence'), {recursive: true});
  fs.mkdirSync(path.join(fixture, 'migrations'), {recursive: true});
  fs.writeFileSync(path.join(fixture, 'migration-allowlists', 'staging-p2-10.candidate.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(fixture, 'migration-allowlists', 'evidence', 'staging-ledger-hdjd6.json'), gitBlob('migration-allowlists/evidence/staging-ledger-hdjd6.json'));
  for (const entry of sourceManifest.migrations) fs.writeFileSync(path.join(fixture, 'migrations', entry.filename), gitBlob(`migrations/${entry.filename}`));
  return {root: fixture, manifestPath: path.join(fixture, 'migration-allowlists', 'staging-p2-10.candidate.json')};
}

test('draft manifest remains fail-closed', () => {
  const fixture = fixtureRoot(manifest => { manifest.status = 'DRAFT'; manifest.artifact_generation.permitted = false; });
  try { assert.throws(() => script.verify(fixture.root, fixture.manifestPath), /MANIFEST_NOT_APPROVED/); }
  finally { fs.rmSync(fixture.root, {recursive: true, force: true}); }
});

test('approved manifest must cover every ledger-unapplied SQL in the checkout', () => {
  const fixture = fixtureRoot(manifest => { manifest.expected_unapplied_filenames.pop(); manifest.migrations.pop(); });
  try {
    assert.throws(() => script.verify(fixture.root, fixture.manifestPath), /TREE_PENDING_FILENAMES/);
  } finally {
    fs.rmSync(fixture.root, {recursive: true, force: true});
  }
});

test('approved manifest verifies raw ledger and all six Linux Git-blob SQL hashes by filename', () => {
  const fixture = fixtureRoot();
  try {
    assert.doesNotThrow(() => script.verify(fixture.root, fixture.manifestPath));
  } finally {
    fs.rmSync(fixture.root, {recursive: true, force: true});
  }
});

test('a CRLF-converted SQL file fails closed instead of silently hash-matching or silently hash-mismatching', () => {
  const fixture = fixtureRoot();
  try {
    const target = '019_diagnosis_hearing_records.sql';
    const lf = fs.readFileSync(path.join(fixture.root, 'migrations', target));
    assert.ok(!lf.includes(13), 'fixture precondition: Git-blob source must be LF, not already CRLF');
    const crlf = Buffer.from(lf.toString('utf8').replace(/\n/g, '\r\n'));
    fs.writeFileSync(path.join(fixture.root, 'migrations', target), crlf);
    assert.throws(() => script.verify(fixture.root, fixture.manifestPath), new RegExp(`SQL_FILE_CONTAINS_CRLF:${target}`));
  } finally {
    fs.rmSync(fixture.root, {recursive: true, force: true});
  }
});

test('artifact generation fails closed when the compiled migration CLI is absent', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-runtime-'));
  try {
    assert.throws(() => script.verifyRuntimeBuild(fixture), /RUNTIME_BUILD_MISSING:dist\/db\/migrateCli\.js/);
  } finally {
    fs.rmSync(fixture, {recursive: true, force: true});
  }
});
