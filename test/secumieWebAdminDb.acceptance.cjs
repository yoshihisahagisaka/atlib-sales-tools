'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHmac } = require('node:crypto');
const { Pool } = require('pg');
const { runMigrations } = require('../dist/db/migrate');
const express = require('express');
const { AssemblyAdminService } = require('../dist/secumieWeb/assemblyAdminService');
const { createAdminSecumieWebRouter } = require('../dist/routes/adminSecumieWeb');
const { createInternalSecumieWebMirrorRouter } = require('../dist/routes/internalSecumieWebMirror');

const connectionString = process.env.SECUMIE_TEST_POSTGRES_URL;
// This integration test CREATES and DROPS a database and roles. A URI alone is
// never authorization: refuse non-disposable targets before any SQL mutation.
if (connectionString) {
  const url = new URL(connectionString);
  if (process.env.SECUMIE_TEST_EPHEMERAL_ONLY !== '1'
    || url.hostname !== '127.0.0.1'
    || url.pathname !== '/postgres'
    || url.username !== 'postgres') {
    throw new Error('Refusing SECU:MIE DB test outside the dedicated disposable localhost PostgreSQL service');
  }
}
const integration = connectionString ? test : test.skip;

// Run only on an ephemeral CI PostgreSQL 16 service; never against Cloud SQL.
integration('corporate LP mirror -> existing staff list -> status + audit, with Web-only grants', { timeout: 30000 }, async () => {
  const dbName = 'secumie_web_staging';
  const root = path.resolve(__dirname, '..');
  const admin = new Pool({ connectionString, max: 1 });
  let owner, staff, runtime, outsider, server;
  let createdDatabase = false;
  const createdRoles = [];
  try {
    // Extra guard against a local PostgreSQL host with non-test databases or
    // an already-existing Web fixture: never overwrite or clean up those objects.
    const otherDbs = await admin.query(
      "SELECT datname FROM pg_database WHERE datname NOT IN ('postgres','template0','template1')");
    assert.equal(otherDbs.rows.length, 0, 'disposable CI instance must not contain other databases');
    const existingRoles = await admin.query(
      'SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[])',
      [['secumie_web_migration_staging','secumie_web_runtime_staging',
        'secumie_web_admin_staging','secumie_unrelated_staging']]);
    assert.equal(existingRoles.rows.length, 0, 'test roles must not preexist');

    // A dedicated owner role, database and isolated migration ledger: none of
    // these objects exist outside the disposable PostgreSQL 16 CI container.
    await admin.query("CREATE ROLE secumie_web_migration_staging LOGIN PASSWORD 'synthetic-migration-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS");
    createdRoles.push('secumie_web_migration_staging');
    await admin.query('CREATE DATABASE ' + dbName + ' OWNER secumie_web_migration_staging');
    createdDatabase = true;
    // Roles must pre-exist the single guarded schema+GRANT migration.
    await admin.query("CREATE ROLE secumie_web_runtime_staging LOGIN PASSWORD 'synthetic-runtime-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS");
    createdRoles.push('secumie_web_runtime_staging');
    await admin.query("CREATE ROLE secumie_web_admin_staging LOGIN PASSWORD 'synthetic-staff-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS");
    createdRoles.push('secumie_web_admin_staging');
    await admin.query("CREATE ROLE secumie_unrelated_staging LOGIN PASSWORD 'synthetic-unrelated-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS");
    createdRoles.push('secumie_unrelated_staging');
    const url = new URL(connectionString);
    url.pathname = '/' + dbName;
    const migrationUrl = new URL(url);
    migrationUrl.username = 'secumie_web_migration_staging';
    migrationUrl.password = 'synthetic-migration-only';
    owner = new Pool({ connectionString: migrationUrl.toString(), max: 1 });
    // Exercise the EXISTING migration runner using only the unapproved
    // STAGING-only package. It never touches a real Cloud SQL instance.
    const migrationDirPath = path.join(root, 'design/secumie-web/migrations');
    const stagedSqlName = '001_secumie_web_intake_staging.sql';
    assert.deepEqual(fs.readdirSync(migrationDirPath), [stagedSqlName]);
    const candidateSql = fs.readFileSync(path.join(migrationDirPath, stagedSqlName), 'utf8');
    const ddlSource = fs.readFileSync(path.join(root, 'design/secumie-web/assembly-intake.draft.sql'), 'utf8');
    const grantsSource = fs.readFileSync(path.join(root, 'design/secumie-web/staging-role-grants.draft.sql'), 'utf8');
    // Keep the approved-domain DDL/ACL behavior byte-for-byte consistent with
    // the prior draft. The combined SQL omits only the separate BEGIN/COMMIT.
    assert.ok(candidateSql.includes(ddlSource.slice(ddlSource.indexOf('CREATE SCHEMA')).trimEnd()),
      'candidate DDL must match existing draft statements');
    assert.ok(candidateSql.includes(grantsSource.slice(grantsSource.indexOf('DO ' + '$'), grantsSource.lastIndexOf('\nCOMMIT;')).trimEnd()),
      'candidate grants must match existing draft statements');
    await admin.query('BEGIN');
    try {
      await assert.rejects(admin.query(candidateSql), /SECU:MIE_WEB_STAGING_CONTEXT_STOP/,
        'the candidate must reject the wrong database/role before any DDL');
    } finally {
      await admin.query('ROLLBACK');
    }
    // PostgreSQL 16 role membership can confer privileges even when direct
    // role attributes look harmless. A Web runtime role must not inherit any
    // group (including Cloud SQL's cloudsqlsuperuser in real staging).
    await admin.query('GRANT pg_read_all_data TO secumie_web_runtime_staging');
    try {
      await assert.rejects(runMigrations(owner, migrationDirPath),
        /SECU:MIE_WEB_ROLE_BOUNDARY_STOP/,
        'Web migration must refuse any inherited membership before DDL');
      const noSchema = await owner.query(
        "SELECT count(*)::int AS n FROM pg_namespace WHERE nspname='secumie_web'");
      assert.equal(noSchema.rows[0].n, 0,
        'rejected role membership must leave the Web schema absent');
    } finally {
      await admin.query('REVOKE pg_read_all_data FROM secumie_web_runtime_staging');
    }
    await runMigrations(owner, migrationDirPath);
    const ledger = await owner.query('SELECT filename FROM schema_migrations ORDER BY filename');
    assert.deepEqual(ledger.rows.map(row => row.filename), [stagedSqlName],
      'Web-only migration must record exactly one file in its own database');
    await runMigrations(owner, migrationDirPath);
    assert.equal((await owner.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n, 1,
      'replay must not duplicate the Web migration ledger');
    // The Web-only candidate already executed grants inside its one migration transaction.
    const staffUrl = new URL(url);
    staffUrl.username = 'secumie_web_admin_staging';
    staffUrl.password = 'synthetic-staff-only';
    staff = new Pool({ connectionString: staffUrl.toString(), max: 2 });
    const runtimeUrl = new URL(url);
    runtimeUrl.username = 'secumie_web_runtime_staging';
    runtimeUrl.password = 'synthetic-runtime-only';
    runtime = new Pool({ connectionString: runtimeUrl.toString(), max: 2 });
    // The same shared instance may host Insight and Secure Guard credentials.
    // Their roles must not be able to CONNECT to the Web-owned database.
    const outsiderUrl = new URL(url);
    outsiderUrl.username = 'secumie_unrelated_staging';
    outsiderUrl.password = 'synthetic-unrelated-only';
    outsider = new Pool({ connectionString: outsiderUrl.toString(), max: 1 });
    await assert.rejects(outsider.query('SELECT 1'), /permission denied for database/i,
      'unrelated login must not connect to the Web staging database');
    const service = new AssemblyAdminService(staff);
    const key = 'synthetic-HMAC-secret-only-for-CI-1234567890';
    const app = express();
    app.use('/api/internal/secumie-web/v1', express.raw({ type: 'application/json', limit: '8kb' }),
      createInternalSecumieWebMirrorRouter(service, key));
    app.use('/api/admin/secumie-web/v1', express.json(), (req, _res, next) => {
      // Synthetic principal; exercise the existing staff gate at router level.
      if (req.get('x-synthetic-anonymous') !== '1') req.staffEmail = 'synthetic-staff@atlib.jp';
      next();
    }, createAdminSecumieWebRouter(service));
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      if (server.listening) return resolve();
      server.once('listening', resolve); server.once('error', reject);
    });
    const base = 'http://127.0.0.1:' + server.address().port;
    const application = {
      source: 'secumie_web_temporary', eventId: '00000000-0000-4000-8000-000000000004',
      companyName: '検証株式会社', unionName: '検証組合', registeredAddress: '東京都',
      websiteUrl: 'https://example.jp/', contactName: '担当者',
      contactEmail: 'test@example.jp', contactPhone: '0300000000', consented: true,
    };
    const post = (item, time = String(Date.now()), sign = true) => {
      const body = JSON.stringify(item);
      const signature = createHmac('sha256', key).update(time).update('\n').update(body).digest('hex');
      return fetch(base + '/api/internal/secumie-web/v1/temporary-intakes', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-secumie-timestamp': time,
          ...(sign ? { 'x-secumie-signature': signature } : {}) },
        body,
      });
    };
    assert.equal((await post(application, String(Date.now()), false)).status, 401);
    assert.equal((await post(application, String(Date.now() - 600000))).status, 401);
    assert.equal((await post({ ...application, websiteUrl: 'http://example.jp/' })).status, 400);
    const saved = await post(application);
    assert.equal(saved.status, 201);
    const receipt = await saved.json();
    assert.equal(receipt.ok, true);
    assert.match(receipt.receiptId, /^SMW-[0-9]{8}-[A-F0-9]{8}$/);
    assert.equal((await post(application)).status, 200);
    assert.equal((await post({ ...application, companyName: '別会社' })).status, 409);

    const listResponse = await fetch(base + '/api/admin/secumie-web/v1/requests?status=RECEIVED&companyName=検証');
    assert.equal(listResponse.status, 200);
    assert.equal(listResponse.headers.get('cache-control'), 'no-store');
    const listed = await listResponse.json();
    assert.equal(listed.items.length, 1);
    const row = listed.items[0];
    assert.equal(row.companyName, application.companyName);
    assert.equal(row.unionName, application.unionName);
    assert.equal(row.contactEmail, application.contactEmail);
    const privacy = await staff.query(
      'SELECT reception_code,information_sharing_enabled FROM secumie_web.assembly_intake WHERE intake_id=$1', [row.intakeId]);
    assert.deepEqual(privacy.rows[0], { reception_code: 'CORPORATE_LP', information_sharing_enabled: false });
    const statusUrl = base + '/api/admin/secumie-web/v1/requests/' + row.intakeId + '/status';
    assert.equal((await fetch(statusUrl, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    })).status, 403, 'cookie-authenticated mutations require a staff command header');
    assert.equal((await fetch(statusUrl, {
      method: 'PATCH', headers: {
        'content-type': 'application/json', 'x-secumie-staff-command': '1',
        'sec-fetch-site': 'cross-site',
      },
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    })).status, 403, 'cross-site mutations must be denied');
    assert.equal((await fetch(statusUrl, {
      method: 'PATCH', headers: { 'content-type': 'application/json',
        'x-secumie-staff-command': '1', 'x-synthetic-anonymous': '1' },
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    })).status, 401, 'missing staff session must be denied');
    const changed = await fetch(statusUrl, {
      method: 'PATCH', headers: { 'content-type': 'application/json', 'x-secumie-staff-command': '1' },
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    });
    assert.equal(changed.status, 200);
    assert.equal((await changed.json()).status, 'IN_PROGRESS');
    const audit = await staff.query(
      'SELECT to_status,changed_by FROM secumie_web.assembly_status_history WHERE intake_id=$1', [row.intakeId]);
    assert.equal(audit.rows.length, 2);
    assert.ok(audit.rows.some(x => x.to_status === 'RECEIVED' && x.changed_by === 'corporate-contact'));
    assert.ok(audit.rows.some(x => x.to_status === 'IN_PROGRESS' && x.changed_by === 'synthetic-staff@atlib.jp'));
    await assert.rejects(
      runtime.query("UPDATE secumie_web.assembly_intake SET request_status='CANCELLED' WHERE intake_id=$1", [row.intakeId]),
      /permission denied/);
    await assert.rejects(staff.query('DELETE FROM secumie_web.assembly_intake WHERE intake_id=$1', [row.intakeId]), /permission denied/);
  } finally {
    if (server?.listening) await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    await Promise.allSettled([staff?.end(), runtime?.end(), outsider?.end(), owner?.end()].filter(Boolean));
    // All test pools are closed above; do not kill sockets during teardown.
    if (createdDatabase) await admin.query('DROP DATABASE ' + dbName);
    for (const roleName of createdRoles.reverse()) {
      await admin.query('DROP ROLE IF EXISTS ' + roleName);
    }
    await admin.end();
  }
});
