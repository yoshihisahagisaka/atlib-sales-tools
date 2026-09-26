import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import {
  reportPdfObjectKey,
  type PdfArtifactIdentity,
} from './diagnosisReportPdfArtifact';
import type { StoredPdfObject } from './diagnosisReportPdfStore';

export interface PdfArtifactRow {
  report_id: string;
  diagnosis_case_id: string;
  report_version: number;
  status: 'PENDING' | 'READY' | 'FAILED';
  object_key: string | null;
  pdf_sha256: string | null;
  pdf_size_bytes: string | number | null;
  error_code: string | null;
  source_content_hash?: string;
}

export class DiagnosisReportPdfRepo {
  constructor(private readonly pool: Pool) {}

  async read(identity: PdfArtifactIdentity): Promise<PdfArtifactRow | null> {
    const { rows } = await this.pool.query<PdfArtifactRow>(
      `SELECT report_id,diagnosis_case_id,report_version,status,
              object_key,pdf_sha256,pdf_size_bytes,error_code,source_content_hash
         FROM diagnosis_report_pdf_artifacts
        WHERE report_id=$1 AND diagnosis_case_id=$2 AND report_version=$3`,
      [identity.reportId, identity.caseId, identity.version],
    );
    return rows[0] ?? null;
  }

  async claim(identity: PdfArtifactIdentity, sourceContentHash = '0'.repeat(64)): Promise<{
    artifact: PdfArtifactRow;
    acquired: boolean;
    generationToken: string | null;
  }> {
    reportPdfObjectKey(identity); if(!/^[a-f0-9]{64}$/.test(sourceContentHash))throw new Error('PDF_ARTIFACT_SOURCE_HASH_INVALID');
    const generationToken = randomUUID();

    const { rows } = await this.pool.query<PdfArtifactRow>(
      `INSERT INTO diagnosis_report_pdf_artifacts
         (report_id,diagnosis_case_id,report_version,status,
          generation_token,lease_expires_at,source_content_hash)
       VALUES ($1,$2,$3,'PENDING',$4,now()+interval '5 minutes',$5)
       ON CONFLICT (report_id) DO UPDATE
          SET status='PENDING',
              generation_token=EXCLUDED.generation_token,
              lease_expires_at=EXCLUDED.lease_expires_at,
              error_code=NULL,updated_at=now()
        WHERE diagnosis_report_pdf_artifacts.status='FAILED'
           OR (diagnosis_report_pdf_artifacts.status='PENDING'
               AND diagnosis_report_pdf_artifacts.lease_expires_at < now())
       RETURNING report_id,diagnosis_case_id,report_version,status,
                 object_key,pdf_sha256,pdf_size_bytes,error_code,source_content_hash`,
      [identity.reportId, identity.caseId, identity.version, generationToken,sourceContentHash],
    );

    if (rows[0]) {
      return { artifact: rows[0], acquired: true, generationToken };
    }

    const existing = await this.read(identity);
    if (!existing) {
      throw new Error('PDF_ARTIFACT_CLAIM_CONFLICT');
    }
    return { artifact: existing, acquired: false, generationToken: null };
  }

  async ready(
    identity: PdfArtifactIdentity,
    generationToken: string,
    stored: StoredPdfObject,
  ): Promise<PdfArtifactRow> {
    if (stored.objectKey !== reportPdfObjectKey(identity) ||
        !/^[a-f0-9]{64}$/.test(stored.sha256) ||
        !Number.isSafeInteger(stored.sizeBytes) ||
        stored.sizeBytes < 1) {
      throw new Error('PDF_ARTIFACT_METADATA_INVALID');
    }

    const { rows } = await this.pool.query<PdfArtifactRow>(
      `UPDATE diagnosis_report_pdf_artifacts
          SET status='READY',object_key=$5,pdf_sha256=$6,
              pdf_size_bytes=$7,error_code=NULL,
              generation_token=NULL,lease_expires_at=NULL,
              completed_at=now(),updated_at=now()
        WHERE report_id=$1 AND diagnosis_case_id=$2
          AND report_version=$3 AND status='PENDING'
          AND generation_token=$4 AND lease_expires_at > now()
       RETURNING report_id,diagnosis_case_id,report_version,status,
                 object_key,pdf_sha256,pdf_size_bytes,error_code`,
      [
        identity.reportId, identity.caseId, identity.version,
        generationToken, stored.objectKey, stored.sha256, stored.sizeBytes,
      ],
    );

    if (!rows[0]) {
      throw new Error('PDF_ARTIFACT_LEASE_LOST');
    }
    return rows[0];
  }

  async failed(
    identity: PdfArtifactIdentity,
    generationToken: string,
    errorCode: string,
  ): Promise<void> {
    if (!/^[A-Z0-9_]{1,100}$/.test(errorCode)) {
      throw new Error('PDF_ARTIFACT_ERROR_CODE_INVALID');
    }

    await this.pool.query(
      `UPDATE diagnosis_report_pdf_artifacts
          SET status='FAILED',error_code=$5,
              generation_token=NULL,lease_expires_at=NULL,
              updated_at=now()
        WHERE report_id=$1 AND diagnosis_case_id=$2
          AND report_version=$3 AND status='PENDING'
          AND generation_token=$4 AND lease_expires_at > now()`,
      [
        identity.reportId, identity.caseId, identity.version,
        generationToken, errorCode,
      ],
    );
  }
}
