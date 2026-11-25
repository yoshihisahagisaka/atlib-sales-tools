import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { contentHash } from '../domain/diagnosisReport';
import type { PreparationOutput } from '../domain/paidAssessmentPreparation';
import type { PreparationAgenda } from '../domain/paidAssessmentPreparationAgenda';
import {
  DesignV2AssessmentEligibilityError,
  readDesignV2AssessmentEligibility,
  type DesignV2AssessmentEligibility,
} from './designV2AssessmentEligibility';
import {
  FreeDiagnosisDesignV2PersistenceRepo,
  type DesignV2StoredReportDraft,
} from './freeDiagnosisDesignV2PersistenceRepo';
import {
  PaidAssessmentSourceHandoffRepo,
  PaidAssessmentSourceHandoffError,
  type PaidAssessmentSourceHandoff,
} from './paidAssessmentSourceHandoffRepo';
import {
  preparePaidAssessmentFromDesignV2,
  type DesignV2PreparationSelection,
  type DesignV2PreparationBridgeResult,
} from './paidAssessmentPreparationBridge';

export const paidAssessmentPreparationSelectionSchema = z.object({
  futureEntryIndex: z.number().int().min(0),
  candidates: z.array(z.object({
    candidateId: z.string().trim().min(1).max(200),
    area: z.enum(['TECHNOLOGY', 'OPERATION', 'MANAGEMENT']),
    confirmationQuestion: z.string().trim().min(1).max(1000).optional(),
    requestedFrom: z.string().trim().min(1).max(200).optional(),
  }).strict()).max(100),
}).strict();

export interface SavedPreparationSelection {
  id: string;
  sourceCaseId: string;
  handoffId: string;
  version: number;
  selection: DesignV2PreparationSelection;
  selectionHash: string;
  createdByUserId: string;
  createdAt: string;
}

export interface PreparationSelectionView {
  saved: SavedPreparationSelection | null;
  preparation: PreparationOutput | null;
  agenda: PreparationAgenda | null;
}

export class PaidAssessmentPreparationSelectionError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = 'PaidAssessmentPreparationSelectionError';
  }
}

type SelectionRow = {
  id: unknown; source_case_id: unknown; handoff_id: unknown; version: unknown;
  selection_json: unknown; selection_hash: unknown;
  created_by_user_id: unknown; created_at: unknown;
};
type CurrentContext = { handoff: PaidAssessmentSourceHandoff; report: DesignV2StoredReportDraft };
const uuid = z.string().uuid();
const hexHash = /^[0-9a-f]{64}$/;

function checkActor(caseId: string, actorEmail: string): void {
  if (!uuid.safeParse(caseId).success) throw new PaidAssessmentPreparationSelectionError(400, 'INVALID_CASE_ID');
  if (typeof actorEmail !== 'string' || !actorEmail.trim()) {
    throw new PaidAssessmentPreparationSelectionError(403, 'STAFF_REQUIRED');
  }
}

function matchEligibility(handoff: PaidAssessmentSourceHandoff, current: DesignV2AssessmentEligibility): boolean {
  const snapshot = handoff.snapshot.eligibility;
  const f = snapshot.feedbackDecision; const fr = current.feedbackDecision;
  const p = snapshot.report; const pr = current.report;
  return snapshot.caseId === current.caseId
    && f.id === fr.id && f.version === fr.version && f.contextHash === fr.contextHash
    && f.decidedByUserId === fr.decidedByUserId && f.decidedAt === fr.decidedAt
    && p.id === pr.id && p.version === pr.version && p.contentHash === pr.contentHash
    && p.approvalSnapshotHash === pr.approvalSnapshotHash;
}

