import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import test from 'node:test';

const image = process.env.MIGRATION_ALLOWLIST_IMAGE;

test('built allowlist image loads the migration CLI and contains only six SQL files', {skip: !image}, () => {
  const loaded = execFileSync('docker', ['run', '--rm', '--entrypoint', 'node', image!, '-e', "require('/app/dist/db/migrateCli.js');process.stdout.write('migration-cli-loaded')"], {encoding: 'utf8'});
  assert.equal(loaded, 'migration-cli-loaded');
  const files = execFileSync('docker', ['run', '--rm', '--entrypoint', 'sh', image!, '-lc', 'find /app/migrations -type f -name "*.sql" -printf "%f\\n" 2>/dev/null || ls -1 /app/migrations'], {encoding: 'utf8'})
    .trim().split(/\r?\n/).sort();
  assert.deepEqual(files, [
    '019_diagnosis_hearing_records.sql',
    '019_web_development_partner_leads.sql',
    '020_diagnosis_hearing_source_references.sql',
    '021_diagnosis_report_pdf_artifacts.sql',
    '022_diagnosis_report_pdf_generation_lease.sql',
    '023_diagnosis_report_pdf_source_content_hash.sql',
  ]);
  const hashes = execFileSync('docker', ['run', '--rm', '--entrypoint', 'sh', image!, '-lc', 'sha256sum /app/migrations/*.sql'], {encoding: 'utf8'});
  assert.deepEqual(hashes.trim().split(/\r?\n/).map(line => line.replace(/^([0-9a-f]+)\s+\/app\/migrations\//, '$1 ')).sort(), [
    '32a080800fe331b2edecf4e0795f98c3ab1d4c3cb5579ca5e4d23440337a1ace 022_diagnosis_report_pdf_generation_lease.sql',
    '50ccdf3664d6fb372b7493bb337257d3f3366a7481deb487037b1b82c9b05621 019_web_development_partner_leads.sql',
    '81963de6c2e98b13d5f478216983c5d92530f1eeb6ad618ef5fa7c55d873c133 020_diagnosis_hearing_source_references.sql',
    '8e71b2af904c209e1c9ce3a5e22d85c21971d4e620efa2a10397d24e8519a13b 023_diagnosis_report_pdf_source_content_hash.sql',
    '934ef483f8862eb2b1ecde56b7dee2e973e27c636dad9f35f44f889b7a890f21 021_diagnosis_report_pdf_artifacts.sql',
    'c475f50fedc946e588cc8fba64d2674c623f77ea03ebe2c78a1ec593d863a507 019_diagnosis_hearing_records.sql',
  ]);
});
