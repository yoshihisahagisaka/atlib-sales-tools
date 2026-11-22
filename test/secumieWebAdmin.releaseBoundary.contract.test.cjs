'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const ledger = JSON.parse(read('security/secumie-web-admin-cve-ledger-20261121.json'));
const runtimeEvidence = JSON.parse(read('security/secumie-web-admin-runtime-evidence-20261122.json'));
const yaml = read('cloudbuild/secumie-admin-readonly-cve-evidence.yaml');
const pwsh = read('scripts/secumie-admin-cve-remote-readonly.ps1');
const server = read('src/server.ts');
const adminJs = read('public/admin/secumie-web.js');
const adminHtml = read('public/admin/secumie-web.html');
const wscRouter = read('src/routes/adminWebSecurityCheck.ts');
const wscService = read('src/services/wscSalesService.ts');

test('CVE ledger is exact: 30 unresolved, 16 HIGH, 14 UNKNOWN, no approvals', () => {
  assert.equal(ledger.schemaVersion, 1);
  assert.equal(ledger.candidate.git, 'b578d4428675c3d9d14e2ac207b88c077248a60f');
  assert.equal(ledger.candidate.scan, 'projects/msp-zabbix/locations/asia/scans/47c0fb7d-2fc9-44fb-8361-3509d194291c');
  assert.deepEqual(ledger.summary, { CRITICAL: 0, HIGH: 16, UNKNOWN: 14, OTHER: 203 });
  assert.equal(ledger.releaseDecision, 'SECURITY_NO_GO');
  assert.deepEqual(ledger.approvedExceptions, []);
  assert.equal(ledger.cves.length, 30);
  assert.equal(new Set(ledger.cves.map(x => x.id)).size, 30);
  assert.equal(ledger.cves.filter(x => x.severity === 'HIGH').length, 16);
  assert.equal(ledger.cves.filter(x => x.severity === 'UNKNOWN').length, 14);
  for (const finding of ledger.cves) {
    assert.match(finding.id, /^CVE-2026-\d+$/);
    assert.match(finding.sourcePackage, /^[a-z][a-z0-9-]+$/);
    assert.equal(finding.fixedVersion, null);
    assert.equal(finding.reviewStatus, 'UNRESOLVED');
    assert.equal(finding.reachability, 'UNDETERMINED');
    assert.equal(finding.approvedException, false);
  }
});

test('immutable evidence candidate is identical across ledger, Cloud Build and PowerShell', () => {
  const image = ledger.candidate.image;
  assert.match(image, /^asia-northeast1-docker\.pkg\.dev\/msp-zabbix\/cloud-run-source-deploy\/sales-tools-staging@sha256:[0-9a-f]{64}$/);
  assert.ok(yaml.includes(image), 'Cloud Build must use the ledger exact image');
  assert.ok(pwsh.includes(image.split('@')[1]), 'PowerShell must verify the ledger image digest');
  assert.match(yaml, /^steps:/m);
  assert.equal((yaml.match(/^\s*- id:/gm) || []).length, 1, 'Only one Cloud Build step is allowed');
  assert.match(yaml, /^\s*- run$/m);
  assert.match(yaml, /^\s*- --network=none$/m);
  assert.match(yaml, /^\s*- --read-only$/m);
  assert.match(yaml, /^\s*- --cap-drop=ALL$/m);
  assert.match(yaml, /^\s*- --security-opt=no-new-privileges$/m);
  assert.match(yaml, /^\s*- --entrypoint=\/bin\/sh$/m);
});

