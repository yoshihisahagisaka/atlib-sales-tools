import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Pool } from 'pg';
import { BusinessKaizenAnonymousKpiService } from '../src/services/businessKaizenAnonymousKpiService';

const connectionString=process.env.TEST_DATABASE_URL;
const enabled=Boolean(connectionString)&&process.env.ALLOW_DISPOSABLE_DB_TEST==='yes';

test('anonymous KPI daily UPSERT is atomic on isolated PostgreSQL 16',{skip:!enabled},async()=>{
  const setupPool=new Pool({connectionString,max:2}),setup=await setupPool.connect(),schema=`bk_e2b_${randomUUID().replaceAll('-','')}`;
  let rolesCreated=false;
  try{
    const identity=(await setup.query(`SELECT current_database() database_name,current_setting('server_version') server_version,inet_server_addr()::text server_address`)).rows[0];
    assert.match(identity.server_version,/^16\./);assert.match(identity.database_name,/(test|disposable|tmp)/i);assert.notEqual(identity.database_name,'sales_tools');assert.notEqual(identity.server_address,'10.17.0.3');
    assert.equal(Number((await setup.query(`SELECT count(*) n FROM pg_roles WHERE rolname IN ('sales_tools_app','sales_tools_runtime')`)).rows[0].n),0);
    await setup.query(`CREATE ROLE sales_tools_app NOLOGIN`);await setup.query(`CREATE ROLE sales_tools_runtime NOLOGIN`);rolesCreated=true;
    await setup.query(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO sales_tools_app`);
    await setup.query(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO sales_tools_runtime`);
    await setup.query(`CREATE SCHEMA "${schema}"`);await setup.query(`GRANT USAGE ON SCHEMA "${schema}" TO sales_tools_app,sales_tools_runtime`);await setup.query(`SET search_path TO "${schema}",public`);
    const root=path.resolve(__dirname,'..');
    await setup.query(fs.readFileSync(path.join(root,'migrations/034_marketing_initiative_v1.sql'),'utf8'));
    await setup.query(fs.readFileSync(path.join(root,'migrations/UNNUMBERED_business_kaizen_anonymous_kpi_daily.sql'),'utf8'));
    await setup.query(`INSERT INTO marketing_initiative(initiative_id,initiative_name,service_key,utm_source,utm_campaign,created_by,updated_by) VALUES($1,'PG approved','BUSINESS_WEB','newsletter','fy2026','staff','staff')`,[randomUUID()]);
    await setup.query(`RESET search_path`);
    const options=`-c search_path=${schema},public`,pool1=new Pool({connectionString,max:4,options}),pool2=new Pool({connectionString,max:4,options});
    try{
      const config={enabled:true,secret:'test',environment:'TEST' as const,allowedOrigins:['https://test.example'],allowedHostnames:['test.example']};
      const verifier=async()=>({success:true,action:'diagnosis_start',hostname:'test.example'});
      const service1=new BusinessKaizenAnonymousKpiService(pool1,config,verifier,()=>new Date('2026-01-31T14:59:59Z'));
      const service2=new BusinessKaizenAnonymousKpiService(pool2,config,verifier,()=>new Date('2026-01-31T15:00:00Z'));
      const pids=await Promise.all([pool1.query(`SELECT pg_backend_pid() pid`),pool2.query(`SELECT pg_backend_pid() pid`)]);
      assert.notEqual(pids[0].rows[0].pid,pids[1].rows[0].pid);
      await Promise.all(Array.from({length:8},(_,index)=>(index%2?service1:service2).receive({eventType:'diagnosis_start',turnstileToken:`test-${index}`,utmSource:'newsletter',utmCampaign:'fy2026'},'https://test.example')));
      const rows=(await pool1.query(`SELECT event_date_jst,event_count,utm_classification,utm_source,utm_campaign FROM business_kaizen_anonymous_kpi_daily ORDER BY event_date_jst`)).rows;
      assert.equal(rows.length,2);assert.deepEqual(rows.map(row=>Number(row.event_count)),[4,4]);
      assert.ok(rows.every(row=>row.utm_classification==='REGISTERED'&&row.utm_source==='newsletter'&&row.utm_campaign==='fy2026'));
      assert.equal(Number((await pool1.query(`SELECT sum(event_count) n FROM business_kaizen_anonymous_kpi_daily`)).rows[0].n),8);
      for(const role of ['sales_tools_app','sales_tools_runtime']){
        const acl=(await pool1.query(`SELECT has_table_privilege($1,$2,'SELECT') s,has_table_privilege($1,$2,'INSERT') i,has_table_privilege($1,$2,'UPDATE') u,has_table_privilege($1,$2,'DELETE') d`,[role,`${schema}.business_kaizen_anonymous_kpi_daily`])).rows[0];
        assert.deepEqual(acl,{s:true,i:true,u:true,d:false});
        const client=await pool1.connect();try{
          await client.query(`SET ROLE ${role}`);
          assert.ok(Number((await client.query(`SELECT count(*) n FROM business_kaizen_anonymous_kpi_daily`)).rows[0].n)>=2);
          const origin=`https://${role.replaceAll('_','-')}.example`;
          await client.query(`INSERT INTO business_kaizen_anonymous_kpi_daily(event_date_jst,event_type,environment,origin,utm_classification,event_count) VALUES('2026-02-02','diagnosis_complete','TEST',$1,'UNATTRIBUTED',1)`,[origin]);
          await client.query(`INSERT INTO business_kaizen_anonymous_kpi_daily(event_date_jst,event_type,environment,origin,utm_classification,event_count) VALUES('2026-02-02','diagnosis_complete','TEST',$1,'UNATTRIBUTED',1) ON CONFLICT(event_date_jst,event_type,environment,origin,utm_classification,utm_source,utm_medium,utm_campaign,utm_content,utm_term) DO UPDATE SET event_count=business_kaizen_anonymous_kpi_daily.event_count+1`,[origin]);
          assert.equal(Number((await client.query(`SELECT event_count FROM business_kaizen_anonymous_kpi_daily WHERE origin=$1`,[origin])).rows[0].event_count),2);
          await assert.rejects(client.query(`DELETE FROM business_kaizen_anonymous_kpi_daily WHERE origin=$1`,[origin]),/permission denied/);
          await assert.rejects(client.query(`DROP TABLE business_kaizen_anonymous_kpi_daily`),/must be owner|permission denied/);
        }finally{await client.query(`RESET ROLE`);client.release()}
      }
      const owner=(await pool1.query(`SELECT pg_get_userbyid(relowner) owner FROM pg_class WHERE oid=$1::regclass`,[`${schema}.business_kaizen_anonymous_kpi_daily`])).rows[0].owner;
      assert.notEqual(owner,'sales_tools_app');assert.notEqual(owner,'sales_tools_runtime');
      console.log(JSON.stringify({postgresVersion:identity.server_version,database:identity.database_name,serverAddress:identity.server_address,schema,connections:2,backendPids:pids.map(value=>value.rows[0].pid),eventCount:8,dailyRows:2,runtimeAcl:'SELECT,INSERT,UPDATE; DELETE denied; not owner'}));
    }finally{await pool1.end();await pool2.end()}
  }finally{try{await setup.query(`RESET ROLE`);await setup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);if(rolesCreated){await setup.query(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE SELECT,INSERT,UPDATE,DELETE ON TABLES FROM sales_tools_app`);await setup.query(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE SELECT,INSERT,UPDATE,DELETE ON TABLES FROM sales_tools_runtime`);await setup.query(`DROP ROLE sales_tools_app`);await setup.query(`DROP ROLE sales_tools_runtime`)}}finally{setup.release();await setupPool.end()}}
});
