import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { BusinessKaizenKpiService, resolveBusinessKaizenKpiPeriod } from '../src/services/businessKaizenKpiService';

const connectionString = process.env.TEST_DATABASE_URL;
const enabled = Boolean(connectionString) && process.env.ALLOW_DISPOSABLE_DB_TEST === 'yes';

test('Business KAIZEN KPI reads canonical facts on isolated PostgreSQL 16', { skip: !enabled }, async () => {
  const setupPool = new Pool({ connectionString, max: 2 });
  const setup = await setupPool.connect();
  const schema = `bk_e1_${randomUUID().replaceAll('-', '')}`;
  try {
    const identity = (await setup.query(`SELECT current_database() database_name,current_setting('server_version') server_version,inet_server_addr()::text server_address`)).rows[0];
    assert.match(identity.server_version, /^16\./);
    assert.match(identity.database_name, /(test|disposable|tmp)/i);
    assert.notEqual(identity.database_name, 'sales_tools');
    assert.notEqual(identity.server_address, '10.17.0.3');
    await setup.query(`CREATE SCHEMA "${schema}"`);
    await setup.query(`SET search_path TO "${schema}",public`);
    const root = path.resolve(__dirname, '..');
    for (const migration of ['027_free_diagnosis_rule_based_v1.sql', '025_business_web_consultation_leads.sql', 'UNNUMBERED_business_kaizen_diagnosis_package_a.sql'])
      await setup.query(fs.readFileSync(path.join(root, 'migrations', migration), 'utf8'));
    await setup.query(`RESET search_path`);
    const pool = new Pool({ connectionString, max: 2, options: `-c search_path=${schema},public` });
    try {
      const lead = randomUUID(), diagnosis = randomUUID();
      await pool.query(`INSERT INTO business_web_consultation_leads(id,company_name,person_name,email,privacy_consent,diagnosis_transfer_consent,consent_wording_version,idempotency_key,diagnosis_snapshot,preparation_result) VALUES($1,'PG KPI','Person','pg@example.test',true,true,'v1',$2,'{}','{}')`, [lead, randomUUID()]);
      await pool.query(`INSERT INTO business_kaizen_diagnoses(id,entry_channel,input_state,consultation_lead_id,owner_user_email,original_answers,current_answers,diagnosis_snapshot,completed_at) VALUES($1,'CUSTOMER_SELF','COMPLETED',$2,NULL,'{}','{}','{}','2026-01-30T16:00:00Z')`, [diagnosis, lead]);
      await pool.query(`INSERT INTO business_kaizen_diagnosis_stage_history(id,diagnosis_id,stage,reached_at) VALUES($1,$2,'ACCEPTED','2026-01-31T15:00:00Z')`, [randomUUID(), diagnosis]);
      const eventId = randomUUID(), key = randomUUID();
      await pool.query(`INSERT INTO business_kaizen_commercial_events(id,diagnosis_id,event_type,service_name,description,amount,currency,occurred_at,created_by_user_email,idempotency_key,payload_hash) VALUES($1,$2,'WON','業務KAIZEN','PG win',NULL,'JPY','2026-02-01T00:00:00Z','pg@atlib.jp',$3,'hash')`, [eventId, diagnosis, key]);
      const period = resolveBusinessKaizenKpiPeriod({ fiscalYear: 2026 });
      assert.ok(period);
      const result = await new BusinessKaizenKpiService(pool).aggregate(period);
      assert.equal(result.cohortFunnel.acceptedDiagnosisCount, 1);
      assert.equal(result.cohortFunnel.completedDiagnosisCount, 1);
      assert.equal(result.activityVolume.completedDiagnosisCount, 0);
      assert.equal(result.cohortFunnel.wonDiagnosisCount, 1);
      assert.equal(result.cohortFunnel.acceptedToWonRate, 1);
      assert.equal(result.cohortFunnel.wonAmountTotal, null);
      assert.equal(result.activityVolume.wonEventCount, 1);
      assert.equal(result.dataQuality.commercialEventAmountUnknownCount, 1);
      assert.equal(Number((await pool.query(`SELECT count(*) n FROM business_kaizen_diagnoses`)).rows[0].n), 1);
      console.log(JSON.stringify({ postgresVersion: identity.server_version, database: identity.database_name, serverAddress: identity.server_address, schema, connections: 2 }));
    } finally { await pool.end(); }
  } finally {
    try { await setup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { setup.release(); await setupPool.end(); }
  }
});
