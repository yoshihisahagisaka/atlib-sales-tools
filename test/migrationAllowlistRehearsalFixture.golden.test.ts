import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(__dirname, '..');
const rehearsal = require('../scripts/migration/rehearseAllowlistPostgres.cjs') as {
  loadFixture(root: string): { manifest: { status: string; artifact_generation: { permitted: boolean } }; ledger: unknown[]; allowlist: string[]; base: string[] };
};

function linuxFixtureRoot(): string {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-rehearsal-'));
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', '--', 'migrations'], {encoding: 'utf8'})
    .split(/\r?\n/).filter(file => /^migrations\/\d+_[a-z0-9_]+\.sql$/.test(file));
  fs.mkdirSync(path.join(fixture, 'migrations'), {recursive: true});
  fs.mkdirSync(path.join(fixture, 'migration-allowlists', 'evidence'), {recursive: true});
  for (const file of files) fs.writeFileSync(path.join(fixture, file), execFileSync('git', ['show', `HEAD:${file}`]));
  fs.writeFileSync(path.join(fixture, 'migration-allowlists', 'evidence', 'staging-ledger-hdjd6.json'), execFileSync('git', ['show', 'HEAD:migration-allowlists/evidence/staging-ledger-hdjd6.json']));
  fs.writeFileSync(path.join(fixture, 'migration-allowlists', 'staging-p2-10.candidate.json'), fs.readFileSync(path.join(root, 'migration-allowlists', 'staging-p2-10.candidate.json')));
  return fixture;
}

test('PostgreSQL rehearsal fixture derives six hashed SQL files without generating an artifact', () => {
  const fixtureRoot = linuxFixtureRoot();
  try {
    const fixture = rehearsal.loadFixture(fixtureRoot);
    assert.equal(fixture.manifest.status, 'APPROVED_FOR_ARTIFACT_GENERATION');
    assert.equal(fixture.manifest.artifact_generation.permitted, true);
    assert.equal(fixture.ledger.length, 20);
    assert.deepEqual(fixture.allowlist, [
    '019_diagnosis_hearing_records.sql',
    '019_web_development_partner_leads.sql',
    '020_diagnosis_hearing_source_references.sql',
    '021_diagnosis_report_pdf_artifacts.sql',
    '022_diagnosis_report_pdf_generation_lease.sql',
    '023_diagnosis_report_pdf_source_content_hash.sql',
    ]);
    assert.ok(fixture.base.every(filename => Number(filename.slice(0, filename.indexOf('_'))) <= 18));
  } finally {
    fs.rmSync(fixtureRoot, {recursive: true, force: true});
  }
});
