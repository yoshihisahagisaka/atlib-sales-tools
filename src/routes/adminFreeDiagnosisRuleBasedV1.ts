import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { FreeDiagnosisSalesLauncherRepo } from '../services/freeDiagnosisSalesLauncherRepo';
import type { FreeDiagnosisRuleBasedCaseRepo } from '../services/freeDiagnosisRuleBasedCaseRepo';
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

  r.get('/cases/:id', (req, res) => handle(res, async () => {
    const kase = await cases.getCase(req.params.id);
    if (!kase) { res.status(404).json({ error: 'CASE_NOT_FOUND' }); return; }
    const [intake, preliminaryScope] = await Promise.all([
      cases.listIntakeAnswers(kase.id), cases.getLatestPreliminaryScope(kase.id),
    ]);
    res.json({ case: kase, intake, preliminaryScope });
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
    res.json(kase);
  }));

  // Step 5: Live Hearing start.
  r.post('/cases/:id/hearing/start', (req, res) => handle(res, async () => {
    const parsed = expectedVersionSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    const kase = await cases.startHearing(req.params.id, parsed.data.expectedVersion);
    res.json(kase);
  }));

  r.post('/cases/:id/hearing/statements', (req, res) => handle(res, async () => {
    const parsed = recordStatementSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    const statementId = await cases.recordStatement(req.params.id, parsed.data, staffEmail(req));
    res.status(201).json({ id: statementId });
  }));

  r.get('/cases/:id/hearing/statements', (req, res) => handle(res, async () => {
    res.json({ items: await cases.listStatements(req.params.id) });
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
    const { executionId, result } = await cases.runAndPersistRuleAnalysis(req.params.id, parsed.data.expectedVersion);
    res.status(201).json({ executionId, result });
  }));

  // Step 9/10: Human Review -> Analysis Approved (or Rejected).
  const reviewSchema = z.object({ executionId: z.string().uuid(), decision: z.enum(['APPROVED', 'REJECTED']) }).extend(expectedVersionSchema.shape).strict();
  r.post('/cases/:id/review', (req, res) => handle(res, async () => {
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    const kase = await cases.humanReview(req.params.id, parsed.data.executionId, parsed.data.decision, staffEmail(req), parsed.data.expectedVersion);
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
