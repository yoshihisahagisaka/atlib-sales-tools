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
  try{
    const identity=(await setup.query(`SELECT current_database() database_name,current_setting('server_version') server_version,inet_server_addr()::text server_address`)).rows[0];
    assert.match(identity.server_version,/^16\./);assert.match(identity.database_name,/(test|disposable|tmp)/i);assert.notEqual(identity.database_name,'sales_tools');assert.notEqual(identity.server_address,'10.17.0.3');
    await setup.query(`CREATE SCHEMA "${schema}"`);await setup.query(`SET search_path TO "${schema}",public`);
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
      console.log(JSON.stringify({postgresVersion:identity.server_version,database:identity.database_name,serverAddress:identity.server_address,schema,connections:2,backendPids:pids.map(value=>value.rows[0].pid),eventCount:8,dailyRows:2}));
    }finally{await pool1.end();await pool2.end()}
  }finally{try{await setup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)}finally{setup.release();await setupPool.end()}}
});
