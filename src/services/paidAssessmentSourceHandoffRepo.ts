import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { contentHash } from '../domain/diagnosisReport';
import {
  DesignV2AssessmentEligibilityError,
  readDesignV2AssessmentEligibility,
  type DesignV2AssessmentEligibility,
} from './designV2AssessmentEligibility';

export interface PaidAssessmentSourceHandoffSnapshot {
  schemaVersion: 1;
  sourceKind: 'FREE_DIAGNOSIS_DESIGN_V2';
  eligibility: DesignV2AssessmentEligibility;
}

export interface PaidAssessmentSourceHandoff {
  id: string;
  sourceCaseId: string;
  version: number;
  feedbackDecisionId: string;
  reportId: string;
  snapshot: PaidAssessmentSourceHandoffSnapshot;
  snapshotHash: string;
  createdByUserId: string;
  createdAt: string;
}

export interface CreatePaidAssessmentSourceHandoffResult {
  created: boolean;
  handoff: PaidAssessmentSourceHandoff;
}

export class PaidAssessmentSourceHandoffError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = 'PaidAssessmentSourceHandoffError';
  }
}

type HandoffRow = {
  id: unknown; source_case_id: unknown; version: unknown; feedback_decision_id: unknown;
  report_id: unknown; snapshot_json: unknown; snapshot_hash: unknown;
  created_by_user_id: unknown; created_at: unknown;
};

const uuid = z.string().uuid();
const hash = /^[0-9a-f]{64}$/;
const snapshotSchema = z.object({
  schemaVersion: z.literal(1),
  sourceKind: z.literal('FREE_DIAGNOSIS_DESIGN_V2'),
  eligibility: z.object({
    caseId: z.string().uuid(),
    feedbackDecision: z.object({
      id: z.string().uuid(),
      version: z.number().int().positive(),
      contextHash: z.string().regex(hash),
      decidedByUserId: z.string().trim().min(1),
      decidedAt: z.string().datetime(),
    }).strict(),
    report: z.object({
      id: z.string().uuid(),
      version: z.number().int().positive(),
      contentHash: z.string().regex(hash),
      approvalSnapshotHash: z.string().regex(hash),
    }).strict(),
  }).strict(),
}).strict();

