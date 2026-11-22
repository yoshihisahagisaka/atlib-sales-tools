import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import fs from 'node:fs';import path from 'node:path';
import { Pool } from 'pg';
import { BusinessKaizenProxyService } from '../src/services/businessKaizenProxyService';

const connectionString=process.env.TEST_DATABASE_URL;
const enabled=Boolean(connectionString)&&process.env.ALLOW_DISPOSABLE_DB_TEST==='yes';
test('Business KAIZEN proxy draft serialization uses independent PostgreSQL 16 backends',{skip:!enabled},async()=>{
  const setupPool=new Pool({connectionString,max:2}),setup=await setupPool.connect(),schema=`bk_b2_${randomUUID().replaceAll('-','')}`;
  try{
    const safety=await setup.query(`SELECT current_database() database_name,current_setting('server_version') server_version,inet_server_addr()::text server_address`),identity=safety.rows[0];
    assert.match(identity.server_version,/^16\./);assert.match(identity.database_name,/(test|disposable|tmp)/i);assert.notEqual(identity.database_name,'sales_tools');assert.notEqual(identity.server_address,'10.17.0.3');
    await setup.query(`CREATE SCHEMA "${schema}"`);await setup.query(`SET search_path TO "${schema}",public`);
    const root=path.resolve(__dirname,'..');
    await setup.query(fs.readFileSync(path.join(root,'migrations/027_free_diagnosis_rule_based_v1.sql'),'utf8'));
    await setup.query(fs.readFileSync(path.join(root,'migrations/025_business_web_consultation_leads.sql'),'utf8'));
    await setup.query(fs.readFileSync(path.join(root,'migrations/UNNUMBERED_business_kaizen_diagnosis_package_a.sql'),'utf8'));
    const companyId=randomUUID(),contactId=randomUUID(),activityId=randomUUID();
    await setup.query(`INSERT INTO company(id,name,created_by_user_id,owner_user_id) VALUES($1,'PG Company','seed','owner@atlib.jp')`,[companyId]);
    await setup.query(`INSERT INTO contact(id,company_id,name) VALUES($1,$2,'PG Contact')`,[contactId,companyId]);
    await setup.query(`INSERT INTO sales_activity(id,company_id,primary_contact_id,selected_service,created_by_user_id,owner_user_id) VALUES($1,$2,$3,'BUSINESS_WEB','seed','owner@atlib.jp')`,[activityId,companyId,contactId]);
    await setup.query('RESET search_path');
    const options=`-c search_path=${schema},public`,pool1=new Pool({connectionString,max:1,options}),pool2=new Pool({connectionString,max:1,options});
    try{
      const [pid1,pid2]=await Promise.all([pool1.query('SELECT pg_backend_pid() pid'),pool2.query('SELECT pg_backend_pid() pid')]);
      assert.notEqual(pid1.rows[0].pid,pid2.rows[0].pid);
      const [one,two]=await Promise.all([new BusinessKaizenProxyService(pool1).createOrResume(activityId,'one@atlib.jp'),new BusinessKaizenProxyService(pool2).createOrResume(activityId,'two@atlib.jp')]);
      assert.equal([one,two].filter(result=>result.created).length,1);assert.equal(one.diagnosisId,two.diagnosisId);
      assert.equal(Number((await pool1.query(`SELECT count(*) n FROM business_kaizen_diagnoses WHERE sales_activity_id=$1`,[activityId])).rows[0].n),1);
      assert.equal(Number((await pool1.query(`SELECT count(*) n FROM business_kaizen_diagnosis_stage_history`)).rows[0].n),0);
      assert.deepEqual((await pool1.query(`SELECT (SELECT count(*) FROM company)::int c,(SELECT count(*) FROM contact)::int t,(SELECT count(*) FROM sales_activity)::int a`)).rows[0],{c:1,t:1,a:1});
      console.log(JSON.stringify({postgresVersion:identity.server_version,database:identity.database_name,backendPids:[pid1.rows[0].pid,pid2.rows[0].pid],diagnosisId:one.diagnosisId}));
    }finally{await pool1.end();await pool2.end()}
  }finally{try{await setup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)}finally{setup.release();await setupPool.end()}}
});
