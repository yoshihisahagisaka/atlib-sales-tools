import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(__dirname, '..');
const rehearsal = require('../scripts/migration/rehearseAllowlistPostgres.cjs') as {
  loadFixture(root: string): { manifest: { status: string; artifact_generation: { permitted: boolean } }; ledger: unknown[]; allowlist: string[]; base: string[] };
};

test('PostgreSQL rehearsal fixture remains draft and derives six hashed SQL files without an artifact', () => {
  const fixture = rehearsal.loadFixture(root);
  assert.match(fixture.manifest.status, /^DRAFT/);
  assert.equal(fixture.manifest.artifact_generation.permitted, false);
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
});
