import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { SurveyMonthlyCounterRepo } from '../src/services/surveyMonthlyCounterRepo';

test('PostgreSQL 16 counter draft: grants, concurrent increments, historical attribution', {
  skip: process.env.RUN_IT_SURVEY_COUNTER_PG !== '1' ? 'disposable PostgreSQL required' : false,
  timeout: 60_000,
}, async () => {
  const admin = new Pool({ connectionString: process.env.IT_SURVEY_COUNTER_PG_URL, max: 12 });
  const runtime = new Pool({ connectionString: process.env.IT_SURVEY_COUNTER_RUNTIME_PG_URL, max: 12 });
  try {
    await admin.query('CREATE ROLE sales_tools_runtime LOGIN PASSWORD \'runtime-only\'');
    await admin.query('GRANT USAGE, CREATE ON SCHEMA public TO sales_tools_runtime');
    const marketing = fs.readFileSync(path.resolve(__dirname,'../migrations/034_marketing_initiative_v1.sql'),'utf8');
    await admin.query(marketing);
    const schema = fs.readFileSync(path.resolve(__dirname,'../docs/sql/it-kaizen-survey-monthly-counter-schema-draft.sql'),'utf8');
    await admin.query(schema);
    const grants = await admin.query<{privilege_type:string}>(
      `SELECT privilege_type FROM information_schema.role_table_grants
       WHERE grantee='sales_tools_runtime' AND table_name='it_kaizen_survey_monthly_counts'`,
    );
    const rights = new Set(grants.rows.map(x=>x.privilege_type));
    for (const right of ['SELECT','INSERT','UPDATE']) assert.ok(rights.has(right),right);
    assert.ok(!rights.has('DELETE'));
    assert.ok(!rights.has('TRUNCATE'));

    const id='00000000-0000-4000-8000-000000000555';
    await admin.query(
      `INSERT INTO marketing_initiative
       (initiative_id,initiative_name,service_key,utm_source,utm_medium,utm_campaign,created_by,updated_by)
       VALUES ($1,'TBK','IT_KAIZEN','tbk','flyer','202610_tbk','staff','staff')`,[id],
    );
    const repo = new SurveyMonthlyCounterRepo(runtime);
    assert.equal(await repo.resolveInitiativeId({
      source:'tbk',medium:'flyer',campaign:'202610_tbk',content:null,term:null,
    }),id);
    const at = new Date('2026-10-15T01:00:00Z');
    await Promise.all(Array.from({length:100},(_,i)=>repo.increment({
      kind:i%4===0?'COMPLETED':'STARTED',initiativeId:id,acceptedAt:at,
    })));
    const rows=await repo.listMonthly('2026-10-01','2026-11-01');
    assert.equal(rows.length,1);
    assert.equal(rows[0]?.month,'2026-10-01');
    assert.equal(rows[0]?.startedCount,75);
    assert.equal(rows[0]?.completedCount,25);
    await assert.rejects(runtime.query('DELETE FROM it_kaizen_survey_monthly_counts'),/permission denied/);
    await admin.query('UPDATE marketing_initiative SET is_active=false WHERE initiative_id=$1',[id]);
    assert.equal(await repo.resolveInitiativeId({
      source:'tbk',medium:'flyer',campaign:'202610_tbk',content:null,term:null,
    }),null);
    assert.equal((await repo.listMonthly('2026-10-01','2026-11-01'))[0]?.initiativeId,id);
  } finally {
    await runtime.end();
    await admin.end();
  }
});
