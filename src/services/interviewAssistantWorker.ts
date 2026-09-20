import { DiagnosisError } from '../domain/itManagementDiagnosis';
import { DiagnosisPreparationRepo } from './diagnosisPreparationRepo';
import { DiagnosisWorkspaceRepo } from './diagnosisWorkspaceRepo';
import type { InterviewContext } from './interviewAssistantContext';
import type { InterviewProvider } from './interviewAssistantProvider';
import { ProviderFailure } from './preDiagnosisProvider';

/** Reuse persisted queue/lease/recovery; claim only Human-requested AI-02 jobs. */
export class InterviewAssistantWorker {
 private running=false;
 constructor(private readonly queue:DiagnosisPreparationRepo,private readonly repo:DiagnosisWorkspaceRepo,private readonly provider:InterviewProvider,private readonly timeoutMs=65000) {}
 /** Returns true if a pending job was claimed and processed, false if none was available or a tick was already in flight. */
 async tick(): Promise<boolean> {
  if(this.running)return false;this.running=true;
  try {
   const execution=await this.queue.claimExecution<InterviewContext>('INTERVIEW_ASSISTANT');if(!execution)return false;
   const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;let raw:unknown=null;
   try {
    raw=await Promise.race([this.provider.suggest(execution.input_snapshot_json,controller.signal),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new ProviderFailure('AI_TIMEOUT'));},this.timeoutMs);})]);
    await this.repo.finishExecution(execution,raw);
   } catch(e) {await this.queue.failExecution(execution,e instanceof ProviderFailure?e.code:e instanceof DiagnosisError?e.message:'AI_PROCESSING_FAILED',raw);}
   finally {if(timer)clearTimeout(timer);}
   return true;
  } finally {this.running=false;}
 }
}