function timestamp(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function mapRow(row: HandoffRow): PaidAssessmentSourceHandoff {
  const parsedSnapshot = snapshotSchema.safeParse(row.snapshot_json);
  const snapshot = parsedSnapshot.success ? parsedSnapshot.data : null;
  const eligibility = snapshot?.eligibility;
  const createdAt = timestamp(row.created_at);
  const valid = uuid.safeParse(row.id).success
    && uuid.safeParse(row.source_case_id).success
    && Number.isInteger(row.version) && Number(row.version) > 0
    && uuid.safeParse(row.feedback_decision_id).success
    && uuid.safeParse(row.report_id).success
    && typeof row.snapshot_hash === 'string' && hash.test(row.snapshot_hash)
    && typeof row.created_by_user_id === 'string' && row.created_by_user_id.trim() !== ''
    && createdAt
    && snapshot !== null
    && eligibility !== undefined
    && eligibility.caseId === row.source_case_id
    && eligibility.feedbackDecision?.id === row.feedback_decision_id
    && eligibility.report?.id === row.report_id
    && contentHash(snapshot) === row.snapshot_hash;
  if (!valid) throw new PaidAssessmentSourceHandoffError(409, 'HANDOFF_INTEGRITY_MISMATCH');
  return {
    id: row.id as string,
    sourceCaseId: row.source_case_id as string,
    version: row.version as number,
    feedbackDecisionId: row.feedback_decision_id as string,
    reportId: row.report_id as string,
    snapshot: snapshot as PaidAssessmentSourceHandoffSnapshot,
    snapshotHash: row.snapshot_hash as string,
    createdByUserId: row.created_by_user_id as string,
    createdAt: createdAt as string,
  };
}

function validateInput(sourceCaseId: string, actorEmail: string): void {
  if (!uuid.safeParse(sourceCaseId).success) throw new PaidAssessmentSourceHandoffError(400, 'INVALID_CASE_ID');
  if (typeof actorEmail !== 'string' || actorEmail.trim() === '') {
    throw new PaidAssessmentSourceHandoffError(403, 'STAFF_REQUIRED');
  }
}

export class PaidAssessmentSourceHandoffRepo {
  constructor(private readonly pool: Pool) {}

  async create(sourceCaseId: string, actorEmail: string): Promise<CreatePaidAssessmentSourceHandoffResult> {
    validateInput(sourceCaseId, actorEmail);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query('SELECT id FROM it_management_diagnosis_case_v2 WHERE id=$1 FOR UPDATE', [sourceCaseId]);
      if (!locked.rows[0]) throw new PaidAssessmentSourceHandoffError(404, 'CASE_NOT_FOUND');

      let eligibility: DesignV2AssessmentEligibility;
      try {
        eligibility = await readDesignV2AssessmentEligibility(client, sourceCaseId);
      } catch (error) {
        if (error instanceof DesignV2AssessmentEligibilityError) {
          throw new PaidAssessmentSourceHandoffError(error.code === 'CASE_NOT_FOUND' ? 404 : 409, error.code);
        }
        throw error;
      }
      const snapshot: PaidAssessmentSourceHandoffSnapshot = {
        schemaVersion: 1,
        sourceKind: 'FREE_DIAGNOSIS_DESIGN_V2',
        eligibility,
      };
      const snapshotHash = contentHash(snapshot);
      const latestResult = await client.query<HandoffRow>(
        `SELECT id,source_case_id,version,feedback_decision_id,report_id,snapshot_json,snapshot_hash,created_by_user_id,created_at
           FROM paid_assessment_source_handoff_v2 WHERE source_case_id=$1 ORDER BY version DESC LIMIT 1`,
        [sourceCaseId],
      );
      const current = latestResult.rows[0] ? mapRow(latestResult.rows[0]) : null;
      if (current?.feedbackDecisionId === eligibility.feedbackDecision.id) {
        if (current.snapshotHash !== snapshotHash) {
          throw new PaidAssessmentSourceHandoffError(409, 'HANDOFF_SOURCE_CONFLICT');
        }
        await client.query('COMMIT');
        return { created: false, handoff: current };
      }

      const id = randomUUID();
      const version = (current?.version ?? 0) + 1;
      const inserted = await client.query<HandoffRow>(
        `INSERT INTO paid_assessment_source_handoff_v2
          (id,source_case_id,version,feedback_decision_id,report_id,snapshot_json,snapshot_hash,created_by_user_id)
         VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
         RETURNING id,source_case_id,version,feedback_decision_id,report_id,snapshot_json,snapshot_hash,created_by_user_id,created_at`,
        [id, sourceCaseId, version, eligibility.feedbackDecision.id, eligibility.report.id,
          JSON.stringify(snapshot), snapshotHash, actorEmail],
      );
      await client.query(
        `INSERT INTO it_management_diagnosis_case_v2_audit
          (id,case_id,command,actor_user_id,detail_json) VALUES($1,$2,'CreatePaidAssessmentSourceHandoff',$3,$4::jsonb)`,
        [randomUUID(), sourceCaseId, actorEmail, JSON.stringify({
          handoffId: id, sourceCaseId, version, feedbackDecisionId: eligibility.feedbackDecision.id,
          reportId: eligibility.report.id, snapshotHash,
        })],
      );
      await client.query('COMMIT');
      return { created: true, handoff: mapRow(inserted.rows[0] as HandoffRow) };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if ((error as { code?: string }).code === '23505') {
        throw new PaidAssessmentSourceHandoffError(409, 'HANDOFF_CONFLICT');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async latest(sourceCaseId: string, actorEmail: string): Promise<PaidAssessmentSourceHandoff | null> {
    validateInput(sourceCaseId, actorEmail);
    const result = await this.pool.query<HandoffRow>(
      `SELECT id,source_case_id,version,feedback_decision_id,report_id,snapshot_json,snapshot_hash,created_by_user_id,created_at
         FROM paid_assessment_source_handoff_v2 WHERE source_case_id=$1 ORDER BY version DESC LIMIT 1`,
      [sourceCaseId],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

}
