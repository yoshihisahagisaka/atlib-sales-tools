import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { createCompanySchema, SELECTED_SERVICE } from '../domain/freeDiagnosisRuleBasedV1';
import { SalesCustomerError, type SalesCustomerRepo } from '../services/salesCustomerRepo';

const companyId = z.string().uuid();
const activityId = z.string().uuid();
const companyInput = createCompanySchema.pick({ name: true, corporateNumber: true }).strict();
const contactInput = createCompanySchema.shape.contact.strict();
const activityInput = z.object({
  companyId,
  contactId: z.string().uuid(),
  selectedService: z.enum(SELECTED_SERVICE),
  referralPersonName: createCompanySchema.shape.referralPersonName,
  attribution: createCompanySchema.shape.attribution,
}).strict();

function run(res: Response, fn: () => Promise<void>): void {
  void fn().catch(err => {
    if (err instanceof SalesCustomerError) { res.status(err.status).json({ error: err.code }); return; }
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  });
}

function actor(req: Request): string {
  if (!req.staffEmail) throw new SalesCustomerError(401, 'STAFF_AUTH_REQUIRED');
  return req.staffEmail;
}

export function createAdminSalesCustomersRouter(repo: SalesCustomerRepo): Router {
  const router = Router();
  router.get('/companies', (req, res) => run(res, async () => {
    actor(req);
    const parsed = z.object({ q: z.string().trim().min(2).max(100) }).strict().safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    res.json({ items: await repo.searchCompanies(parsed.data.q) });
  }));
  router.get('/companies/:companyId/contacts', (req, res) => run(res, async () => {
    actor(req);
    const id = companyId.safeParse(req.params.companyId);
    if (!id.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    res.json({ items: await repo.listContacts(id.data) });
  }));
  router.get('/activities/:salesActivityId', (req, res) => run(res, async () => {
    actor(req);
    const id = activityId.safeParse(req.params.salesActivityId);
    if (!id.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    res.json(await repo.getActivity(id.data));
  }));
  router.post('/companies', (req, res) => run(res, async () => {
    const email = actor(req);
    const parsed = companyInput.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    res.status(201).json(await repo.createCompany(parsed.data, email));
  }));
  router.post('/companies/:companyId/contacts', (req, res) => run(res, async () => {
    actor(req);
    const id = companyId.safeParse(req.params.companyId);
    const parsed = contactInput.safeParse(req.body);
    if (!id.success || !parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    res.status(201).json(await repo.createContact(id.data, parsed.data));
  }));
  router.post('/activities', (req, res) => run(res, async () => {
    const email = actor(req);
    const parsed = activityInput.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    res.status(201).json(await repo.createActivityForExisting(parsed.data, email));
  }));
  return router;
}
