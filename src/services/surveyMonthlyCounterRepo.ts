import type { Pool } from 'pg';
import { japanYearMonth, type SurveyCountKind } from '../domain/surveyMonthlyCounter';
import { surveyAttributionBucket } from '../domain/surveyCounterAttribution';

/**
 * Service-owned aggregate counter. Requires the reviewed additive migration
 * corresponding to docs/sql/it-kaizen-survey-monthly-counter-schema-draft.sql.
 * Not wired to a public endpoint until security/attribution review is complete.
 */
export class SurveyMonthlyCounterRepo {
  constructor(private readonly pool: Pool) {}

  async increment(input: {
    kind: SurveyCountKind;
    initiativeId: string | null;
    acceptedAt: Date;
  }): Promise<void> {
    const month = japanYearMonth(input.acceptedAt);
    const monthStart = `${month}-01`;
    const bucket = surveyAttributionBucket(input.initiativeId);
    const started = input.kind === 'STARTED' ? 1 : 0;
    const completed = input.kind === 'COMPLETED' ? 1 : 0;
    // Atomic upsert: no read-modify-write race; no per-attempt rows.
    await this.pool.query(
      `INSERT INTO it_kaizen_survey_monthly_counts
         (month_jst,service_key,initiative_id,attribution_bucket,started_count,completed_count)
       VALUES ($1,'IT_KAIZEN',$2,$3,$4,$5)
       ON CONFLICT (month_jst,service_key,attribution_bucket)
       DO UPDATE SET started_count=it_kaizen_survey_monthly_counts.started_count+EXCLUDED.started_count,
                     completed_count=it_kaizen_survey_monthly_counts.completed_count+EXCLUDED.completed_count,
                     updated_at=now()`,
      [monthStart, input.initiativeId, bucket, started, completed],
    );
  }

  async listMonthly(fromMonthInclusive: string, toMonthExclusive: string) {
    const { rows } = await this.pool.query<{
      month_jst: string; initiative_id: string | null;
      started_count: string; completed_count: string;
    }>(
      `SELECT month_jst,initiative_id,started_count,completed_count
       FROM it_kaizen_survey_monthly_counts
       WHERE month_jst >= $1::date AND month_jst < $2::date
       ORDER BY month_jst,attribution_bucket`,
      [fromMonthInclusive, toMonthExclusive],
    );
    return rows.map(row => ({
      month: String(row.month_jst).slice(0, 10),
      initiativeId: row.initiative_id,
      startedCount: Number(row.started_count),
      completedCount: Number(row.completed_count),
    }));
  }
}
