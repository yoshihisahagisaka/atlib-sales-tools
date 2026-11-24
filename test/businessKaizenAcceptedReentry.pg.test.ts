import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { BusinessKaizenCommonKpiAdapter } from '../src/services/businessKaizenCommonKpiAdapter';
import { BusinessKaizenKpiService, resolveBusinessKaizenKpiPeriod } from '../src/services/businessKaizenKpiService';
import { BusinessKaizenProxyService } from '../src/services/businessKaizenProxyService';

const connectionString = process.env.TEST_DATABASE_URL;
const enabled = Boolean(connectionString) && process.env.ALLOW_DISPOSABLE_DB_TEST === 'yes';

test('ACCEPTED re-entry and append-only ACL on isolated PostgreSQL 16', { skip: !enabled }, async () => {
  const setupPool = new Pool({ connectionString, max: 2 }), setup = await setupPool.connect();
  const schema = `bk_f2a_${randomUUID().replaceAll('-', '')}`;
  let rolesCreated = false;
  try {
    const identity = (await setup.query(`SELECT current_database() database_name,current_setting('server_version') server_version,inet_server_addr()::text server_address`)).rows[0];
    assert.match(identity.server_version, /^16\./);
    assert.match(identity.database_name, /(test|disposable|tmp)/i);
    assert.notEqual(identity.database_name, 'sales_tools');
    assert.notEqual(identity.server_address, '10.17.0.3');
    assert.equal(Number((await setup.query(`SELECT count(*) n FROM pg_roles WHERE rolname IN ('sales_tools_app','sales_tools_runtime')`)).rows[0].n), 0);
    await setup.query(`CREATE ROLE sales_tools_app NOLOGIN`);
    await setup.query(`CREATE ROLE sales_tools_runtime NOLOGIN`);
    rolesCreated = true;
    await setup.query(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO sales_tools_app`);
    await setup.query(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO sales_tools_runtime`);
    await setup.query(`CREATE SCHEMA "${schema}"`);
    await setup.query(`GRANT USAGE ON SCHEMA "${schema}" TO sales_tools_app,sales_tools_runtime`);
    await setup.query(`SET search_path TO "${schema}",public`);
    const root = path.resolve(__dirname, '..');
    for (const migration of ['027_free_diagnosis_rule_based_v1.sql','030_sales_activity_marketing_attribution.sql','025_business_web_consultation_leads.sql','UNNUMBERED_business_kaizen_diagnosis_package_a.sql'])
      await setup.query(fs.readFileSync(path.join(root, 'migrations', migration), 'utf8'));
    await setup.query(`RESET search_path`);

    const pool = new Pool({ connectionString, max: 3, options: `-c search_path=${schema},public` });
    try {
      for (const role of ['sales_tools_app','sales_tools_runtime']) {
        const acl = (await pool.query(`SELECT has_table_privilege($1,$2,'SELECT') s,has_table_privilege($1,$2,'INSERT') i,has_table_privilege($1,$2,'UPDATE') u,has_table_privilege($1,$2,'DELETE') d`, [role, `${schema}.business_kaizen_diagnosis_stage_history`])).rows[0];
        assert.deepEqual(acl, { s: true, i: true, u: false, d: false });
      }
      const company = randomUUID(), contact = randomUUID(), activity = randomUUID(), diagnosis = randomUUID();
      await pool.query(`INSERT INTO company(id,name,created_by_user_id,owner_user_id) VALUES($1,'PG F2a','seed','owner')`, [company]);
      await pool.query(`INSERT INTO contact(id,company_id,name) VALUES($1,$2,'Person')`, [contact, company]);
      await pool.query(`INSERT INTO sales_activity(id,company_id,primary_contact_id,selected_service,created_by_user_id,owner_user_id) VALUES($1,$2,$3,'BUSINESS_WEB','seed','owner')`, [activity, company, contact]);
      await pool.query(`INSERT INTO business_kaizen_diagnoses(id,entry_channel,input_state,sales_activity_id,company_id,contact_id,current_stage) VALUES($1,'STAFF_PROXY','DRAFT',$2,$3,$4,'ACCEPTED')`, [diagnosis, activity, company, contact]);
      const firstAccepted = '2026-02-01T00:00:00.000Z';
      await pool.query(`INSERT INTO business_kaizen_diagnosis_stage_history(id,diagnosis_id,stage,reached_at) VALUES($1,$2,'ACCEPTED',$3)`, [randomUUID(), diagnosis, firstAccepted]);
      const service = new BusinessKaizenProxyService(pool);
      await service.updateStage(diagnosis, 'SCHEDULING', 1, 'pg@atlib.jp');
      await service.updateStage(diagnosis, 'ACCEPTED', 2, 'pg@atlib.jp');
      const same = await service.updateStage(diagnosis, 'ACCEPTED', 3, 'pg@atlib.jp');
      assert.equal(same.changed, false);
      assert.equal(Number((await pool.query(`SELECT count(*) n FROM business_kaizen_diagnosis_stage_history WHERE diagnosis_id=$1 AND stage='ACCEPTED'`, [diagnosis])).rows[0].n), 2);
      assert.equal(new Date((await pool.query(`SELECT min(reached_at) first_at FROM business_kaizen_diagnosis_stage_history WHERE diagnosis_id=$1 AND stage='ACCEPTED'`, [diagnosis])).rows[0].first_at).toISOString(), firstAccepted);
      const period = resolveBusinessKaizenKpiPeriod({ from: '2026-02-01', to: '2026-02-28' }); assert.ok(period);
      assert.equal((await new BusinessKaizenKpiService(pool).aggregate(period)).cohortFunnel.acceptedDiagnosisCount, 1);
      const subjects = await new BusinessKaizenCommonKpiAdapter(pool).listAcceptedSubjects();
      assert.equal(subjects.length, 1); assert.equal(subjects[0]?.enteredAt, firstAccepted);
      const appClient = await pool.connect();
      try {
        await appClient.query(`SET ROLE sales_tools_app`);
        await assert.rejects(appClient.query(`UPDATE business_kaizen_diagnosis_stage_history SET stage='SCHEDULED' WHERE diagnosis_id=$1`, [diagnosis]), /permission denied/);
        await assert.rejects(appClient.query(`DELETE FROM business_kaizen_diagnosis_stage_history WHERE diagnosis_id=$1`, [diagnosis]), /permission denied/);
      } finally { await appClient.query(`RESET ROLE`); appClient.release(); }
      console.log(JSON.stringify({ postgresVersion: identity.server_version, database: identity.database_name, serverAddress: identity.server_address, schema, connections: 3, acceptedHistoryCount: 2, firstAccepted }));
    } finally { await pool.end(); }
  } finally {
    try {
      await setup.query(`RESET ROLE`);
      await setup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      if (rolesCreated) {
        await setup.query(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE ALL ON TABLES FROM sales_tools_app`);
        await setup.query(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE ALL ON TABLES FROM sales_tools_runtime`);
        await setup.query(`DROP ROLE sales_tools_app`); await setup.query(`DROP ROLE sales_tools_runtime`);
      }
    } finally { setup.release(); await setupPool.end(); }
  }
});
