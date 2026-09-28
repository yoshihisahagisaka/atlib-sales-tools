import type { QueryResult } from 'pg';

type Client = { query(sql: string): Promise<unknown>; release(): void };
type Pool = { connect(): Promise<Client> };
type Row = Record<string, unknown>;

export type DeletionReadinessEvidence = Readonly<{
  schema: 'public.diagnosis_deletion_requests';
  status_counts: readonly Readonly<{ status: string; count: string }>[];
  approved_total: string;
  first_tick_candidate_count: string;
  candidate_scope_class_counts: readonly Readonly<{ data_class: string; count: string }>[];
  candidate_active_hold_counts: readonly Readonly<{ hold_state: string; count: string }>[];
  candidate_restricted_retention_counts: readonly Readonly<{ restricted_retention: string; count: string }>[];
  pause_approved_hour_counts: readonly Readonly<{ hour_utc: string; count: string }>[];
  non_candidate_status_counts: readonly Readonly<{ status: string; count: string }>[];
  candidate_action_counts: readonly Readonly<{ action: string; count: string }>[];
  runtime_role_privileges: Readonly<{ runtime_role: string; can_select_deletion_requests: boolean; can_select_retention_holds: boolean; can_select_cases: boolean }>;
}>;

const BEGIN_READ_ONLY = 'BEGIN READ ONLY';
const SET_STATEMENT_TIMEOUT = "SET LOCAL statement_timeout = '5s'";
const ROLLBACK = 'ROLLBACK';
// Fixed P2-39 pause start; this is evidence only, not a worker eligibility condition.
const PAUSE_START = "TIMESTAMPTZ '2026-09-28 00:18:37.223771+00'";
const CANDIDATES = `WITH candidates AS (
  SELECT id, diagnosis_case_id, scoped_data_classes, restricted_retention_json
  FROM public.diagnosis_deletion_requests
  WHERE status='APPROVED'
  ORDER BY approved_at ASC
  LIMIT 20
)`;
const STATUS_COUNTS = "SELECT status, count(*)::text AS count FROM public.diagnosis_deletion_requests GROUP BY status ORDER BY status";
const APPROVED_TOTAL = "SELECT count(*)::text AS count FROM public.diagnosis_deletion_requests WHERE status='APPROVED'";
const FIRST_TICK_COUNT = `${CANDIDATES} SELECT count(*)::text AS count FROM candidates`;
const SCOPE_CLASS_COUNTS = `${CANDIDATES}
SELECT scope.value AS data_class, count(*)::text AS count
FROM candidates c CROSS JOIN LATERAL jsonb_array_elements_text(c.scoped_data_classes) AS scope(value)
GROUP BY scope.value ORDER BY scope.value`;
const ACTIVE_HOLD_COUNTS = `${CANDIDATES}
SELECT CASE WHEN EXISTS (SELECT 1 FROM public.diagnosis_retention_holds h WHERE h.diagnosis_case_id=c.diagnosis_case_id AND h.ended_at IS NULL AND (h.expires_at IS NULL OR h.expires_at > now())) THEN 'HAS_ACTIVE_HOLD' ELSE 'NO_ACTIVE_HOLD' END AS hold_state, count(*)::text AS count
FROM candidates c GROUP BY 1 ORDER BY 1`;
const RESTRICTED_RETENTION_COUNTS = `${CANDIDATES}
SELECT CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(c.restricted_retention_json) r WHERE COALESCE(r->>'dataClass','')<>'') THEN 'HAS_RESTRICTED_RETENTION' ELSE 'NO_RESTRICTED_RETENTION' END AS restricted_retention, count(*)::text AS count
FROM candidates c GROUP BY 1 ORDER BY 1`;
const PAUSE_APPROVED_HOURS = `SELECT date_trunc('hour', approved_at) AS hour_utc, count(*)::text AS count
FROM public.diagnosis_deletion_requests
WHERE status='APPROVED' AND approved_at >= ${PAUSE_START}
GROUP BY 1 ORDER BY 1`;
const NON_CANDIDATE_STATUS_COUNTS = "SELECT status, count(*)::text AS count FROM public.diagnosis_deletion_requests WHERE status<>'APPROVED' GROUP BY status ORDER BY status";
const ACTION_COUNTS = `${CANDIDATES}, scope AS (
  SELECT c.id, c.diagnosis_case_id, c.restricted_retention_json, value AS data_class
  FROM candidates c CROSS JOIN LATERAL jsonb_array_elements_text(c.scoped_data_classes) AS value
), classified AS (
  SELECT s.*,
    EXISTS (SELECT 1 FROM public.diagnosis_retention_holds h WHERE h.diagnosis_case_id=s.diagnosis_case_id AND h.data_class=s.data_class AND h.ended_at IS NULL AND (h.expires_at IS NULL OR h.expires_at > now())) AS held,
    EXISTS (SELECT 1 FROM jsonb_array_elements(s.restricted_retention_json) r WHERE r->>'dataClass'=s.data_class) AS decision_restricted
  FROM scope s
), actions AS (
  SELECT 'POTENTIAL_RAW_ANONYMIZATION_SCOPE'::text AS action, count(*)::text AS count
  FROM classified WHERE data_class IN ('GENERAL_RAW_DIAGNOSIS','TRANSCRIPT_RECORDING','RAW_AI_IO') AND NOT held AND NOT decision_restricted
  UNION ALL
  SELECT 'RESTRICT_RETAIN_SCOPE', count(*)::text FROM classified
  WHERE data_class='APPROVED_DECISION_EVIDENCE' OR held OR decision_restricted
  UNION ALL
  SELECT 'SHARED_ORGANIZATION_FAIL_CLOSED_REQUEST', count(*)::text
  FROM (SELECT DISTINCT diagnosis_case_id FROM classified x WHERE x.data_class='GENERAL_RAW_DIAGNOSIS' AND NOT x.held AND NOT x.decision_restricted) eligible
  JOIN public.diagnosis_cases c ON c.id=eligible.diagnosis_case_id
  WHERE (SELECT count(*) FROM public.diagnosis_cases peer WHERE peer.organization_id=c.organization_id)<>1
) SELECT action, count FROM actions ORDER BY action`;
const PRIVILEGES = "SELECT current_user AS runtime_role, has_table_privilege(current_user, 'public.diagnosis_deletion_requests', 'SELECT') AS can_select_deletion_requests, has_table_privilege(current_user, 'public.diagnosis_retention_holds', 'SELECT') AS can_select_retention_holds, has_table_privilege(current_user, 'public.diagnosis_cases', 'SELECT') AS can_select_cases";

