import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DeletionReconciliationManifest } from '../src/services/deletionReconciliation';
import { buildExternalManifestBundle, externalManifestBundleHash, GcsDeletionManifestStore, verifyExternalManifestBundle } from '../src/services/externalDeletionManifestStore';

const manifest:DeletionReconciliationManifest={
  manifest_version:'ITMGMT-DELETION-RECONCILIATION-v1',
  exported_at:'2026-09-14T00:00:00.000Z',
  entries:[{
    tombstone_id:'00000000-0000-4000-8000-000000000001',
    diagnosis_case_id:'00000000-0000-4000-8000-000000000002',
    deletion_request_id:'00000000-0000-4000-8000-000000000003',
    data_class:'GENERAL_RAW_DIAGNOSIS',target_kind:'SOURCE_RECORD',target_id:'00000000-0000-4000-8000-000000000004',action:'ANONYMIZE',
    deleted_or_anonymized_at:'2026-09-14T00:00:00.000Z',
  }],
};

test('external manifest bundle is deterministic, self-verifying and tamper-evident',()=>{
  const bundle=buildExternalManifestBundle(manifest);
  assert.match(bundle.manifest_hash,/^[a-f0-9]{64}$/);
  assert.match(externalManifestBundleHash(bundle),/^[a-f0-9]{64}$/);
  assert.deepEqual(verifyExternalManifestBundle(structuredClone(bundle)),bundle);
  const tampered=structuredClone(bundle);
  tampered.manifest.entries[0]!.target_id='00000000-0000-4000-8000-000000000099';
  assert.throws(()=>verifyExternalManifestBundle(tampered),/EXTERNAL_MANIFEST_HASH_MISMATCH/);
});

test('GCS object name is content-addressed and time-scoped without raw customer fields',()=>{
  const bundle=buildExternalManifestBundle(manifest);
  const store=new GcsDeletionManifestStore('controlled-pilot-manifests','reconciliation');
  const object=store.objectName(bundle);
  assert.equal(object,`reconciliation/2026-09-14T00-00-00-000Z-${bundle.manifest_hash}.json`);
  assert.equal(object.includes('SOURCE_RECORD'),false);
  assert.equal(object.includes(manifest.entries[0]!.target_id),false);
});
