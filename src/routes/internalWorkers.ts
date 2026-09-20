import { Router } from 'express';
import { requireSchedulerIdentity } from '../middleware/schedulerAuth';
import type { PreDiagnosisWorker } from '../services/preDiagnosisWorker';
import type { InterviewAssistantWorker } from '../services/interviewAssistantWorker';
import type { PostDiagnosisWorker } from '../services/postDiagnosisWorker';
import type { ReportDraftWorker } from '../services/reportDraftWorker';
import type { RetentionDeletionWorker } from '../services/retentionDeletionWorker';

/** Identifies deletion executions triggered by the durable Scheduler worker, distinct from a named staff operator. */
export const SCHEDULER_DELETION_ACTOR = 'system:scheduler-deletion-worker';

const AI_MAX_JOBS_PER_INVOCATION = 3;
const DELETION_MAX_REQUESTS_PER_INVOCATION = 20;
const SOFT_DEADLINE_MS = 200_000;

export function createInternalAiWorkerRouter(
  workers: [PreDiagnosisWorker, InterviewAssistantWorker, PostDiagnosisWorker, ReportDraftWorker],
  allowedServiceAccountEmail: string,
  audience: string,
): Router {
  const router = Router();
  router.post('/internal/workers/ai/tick', requireSchedulerIdentity(allowedServiceAccountEmail, audience), async (_req, res) => {
    const deadline = Date.now() + SOFT_DEADLINE_MS;
    let processed = 0;
    outer: while (processed < AI_MAX_JOBS_PER_INVOCATION && Date.now() < deadline) {
      let anyWork = false;
      for (const worker of workers) {
        if (processed >= AI_MAX_JOBS_PER_INVOCATION || Date.now() >= deadline) break outer;
        // eslint-disable-next-line no-await-in-loop
        const did = await worker.tick();
        if (did) { processed++; anyWork = true; }
      }
      if (!anyWork) break;
    }
    res.status(200).json({ processed });
  });
  return router;
}

export function createInternalDeletionWorkerRouter(
  retentionDeletionWorker: RetentionDeletionWorker,
  allowedServiceAccountEmail: string,
  audience: string,
): Router {
  const router = Router();
  router.post('/internal/workers/deletion/tick', requireSchedulerIdentity(allowedServiceAccountEmail, audience), async (_req, res) => {
    const deadline = Date.now() + SOFT_DEADLINE_MS;
    const approved = await retentionDeletionWorker.listApprovedRequests(DELETION_MAX_REQUESTS_PER_INVOCATION);
    let processed = 0, failed = 0;
    for (const request of approved) {
      if (Date.now() >= deadline) break;
      try {
        // eslint-disable-next-line no-await-in-loop
        await retentionDeletionWorker.executeApprovedRequest(request.diagnosis_case_id, request.id, SCHEDULER_DELETION_ACTOR);
        processed++;
      } catch {
        // Failure isolation: record this request as FAILED using the existing schema state
        // (migration 013 already defines 'FAILED' + failure_code) and continue with the rest
        // of the approved batch rather than letting one bad request block the others.
        // eslint-disable-next-line no-await-in-loop
        await retentionDeletionWorker.markFailed(request.diagnosis_case_id, request.id, 'DELETION_WORKER_INTERRUPTED');
        failed++;
      }
    }
    res.status(200).json({ processed, failed, candidates: approved.length });
  });
  return router;
}
