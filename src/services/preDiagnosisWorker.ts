import { DiagnosisError } from '../domain/itManagementDiagnosis';
import { validateOrganizerOutput } from '../domain/diagnosisPreparation';
import { DiagnosisPreparationRepo } from './diagnosisPreparationRepo';
import { ProviderFailure, type AIProvider } from './preDiagnosisProvider';

/** Persisted queue + bounded provider call. Each process claims via SKIP LOCKED. */
export class PreDiagnosisWorker {
  private running = false;
  constructor(private readonly repo: DiagnosisPreparationRepo, private readonly provider: AIProvider, private readonly timeoutMs = 65000) {}
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const execution = await this.repo.claimExecution();
      if (!execution) return;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let raw: unknown = null;
      try {
        raw = await Promise.race([
          this.provider.organize(execution.input_snapshot_json, controller.signal),
          new Promise<never>((_resolve,reject) => { timer = setTimeout(() => { controller.abort(); reject(new ProviderFailure('AI_TIMEOUT')); },this.timeoutMs); }),
        ]);
        const output = validateOrganizerOutput(raw,new Set(execution.input_snapshot_json.responses.map(r=>r.id)));
        await this.repo.finishExecution(execution,output,raw);
      } catch (error) {
        const code = error instanceof ProviderFailure ? error.code : error instanceof DiagnosisError ? error.message : 'AI_PROCESSING_FAILED';
        await this.repo.failExecution(execution,code,raw);
      } finally { if (timer) clearTimeout(timer); }
    } finally { this.running = false; }
  }
}
