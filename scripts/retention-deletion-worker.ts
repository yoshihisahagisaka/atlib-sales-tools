import { loadConfig } from '../src/config';
import { createPool } from '../src/db/pool';
import { RetentionDeletionWorker } from '../src/services/retentionDeletionWorker';

async function main(){
  const [mode,caseId,requestId,actorId,confirmation]=process.argv.slice(2);
  if(!caseId || !['preview','execute'].includes(mode ?? '')){
    throw new Error('USAGE: retention-deletion-worker <preview|execute> <caseId> [requestId actorId EXECUTE_APPROVED_DELETION]');
  }
  const config=await loadConfig();
  const pool=createPool(config);
  try{
    const worker=new RetentionDeletionWorker(pool);
    if(mode==='preview'){
      const result=await worker.previewPolicyExpiry(caseId);
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return;
    }
    if(!requestId || !actorId || confirmation!=='EXECUTE_APPROVED_DELETION'){
      throw new Error('EXECUTION_CONFIRMATION_REQUIRED');
    }
    const result=await worker.executeApprovedRequest(caseId,requestId,actorId);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }finally{
    await pool.end();
  }
}

main().catch(error=>{
  const code=error instanceof Error?error.message:'RETENTION_DELETION_WORKER_FAILED';
  // Never print request/customer raw content or stack traces from this operational command.
  process.stderr.write(`${JSON.stringify({event:'retention_deletion_worker_failed',code})}\n`);
  process.exit(1);
});
