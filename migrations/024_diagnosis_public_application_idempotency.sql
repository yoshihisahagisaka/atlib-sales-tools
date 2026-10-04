-- Persistent public-LP retry coordination.  Do not store a plaintext resume token.
CREATE TABLE diagnosis_public_application_idempotency (
  idempotency_key TEXT PRIMARY KEY CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  diagnosis_case_id UUID UNIQUE REFERENCES diagnosis_cases(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX diagnosis_public_application_idempotency_expires_idx
  ON diagnosis_public_application_idempotency(expires_at);
