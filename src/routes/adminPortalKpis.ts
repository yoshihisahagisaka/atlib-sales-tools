import { Router } from 'express';
import { FiscalYearPeriod, ItKaizenPortalKpiAdapter, parseFiscalYear } from '../services/itKaizenPortalKpiAdapter';

function unsupportedCommercialMetrics() {
  return {
    proposedCount: { value: null, status: 'UNSUPPORTED' },
    wonCount: { value: null, status: 'UNSUPPORTED' },
    acceptedToWonRate: { value: null, status: 'UNSUPPORTED' },
  };
}

function unavailableResponse(period: FiscalYearPeriod) {
  return {
    error: 'PORTAL_KPI_UNAVAILABLE', period,
    common: { acceptedCount: { value: null, status: 'ERROR' }, ...unsupportedCommercialMetrics() },
    services: {
      IT_KAIZEN: { status: 'ERROR', acceptedCount: { value: null, status: 'ERROR' } },
      BUSINESS_KAIZEN: { status: 'UNCONNECTED', acceptedCount: { value: null, status: 'UNAVAILABLE' } },
    },
  };
}

export function createAdminPortalKpisRouter(
  adapter: ItKaizenPortalKpiAdapter,
  now: () => Date = () => new Date(),
): Router {
  const router = Router();
  router.get('/', async (req, res) => {
    let period;
    try {
      period = parseFiscalYear(req.query.fiscalYear, now());
    } catch {
      res.status(400).json({ error: 'INVALID_FISCAL_YEAR' });
      return;
    }
    try {
      const acceptedCount = await adapter.countAcceptedSubjects(period);
      res.json({
        period,
        common: {
          acceptedCount: {
            value: null, status: 'PARTIAL',
            connectedBusinessLines: ['IT_KAIZEN'], missingBusinessLines: ['BUSINESS_KAIZEN'],
          },
          ...unsupportedCommercialMetrics(),
        },
        services: {
          IT_KAIZEN: { status: 'AVAILABLE', acceptedCount: { value: acceptedCount, status: 'AVAILABLE' } },
          BUSINESS_KAIZEN: { status: 'UNCONNECTED', acceptedCount: { value: null, status: 'UNAVAILABLE' } },
        },
      });
    } catch {
      res.status(503).json(unavailableResponse(period));
    }
  });
  return router;
}
