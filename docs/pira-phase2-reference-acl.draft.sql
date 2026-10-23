-- UNNUMBERED / RUNNER-EXTERNAL / NOT APPROVED FOR APPLICATION.
-- Prerequisite: reviewed Phase 1 DDL, actual ledger/owners/default ACL/role audit.
-- Roles must be provisioned separately after approval. No role creation here.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='15s';

-- Sales estimates have no canonical company_id. Human verification is append-only,
-- bound to the exact approved estimate revision, not a match on customer_name.
CREATE TABLE pira_estimate_company_binding (
  estimate_id UUID NOT NULL REFERENCES estimates(id),
  company_id UUID NOT NULL REFERENCES company(id),
  revision TEXT NOT NULL,
  evidence TEXT NOT NULL CHECK(length(trim(evidence))>0),
  verified_by TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(estimate_id,revision)
);
CREATE FUNCTION pira_estimate_binding_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'PIRA estimate binding is append-only'; END;
$$;
CREATE TRIGGER pira_estimate_binding_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
ON pira_estimate_company_binding FOR EACH STATEMENT EXECUTE FUNCTION pira_estimate_binding_immutable();

CREATE VIEW pira_company_reference AS SELECT id,name,corporate_number FROM company;
CREATE VIEW pira_notice_company_reference AS SELECT id,name FROM company;
CREATE VIEW pira_estimate_reference AS
SELECT e.id,e.updated_at::text AS revision,b.company_id
FROM estimates e JOIN pira_estimate_company_binding b
 ON b.estimate_id=e.id AND b.revision=e.updated_at::text
WHERE e.status='confirmed';

-- Explicit revocation required: historical 018 default ACL is not narrowed by GRANT.
REVOKE ALL ON pira_estimate_company_binding,pira_company_reference,pira_estimate_reference,pira_notice_company_reference
FROM PUBLIC,sales_tools_app,sales_tools_runtime,pira_core_runtime,pira_notifier;
GRANT SELECT,INSERT ON pira_estimate_company_binding TO sales_tools_app,sales_tools_runtime;
GRANT SELECT ON pira_company_reference,pira_estimate_reference TO pira_core_runtime;
GRANT SELECT ON pira_notice_company_reference TO pira_notifier;
REVOKE ALL ON pira_association,pira_principal,pira_membership,pira_affiliation,pira_identity,
pira_external_link,pira_terms,pira_application,pira_order,pira_audit,pira_outbox
FROM PUBLIC,sales_tools_app,sales_tools_runtime,pira_core_runtime,pira_notifier;
GRANT SELECT,INSERT,UPDATE ON pira_association,pira_principal,pira_membership,pira_affiliation,
pira_identity,pira_external_link,pira_application,pira_outbox TO pira_core_runtime;
GRANT SELECT,INSERT ON pira_order,pira_terms,pira_audit TO pira_core_runtime;
GRANT SELECT,UPDATE ON pira_outbox TO pira_notifier;
GRANT SELECT ON pira_association TO pira_notifier;
GRANT INSERT ON pira_audit TO pira_notifier;
COMMIT;
-- Must verify effective privileges including inherited roles, PUBLIC, view ownership,
-- functions, schema CREATE, sequences and owner defaults on actual isolated PG first.
-- Existing global default ACL is deliberately unchanged. Do NOT execute as-is.
