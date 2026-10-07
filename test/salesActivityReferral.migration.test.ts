import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

test('032 adds nullable referral sales context without changing existing Sales Activities', async () => {
  const db = new PGlite(); await db.waitReady;
  try {
    await db.exec('CREATE TABLE sales_activity (id UUID PRIMARY KEY); INSERT INTO sales_activity (id) VALUES (\'00000000-0000-0000-0000-000000000001\');');
    await db.exec(fs.readFileSync(path.resolve(__dirname, '../migrations/032_sales_activity_referral_person_name.sql'), 'utf8'));
    const row = (await db.query<{ referral_person_name: string | null }>('SELECT referral_person_name FROM sales_activity')).rows[0];
    assert.ok(row); assert.equal(row.referral_person_name, null);
  } finally { await db.close(); }
});
