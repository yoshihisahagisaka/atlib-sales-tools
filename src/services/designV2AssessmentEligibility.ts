import type { Pool } from 'pg';
import { z } from 'zod';
import { contentHash } from '../domain/diagnosisReport';

export type DesignV2AssessmentEligibilityErrorCode =
  | 'CASE_NOT_FOUND'
  | 'CASE_NOT_ELIGIBLE'
  | 'ASSESSMENT_ROUTE_NOT_SELECTED'
  | 'DECISION_INTEGRITY_MISMATCH'
  | 'REPORT_INTEGRITY_MISMATCH';

export class DesignV2AssessmentEligibilityError extends Error {
  constructor(readonly code: DesignV2AssessmentEligibilityErrorCode) {
    super(code);
    this.name = 'DesignV2AssessmentEligibilityError';
  }
}

export interface DesignV2AssessmentEligibility {
  caseId: string;
  feedbackDecision: {
    id: string;
    version: number;
    contextHash: string;
    decidedByUserId: string;
    decidedAt: string;
  };
  report: {
    id: string;
    version: number;
    contentHash: string;
    approvalSnapshotHash: string;
  };
}

type QueryPool = Pick<Pool, 'query'>;
type JsonObject = Record<string, unknown>;

const uuidSchema = z.string().uuid();
const hashPattern = /^[0-9a-f]{64}$/;

function objectValue(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function nonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function positiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function hashString(value: unknown): value is string {
  return typeof value === 'string' && hashPattern.test(value);
}

function timestamp(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export async function readDesignV2AssessmentEligibility(
  pool: QueryPool,
  caseId: string,
): Promise<DesignV2AssessmentEligibility> {
  if (!uuidSchema.safeParse(caseId).success) {
    throw new DesignV2AssessmentEligibilityError('CASE_NOT_FOUND');
  }

  const caseResult = await pool.query(
    `SELECT id,status,feedback_report_id
       FROM it_management_diagnosis_case_v2
      WHERE id=$1`,
    [caseId],
  );
  const kase = caseResult.rows[0] as JsonObject | undefined;
  if (!kase) throw new DesignV2AssessmentEligibilityError('CASE_NOT_FOUND');
  if (kase.status !== 'CLOSED' || !nonemptyString(kase.feedback_report_id)) {
    throw new DesignV2AssessmentEligibilityError('CASE_NOT_ELIGIBLE');
  }

  const decisionResult = await pool.query(
    `SELECT id,version,route_code,context_snapshot_json,context_hash,decided_by_user_id,decided_at
       FROM management_feedback_decisions
      WHERE it_management_diagnosis_case_v2_id=$1
      ORDER BY version DESC
      LIMIT 1`,
    [caseId],
  );
  const decision = decisionResult.rows[0] as JsonObject | undefined;
  if (!decision || decision.route_code !== 'DESIGN_ASSESSMENT') {
    throw new DesignV2AssessmentEligibilityError('ASSESSMENT_ROUTE_NOT_SELECTED');
  }

  const decisionSnapshot = objectValue(decision.context_snapshot_json);
  const decisionReport = objectValue(decisionSnapshot?.report);
  const decisionInput = objectValue(decisionSnapshot?.decision);
  const decidedAt = timestamp(decision.decided_at);
  if (
    !nonemptyString(decision.id)
    || !positiveInteger(decision.version)
    || !hashString(decision.context_hash)
    || !decisionSnapshot
    || contentHash(decisionSnapshot) !== decision.context_hash
    || decisionInput?.route !== 'DESIGN_ASSESSMENT'
    || !decisionReport
    || !nonemptyString(decisionReport.id)
    || !positiveInteger(decisionReport.version)
    || !hashString(decisionReport.content_hash)
    || !hashString(decisionReport.approval_snapshot_hash)
    || !nonemptyString(decision.decided_by_user_id)
    || !decidedAt
  ) {
    throw new DesignV2AssessmentEligibilityError('DECISION_INTEGRITY_MISMATCH');
  }

  const reportResult = await pool.query(
    `SELECT id,version,status,content_json,snapshot_json,policy_version,approved_by_user_id,approved_at
       FROM diagnosis_reports
      WHERE id=$1
        AND it_management_diagnosis_case_v2_id=$2`,
    [decisionReport.id, caseId],
  );
  const report = reportResult.rows[0] as JsonObject | undefined;
  const approvalSnapshot = objectValue(report?.snapshot_json);
  const reportContentHash = report ? contentHash(report.content_json) : null;
  if (
    !report
    || report.id !== decisionReport.id
    || report.id !== kase.feedback_report_id
    || report.status !== 'DELIVERED'
    || report.policy_version !== 'design-v2'
    || report.version !== decisionReport.version
    || !approvalSnapshot
    || reportContentHash !== decisionReport.content_hash
    || contentHash(approvalSnapshot) !== decisionReport.approval_snapshot_hash
    || approvalSnapshot.content_hash !== reportContentHash
    || !nonemptyString(report.approved_by_user_id)
    || !timestamp(report.approved_at)
    || !nonemptyString(approvalSnapshot.approved_by)
    || !timestamp(approvalSnapshot.approved_at)
  ) {
    throw new DesignV2AssessmentEligibilityError('REPORT_INTEGRITY_MISMATCH');
  }

  return {
    caseId,
    feedbackDecision: {
      id: decision.id,
      version: decision.version,
      contextHash: decision.context_hash,
      decidedByUserId: decision.decided_by_user_id,
      decidedAt,
    },
    report: {
      id: report.id as string,
      version: report.version as number,
      contentHash: decisionReport.content_hash,
      approvalSnapshotHash: decisionReport.approval_snapshot_hash,
    },
  };
}