function decodeRow(row: SelectionRow, handoff: PaidAssessmentSourceHandoff): SavedPreparationSelection {
  const parsed = paidAssessmentPreparationSelectionSchema.safeParse(row.selection_json);
  const createdAt = row.created_at instanceof Date ? row.created_at.toISOString()
    : typeof row.created_at === 'string' && Number.isFinite(Date.parse(row.created_at))
      ? new Date(row.created_at).toISOString() : null;
  if (!uuid.safeParse(row.id).success || row.source_case_id !== handoff.sourceCaseId
    || row.handoff_id !== handoff.id || !Number.isInteger(row.version) || Number(row.version) < 1
    || typeof row.selection_hash !== 'string' || !hexHash.test(row.selection_hash)
    || !parsed.success || contentHash(parsed.data) !== row.selection_hash
    || typeof row.created_by_user_id !== 'string' || !row.created_by_user_id.trim()
    || !createdAt) {
    throw new PaidAssessmentPreparationSelectionError(409, 'PREPARATION_SELECTION_INTEGRITY_MISMATCH');
  }
  return {
    id: row.id as string, sourceCaseId: row.source_case_id as string,
    handoffId: row.handoff_id as string, version: row.version as number,
    selection: parsed.data, selectionHash: row.selection_hash,
    createdByUserId: row.created_by_user_id as string, createdAt,
  };
}

function compute(handoff: PaidAssessmentSourceHandoff, report: DesignV2StoredReportDraft,
  selection: DesignV2PreparationSelection): DesignV2PreparationBridgeResult {
  try {
    return preparePaidAssessmentFromDesignV2(handoff, report, selection);
  } catch (error) {
    if (error instanceof TypeError && error.message.startsWith('E3_')) {
      const sourceError = ['E3_HANDOFF_INTEGRITY_MISMATCH', 'E3_REPORT_INTEGRITY_MISMATCH'];
      throw new PaidAssessmentPreparationSelectionError(
        sourceError.includes(error.message) ? 409 : 400,
        sourceError.includes(error.message) ? 'HANDOFF_STALE' : 'INVALID_SELECTION',
      );
    }
    throw error;
  }
}

function toView(saved: SavedPreparationSelection, bridge: DesignV2PreparationBridgeResult): PreparationSelectionView {
  return { saved, preparation: bridge.preparation, agenda: bridge.agenda };
}

const columns = 'id,source_case_id,handoff_id,version,selection_json,selection_hash,created_by_user_id,created_at';

/**
 * Human draft only. Current authority belongs to E1 eligibility; E3 is a pure projection.
 * Source and handoff data are always read from staff-server repositories, never from the HTTP body.
 */
export class PaidAssessmentPreparationSelectionRepo {
  private readonly handoffs: PaidAssessmentSourceHandoffRepo;
  private readonly reports: FreeDiagnosisDesignV2PersistenceRepo;

  constructor(private readonly pool: Pool) {
    this.handoffs = new PaidAssessmentSourceHandoffRepo(pool);
    this.reports = new FreeDiagnosisDesignV2PersistenceRepo(pool);
  }

  private async current(caseId: string, actorEmail: string): Promise<CurrentContext> {
    checkActor(caseId, actorEmail);
    let handoff: PaidAssessmentSourceHandoff | null;
    try { handoff = await this.handoffs.latest(caseId, actorEmail); }
    catch (error) {
      if (error instanceof PaidAssessmentSourceHandoffError) {
        throw new PaidAssessmentPreparationSelectionError(error.status, error.code);
      }
      throw error;
    }
    if (!handoff) {
      const found = await this.pool.query('SELECT 1 FROM it_management_diagnosis_case_v2 WHERE id=$1', [caseId]);
      throw new PaidAssessmentPreparationSelectionError(found.rowCount ? 409 : 404,
        found.rowCount ? 'HANDOFF_REQUIRED' : 'CASE_NOT_FOUND');
    }
    await this.assertCurrent(this.pool, caseId, handoff);
    let report: DesignV2StoredReportDraft;
    try { report = await this.reports.getDesignV2ReportDraft(caseId, handoff.reportId); }
    catch { throw new PaidAssessmentPreparationSelectionError(409, 'HANDOFF_STALE'); }
    if (report.status !== 'DELIVERED' || report.id !== handoff.reportId
      || report.version !== handoff.snapshot.eligibility.report.version
      || contentHash(report.content) !== handoff.snapshot.eligibility.report.contentHash) {
      throw new PaidAssessmentPreparationSelectionError(409, 'HANDOFF_STALE');
    }
    return { handoff, report };
  }

