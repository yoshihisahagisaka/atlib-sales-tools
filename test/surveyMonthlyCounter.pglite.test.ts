import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';
import { SurveyMonthlyCounterRepo } from '../src/services/surveyMonthlyCounterRepo';

test('aggregate-only draft: monthly atomic upsert, UTM lookup, historical initiative and JST rollover', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE marketing_initiative (
        initiative_id UUID PRIMARY KEY,
        service_key TEXT NOT NULL,
        is_active BOOLEAN NOT NULL,
        utm_source TEXT, utm_medium TEXT, utm_campaign TEXT,
        utm_content TEXT, utm_term TEXT
      );
    `);
    const schema = readFileSync(join(__dirname, '../docs/sql/it-kaizen-survey-monthly-counter-schema-draft.sql'), 'utf8');
    await db.exec(schema);
    const id = '00000000-0000-4000-8000-000000000111';
    await db.query(
      `INSERT INTO marketing_initiative VALUES ($1,'IT_KAIZEN',true,'tbk','flyer','202610_tbk',NULL,NULL)`,
      [id],
    );
    const repo = new SurveyMonthlyCounterRepo(db as unknown as Pool);
    const utm = {source:'tbk',medium:'flyer',campaign:'202610_tbk',content:null,term:null};
    assert.equal(await repo.resolveInitiativeId(utm),id);
    await repo.increment({kind:'STARTED',initiativeId:id,acceptedAt:new Date('2026-10-15T00:00:00Z')});
    await repo.increment({kind:'STARTED',initiativeId:id,acceptedAt:new Date('2026-10-15T00:00:01Z')});
    await repo.increment({kind:'COMPLETED',initiativeId:id,acceptedAt:new Date('2026-10-15T00:01:00Z')});
    await repo.increment({kind:'STARTED',initiativeId:null,acceptedAt:new Date('2026-10-15T00:02:00Z')});
    const counts = await db.query<{initiative_id:string|null,started_count:string,completed_count:string}>(
      `SELECT initiative_id,started_count,completed_count FROM it_kaizen_survey_monthly_counts ORDER BY attribution_bucket`,
    );
    assert.equal(counts.rows.length,2);
    const initiative = counts.rows.find(x=>x.initiative_id===id)!;
    assert.equal(Number(initiative.started_count),2);
    assert.equal(Number(initiative.completed_count),1);
    await db.query('UPDATE marketing_initiative SET is_active=false WHERE initiative_id=$1',[id]);
    assert.equal(await repo.resolveInitiativeId(utm),null);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM it_kaizen_survey_monthly_counts WHERE initiative_id=$1',[id])).rows[0]?.n,1);
    await repo.increment({kind:'STARTED',initiativeId:null,acceptedAt:new Date('2026-01-31T15:00:00Z')});
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM it_kaizen_survey_monthly_counts WHERE month_jst='2026-02-01'`)).rows[0]?.n,1);
  } finally {
    await db.close();
  }
});
