import { DiagnosisError } from '../domain/itManagementDiagnosis';
import { DiagnosisPreparationRepo } from './diagnosisPreparationRepo';
import { DiagnosisReviewRepo } from './diagnosisReviewRepo';
import type { PostDiagnosisContext } from './postDiagnosisContext';
import type { PostDiagnosisProvider } from './postDiagnosisProvider';
import { ProviderFailure } from './preDiagnosisProvider';
export class PostDiagnosisWorker {
 private running=false;
 // 2026-10-01: raised from 65000ms alongside AnthropicPostDiagnosisProvider's SDK timeout
 // (now 120000ms), so this outer AbortController stays the backstop rather than firing before
 // the SDK's own timeout. Not a confirmed permanent value -- see postDiagnosisProvider.ts.
 // Recovered 2026-10-03 (Production Canonical Normalization) from atlib-sales-launch
 // commit 7cb6ea77 (P2-91).
 constructor(private readonly queue:DiagnosisPreparationRepo,private readonly repo:DiagnosisReviewRepo,private readonly provider:PostDiagnosisProvider,private readonly timeoutMs=125000){}
 async tick(){if(this.running)return;this.running=true;try{
  const execution=await this.queue.claimExecution<PostDiagnosisContext>('POST_DIAGNOSIS_STRUCTURER');if(!execution)return;
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;let raw:unknown=null;
  try{raw=await Promise.race([this.provider.structure(execution.input_snapshot_json,controller.signal),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new ProviderFailure('AI_TIMEOUT'));},this.timeoutMs);})]);await this.repo.finishExecution(execution,raw);}
  catch(e){await this.queue.failExecution(execution,e instanceof ProviderFailure?e.code:e instanceof DiagnosisError?e.message:'AI_PROCESSING_FAILED',raw);}finally{if(timer)clearTimeout(timer);}
 }finally{this.running=false;}}
}
