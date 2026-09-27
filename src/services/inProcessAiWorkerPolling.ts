export interface AiWorkerTick {
  tick(): Promise<boolean>;
}

type WorkerLogger = {
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
};

export interface InProcessAiWorkerPollingOptions {
  enabled: boolean;
  workers: ReadonlyArray<{ name: string; worker: AiWorkerTick }>;
  logger: WorkerLogger;
  intervalMs?: number;
}

/**
 * Application instances must opt in explicitly.  Scheduler HTTP routes have a
 * separate authorization/dispatch boundary and are deliberately unaffected.
 */
export function startInProcessAiWorkerPolling(options: InProcessAiWorkerPollingOptions): () => void {
  if (!options.enabled) {
    options.logger.info({ event: 'in_process_ai_workers_disabled' }, 'In-process AI workers disabled');
    return () => undefined;
  }

  const poll = (name: string, worker: AiWorkerTick) => {
    void worker.tick().catch((error: unknown) => {
      const errorCode = typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : undefined;
      options.logger.warn({
        event: 'in_process_ai_worker_failed',
        worker: name,
        error_name: error instanceof Error ? error.name : 'UnknownError',
        error_code: errorCode,
      }, 'In-process AI worker failed');
    });
  };
  const pollAll = () => options.workers.forEach(({ name, worker }) => poll(name, worker));
  options.logger.info({ event: 'in_process_ai_workers_enabled', worker_count: options.workers.length }, 'In-process AI workers enabled');
  pollAll();
  const timer = setInterval(pollAll, options.intervalMs ?? 5000);
  timer.unref();
  return () => clearInterval(timer);
}
