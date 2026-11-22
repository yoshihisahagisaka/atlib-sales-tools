import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { BusinessKaizenProxyService } from '../src/services/businessKaizenProxyService';

const connectionString=process.env.TEST_DATABASE_URL;
const enabled=Boolean(connectionString)&&process.env.ALLOW_DISPOSABLE_DB_TEST==='yes';

test('Business KAIZEN unified read model on disposable PostgreSQL 16',{skip:!enabled},async()=>{
  const setupPool=new Pool({connectionString,max:2}),setup=await setupPool.connect(),schema=`bk_c1_${randomUUID().replaceAll('-','')}`;
  try{
    const identity=(await setup.query(`SELECT current_database() database_name,current_setting('server_version') server_version,inet_server_addr()::text server_address`)).rows[0];
    assert.match(identity.server_version,/^16\./);assert.match(identity.database_name,/(test|disposable|tmp)/i);assert.notEqual(identity.database_name,'sales_tools');assert.notEqual(identity.server_address,'10.17.0.3');
    await setup.query(`CREATE SCHEMA "${schema}"`);await setup.query(`SET search_path TO "${schema}",public`);
    const root=path.resolve(__dirname,'..');
    for(const migration of ['027_free_diagnosis_rule_based_v1.sql','030_sales_activity_marketing_attribution.sql','025_business_web_consultation_leads.sql','UNNUMBERED_business_kaizen_diagnosis_package_a.sql'])await setup.query(fs.readFileSync(path.join(root,'migrations',migration),'utf8'));
    await setup.query('RESET search_path');
    const pool=new Pool({connectionString,max:2,options:`-c search_path=${schema},public`});
    try{
      const leadId=randomUUID(),selfId=randomUUID(),companyId=randomUUID(),contactId=randomUUID(),activityId=randomUUID(),proxyId=randomUUID();
      await pool.query(`INSERT INTO business_web_consultation_leads(id,company_name,person_name,email,privacy_consent,diagnosis_transfer_consent,consent_wording_version,idempotency_key,diagnosis_snapshot,preparation_result,utm_source) VALUES($1,'PG Self','PG Self Person','self@example.test',true,true,'v1',$2,'{}','{}','self-pg')`,[leadId,randomUUID()]);
      await pool.query(`INSERT INTO business_kaizen_diagnoses(id,entry_channel,input_state,consultation_lead_id,current_stage) VALUES($1,'CUSTOMER_SELF','DRAFT',$2,'ACCEPTED')`,[selfId,leadId]);
      await pool.query(`INSERT INTO company(id,name,created_by_user_id,owner_user_id) VALUES($1,'PG Proxy','seed','owner@atlib.jp')`,[companyId]);
      await pool.query(`INSERT INTO contact(id,company_id,name) VALUES($1,$2,'PG Proxy Person')`,[contactId,companyId]);
      await pool.query(`INSERT INTO sales_activity(id,company_id,primary_contact_id,selected_service,created_by_user_id,owner_user_id,utm_source) VALUES($1,$2,$3,'BUSINESS_WEB','seed','owner@atlib.jp','proxy-pg')`,[activityId,companyId,contactId]);
      await pool.query(`INSERT INTO business_kaizen_diagnoses(id,entry_channel,input_state,sales_activity_id,company_id,contact_id,owner_user_email) VALUES($1,'STAFF_PROXY','DRAFT',$2,$3,$4,'owner@atlib.jp')`,[proxyId,activityId,companyId,contactId]);
      const service=new BusinessKaizenProxyService(pool),before=(await pool.query(`SELECT (SELECT count(*) FROM company)::int c,(SELECT count(*) FROM contact)::int t,(SELECT count(*) FROM sales_activity)::int a,(SELECT count(*) FROM business_web_consultation_leads)::int l`)).rows[0];
      const list=await service.list({page:1,limit:10});assert.equal(list.items.length,2);assert.deepEqual(new Set(list.items.map(item=>item.entryChannel)),new Set(['CUSTOMER_SELF','STAFF_PROXY']));
      const self=await service.get(selfId),proxy=await service.get(proxyId);assert.equal(self.companyName,'PG Self');assert.equal(self.salesActivityId,null);assert.equal(self.attribution.utmSource,'self-pg');assert.equal(proxy.companyName,'PG Proxy');assert.equal(proxy.consultationLeadId,null);assert.equal(proxy.attribution.utmSource,'proxy-pg');
      const after=(await pool.query(`SELECT (SELECT count(*) FROM company)::int c,(SELECT count(*) FROM contact)::int t,(SELECT count(*) FROM sales_activity)::int a,(SELECT count(*) FROM business_web_consultation_leads)::int l`)).rows[0];assert.deepEqual(after,before);
      console.log(JSON.stringify({postgresVersion:identity.server_version,database:identity.database_name,selfDiagnosisId:selfId,proxyDiagnosisId:proxyId}));
    }finally{await pool.end()}
  }finally{try{await setup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)}finally{setup.release();await setupPool.end()}}
});
