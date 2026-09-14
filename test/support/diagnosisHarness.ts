import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import cookieParser from 'cookie-parser';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';
import { ItManagementDiagnosisRepo } from '../../src/services/itManagementDiagnosisRepo';
import { createItManagementDiagnosisRouter, DIAGNOSIS_POLICY_NOTICE_VERSION, type CompletionNotifier } from '../../src/routes/itManagementDiagnosis';
import { createAdminItManagementDiagnosisRouter } from '../../src/routes/adminItManagementDiagnosis';
import { StaffAuthService } from '../../src/services/staffAuthService';
import { requireStaffAuth } from '../../src/middleware/staffAuth';
import { safeAccessRequest } from '../../src/middleware/diagnosisLogging';
import { createKaizenDiagnosticRouter } from '../../src/routes/kaizenDiagnostic';
import { KaizenDiagnosticRepo } from '../../src/services/kaizenDiagnosticRepo';
import type { Config } from '../../src/config';
import type { Mailer } from '../../src/services/mailer';
import { DiagnosisPreparationRepo } from '../../src/services/diagnosisPreparationRepo';
import { AnthropicPreDiagnosisProvider, type AIProvider } from '../../src/services/preDiagnosisProvider';
import { DiagnosisWorkspaceRepo } from '../../src/services/diagnosisWorkspaceRepo';
import { AnthropicInterviewProvider, type InterviewProvider } from '../../src/services/interviewAssistantProvider';
import { InterviewAssistantWorker } from '../../src/services/interviewAssistantWorker';
import { DiagnosisReviewRepo } from '../../src/services/diagnosisReviewRepo';
import { AnthropicPostDiagnosisProvider, type PostDiagnosisProvider } from '../../src/services/postDiagnosisProvider';
import { PostDiagnosisWorker } from '../../src/services/postDiagnosisWorker';
import {DiagnosisAssessmentRepo} from '../../src/services/diagnosisAssessmentRepo';
import { DiagnosisReportRepo } from '../../src/services/diagnosisReportRepo';
import { AnthropicReportDraftProvider, type ReportDraftProvider } from '../../src/services/reportDraftProvider';
import { ReportDraftWorker } from '../../src/services/reportDraftWorker';
import { PreDiagnosisWorker } from '../../src/services/preDiagnosisWorker';
import { ManagementFeedbackDecisionRepo } from '../../src/services/managementFeedbackDecisionRepo';
import { createManagementFeedbackDecisionRouter } from '../../src/routes/managementFeedbackDecision';

/** Real PostgreSQL SQL/constraints/transactions in a disposable WASM database.
 * A single connection adapter serializes transactions, matching pg Pool checkout.
 * No production config, secret manager, SMTP, Slack or AI is loaded.
 */
export async function createDiagnosisHarness(notify?: CompletionNotifier, provider: AIProvider = new AnthropicPreDiagnosisProvider(), interviewProvider: InterviewProvider = new AnthropicInterviewProvider(), postProvider: PostDiagnosisProvider = new AnthropicPostDiagnosisProvider(), reportProvider: ReportDraftProvider = new AnthropicReportDraftProvider()) {
  const db = new PGlite();
  await db.waitReady;
  const root = path.resolve(__dirname, '../..');
  await db.exec(fs.readFileSync(path.join(root, 'migrations/005_kaizen_diagnostics.sql'), 'utf8'));
  await db.query(`INSERT INTO kaizen_diagnostics (input_source,company_name,question_set_version,answers,scores,suggested_services)
    VALUES ('prospect','Legacy株式会社','legacy','[]','{}','[]')`);
  await db.exec(fs.readFileSync(path.join(root, 'migrations/007_it_management_diagnosis.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(root, 'migrations/008_it_management_diagnosis_preparation.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(root, 'migrations/009_it_management_diagnosis_workspace.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(root, 'migrations/010_it_management_diagnosis_human_review.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(root, 'migrations/011_it_management_diagnosis_report_feedback.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(root, 'migrations/012_it_management_diagnosis_assessment_handoff.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(root, 'migrations/013_it_management_diagnosis_policy_closure.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(root, 'migrations/014_it_management_diagnosis_restore_reconciliation.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(root, 'migrations/015_management_feedback_decision.sql'), 'utf8'));
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
  const repo = new ItManagementDiagnosisRepo(pool);
  const preparation = new DiagnosisPreparationRepo(pool);
  const worker = new PreDiagnosisWorker(preparation,provider);
  const workspace = new DiagnosisWorkspaceRepo(pool);
  const interviewWorker = new InterviewAssistantWorker(preparation,workspace,interviewProvider);
  const review = new DiagnosisReviewRepo(pool);
  const postWorker = new PostDiagnosisWorker(preparation,review,postProvider);
  const assessment = new DiagnosisAssessmentRepo(pool);
  const report = new DiagnosisReportRepo(pool);
  const feedbackDecision = new ManagementFeedbackDecisionRepo(pool);
  const reportWorker = new ReportDraftWorker(preparation,report,reportProvider);
  const staffAuth = new StaffAuthService('disposable-test-key-not-a-production-secret');
  const staffCookie = `staff_session=${staffAuth.issueSessionToken({ email: 'operator@atlib.jp' })}`;
  const logs: string[] = [];
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(pinoHttp({ logger: pino({ level: 'info' }, { write: text => { logs.push(text); } }), serializers: { req: safeAccessRequest } }));
  app.use(express.json()); app.use(cookieParser());
  app.use('/api/it-management-diagnosis/cases', (req, _res, next) => {
    if (req.method === 'POST' && req.get('x-test-skip-policy-injection') !== '1' && req.body && typeof req.body === 'object') {
      req.body = { ...req.body, policyNoticeVersion: DIAGNOSIS_POLICY_NOTICE_VERSION, policyAcknowledged: true };
    }
    next();
  });
  app.use('/api/it-management-diagnosis', createItManagementDiagnosisRouter(repo, notify));
  app.use('/api/admin/it-management-diagnosis', requireStaffAuth(staffAuth), createAdminItManagementDiagnosisRouter(repo, notify,{ repo: preparation,provider,worker },{repo:workspace,provider:interviewProvider,worker:interviewWorker},{repo:review,provider:postProvider,worker:postWorker},{repo:report,provider:reportProvider,worker:reportWorker},assessment));
  app.use('/api/admin/it-management-diagnosis', requireStaffAuth(staffAuth), createManagementFeedbackDecisionRouter(feedbackDecision));
  app.use('/api/kaizen-diagnostic', createKaizenDiagnosticRouter(new KaizenDiagnosticRepo(pool), {} as Mailer,
    { portalBaseUrl: 'http://localhost', slack: {} } as Config));
  app.use('/admin', requireStaffAuth(staffAuth), express.static(path.join(root, 'public/admin')));
  app.use(express.static(path.join(root, 'public')));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { db, pool, repo, url, logs, staffCookie, preparation, worker, workspace, interviewWorker, review, postWorker, report, reportWorker, assessment, feedbackDecision,
    close: async () => { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); await db.close(); } };
}
