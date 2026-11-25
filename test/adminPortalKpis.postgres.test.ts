import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import { ItKaizenPortalKpiAdapter, parseFiscalYear } from '../src/services/itKaizenPortalKpiAdapter';

const enabled = process.env.RUN_PORTAL_KPI_PG16 === '1';
const config = {
  host: '127.0.0.1', port: 55438, database: 'portal_kpi', user: 'postgres', password: 'postgres',
  max: 3, connectionTimeoutMillis: 5000,
};
const migrationDir = path.resolve(__dirname, '../migrations');

test('P2b SELECT uses real migrations on isolated PostgreSQL 16', {
  skip: enabled ? false : 'BLOCKED_EXTERNAL: explicit disposable PostgreSQL 16 required', timeout: 120_000,
}, async () => {
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.database, 'portal_kpi');
  const admin = new Pool(config);
  const identity = await admin.query<{ database_name: string; version: string }>(
    'SELECT current_database() AS database_name, current_setting(\'server_version\') AS version',
  );
  assert.equal(identity.rows[0]?.database_name, 'portal_kpi');
  assert.match(identity.rows[0]?.version ?? '', /^16\./);

  const schema = `portal_kpi_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ ...config, options: `-c search_path=${schema},public` });
  try {
    for (const filename of [
      '027_free_diagnosis_rule_based_v1.sql',
      '033_free_diagnosis_design_v2_persistence.sql',
      '035_it_management_test_case_designation.sql',
    ]) {
      await pool.query(fs.readFileSync(path.join(migrationDir, filename), 'utf8'));
    }

    const insertSubject = async (suffix: string, isInternalTest: boolean, entryChannel?: 'CUSTOMER_SELF' | 'STAFF_PROXY', submittedAt?: string) => {
      const companyId = `00000000-0000-4000-8001-${suffix.padStart(12, '0')}`;
      const contactId = `00000000-0000-4000-8002-${suffix.padStart(12, '0')}`;
      const activityId = `00000000-0000-4000-8003-${suffix.padStart(12, '0')}`;
      const caseId = `00000000-0000-4000-8004-${suffix.padStart(12, '0')}`;
      await pool.query(`INSERT INTO company(id,name,created_by_user_id,owner_user_id) VALUES($1,$2,'tester','tester')`, [companyId, `Company ${suffix}`]);
      await pool.query(`INSERT INTO contact(id,company_id,name) VALUES($1,$2,$3)`, [contactId, companyId, `Contact ${suffix}`]);
      await pool.query(`INSERT INTO sales_activity(id,company_id,primary_contact_id,selected_service,created_by_user_id,owner_user_id) VALUES($1,$2,$3,'IT_KAIZEN','tester','tester')`, [activityId, companyId, contactId]);
      await pool.query(`INSERT INTO it_management_diagnosis_case_v2(id,company_id,contact_id,sales_activity_id,is_internal_test,created_by_user_id) VALUES($1,$2,$3,$4,$5,'tester')`, [caseId, companyId, contactId, activityId, isInternalTest]);
      if (entryChannel && submittedAt) {
        await pool.query(`INSERT INTO it_management_diagnosis_original_survey_snapshot_v2
          (id,case_id,survey_version,entry_channel,answered_by_role,answers_json,submitted_at,content_hash)
          VALUES($1,$2,'v2',$3,'CUSTOMER','{}'::jsonb,$4,$5)`,
        [`00000000-0000-4000-8005-${suffix.padStart(12, '0')}`, caseId, entryChannel, submittedAt, 'a'.repeat(64)]);
      }
      return caseId;
    };

    const firstCase = await insertSubject('1', false, 'CUSTOMER_SELF', '2026-02-01T00:00:00+09:00');
    await insertSubject('2', false, 'STAFF_PROXY', '2027-01-31T23:59:59.999+09:00');
    await insertSubject('3', true, 'CUSTOMER_SELF', '2026-07-01T00:00:00+09:00');
    await insertSubject('4', false); // Original not created.
    await insertSubject('5', false, 'CUSTOMER_SELF', '2027-02-01T00:00:00+09:00');

    await assert.rejects(pool.query(`INSERT INTO it_management_diagnosis_original_survey_snapshot_v2
      (id,case_id,survey_version,entry_channel,answered_by_role,answers_json,submitted_at,content_hash)
      VALUES($1,$2,'v2','STAFF_PROXY','STAFF','{}'::jsonb,'2026-03-01T00:00:00+09:00',$3)`,
    ['00000000-0000-4000-8005-000000000099', firstCase, 'b'.repeat(64)]));

    const adapter = new ItKaizenPortalKpiAdapter(pool);
    assert.equal(await adapter.countAcceptedSubjects(parseFiscalYear('2026', new Date())), 2);
    assert.equal(await adapter.countAcceptedSubjects(parseFiscalYear('2025', new Date())), 0);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
