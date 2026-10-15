import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Pool } from 'pg';
import { runMigrations } from '../src/db/migrate';

test('PostgreSQL 16 migration runner applies counter draft once and skips replay', {
  skip: process.env.RUN_IT_SURVEY_COUNTER_PG !== '1' ? 'disposable PostgreSQL required' : false,
  timeout: 60_000,
}, async () => {
  const connectionString = process.env.IT_SURVEY_COUNTER_PG_URL;
  if (!connectionString) throw new Error('MISSING_DISPOSABLE_PG_URL');
  const pool = new Pool({connectionString,max:3});
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'it-survey-counter-migration-'));
  const filename = '900_it_survey_counter_rehearsal.sql';
  try {
    await pool.query(`CREATE TABLE marketing_initiative(initiative_id UUID PRIMARY KEY)`);
    const draft = fs.readFileSync(path.resolve(__dirname,'../docs/sql/it-kaizen-survey-monthly-counter-schema-draft.sql'),'utf8');
    fs.writeFileSync(path.join(dir,filename),draft);
    const first: object[] = [];
    await runMigrations(pool,dir,event=>first.push(event));
    assert.deepEqual(first,[{event:'migration_applied',filename}]);
    const second: object[] = [];
    await runMigrations(pool,dir,event=>second.push(event));
    assert.deepEqual(second,[{event:'migration_skipped',filename}]);
    const exists = await pool.query<{exists:boolean}>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='it_kaizen_survey_monthly_counts') AS exists`,
    );
    assert.equal(exists.rows[0]?.exists,true);
  } finally {
    await pool.end();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