  private async assertCurrent(pool: Pick<Pool, 'query'> | PoolClient, caseId: string,
    handoff: PaidAssessmentSourceHandoff): Promise<void> {
    let current: DesignV2AssessmentEligibility;
    try { current = await readDesignV2AssessmentEligibility(pool, caseId); }
    catch (error) {
      if (error instanceof DesignV2AssessmentEligibilityError) {
        throw new PaidAssessmentPreparationSelectionError(error.code === 'CASE_NOT_FOUND' ? 404 : 409,
          error.code === 'CASE_NOT_FOUND' ? 'CASE_NOT_FOUND' : 'HANDOFF_STALE');
      }
      throw error;
    }
    if (!matchEligibility(handoff, current)) {
      throw new PaidAssessmentPreparationSelectionError(409, 'HANDOFF_STALE');
    }
  }

  async latest(caseId: string, actorEmail: string): Promise<PreparationSelectionView> {
    const { handoff, report } = await this.current(caseId, actorEmail);
    const result = await this.pool.query<SelectionRow>(
      `SELECT ${columns} FROM paid_assessment_preparation_selection_v1
        WHERE handoff_id=$1 ORDER BY version DESC LIMIT 1`, [handoff.id],
    );
    const row = result.rows[0];
    if (!row) return { saved: null, preparation: null, agenda: null };
    const saved = decodeRow(row, handoff);
    return toView(saved, compute(handoff, report, saved.selection));
  }

  async save(caseId: string, actorEmail: string, selection: DesignV2PreparationSelection):
    Promise<{ created: boolean; view: PreparationSelectionView }> {
    checkActor(caseId, actorEmail);
    const parsed = paidAssessmentPreparationSelectionSchema.safeParse(selection);
    if (!parsed.success) throw new PaidAssessmentPreparationSelectionError(400, 'INVALID_SELECTION');
    const context = await this.current(caseId, actorEmail);
    const selectionValue = parsed.data;
    const projection = compute(context.handoff, context.report, selectionValue);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const lock = await client.query('SELECT id FROM it_management_diagnosis_case_v2 WHERE id=$1 FOR UPDATE', [caseId]);
      if (!lock.rows[0]) throw new PaidAssessmentPreparationSelectionError(404, 'CASE_NOT_FOUND');
      await this.assertCurrent(client, caseId, context.handoff);
      const latestHandoff = await client.query<{ id: string }>(
        'SELECT id FROM paid_assessment_source_handoff_v2 WHERE source_case_id=$1 ORDER BY version DESC LIMIT 1',
        [caseId],
      );
      if (latestHandoff.rows[0]?.id !== context.handoff.id) {
        throw new PaidAssessmentPreparationSelectionError(409, 'HANDOFF_STALE');
      }
      const prior = await client.query<SelectionRow>(
        `SELECT ${columns} FROM paid_assessment_preparation_selection_v1
          WHERE handoff_id=$1 ORDER BY version DESC LIMIT 1`, [context.handoff.id],
      );
      const old = prior.rows[0] ? decodeRow(prior.rows[0], context.handoff) : null;
      const selectionHash = contentHash(selectionValue);
      if (old && old.selectionHash === selectionHash) {
        await client.query('COMMIT');
        return { created: false, view: toView(old, compute(context.handoff, context.report, old.selection)) };
      }
      const id = randomUUID();
      const version = (old?.version ?? 0) + 1;
      const inserted = await client.query<SelectionRow>(
        `INSERT INTO paid_assessment_preparation_selection_v1
          (id,source_case_id,handoff_id,version,selection_json,selection_hash,created_by_user_id)
         VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)
         RETURNING ${columns}`,
        [id, caseId, context.handoff.id, version, JSON.stringify(selectionValue), selectionHash, actorEmail],
      );
      await client.query(
        `INSERT INTO it_management_diagnosis_case_v2_audit
          (id,case_id,command,actor_user_id,detail_json)
         VALUES($1,$2,'RecordPaidAssessmentPreparationSelection',$3,$4::jsonb)`,
        [randomUUID(), caseId, actorEmail, JSON.stringify({
          selectionId: id, version, handoffId: context.handoff.id, selectionHash,
        })],
      );
      await client.query('COMMIT');
      return {
        created: true,
        view: toView(decodeRow(inserted.rows[0] as SelectionRow, context.handoff), projection),
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if ((error as { code?: string }).code === '23505') {
        throw new PaidAssessmentPreparationSelectionError(409, 'PREPARATION_SELECTION_CONFLICT');
      }
      throw error;
    } finally { client.release(); }
  }
}
