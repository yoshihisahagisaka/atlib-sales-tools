import { Router } from 'express';
import {
  CUSTOMER_FIT_CHECK_ITEMS,
  HUMAN_DECISION_OPTIONS,
  customerFitCheckInputSchema,
  listQuerySchema,
} from '../domain/customerFitCheck';
import type { CustomerFitCheckRepo } from '../services/customerFitCheckRepo';

/** requireStaffAuthの配下でマウントされる前提（server.ts側で適用）。 */
export function createAdminCustomerFitCheckRouter(repo: CustomerFitCheckRepo): Router {
  const router = Router();

  // フォーム描画用の項目マスタ（軸名・確認文・判定上の意味）。判定はここでは行わない。
  router.get('/items', (_req, res) => {
    res.json({ items: CUSTOMER_FIT_CHECK_ITEMS, humanDecisionOptions: HUMAN_DECISION_OPTIONS });
  });

  router.get('/', async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query' });
      return;
    }
    const { items, total } = await repo.list({
      humanDecision: parsed.data.humanDecision,
      limit: parsed.data.limit ?? 50,
      offset: parsed.data.offset ?? 0,
    });
    res.json({ items, total });
  });

  router.get('/:id', async (req, res) => {
    const item = await repo.findById(req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(item);
  });

  router.post('/', async (req, res) => {
    const parsed = customerFitCheckInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }
    const salesRepEmail = req.staffEmail;
    if (!salesRepEmail) {
      // requireStaffAuth配下でのみマウントされるため通常到達しないが、型上はoptionalなためガードする。
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const id = await repo.create(salesRepEmail, parsed.data);
    res.status(201).json({ id });
  });

  router.put('/:id', async (req, res) => {
    const parsed = customerFitCheckInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }
    const updated = await repo.update(req.params.id, parsed.data);
    if (!updated) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(204).end();
  });

  return router;
}
