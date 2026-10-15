import { Router } from 'express';
import { aggregateSurveyMonths } from '../domain/surveyMonthlySummary';
import { japanYearMonth } from '../domain/surveyMonthlyCounter';
import type { SurveyMonthlyCounterRepo } from '../services/surveyMonthlyCounterRepo';

/**
 * Service-owned read-only survey count summary.
 * Mount only behind existing adminAuthGate after the approved migration.
 * No CRM updates, no customer identities, no common KPI data duplication.
 */
export function createAdminSurveyKpiSummaryRouter(
  repo: SurveyMonthlyCounterRepo,
  coverageStart: Date,
): Router {
  const router = Router();
  router.get('/summary', async (_req, res) => {
    const currentMonth = japanYearMonth(new Date());
    const coverageStartMonth = japanYearMonth(coverageStart);
    try {
      const currentYear = Number(currentMonth.slice(0, 4));
      const fromMonth = `${currentYear - 2}-01-01`;
      const untilMonth = `${currentYear + 1}-01-01`;
      const rows = await repo.listMonthly(fromMonth, untilMonth);
      const summary = aggregateSurveyMonths(
        rows.map(row => ({
          month: row.month.slice(0, 7),
          startedCount: row.startedCount,
          completedCount: row.completedCount,
        })),
        currentMonth,
        coverageStartMonth,
      );
      res.setHeader('Cache-Control', 'no-store');
      res.json({ serviceKey: 'IT_KAIZEN', fiscalYearStartMonth: 2, coverageStart: coverageStart.toISOString(), summary });
    } catch {
      res.status(503).json({ error: 'SURVEY_KPI_UNAVAILABLE' });
    }
  });
  return router;
}
