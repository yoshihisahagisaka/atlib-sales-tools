import { DiagnosisError } from '../domain/itManagementDiagnosis';
import { DiagnosisPreparationRepo } from './diagnosisPreparationRepo';
import { DiagnosisReportRepo,type ReportExecutionInput } from './diagnosisReportRepo';
import type { ReportDraftProvider } from './reportDraftProvider';
import { ProviderFailure } from './preDiagnosisProvider';
export class ReportDraftWorker{
 private running=false;
 constructor(private readonly queue:DiagnosisPreparationRepo,private readonly repo:DiagnosisReportRepo,private readonly provider:ReportDraftProvider,private readonly timeoutMs=65000){}
 async tick(){if(this.running)return;this.running=true;try{
  const execution=await this.queue.claimExecution<ReportExecutionInput>('REPORT_DRAFT_GENERATOR');if(!execution)return;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;let raw:unknown=null;
  try{raw=await Promise.race([this.provider.draft(execution.input_snapshot_json.context,controller.signal),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new ProviderFailure('AI_TIMEOUT'));},this.timeoutMs);})]);await this.repo.finishExecution(execution,raw);}
  catch(e){await this.queue.failExecution(execution,e instanceof ProviderFailure?e.code:e instanceof DiagnosisError?e.message:'AI_PROCESSING_FAILED',raw);}finally{if(timer)clearTimeout(timer);}
 }finally{this.running=false;}}
}
