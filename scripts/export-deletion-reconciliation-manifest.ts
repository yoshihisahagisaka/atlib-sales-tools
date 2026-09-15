import { loadDatabaseConfig } from '../src/config';
import { createPool } from '../src/db/pool';
import { buildDeletionReconciliationManifest } from '../src/services/deletionReconciliation';
import { buildExternalManifestBundle, GcsDeletionManifestStore } from '../src/services/externalDeletionManifestStore';

async function main(){
  const bucket=process.env.DIAGNOSIS_RECONCILIATION_GCS_BUCKET?.trim();
  if(!bucket)throw new Error('DIAGNOSIS_RECONCILIATION_GCS_BUCKET_REQUIRED');
  const prefix=process.env.DIAGNOSIS_RECONCILIATION_GCS_PREFIX?.trim()||'it-management-diagnosis/deletion-reconciliation';
  const db=await loadDatabaseConfig();
  const pool=createPool({db});
  try{
    const manifest=await buildDeletionReconciliationManifest(pool);
    const bundle=buildExternalManifestBundle(manifest);
    const store=new GcsDeletionManifestStore(bucket,prefix);
    const uploaded=await store.putImmutable(bundle);
    const verified=await store.verify(uploaded.object,uploaded.manifest_hash);
    // Output identifiers/hashes only. Never print raw customer records or manifest entries.
    console.log(JSON.stringify({event:'deletion_reconciliation_manifest_exported',bucket:uploaded.bucket,object:uploaded.object,manifest_hash:uploaded.manifest_hash,bundle_hash:verified.bundle_hash,tombstone_count:manifest.entries.length}));
  }finally{await pool.end();}
}

main().catch(error=>{
  const code=error instanceof Error?error.message.slice(0,160):'MANIFEST_EXPORT_FAILED';
  console.error(JSON.stringify({event:'deletion_reconciliation_manifest_export_failed',code}));
  process.exit(1);
});
