import { createHash } from 'node:crypto';
import { GoogleAuth } from 'google-auth-library';
import type { DeletionReconciliationManifest } from './deletionReconciliation';
import { deletionManifestHash } from './deletionReconciliation';

export const EXTERNAL_MANIFEST_BUNDLE_VERSION='ITMGMT-EXTERNAL-DELETION-MANIFEST-v1';

export interface ExternalManifestBundle {
  bundle_version:typeof EXTERNAL_MANIFEST_BUNDLE_VERSION;
  manifest_hash:string;
  manifest:DeletionReconciliationManifest;
}

export function buildExternalManifestBundle(manifest:DeletionReconciliationManifest):ExternalManifestBundle{
  return {bundle_version:EXTERNAL_MANIFEST_BUNDLE_VERSION,manifest_hash:deletionManifestHash(manifest),manifest};
}

export function externalManifestBundleHash(bundle:ExternalManifestBundle):string{
  return createHash('sha256').update(JSON.stringify(bundle)).digest('hex');
}

export function verifyExternalManifestBundle(value:unknown):ExternalManifestBundle{
  if(!value||typeof value!=='object')throw new Error('EXTERNAL_MANIFEST_INVALID');
  const bundle=value as ExternalManifestBundle;
  if(bundle.bundle_version!==EXTERNAL_MANIFEST_BUNDLE_VERSION||!bundle.manifest)throw new Error('EXTERNAL_MANIFEST_VERSION_INVALID');
  if(bundle.manifest_hash!==deletionManifestHash(bundle.manifest))throw new Error('EXTERNAL_MANIFEST_HASH_MISMATCH');
  return bundle;
}

export class GcsDeletionManifestStore{
  private readonly auth:GoogleAuth;
  constructor(private readonly bucket:string,private readonly prefix='it-management-diagnosis/deletion-reconciliation',auth?:GoogleAuth){
    if(!bucket.trim())throw new Error('DELETION_MANIFEST_BUCKET_REQUIRED');
    this.auth=auth??new GoogleAuth({scopes:['https://www.googleapis.com/auth/devstorage.read_write']});
  }

  private async token():Promise<string>{
    const token=await this.auth.getAccessToken();
    if(!token)throw new Error('DELETION_MANIFEST_GCS_AUTH_REQUIRED');
    return token;
  }

  objectName(bundle:ExternalManifestBundle):string{
    const timestamp=bundle.manifest.exported_at.replace(/[:.]/g,'-');
    return `${this.prefix}/${timestamp}-${bundle.manifest_hash}.json`;
  }

  async putImmutable(bundle:ExternalManifestBundle):Promise<{bucket:string;object:string;manifest_hash:string;bundle_hash:string}>{
    verifyExternalManifestBundle(bundle);
    const object=this.objectName(bundle);
    const params=new URLSearchParams({uploadType:'media',name:object,ifGenerationMatch:'0'});
    const response=await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(this.bucket)}/o?${params}`,{
      method:'POST',headers:{Authorization:`Bearer ${await this.token()}`,'Content-Type':'application/json'},body:JSON.stringify(bundle),
    });
    if(!response.ok){
      // 412 means the immutable object already exists. Do not overwrite it; verify the existing object instead.
      if(response.status!==412)throw new Error(`DELETION_MANIFEST_GCS_UPLOAD_FAILED_${response.status}`);
      const existing=await this.get(object);
      if(existing.manifest_hash!==bundle.manifest_hash)throw new Error('DELETION_MANIFEST_GCS_EXISTING_OBJECT_MISMATCH');
    }
    return {bucket:this.bucket,object,manifest_hash:bundle.manifest_hash,bundle_hash:externalManifestBundleHash(bundle)};
  }

  async get(object:string):Promise<ExternalManifestBundle>{
    const params=new URLSearchParams({alt:'media'});
    const response=await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(this.bucket)}/o/${encodeURIComponent(object)}?${params}`,{
      headers:{Authorization:`Bearer ${await this.token()}`},
    });
    if(!response.ok)throw new Error(`DELETION_MANIFEST_GCS_READ_FAILED_${response.status}`);
    return verifyExternalManifestBundle(await response.json());
  }

  async verify(object:string,expectedManifestHash:string):Promise<{verified:true;manifest_hash:string;bundle_hash:string}>{
    const bundle=await this.get(object);
    if(bundle.manifest_hash!==expectedManifestHash)throw new Error('DELETION_MANIFEST_GCS_VERIFY_HASH_MISMATCH');
    return {verified:true,manifest_hash:bundle.manifest_hash,bundle_hash:externalManifestBundleHash(bundle)};
  }
}
