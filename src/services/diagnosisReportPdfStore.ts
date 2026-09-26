import { GoogleAuth } from 'google-auth-library';
import {
  reportPdfObjectKey,
  reportPdfSha256,
  type PdfArtifactIdentity,
} from './diagnosisReportPdfArtifact';

export interface StoredPdfObject {
  objectKey: string;
  sha256: string;
  sizeBytes: number;
}

export class GcsDiagnosisReportPdfStore {
  private readonly auth: GoogleAuth;

  constructor(
    private readonly bucket: string,
    auth?: GoogleAuth,
  ) {
    if (!bucket.trim()) {
      throw new Error('DIAGNOSIS_REPORT_PDF_BUCKET_REQUIRED');
    }
    this.auth = auth ?? new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
    });
  }

  private async token(): Promise<string> {
    const token = await this.auth.getAccessToken();
    if (!token) {
      throw new Error('DIAGNOSIS_REPORT_PDF_GCS_AUTH_REQUIRED');
    }
    return token;
  }

  async putImmutable(
    identity: PdfArtifactIdentity,
    pdf: Buffer,
    sourceContentHash?: string,
  ): Promise<StoredPdfObject> {
    const objectKey = reportPdfObjectKey(identity);
    const sha256 = reportPdfSha256(pdf);
    const params = new URLSearchParams({
      uploadType: 'media',
      name: objectKey,
      ifGenerationMatch: '0',
    });

    const response = await fetch(
      `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(this.bucket)}/o?${params}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await this.token()}`,
          'Content-Type': 'application/pdf',
          ...(sourceContentHash ? {'x-goog-meta-source-content-hash':sourceContentHash,'x-goog-meta-report-id':identity.reportId,'x-goog-meta-report-version':String(identity.version)} : {}),
        },
        body: new Uint8Array(pdf),
      },
    );

    if (response.status === 412) {
      const existing = await this.getVerified(objectKey, sha256);
      if (existing.length !== pdf.length) {
        throw new Error('DIAGNOSIS_REPORT_PDF_EXISTING_OBJECT_SIZE_MISMATCH');
      }
    } else if (!response.ok) {
      throw new Error(`DIAGNOSIS_REPORT_PDF_GCS_UPLOAD_FAILED_${response.status}`);
    }

    return { objectKey, sha256, sizeBytes: pdf.length };
  }

  async readExisting(
    identity: PdfArtifactIdentity,
    expectedSourceContentHash?: string,
  ): Promise<{ pdf: Buffer; stored: StoredPdfObject } | null> {
    const objectKey = reportPdfObjectKey(identity);
    if(expectedSourceContentHash){const meta=await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(this.bucket)}/o/${encodeURIComponent(objectKey)}`,{headers:{Authorization:`Bearer ${await this.token()}`}});if(meta.status===404)return null;if(!meta.ok)throw new Error(`DIAGNOSIS_REPORT_PDF_GCS_READ_FAILED_${meta.status}`);const body=await meta.json() as {metadata?:Record<string,string>};if(body.metadata?.['source-content-hash']!==expectedSourceContentHash)throw new Error('DIAGNOSIS_REPORT_PDF_GCS_SOURCE_HASH_MISMATCH');}
    const params = new URLSearchParams({ alt: 'media' });
    const response = await fetch(
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(this.bucket)}/o/${encodeURIComponent(objectKey)}?${params}`,
      { headers: { Authorization: `Bearer ${await this.token()}` } },
    );

    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`DIAGNOSIS_REPORT_PDF_GCS_READ_FAILED_${response.status}`);
    }

    const pdf = Buffer.from(await response.arrayBuffer());
    const sha256 = reportPdfSha256(pdf);
    return {
      pdf,
      stored: { objectKey, sha256, sizeBytes: pdf.length },
    };
  }

  async getVerified(objectKey: string, expectedSha256: string): Promise<Buffer> {
    const params = new URLSearchParams({ alt: 'media' });
    const response = await fetch(
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(this.bucket)}/o/${encodeURIComponent(objectKey)}?${params}`,
      { headers: { Authorization: `Bearer ${await this.token()}` } },
    );

    if (!response.ok) {
      throw new Error(`DIAGNOSIS_REPORT_PDF_GCS_READ_FAILED_${response.status}`);
    }

    const pdf = Buffer.from(await response.arrayBuffer());
    if (reportPdfSha256(pdf) !== expectedSha256) {
      throw new Error('DIAGNOSIS_REPORT_PDF_GCS_HASH_MISMATCH');
    }
    return pdf;
  }
}