function fail(): never { throw new Error('DELETION_READINESS_VERIFICATION_FAILED'); }
function rows(result: unknown): readonly Row[] { const value = result as QueryResult<Row>; if (!Array.isArray(value?.rows)) fail(); return value.rows; }
function text(value: unknown): string { if (typeof value !== 'string') fail(); return value; }
function keyed(result: unknown, key: string): readonly Readonly<Record<string, string>>[] {
  return rows(result).map((row) => { if (Object.keys(row).sort().join(',') !== [key, 'count'].sort().join(',')) fail(); return Object.freeze({ [key]: text(row[key]), count: text(row.count) }); });
}
function count(result: unknown): string { const row = rows(result)[0]; if (!row || Object.keys(row).join(',') !== 'count') fail(); return text(row.count); }
function hours(result: unknown): DeletionReadinessEvidence['pause_approved_hour_counts'] {
  return rows(result).map((row) => { if (Object.keys(row).sort().join(',') !== 'count,hour_utc') fail(); const value = row.hour_utc instanceof Date ? row.hour_utc.toISOString() : text(row.hour_utc); return Object.freeze({ hour_utc: value, count: text(row.count) }); });
}
function privileges(result: unknown): DeletionReadinessEvidence['runtime_role_privileges'] {
  const row = rows(result)[0];
  if (!row || Object.keys(row).sort().join(',') !== 'can_select_cases,can_select_deletion_requests,can_select_retention_holds,runtime_role') fail();
  if (typeof row.runtime_role !== 'string' || typeof row.can_select_deletion_requests !== 'boolean' || typeof row.can_select_retention_holds !== 'boolean' || typeof row.can_select_cases !== 'boolean') fail();
  return Object.freeze({ runtime_role: row.runtime_role, can_select_deletion_requests: row.can_select_deletion_requests, can_select_retention_holds: row.can_select_retention_holds, can_select_cases: row.can_select_cases });
}

/** Fixed aggregate-only preflight. Candidate selection deliberately matches the worker's approved_at-only ordering. */
export async function verifyDeletionReadiness(pool: Pool): Promise<DeletionReadinessEvidence> {
  const client = await pool.connect(); let started = false;
  try {
    await client.query(BEGIN_READ_ONLY); started = true; await client.query(SET_STATEMENT_TIMEOUT);
    const status_counts = keyed(await client.query(STATUS_COUNTS), 'status') as DeletionReadinessEvidence['status_counts'];
    const approved_total = count(await client.query(APPROVED_TOTAL));
    const first_tick_candidate_count = count(await client.query(FIRST_TICK_COUNT));
    const candidate_scope_class_counts = keyed(await client.query(SCOPE_CLASS_COUNTS), 'data_class') as DeletionReadinessEvidence['candidate_scope_class_counts'];
    const candidate_active_hold_counts = keyed(await client.query(ACTIVE_HOLD_COUNTS), 'hold_state') as DeletionReadinessEvidence['candidate_active_hold_counts'];
    const candidate_restricted_retention_counts = keyed(await client.query(RESTRICTED_RETENTION_COUNTS), 'restricted_retention') as DeletionReadinessEvidence['candidate_restricted_retention_counts'];
    const pause_approved_hour_counts = hours(await client.query(PAUSE_APPROVED_HOURS));
    const non_candidate_status_counts = keyed(await client.query(NON_CANDIDATE_STATUS_COUNTS), 'status') as DeletionReadinessEvidence['non_candidate_status_counts'];
    const candidate_action_counts = keyed(await client.query(ACTION_COUNTS), 'action') as DeletionReadinessEvidence['candidate_action_counts'];
    const runtime_role_privileges = privileges(await client.query(PRIVILEGES));
    await client.query(ROLLBACK); started = false;
    return Object.freeze({ schema: 'public.diagnosis_deletion_requests', status_counts, approved_total, first_tick_candidate_count, candidate_scope_class_counts, candidate_active_hold_counts, candidate_restricted_retention_counts, pause_approved_hour_counts, non_candidate_status_counts, candidate_action_counts, runtime_role_privileges });
  } catch { if (started) { try { await client.query(ROLLBACK); } catch { /* fail closed */ } } fail(); } finally { client.release(); }
}

export const deletionReadinessSql = Object.freeze({ BEGIN_READ_ONLY, SET_STATEMENT_TIMEOUT, STATUS_COUNTS, APPROVED_TOTAL, FIRST_TICK_COUNT, SCOPE_CLASS_COUNTS, ACTIVE_HOLD_COUNTS, RESTRICTED_RETENTION_COUNTS, PAUSE_APPROVED_HOURS, NON_CANDIDATE_STATUS_COUNTS, ACTION_COUNTS, PRIVILEGES, ROLLBACK });
