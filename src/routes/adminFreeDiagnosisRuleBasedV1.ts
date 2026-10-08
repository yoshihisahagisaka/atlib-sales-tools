import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { FreeDiagnosisSalesLauncherRepo } from '../services/freeDiagnosisSalesLauncherRepo';
import type { FreeDiagnosisRuleBasedCaseRepo } from '../services/freeDiagnosisRuleBasedCaseRepo';
import type { Vs1ReviewReportFeedbackRepo } from '../services/vs1ReviewReportFeedbackRepo';
import {
  createCompanySchema, focusSelectionObjectSchema, intakeAnswerSchema, recordStatementSchema, RuleBasedV1Error,
} from '../domain/freeDiagnosisRuleBasedV1';

function staffEmail(req: Request): string {
  return req.staffEmail ?? 'unknown-staff';
}

function handle(res: Response, fn: () => Promise<void>): void {
  fn().catch(err => {
    if (err instanceof RuleBasedV1Error) { res.status(err.status).json({ error: err.code }); return; }
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  });
}

const expectedVersionSchema = z.object({ expectedVersion: z.number().int().positive() }).strict();

export function createAdminFreeDiagnosisRuleBasedV1Router(
  launcher: FreeDiagnosisSalesLauncherRepo,
  cases: FreeDiagnosisRuleBasedCaseRepo,
  vs1?: Vs1ReviewReportFeedbackRepo,
): Router {
  const r = Router();

  // Step 1: Internal Customer / Case entry (Sales Launcher: Company/Contact/Activity).
  r.post('/sales-activities', (req, res) => handle(res, async () => {
    const parsed = createCompanySchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    const created = await launcher.createSalesActivity(parsed.data, staffEmail(req));
    res.status(201).json(created);
  }));

  r.post('/sales-activities/:salesActivityId/cases', (req, res) => handle(res, async () => {
    const activity = await launcher.getSalesActivity(req.params.salesActivityId);
    if (!activity) { res.status(404).json({ error: 'SALES_ACTIVITY_NOT_FOUND' }); return; }
    const kase = await cases.createCase(activity.companyId, activity.primaryContactId, activity.id, staffEmail(req));
    res.status(201).json(kase);
  }));

  r.get('/sales-activities', (req, res) => handle(res, async () => {
    const parsed = z.object({ acquisitionSourceName: z.string().trim().min(1).max(200).optional(), utmCampaign: z.string().trim().min(1).max(200).optional() }).strict().safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    res.json({ items: await launcher.listSalesActivities(parsed.data) });
  }));

  r.get('/cases/:id', (req, res) => handle(res, async () => {
    const kase = await cases.getCase(req.params.id);
    if (!kase) { res.status(404).json({ error: 'CASE_NOT_FOUND' }); return; }
    const [intake, preliminaryScope, salesActivity] = await Promise.all([
      cases.listIntakeAnswers(kase.id), cases.getLatestPreliminaryScope(kase.id),
      launcher.getSalesActivity(kase.salesActivityId),
    ]);
    res.json({ case: kase, intake, preliminaryScope, salesActivity: salesActivity ? {
      id: salesActivity.id, selectedService: salesActivity.selectedService, attribution: salesActivity.attribution,
    } : null });
  }));

  // Step 2: 7-question Hearing Intake (SELF/PROXY共通、normalized Intakeへ集約).
  r.post('/cases/:id/intake', (req, res) => handle(res, async () => {
    const parsed = intakeAnswerSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    await cases.recordIntakeAnswer(req.params.id, parsed.data, staffEmail(req));
    res.status(204).end();
  }));

  r.post('/cases/:id/intake/complete', (req, res) => handle(res, async () => {
    const parsed = expectedVersionSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    const kase = await cases.completeIntake(req.params.id, parsed.data.expectedVersion);
    res.json(kase);
  }));

  // Step 3: Focus Selection (Primary必須1件・Secondary任意0-1件).
  const focusWithVersionSchema = focusSelectionObjectSchema.extend(expectedVersionSchema.shape).strict()
    .refine(p => p.secondaryFocus == null || p.secondaryFocus !== p.primaryFocus, 'secondaryFocusはprimaryFocusと異なる必要があります。');
  r.post('/cases/:id/focus', (req, res) => handle(res, async () => {
    const parsed = focusWithVersionSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    const kase = await cases.selectFocus(req.params.id, parsed.data, parsed.data.expectedVersion);
    res.json(kase);
  }));

  // Step 4: Preparation (AI呼び出しなし、既存Plan Item Templateの提示のみ).
  r.post('/cases/:id/preparation/start', (req, res) => handle(res, async () => {
    const parsed = expectedVersionSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    const kase = await cases.startPreparation(req.params.id, parsed.data.expectedVersion);
    res.json({ case: kase, preparation: await cases.initialRule(req.params.id) });
  }));

  r.get('/cases/:id/preparation', (req, res) => handle(res, async () => {
    res.json(await cases.initialRule(req.params.id));
  }));

  // Step 5: Live Hearing start.
  r.post('/cases/:id/hearing/start', (req, res) => handle(res, async () => {
    const parsed = expectedVersionSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    const kase = await cases.startHearing(req.params.id, parsed.data.expectedVersion);
    res.json(kase);
  }));

  r.get('/cases/:id/hearing/units', (req, res) => handle(res, async () => {
    res.json({ items: await cases.hearingUnits(req.params.id) });
  }));

  r.post('/cases/:id/hearing/statements', (req, res) => handle(res, async () => {
    const parsed = recordStatementSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    const statementId = await cases.recordStatement(req.params.id, parsed.data, staffEmail(req));
    res.status(201).json({ id: statementId });
  }));

  r.get('/cases/:id/hearing/statements', (req, res) => handle(res, async () => {
    res.json({ items: await cases.listStatementsForDisplay(req.params.id) });
  }));

  // Step 6: 整理モード.
  r.post('/cases/:id/hearing/organize', (req, res) => handle(res, async () => {
    const parsed = expectedVersionSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    const kase = await cases.enterOrganizingMode(req.params.id, parsed.data.expectedVersion);
    res.json(kase);
  }));

  // Step 7: Hearing Complete.
  r.post('/cases/:id/hearing/complete', (req, res) => handle(res, async () => {
    const parsed = expectedVersionSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    const kase = await cases.completeHearing(req.params.id, parsed.data.expectedVersion);
    res.json(kase);
  }));

  // Step 8: Rule Analysis (deterministic、即時応答。AI呼び出し一切なし).
  r.post('/cases/:id/rule-analysis/run', (req, res) => handle(res, async () => {
    const parsed = expectedVersionSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    const { executionId, result, findings } = await cases.runAndPersistRuleAnalysis(req.params.id, parsed.data.expectedVersion);
    res.status(201).json({ executionId, result, findings });
  }));

  r.get('/cases/:id/rule-analysis/:executionId/findings', (req, res) => handle(res, async () => {
    res.json({ items: await cases.listInvestigationOutputs(req.params.executionId) });
  }));

  r.post('/cases/:id/final-review/project', (req,res)=>handle(res,async()=>{if(!vs1){res.status(501).end();return;}const p=z.object({executionId:z.string().uuid()}).strict().safeParse(req.body);if(!p.success){res.status(400).end();return;}res.json(await vs1.project(req.params.id,p.data.executionId,staffEmail(req)));}));
  r.post('/cases/:id/reports/draft', (req,res)=>handle(res,async()=>{if(!vs1){res.status(501).end();return;}res.status(201).json(await vs1.draft(req.params.id,staffEmail(req)));}));
  r.get('/cases/:id/reports/:reportId', (req,res)=>handle(res,async()=>{if(!vs1){res.status(501).end();return;}res.json(await vs1.getReport(req.params.id,req.params.reportId));}));
  r.post('/cases/:id/reports/:reportId/approve', (req,res)=>handle(res,async()=>{if(!vs1){res.status(501).end();return;}await vs1.approve(req.params.id,req.params.reportId,staffEmail(req));res.status(204).end();}));
  r.post('/cases/:id/reports/:reportId/deliver', (req,res)=>handle(res,async()=>{if(!vs1){res.status(501).end();return;}await vs1.deliver(req.params.id,req.params.reportId,staffEmail(req));res.status(204).end();}));
  r.post('/cases/:id/feedback/start', (req,res)=>handle(res,async()=>{if(!vs1){res.status(501).end();return;}await vs1.startFeedback(req.params.id,staffEmail(req));res.status(204).end();}));
  r.post('/cases/:id/feedback/decision', (req,res)=>handle(res,async()=>{if(!vs1){res.status(501).end();return;}const p=z.object({route:z.enum(['DIRECT_ACT','FOCUSED_CONFIRMATION','DESIGN_ASSESSMENT','STOP_HOLD']),materialDecision:z.string().min(1),nextAction:z.string().min(1)}).safeParse(req.body);if(!p.success){res.status(400).end();return;}res.json(await vs1.decide(req.params.id,staffEmail(req),p.data));}));

  // Step 9/10: Human Review -> Analysis Approved (or Rejected). 編集して採用(wordingOverrides)
  // ／却下(omittedFindingIds)はgrounds_json/Gatesを書き換えない -- 提示方法・採否のみ。
  const reviewSchema = z.object({
    executionId: z.string().uuid(), decision: z.enum(['APPROVED', 'REJECTED']),
    omittedFindingIds: z.array(z.string().uuid()).default([]),
    wordingOverrides: z.record(z.string().uuid(), z.string().trim().min(1).max(500)).default({}),
  }).extend(expectedVersionSchema.shape).strict();
  r.post('/cases/:id/review', (req, res) => handle(res, async () => {
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    const kase = await cases.humanReview(req.params.id, parsed.data.executionId, parsed.data.decision, staffEmail(req), parsed.data.expectedVersion,
      { omittedFindingIds: parsed.data.omittedFindingIds, wordingOverrides: parsed.data.wordingOverrides });
    res.json(kase);
  }));

  // Step 11/12: Preliminary Assessment Structure / Suggested Scope.
  r.post('/cases/:id/preliminary-scope', (req, res) => handle(res, async () => {
    const parsed = expectedVersionSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    const suggestion = await cases.generatePreliminaryScope(req.params.id, parsed.data.expectedVersion);
    res.status(201).json(suggestion);
  }));

  r.get('/cases/:id/preliminary-scope', (req, res) => handle(res, async () => {
    const suggestion = await cases.getLatestPreliminaryScope(req.params.id);
    if (!suggestion) { res.status(404).json({ error: 'PRELIMINARY_SCOPE_NOT_READY' }); return; }
    res.json(suggestion);
  }));

  return r;
}
