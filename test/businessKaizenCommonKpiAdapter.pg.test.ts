import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { BusinessKaizenCommonKpiAdapter } from '../src/services/businessKaizenCommonKpiAdapter';

const connectionString = process.env.TEST_DATABASE_URL;
const enabled = Boolean(connectionString) && process.env.ALLOW_DISPOSABLE_DB_TEST === 'yes';

test('Business KAIZEN common KPI adapter reads facts on isolated PostgreSQL 16', { skip: !enabled }, async () => {
  const setupPool = new Pool({ connectionString, max: 2 });
  const setup = await setupPool.connect();
  const schema = `bk_e3a_${randomUUID().replaceAll('-', '')}`;
  try {
    const identity = (await setup.query(`SELECT current_database() database_name,current_setting('server_version') server_version,inet_server_addr()::text server_address`)).rows[0];
    assert.match(identity.server_version, /^16\./);
    assert.match(identity.database_name, /(test|disposable|tmp)/i);
    assert.notEqual(identity.database_name, 'sales_tools');
    assert.notEqual(identity.server_address, '10.17.0.3');
    await setup.query(`CREATE SCHEMA "${schema}"`);
    await setup.query(`SET search_path TO "${schema}",public`);
    const root = path.resolve(__dirname, '..');
    for (const migration of ['027_free_diagnosis_rule_based_v1.sql','030_sales_activity_marketing_attribution.sql','025_business_web_consultation_leads.sql','UNNUMBERED_business_kaizen_diagnosis_package_a.sql'])
      await setup.query(fs.readFileSync(path.join(root, 'migrations', migration), 'utf8'));
    await setup.query(`RESET search_path`);
    const pool = new Pool({ connectionString, max: 2, options: `-c search_path=${schema},public` });
    try {
      const lead = randomUUID(), diagnosis = randomUUID();
      await pool.query(`INSERT INTO business_web_consultation_leads(id,company_name,person_name,email,privacy_consent,diagnosis_transfer_consent,consent_wording_version,idempotency_key,diagnosis_snapshot,preparation_result,utm_source) VALUES($1,'PG','Person','pg@example.test',true,true,'v1',$2,'{}','{}','web')`, [lead, randomUUID()]);
      await pool.query(`INSERT INTO business_kaizen_diagnoses(id,entry_channel,input_state,consultation_lead_id) VALUES($1,'CUSTOMER_SELF','DRAFT',$2)`, [diagnosis, lead]);
      await pool.query(`INSERT INTO business_kaizen_diagnosis_stage_history(id,diagnosis_id,stage,reached_at) VALUES($1,$2,'ACCEPTED','2026-02-01T00:00:00Z')`, [randomUUID(), diagnosis]);
      const company = randomUUID(), contact = randomUUID(), activity = randomUUID(), proxy = randomUUID(), draft = randomUUID();
      await pool.query(`INSERT INTO company(id,name,created_by_user_id,owner_user_id) VALUES($1,'PG Proxy','seed','owner')`, [company]);
      await pool.query(`INSERT INTO contact(id,company_id,name) VALUES($1,$2,'Person')`, [contact, company]);
      await pool.query(`INSERT INTO sales_activity(id,company_id,primary_contact_id,selected_service,created_by_user_id,owner_user_id,acquisition_source_type,acquisition_source_name,utm_campaign) VALUES($1,$2,$3,'BUSINESS_WEB','seed','owner','REFERRAL','partner','pg-proxy')`, [activity, company, contact]);
      await pool.query(`INSERT INTO business_kaizen_diagnoses(id,entry_channel,input_state,sales_activity_id,company_id,contact_id,owner_user_email) VALUES($1,'STAFF_PROXY','DRAFT',$2,$3,$4,'owner@atlib.jp'),($5,'STAFF_PROXY','DRAFT',$2,$3,$4,'owner@atlib.jp')`, [proxy, activity, company, contact, draft]);
      for (const [stage,at] of [['ACCEPTED','2026-02-02T00:00:00Z'],['PROPOSED','2026-02-02T01:00:00Z'],['MEETING_COMPLETED','2026-02-02T02:00:00Z'],['SCHEDULED','2026-02-03T00:00:00Z'],['SCHEDULED','2026-02-04T00:00:00Z']])
        await pool.query(`INSERT INTO business_kaizen_diagnosis_stage_history(id,diagnosis_id,stage,reached_at) VALUES($1,$2,$3,$4)`, [randomUUID(), proxy, stage, at]);
      for (const [type,amount,at] of [['PROPOSED',null,'2026-02-05T00:00:00Z'],['PROPOSED',0,'2026-02-06T00:00:00Z'],['WON',500,'2026-02-07T00:00:00Z']] as const)
        await pool.query(`INSERT INTO business_kaizen_commercial_events(id,diagnosis_id,event_type,service_name,description,amount,currency,occurred_at,created_by_user_email,idempotency_key,payload_hash) VALUES($1,$2,$3,'free text','fact',$4,'JPY',$5,'pg@atlib.jp',$6,'hash')`, [randomUUID(), proxy, type, amount, at, randomUUID()]);
      const before = Number((await pool.query(`SELECT count(*) n FROM business_kaizen_diagnoses`)).rows[0].n);
      const subjects = await new BusinessKaizenCommonKpiAdapter(pool).listAcceptedSubjects();
      assert.equal(subjects.length, 2);
      const self = subjects.find(subject => subject.ref.subjectId === diagnosis)!;
      const projectedProxy = subjects.find(subject => subject.ref.subjectId === proxy)!;
      assert.ok(!subjects.some(subject => subject.ref.subjectId === draft));
      assert.equal(self.companyId, null);
      assert.equal(self.milestones[0]?.code, 'ENTRY_ACCEPTED');
      assert.equal(projectedProxy.companyId, company);
      assert.equal(projectedProxy.contactId, contact);
      assert.equal(projectedProxy.ownerId, 'owner@atlib.jp');
      assert.equal(projectedProxy.acquisitionChannel, 'REFERRAL');
      assert.deepEqual(projectedProxy.milestones.map(item => item.code), ['ENTRY_ACCEPTED','MEETING_SCHEDULED','PAID_SERVICE_PROPOSED','PAID_SERVICE_WON']);
      assert.equal(projectedProxy.milestones[1]?.firstReachedAt, '2026-02-03T00:00:00.000Z');
      assert.deepEqual(projectedProxy.commercialEvents.map(event => [event.type,event.amount,event.serviceCode]), [['PROPOSED',null,null],['PROPOSED',0,null],['WON',500,null]]);
      assert.equal(projectedProxy.drillDownPath, `/admin/business-kaizen-diagnosis-detail.html?id=${proxy}`);
      assert.equal(Number((await pool.query(`SELECT count(*) n FROM business_kaizen_diagnoses`)).rows[0].n), before);
      console.log(JSON.stringify({ postgresVersion: identity.server_version, database: identity.database_name, serverAddress: identity.server_address, schema, connections: 2 }));
    } finally { await pool.end(); }
  } finally {
    try { await setup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { setup.release(); await setupPool.end(); }
  }
});
