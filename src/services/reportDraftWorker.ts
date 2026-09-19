import { DiagnosisError } from '../domain/itManagementDiagnosis';
import { DiagnosisPreparationRepo } from './diagnosisPreparationRepo';
import { DiagnosisReportRepo,type ReportExecutionInput } from './diagnosisReportRepo';
import type { ReportDraftProvider } from './reportDraftProvider';
import { ProviderFailure } from './preDiagnosisProvider';
export class ReportDraftWorker{
 private running=false;
 constructor(private readonly queue:DiagnosisPreparationRepo,private readonly repo:DiagnosisReportRepo,private readonly provider:ReportDraftProvider,private readonly timeoutMs=65000){}
 /** Returns true if a pending job was claimed and processed, false if none was available or a tick was already in flight. */
 async tick(): Promise<boolean> {if(this.running)return false;this.running=true;try{
  const execution=await this.queue.claimExecution<ReportExecutionInput>('REPORT_DRAFT_GENERATOR');if(!execution)return false;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;let raw:unknown=null;
  try{raw=await Promise.race([this.provider.draft(execution.input_snapshot_json.context,controller.signal),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new ProviderFailure('AI_TIMEOUT'));},this.timeoutMs);})]);await this.repo.finishExecution(execution,raw);}
  catch(e){await this.queue.failExecution(execution,e instanceof ProviderFailure?e.code:e instanceof DiagnosisError?e.message:'AI_PROCESSING_FAILED',raw);}finally{if(timer)clearTimeout(timer);}
  return true;
 }finally{this.running=false;}}
}
