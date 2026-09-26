import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(__dirname, '..');
const script = require('../scripts/migration/buildAllowlistArtifact.cjs') as {
  verify(root: string, manifestPath: string): unknown;
};
const candidatePath = path.join(root, 'migration-allowlists', 'staging-p2-10.candidate.json');

test('candidate manifest is fail-closed and cannot verify as an artifact input', () => {
  assert.throws(() => script.verify(root, candidatePath), /MANIFEST_NOT_APPROVED/);
});

test('approved manifest must cover every ledger-unapplied SQL in the checkout', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-allowlist-'));
  try {
    const manifest = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
    manifest.status = 'APPROVED_FOR_ARTIFACT_GENERATION';
    manifest.artifact_generation.permitted = true;
    manifest.expected_unapplied_filenames.pop();
    manifest.migrations.pop();
    const fixturePath = path.join(fixtureDir, 'manifest.json');
    fs.writeFileSync(fixturePath, JSON.stringify(manifest));
    assert.throws(() => script.verify(root, fixturePath), /TREE_PENDING_FILENAMES/);
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('approved fixture verifies the raw ledger and all six SQL hashes by filename', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-allowlist-'));
  try {
    const manifest = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
    manifest.status = 'APPROVED_FOR_ARTIFACT_GENERATION';
    manifest.artifact_generation.permitted = true;
    const fixturePath = path.join(fixtureDir, 'manifest.json');
    fs.writeFileSync(fixturePath, JSON.stringify(manifest));
    assert.doesNotThrow(() => script.verify(root, fixturePath));
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});