test('remote evidence execution cannot mutate services, images, DB or secrets', () => {
  for (const content of [yaml, pwsh]) {
    assert.doesNotMatch(content, /^\s*availableSecrets:/mi);
    assert.doesNotMatch(content, /^\s*secretEnv:/mi);
    assert.doesNotMatch(content, /^\s*images:/mi);
    assert.doesNotMatch(content, /^\s*artifacts:/mi);
    // Look for executable commands, not explanatory comments or safety-deny strings.
    const commands = content.split(/\r?\n/).filter(line => !/^\s*#/.test(line)).join('\n');
    assert.doesNotMatch(commands, /^\s*(?:&\s*)?gcloud\s+(?:run\b|sql\b|secrets\b|artifacts\b)/mi);
    assert.doesNotMatch(commands, /^\s*(?:&\s*)?docker\s+(?:build|push|rm\s+-f|rmi|system\s+prune)\b/mi);
  }
  assert.doesNotMatch(yaml, /^\s*- --privileged$/m);
  assert.doesNotMatch(yaml, /^\s*- (?:--mount|--volume|-v)(?:=|$)/m);
  assert.match(pwsh, /param\(\[switch\]\$DryRun\)/);
  assert.match(pwsh, /gcloud builds submit --no-source/);
  assert.match(pwsh, /\$LASTEXITCODE\s+-ne\s+0/);
  assert.doesNotMatch(pwsh, /^\s*(?:&\s*)?docker\s+pull\b/mi);
});

test('staff-only UI reuses WSC API, keeps manual mail handling and DB No-Go', () => {
  assert.match(server, /app\.use\('\/api\/admin\/web-security-check', \.\.\.adminAuthGate/);
  assert.match(server, /app\.use\('\/admin', \.\.\.adminAuthGate, express\.static/);
  const protect = server.indexOf("app.use('/admin', ...adminAuthGate, express.static");
  const general = server.indexOf("app.use(express.static(path.join(__dirname, '../public')))");
  assert.ok(protect >= 0 && general > protect);
  assert.match(adminJs, /fetch\('\/api\/admin\/web-security-check\/diagnose'/);
  assert.doesNotMatch(adminJs, /localStorage|sessionStorage|indexedDB|innerHTML|document\.cookie/);
  assert.match(adminHtml, /現在は暫定メール受付/);
  assert.match(adminHtml, /送付と対応履歴の記録は自動実行されません/);
  assert.match(adminJs, /response\.status === 404/);
});

test('WSC diagnosis remains strict, staff-authenticated and backed by the existing restricted probe', () => {
  assert.match(wscRouter, /z\.object\(\{ name: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(500\), url: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(2_000\) \}\)\.strict\(\)/);
  assert.match(wscRouter, /router\.post\('\/diagnose'/);
  assert.match(wscRouter, /'Content-Type', 'application\/pdf'/);
  assert.match(wscRouter, /'Cache-Control', 'no-store'/);
  assert.match(wscService, /createRestrictedNetworkProbe/);
  assert.match(wscService, /normalizeDiagnosisUrl/);
  assert.match(wscService, /engine\.evaluate\(/);
  assert.match(wscService, /engine\.render\(/);
  assert.match(wscService, /chromium\.launch\(\{ headless: true \}\)/);
});

test('Web admin list is strictly opt-in and SUBMITTED requires explicit confirmation', () => {
  assert.match(server, /const webDb = loadSecumieWebAdminDatabaseConfig\(\)/);
  assert.match(server, /if \(webRequests\) app\.use\('\/api\/admin\/secumie-web\/v1'/);
  assert.match(server, /createAdminSecumieWebRouter\(webRequests\)/);
  assert.match(server, /\.\.\.adminAuthGate, createAdminSecumieWebRouter/);
  assert.match(server, /if \(mirrorSecret && !webRequests\) throw new Error/);
  assert.match(adminJs, /response\.status === 404/);
  assert.match(adminJs, /select\.value === 'SUBMITTED' && !window\.confirm\(/);
  assert.match(adminJs, /credentials: 'same-origin'/);
  assert.match(adminHtml, /送付と対応履歴の記録は自動実行されません/);
  assert.doesNotMatch(adminJs, /\b(?:localStorage|sessionStorage|indexedDB|innerHTML|document\.cookie)\b/);
});


test('read-only 2026-11-22 runtime evidence preserves 30 unresolved CVEs and Expat priority', () => {
  assert.equal(ledger.runtimeEvidenceRef, 'security/secumie-web-admin-runtime-evidence-20261122.json');
  assert.equal(runtimeEvidence.schemaVersion, 1);
  assert.equal(runtimeEvidence.source.buildId, 'eb944607-e2df-408a-a4b1-01d56b37d006');
  assert.equal(runtimeEvidence.source.buildStatus, 'SUCCESS');
  assert.equal(runtimeEvidence.source.image, ledger.candidate.image);
  assert.deepEqual(runtimeEvidence.scanSummaryUnchanged, ledger.summary);
  assert.equal(runtimeEvidence.releaseDecision, 'SECURITY_NO_GO');
  assert.deepEqual(runtimeEvidence.approvedExceptions, []);
  assert.equal(runtimeEvidence.observed.runtimeUid, 1000);
  assert.equal(runtimeEvidence.observed.runtimeUser, 'node');
  for (const executable of [
    '/usr/bin/Xvfb', '/usr/sbin/cupsd', '/usr/sbin/kadmind',
    '/usr/sbin/krb5kdc', '/usr/bin/setfacl', '/usr/bin/setfattr',
  ]) {
    assert.ok(runtimeEvidence.observed.executableAbsent.includes(executable), 'Missing absence evidence: ' + executable);
  }
  assert.equal(runtimeEvidence.observed.perlArchiveTarImport, 'NOT_IMPORTABLE');
  assert.match(runtimeEvidence.observed.headlessShellBinary, /chrome-headless-shell$/);
  const packageNames = new Set(runtimeEvidence.observed.installedPackages.map(pkg => pkg.name));
  for (const required of ['libexpat1', 'libkrb5-3', 'libcups2t64', 'libssl3t64', 'libgnutls30t64']) {
    assert.ok(packageNames.has(required), 'Runtime dependency must not be silently erased: ' + required);
  }
  assert.ok(runtimeEvidence.observed.chromiumHeadlessShellLddFilteredMatches.some(x => /libexpat\.so\.1/.test(x)));
  assert.equal(runtimeEvidence.interpretation.confirmedPdfDependencyPackage, 'expat');
  assert.equal(ledger.cves.filter(x => x.sourcePackage === 'expat' && x.severity === 'HIGH').length, 2);
  assert.ok(ledger.cves.every(x => x.reviewStatus === 'UNRESOLVED' && !x.approvedException));
  assert.deepEqual(runtimeEvidence.source.inspectionProperties, [
    '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
  ]);
});
