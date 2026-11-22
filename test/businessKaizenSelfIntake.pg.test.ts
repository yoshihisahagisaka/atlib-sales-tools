/**
 * Package A disposable PostgreSQL regression.
 * Requires TEST_DATABASE_URL pointing to an isolated, disposable database.
 * NEVER point this at Production or a shared database.
 * Run with the repository's existing TypeScript test runner.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { BusinessWebConsultationLeadRepo } from '../src/services/businessWebConsultationLeadRepo';
import { saveBusinessKaizenSelfIntake } from '../src/services/businessKaizenSelfIntake';
import { prepareConsultation, type DiagnosisSnapshot } from '../src/domain/businessWebConsultation';
import fs from 'node:fs';
import path from 'node:path';

const connectionString = process.env.TEST_DATABASE_URL;
const enabled = Boolean(connectionString) && process.env.ALLOW_DISPOSABLE_DB_TEST === 'yes';

test('Package A atomic SELF intake (disposable PostgreSQL only)', { skip: !enabled }, async () => {
  const pool = new Pool({ connectionString, max: 6 });
  const schema = `bk_a_${randomUUID().replaceAll('-', '')}`;
  const setup = await pool.connect();
  try {
    const safety = await setup.query<{
      database_name: string;
      server_version: string;
      server_address: string | null;
    }>(`SELECT current_database() AS database_name,
               current_setting('server_version') AS server_version,
               inet_server_addr()::text AS server_address`);
    const identity = safety.rows[0]!;
    assert.match(identity.server_version, /^16\./, 'PostgreSQL 16 is required');
    assert.match(identity.database_name, /(test|disposable|tmp)/i,
      'database name must independently identify a disposable test database');
    assert.notEqual(identity.database_name, 'sales_tools');
    assert.notEqual(identity.server_address, '10.17.0.3', 'known Production address is forbidden');

    await setup.query(`CREATE SCHEMA "${schema}"`);
    // A dedicated search_path is assigned per pooled connection using connection options below.
    await setup.query(`SET search_path TO "${schema}", public`);
    await setup.query('CREATE TABLE sales_activity (id uuid PRIMARY KEY)');
    await setup.query('CREATE TABLE company (id uuid PRIMARY KEY)');
    await setup.query('CREATE TABLE contact (id uuid PRIMARY KEY)');
    await setup.query(fs.readFileSync(path.resolve(__dirname, '../migrations/025_business_web_consultation_leads.sql'), 'utf8'));
    const migration = fs.readFileSync(path.resolve(__dirname, '../migrations/UNNUMBERED_business_kaizen_diagnosis_package_a.sql'), 'utf8');
    // This disposable-only fixture checks schema behavior without requiring Production roles.
    await setup.query(migration); // role-exists-safe GRANT block is safe on disposable DB
    await setup.query('RESET search_path');

    // Use an isolated pool, not session SET on a shared pool, to ensure every transaction
    // uses the test schema and no request can leak into public tables.
    const isolated = new Pool({ connectionString, max: 6, options: `-c search_path=${schema},public` });
    try {
      const repo = new BusinessWebConsultationLeadRepo(isolated);
      const snapshot: DiagnosisSnapshot = {
        diagnosisDefinition: 'business_web_self_check', diagnosisVersion: '1.0', logicVersion: '1.0',
        originalAnswers: { Q01:'MANAGER', Q02:['SMOOTH_WORKFLOW'], Q03:'OPEN', Q04:2, Q05:2, Q06:2, Q07:2, Q08:1, Q09:1, Q10:2, Q11:1, Q12:['EXCEL'], Q13:2, Q14:2, Q15:'UNKNOWN' },
        targetState:{ clarity:'CLEAR', selected:['SMOOTH_WORKFLOW'] },
        sixAxisGaps: Object.fromEntries(['workflow','information','decision','dependency','scalability','toolConstraint'].map(key=>[key,{level:'MODERATE',coverage:'HIGH',knownCount:1,eligibleCount:1,average:2}])) as DiagnosisSnapshot['sixAxisGaps'],
        confirmedFacts:['FACT'], unknownItems:['UNKNOWN Scope'], bottlenecks:['B01'], direction:null,
        directionStatus:'SCOPE_CLARIFICATION', confidence:'LOW', renderedImprovementDirection:'範囲を確認します。',
      };
      const makeInput = (idempotencyKey = randomUUID()) => ({
        companyName:'T株式会社', personName:'担当者', email:'t@example.test', privacyConsent:true as const,
        diagnosisTransferConsent:true as const, consentWordingVersion:'business_web_consultation_consent_v1',
        idempotencyKey, snapshot, preparation:prepareConsultation(snapshot),
      });
      const input = makeInput();
      const first = await saveBusinessKaizenSelfIntake(isolated, repo, input);
      const replay = await saveBusinessKaizenSelfIntake(isolated, repo, input);
      assert.equal(first.created, true); assert.equal(replay.created, false);
      assert.equal(first.leadId, replay.leadId); assert.equal(first.diagnosisId, replay.diagnosisId);
      const count = async (table: string) => Number((await isolated.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n);
      assert.equal(await count('business_web_consultation_leads'), 1);
      assert.equal(await count('business_kaizen_diagnoses'), 1);
      assert.equal(await count('business_kaizen_diagnosis_stage_history'), 1);
      assert.equal(await count('company'), 0);
      assert.equal(await count('contact'), 0);
      assert.equal(await count('sales_activity'), 0);

      await assert.rejects(
        isolated.query(
          `UPDATE business_kaizen_diagnoses SET original_answers=$2::jsonb
           WHERE id=$1`,
          [first.diagnosisId, JSON.stringify({ Q01: 'CHANGED' })],
        ),
        /original answers are immutable/,
      );
      await isolated.query(
        `UPDATE business_kaizen_diagnoses SET current_answers=$2::jsonb WHERE id=$1`,
        [first.diagnosisId, JSON.stringify({ Q01: 'CURRENT MAY CHANGE' })],
      );
      await assert.rejects(
        isolated.query(
          `UPDATE business_kaizen_diagnosis_stage_history SET stage='SCHEDULING'
           WHERE diagnosis_id=$1`,
          [first.diagnosisId],
        ),
        /stage history is append-only/,
      );
      await assert.rejects(
        isolated.query('DELETE FROM business_kaizen_diagnosis_stage_history WHERE diagnosis_id=$1', [first.diagnosisId]),
        /stage history is append-only/,
      );

      // A future Proxy draft may establish Original once after starting at NULL.
      const companyId = randomUUID(), contactId = randomUUID(), activityId = randomUUID();
      await isolated.query('INSERT INTO company(id) VALUES($1)', [companyId]);
      await isolated.query('INSERT INTO contact(id) VALUES($1)', [contactId]);
      await isolated.query('INSERT INTO sales_activity(id) VALUES($1)', [activityId]);
      const draft = await isolated.query<{ id: string }>(
        `INSERT INTO business_kaizen_diagnoses
         (entry_channel,input_state,sales_activity_id,company_id,contact_id)
         VALUES('STAFF_PROXY','DRAFT',$1,$2,$3) RETURNING id`,
        [activityId, companyId, contactId],
      );
      await isolated.query(
        'UPDATE business_kaizen_diagnoses SET original_answers=$2::jsonb WHERE id=$1',
        [draft.rows[0]!.id, JSON.stringify({ Q01: 'FIRST' })],
      );
      await assert.rejects(
        isolated.query(
          'UPDATE business_kaizen_diagnoses SET original_answers=$2::jsonb WHERE id=$1',
          [draft.rows[0]!.id, JSON.stringify({ Q01: 'SECOND' })],
        ),
        /original answers are immutable/,
      );
      await isolated.query('DELETE FROM business_kaizen_diagnoses WHERE id=$1', [draft.rows[0]!.id]);
      await isolated.query('DELETE FROM sales_activity WHERE id=$1', [activityId]);
      await isolated.query('DELETE FROM contact WHERE id=$1', [contactId]);
      await isolated.query('DELETE FROM company WHERE id=$1', [companyId]);

      // Historical Lead exists without a Diagnosis. A replay must not backfill it,
      // and must never treat incoming answers as historical original evidence.
      const historicalInput = makeInput();
      const historicalLead = await repo.insertOrGet(historicalInput);
      assert.equal(historicalLead.created, true);
      const historicalSnapshot = { ...snapshot, renderedImprovementDirection: 'CHANGED ON REPLAY' };
      const replayOfHistory = await saveBusinessKaizenSelfIntake(isolated, repo, {
        ...historicalInput,
        snapshot: historicalSnapshot,
        preparation: prepareConsultation(historicalSnapshot),
      });
      assert.equal(replayOfHistory.created, false);
      assert.equal(replayOfHistory.leadId, historicalLead.id);
      assert.equal(replayOfHistory.diagnosisId, null);
      assert.equal(await count('business_web_consultation_leads'), 2);
      assert.equal(await count('business_kaizen_diagnoses'), 1);
      assert.equal(await count('business_kaizen_diagnosis_stage_history'), 1);
      const historicalStored = await isolated.query<{ diagnosis_snapshot: DiagnosisSnapshot }>(
        'SELECT diagnosis_snapshot FROM business_web_consultation_leads WHERE id=$1',
        [historicalLead.id],
      );
      assert.equal(historicalStored.rows[0]!.diagnosis_snapshot.renderedImprovementDirection,
        snapshot.renderedImprovementDirection);

      const concurrentInput = makeInput();
      const concurrent = await Promise.all(Array.from({length: 8},()=>saveBusinessKaizenSelfIntake(isolated,repo,concurrentInput)));
      assert.equal(new Set(concurrent.map(x=>x.leadId)).size, 1);
      assert.equal(new Set(concurrent.map(x=>x.diagnosisId)).size, 1);
      assert.equal(concurrent.filter(x=>x.created).length, 1);
      assert.equal(await count('business_web_consultation_leads'), 3);
      assert.equal(await count('business_kaizen_diagnoses'), 2);
      assert.equal(await count('business_kaizen_diagnosis_stage_history'), 2);

      // Trigger deliberately fails the Diagnosis INSERT: Lead must roll back too.
      await isolated.query(`CREATE FUNCTION fail_diagnosis() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected diagnosis failure'; END $$`);
      await isolated.query('CREATE TRIGGER fail_diagnosis_insert BEFORE INSERT ON business_kaizen_diagnoses FOR EACH ROW EXECUTE FUNCTION fail_diagnosis()');
      await assert.rejects(saveBusinessKaizenSelfIntake(isolated,repo,makeInput()), /injected diagnosis failure/);
      assert.equal(await count('business_web_consultation_leads'), 3);
      await isolated.query('DROP TRIGGER fail_diagnosis_insert ON business_kaizen_diagnoses');
      await isolated.query('DROP FUNCTION fail_diagnosis()');

      await isolated.query(`CREATE FUNCTION fail_stage() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected stage failure'; END $$`);
      await isolated.query('CREATE TRIGGER fail_stage_insert BEFORE INSERT ON business_kaizen_diagnosis_stage_history FOR EACH ROW EXECUTE FUNCTION fail_stage()');
      await assert.rejects(saveBusinessKaizenSelfIntake(isolated,repo,makeInput()), /injected stage failure/);
      assert.equal(await count('business_web_consultation_leads'), 3);
      assert.equal(await count('business_kaizen_diagnoses'), 2);
      await isolated.query('DROP TRIGGER fail_stage_insert ON business_kaizen_diagnosis_stage_history');
      await isolated.query('DROP FUNCTION fail_stage()');
    } finally { await isolated.end(); }
  } finally {
    try { await setup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { setup.release(); await pool.end(); }
  }
});

