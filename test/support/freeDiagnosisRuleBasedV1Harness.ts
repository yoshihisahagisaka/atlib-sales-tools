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
import { PublicCustomerSelfSubmissionService } from '../../src/services/publicCustomerSelfSubmissionService';
import { createPublicCustomerSelfFreeDiagnosisRouter } from '../../src/routes/publicCustomerSelfFreeDiagnosis';
import { FreeDiagnosisDesignV2PersistenceRepo } from '../../src/services/freeDiagnosisDesignV2PersistenceRepo';
import { FreeDiagnosisDesignV2EntryAdapter } from '../../src/services/freeDiagnosisDesignV2EntryAdapter';
import { FreeDiagnosisDesignV2ApiService } from '../../src/services/freeDiagnosisDesignV2ApiService';
import { createAdminFreeDiagnosisDesignV2Router } from '../../src/routes/adminFreeDiagnosisDesignV2';
import { StaffProxyDesignV2SubmissionService } from '../../src/services/staffProxyDesignV2SubmissionService';
import { MarketingInitiativeRepo } from '../../src/services/marketingInitiativeRepo';
import { createAdminMarketingInitiativeRouter } from '../../src/routes/adminMarketingInitiative';
import { TestCaseManagementRepo } from '../../src/services/testCaseManagementRepo';

/** Real PostgreSQL SQL/constraints/transactions in a disposable WASM database.
 * Same pattern as test/support/diagnosisHarness.ts. Only migration 027 is applied: the
 * Rule-Based v1 tables have no foreign key into any legacy table.
 */
export async function createFreeDiagnosisRuleBasedV1Harness(options: { includeDesignV2?: boolean } = {}) {
  const db = new PGlite();
  await db.waitReady;
  const root = path.resolve(__dirname, '../..');
  for (const migration of ['005_kaizen_diagnostics.sql','007_it_management_diagnosis.sql','008_it_management_diagnosis_preparation.sql','009_it_management_diagnosis_workspace.sql','010_it_management_diagnosis_human_review.sql','011_it_management_diagnosis_report_feedback.sql','012_it_management_diagnosis_assessment_handoff.sql','015_management_feedback_decision.sql']) {
    await db.exec(fs.readFileSync(path.join(root, 'migrations', migration), 'utf8'));
  }
  await db.exec(fs.readFileSync(path.join(root, 'migrations/027_free_diagnosis_rule_based_v1.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(root, 'migrations/028_free_diagnosis_current_design_v1_phase1_draft.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(root, 'migrations/029_vs1_report_feedback_shared_artifacts.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(root, 'migrations/030_sales_activity_marketing_attribution.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(root, 'migrations/031_public_customer_self_submission.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(root, 'migrations/032_sales_activity_referral_person_name.sql'), 'utf8'));
  if (options.includeDesignV2) await db.exec(fs.readFileSync(path.join(root, 'migrations/033_free_diagnosis_design_v2_persistence.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(root, 'migrations/034_marketing_initiative_v1.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(root, 'migrations/035_it_management_test_case_designation.sql'), 'utf8'));

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
  const initiatives = new MarketingInitiativeRepo(pool);
  const testCases = new TestCaseManagementRepo(pool);
  const cases = new FreeDiagnosisRuleBasedCaseRepo(pool);
  const vs1 = new Vs1ReviewReportFeedbackRepo(pool);
  const designV2Persistence = new FreeDiagnosisDesignV2PersistenceRepo(pool);
  const designV2Api = new FreeDiagnosisDesignV2ApiService(cases, designV2Persistence, vs1);
  const designV2Entry = new FreeDiagnosisDesignV2EntryAdapter(designV2Persistence);
  const publicSelf = new PublicCustomerSelfSubmissionService(pool, designV2Entry);
  const staffProxyDesignV2 = new StaffProxyDesignV2SubmissionService(pool, designV2Entry);
  const staffAuth = new StaffAuthService('disposable-test-key-not-a-production-secret');
  const staffCookie = `staff_session=${staffAuth.issueSessionToken({ email: 'operator@atlib.jp' })}`;

  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(express.json()); app.use(cookieParser());
  app.use('/api/public/it-management-kaizen/free-diagnosis-v1', createPublicCustomerSelfFreeDiagnosisRouter(publicSelf, true));
  app.use('/api/admin/free-diagnosis-v1', requireStaffAuth(staffAuth), createAdminFreeDiagnosisRuleBasedV1Router(launcher, cases, vs1, staffProxyDesignV2, testCases, new Set(['operator@atlib.jp'])));
  app.use('/api/admin/marketing-initiatives', requireStaffAuth(staffAuth), createAdminMarketingInitiativeRouter(initiatives, launcher));
  app.use('/api/admin/free-diagnosis-v1', requireStaffAuth(staffAuth), createAdminFreeDiagnosisDesignV2Router(designV2Api));
  app.use('/admin', requireStaffAuth(staffAuth), express.static(path.join(root, 'public/admin')));
  app.use(express.static(path.join(root, 'public')));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    db, pool, launcher, initiatives, testCases, cases, vs1, publicSelf, staffProxyDesignV2, designV2Persistence, url, staffCookie,
    close: async () => { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); await db.close(); },
  };
}
