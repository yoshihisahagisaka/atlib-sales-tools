import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import cookieParser from 'cookie-parser';
import { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';
import { FreeDiagnosisSalesLauncherRepo } from '../../src/services/freeDiagnosisSalesLauncherRepo';
import { FreeDiagnosisRuleBasedCaseRepo } from '../../src/services/freeDiagnosisRuleBasedCaseRepo';
import { Vs1ReviewReportFeedbackRepo } from '../../src/services/vs1ReviewReportFeedbackRepo';
import { createAdminFreeDiagnosisRuleBasedV1Router } from '../../src/routes/adminFreeDiagnosisRuleBasedV1';
import { StaffAuthService } from '../../src/services/staffAuthService';
import { requireStaffAuth } from '../../src/middleware/staffAuth';

/** Real PostgreSQL SQL/constraints/transactions in a disposable WASM database.
 * Same pattern as test/support/diagnosisHarness.ts. Only migration 027 is applied: the
 * Rule-Based v1 tables have no foreign key into any legacy table.
 */
export async function createFreeDiagnosisRuleBasedV1Harness() {
  const db = new PGlite();
  await db.waitReady;
  const root = path.resolve(__dirname, '../..');
  for (const migration of ['005_kaizen_diagnostics.sql','007_it_management_diagnosis.sql','008_it_management_diagnosis_preparation.sql','009_it_management_diagnosis_workspace.sql','010_it_management_diagnosis_human_review.sql','011_it_management_diagnosis_report_feedback.sql','012_it_management_diagnosis_assessment_handoff.sql','015_management_feedback_decision.sql']) {
    await db.exec(fs.readFileSync(path.join(root, 'migrations', migration), 'utf8'));
  }
  await db.exec(fs.readFileSync(path.join(root, 'migrations/027_free_diagnosis_rule_based_v1.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(root, 'migrations/028_free_diagnosis_current_design_v1_phase1_draft.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(root, 'migrations/029_vs1_report_feedback_shared_artifacts.sql'), 'utf8'));

  let tail = Promise.resolve();
  async function acquire() {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    return release;
  }
  const query = async (sql: string, params?: unknown[]) => db.query(sql, params);
  const pool = {
    query: async (sql: string, params?: unknown[]) => { const release = await acquire(); try { return await query(sql, params); } finally { release(); } },
    connect: async () => { const release = await acquire(); return { query, release }; },
  } as unknown as Pool;

  const launcher = new FreeDiagnosisSalesLauncherRepo(pool);
  const cases = new FreeDiagnosisRuleBasedCaseRepo(pool);
  const vs1 = new Vs1ReviewReportFeedbackRepo(pool);
  const staffAuth = new StaffAuthService('disposable-test-key-not-a-production-secret');
  const staffCookie = `staff_session=${staffAuth.issueSessionToken({ email: 'operator@atlib.jp' })}`;

  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(express.json()); app.use(cookieParser());
  app.use('/api/admin/free-diagnosis-v1', requireStaffAuth(staffAuth), createAdminFreeDiagnosisRuleBasedV1Router(launcher, cases, vs1));
  app.use('/admin', requireStaffAuth(staffAuth), express.static(path.join(root, 'public/admin')));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    db, pool, launcher, cases, vs1, url, staffCookie,
    close: async () => { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); await db.close(); },
  };
}
