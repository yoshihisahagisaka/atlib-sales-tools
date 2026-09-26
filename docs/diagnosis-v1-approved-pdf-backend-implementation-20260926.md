# Diagnosis V1 approved PDF backend implementation

The approved-report PDF backend reuses migrations 021/022 and adds migration 023.

- 023 binds each artifact to the approved report snapshot `content_hash`.
- Generation uses a five-minute ownership lease and token-gated READY/FAILED updates.
- Existing GCS objects are reusable only when object metadata contains the same source content hash; objects are never overwritten.
- Admin API is report-ID scoped for generation, status and verified download, and is mounted only with `DIAGNOSIS_REPORT_PDF_GCS_BUCKET`.
- Cloud Run needs Playwright Chromium available in the runtime image and a service account with GCS read/create permissions for that bucket. Deployment was not performed.
