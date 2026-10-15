-- DESIGN DRAFT ONLY; NOT A NUMBERED/EXECUTABLE PRODUCTION MIGRATION.
-- Must be reconciled with Business KAIZEN's pending migrations and reviewed.
-- Keep Migration 031's real customer consent record and constraint unchanged.

CREATE TABLE it_management_staff_test_submission_receipt (
  idempotency_key UUID PRIMARY KEY,
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  diagnosis_case_id UUID NOT NULL UNIQUE
    REFERENCES it_management_diagnosis_case_v2(id) ON DELETE RESTRICT,
  actor_user_id TEXT NOT NULL CHECK (btrim(actor_user_id) <> ''),
  provenance TEXT NOT NULL DEFAULT 'STAFF_TEST_SIMULATION'
    CHECK (provenance = 'STAFF_TEST_SIMULATION'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- DESIGN GAP: Separate public and test primary-key constraints do not
-- guarantee cross-table uniqueness. Before activating this schema, enforce
-- cross-mode idempotency through a shared lock/registry or another
-- transaction-safe mechanism, including concurrent public/test submissions.
--
-- DESIGN GAP: Existing Design v2 original snapshot entry_channel only permits
-- CUSTOMER_SELF / STAFF_PROXY. A simulated CUSTOMER_SELF questionnaire
-- needs explicit provenance/audit and must not be mistaken for real consent.
--
-- DESIGN GAP: No grants are specified. Confirm runtime role privileges and
-- Migration 036 historical ACL rules before preparing the numbered migration.
--
-- DO NOT RUN THIS DRAFT IN PRODUCTION.
