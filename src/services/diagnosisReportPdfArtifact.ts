import { createHash } from 'node:crypto';

export interface PdfArtifactIdentity {
  reportId: string;
  caseId: string;
  version: number;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function reportPdfObjectKey(identity: PdfArtifactIdentity): string {
  if (!UUID_PATTERN.test(identity.reportId) ||
      !UUID_PATTERN.test(identity.caseId) ||
      !Number.isSafeInteger(identity.version) ||
      identity.version < 1) {
    throw new Error('PDF_ARTIFACT_IDENTITY_INVALID');
  }

  return `it-management-diagnosis/reports/${identity.caseId.toLowerCase()}/v${identity.version}/${identity.reportId.toLowerCase()}.pdf`;
}

export function reportPdfSha256(pdf: Buffer): string {
  if (pdf.length < 5 || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error('PDF_ARTIFACT_INVALID_BYTES');
  }

  return createHash('sha256').update(pdf).digest('hex');
}
