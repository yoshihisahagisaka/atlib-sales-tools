-- REVIEW ONLY: unnumbered, outside migrations/. Never run against a real DB in this task.
-- Dependency: existing company (027), estimates (002). Actual ledger/ACL not yet verified.
CREATE TABLE pira_association (
 id TEXT PRIMARY KEY,
 version INTEGER NOT NULL CHECK(version>0),
 association_id TEXT ,
 company_id UUID  REFERENCES company(id) ON DELETE RESTRICT,
 data JSONB NOT NULL CHECK(jsonb_typeof(data)='object'),
 CHECK(id=association_id AND company_id IS NULL),
 CHECK(data->>'orderMode' IN ('MANUAL','AUTO')), CHECK(jsonb_typeof(data->'active')='boolean')
);
CREATE INDEX pira_association_scope_idx ON pira_association(association_id,company_id);
CREATE TABLE pira_principal (
 id TEXT PRIMARY KEY,
 version INTEGER NOT NULL CHECK(version>0),
 association_id TEXT ,
 company_id UUID  REFERENCES company(id) ON DELETE RESTRICT,
 data JSONB NOT NULL CHECK(jsonb_typeof(data)='object'),
 CHECK(association_id IS NULL AND company_id IS NULL), CHECK(jsonb_typeof(data->'active')='boolean')
);
CREATE TABLE pira_membership (
 id TEXT PRIMARY KEY,
 version INTEGER NOT NULL CHECK(version>0),
 association_id TEXT ,
 company_id UUID  REFERENCES company(id) ON DELETE RESTRICT,
 data JSONB NOT NULL CHECK(jsonb_typeof(data)='object'),
 FOREIGN KEY(association_id) REFERENCES pira_association(id) ON DELETE RESTRICT,
 principal_id TEXT GENERATED ALWAYS AS (data->>'principalId') STORED REFERENCES pira_principal(id),
 CHECK(principal_id IS NOT NULL), CHECK(data->>'role' IN ('atlib_admin','association_admin','association_staff','company_admin')),
 CHECK((data->>'role'='atlib_admin' AND association_id IS NULL AND company_id IS NULL) OR (data->>'role' IN ('association_admin','association_staff') AND association_id IS NOT NULL AND company_id IS NULL) OR (data->>'role'='company_admin' AND company_id IS NOT NULL AND association_id IS NULL))
);
CREATE INDEX pira_membership_scope_idx ON pira_membership(association_id,company_id);
CREATE TABLE pira_affiliation (
 id TEXT PRIMARY KEY,
 version INTEGER NOT NULL CHECK(version>0),
 association_id TEXT NOT NULL,
 company_id UUID NOT NULL REFERENCES company(id) ON DELETE RESTRICT,
 data JSONB NOT NULL CHECK(jsonb_typeof(data)='object'),
 FOREIGN KEY(association_id) REFERENCES pira_association(id) ON DELETE RESTRICT,
 UNIQUE(association_id,company_id)
);
CREATE INDEX pira_affiliation_scope_idx ON pira_affiliation(association_id,company_id);
CREATE TABLE pira_identity (
 id TEXT PRIMARY KEY,
 version INTEGER NOT NULL CHECK(version>0),
 association_id TEXT ,
 company_id UUID NOT NULL REFERENCES company(id) ON DELETE RESTRICT,
 data JSONB NOT NULL CHECK(jsonb_typeof(data)='object'),
 FOREIGN KEY(association_id) REFERENCES pira_association(id) ON DELETE RESTRICT
);
CREATE TABLE pira_external_link (
 id TEXT PRIMARY KEY,
 version INTEGER NOT NULL CHECK(version>0),
 association_id TEXT ,
 company_id UUID NOT NULL REFERENCES company(id) ON DELETE RESTRICT,
 data JSONB NOT NULL CHECK(jsonb_typeof(data)='object'),
 FOREIGN KEY(association_id) REFERENCES pira_association(id) ON DELETE RESTRICT
);
CREATE INDEX pira_external_link_scope_idx ON pira_external_link(association_id,company_id);
CREATE TABLE pira_terms (
 id TEXT PRIMARY KEY,
 version INTEGER NOT NULL CHECK(version>0),
 association_id TEXT NOT NULL,
 company_id UUID  REFERENCES company(id) ON DELETE RESTRICT,
 data JSONB NOT NULL CHECK(jsonb_typeof(data)='object'),
 FOREIGN KEY(association_id) REFERENCES pira_association(id) ON DELETE RESTRICT,
 CHECK(data->>'service' IN ('GUARD','SEND','INFRAVISION'))
);
CREATE INDEX pira_terms_scope_idx ON pira_terms(association_id,company_id);
CREATE TABLE pira_application (
 id TEXT PRIMARY KEY,
 version INTEGER NOT NULL CHECK(version>0),
 association_id TEXT NOT NULL,
 company_id UUID NOT NULL REFERENCES company(id) ON DELETE RESTRICT,
 data JSONB NOT NULL CHECK(jsonb_typeof(data)='object'),
 FOREIGN KEY(association_id) REFERENCES pira_association(id) ON DELETE RESTRICT,
 UNIQUE(id,association_id,company_id),
 FOREIGN KEY(association_id,company_id) REFERENCES pira_affiliation(association_id,company_id),
 CHECK(data->>'state' IN ('SUBMITTED','RETURNED','CANCELLED','ORDERED'))
);
CREATE INDEX pira_application_scope_idx ON pira_application(association_id,company_id);
CREATE TABLE pira_order (
 id TEXT PRIMARY KEY,
 version INTEGER NOT NULL CHECK(version>0),
 association_id TEXT NOT NULL,
 company_id UUID NOT NULL REFERENCES company(id) ON DELETE RESTRICT,
 data JSONB NOT NULL CHECK(jsonb_typeof(data)='object'),
 FOREIGN KEY(association_id) REFERENCES pira_association(id) ON DELETE RESTRICT,
 application_id TEXT GENERATED ALWAYS AS (data->>'applicationId') STORED NOT NULL,
 FOREIGN KEY(application_id,association_id,company_id) REFERENCES pira_application(id,association_id,company_id),
 UNIQUE(application_id), CHECK(data->>'approvalMode' IN ('MANUAL','AUTO'))
);
CREATE INDEX pira_order_scope_idx ON pira_order(association_id,company_id);
CREATE TABLE pira_audit (
 id TEXT PRIMARY KEY,
 version INTEGER NOT NULL CHECK(version>0),
 association_id TEXT ,
 company_id UUID  REFERENCES company(id) ON DELETE RESTRICT,
 data JSONB NOT NULL CHECK(jsonb_typeof(data)='object'),
 FOREIGN KEY(association_id) REFERENCES pira_association(id) ON DELETE RESTRICT
);
CREATE INDEX pira_audit_scope_idx ON pira_audit(association_id,company_id);
CREATE TABLE pira_outbox (
 id TEXT PRIMARY KEY,
 version INTEGER NOT NULL CHECK(version>0),
 association_id TEXT ,
 company_id UUID  REFERENCES company(id) ON DELETE RESTRICT,
 data JSONB NOT NULL CHECK(jsonb_typeof(data)='object'),
 FOREIGN KEY(association_id) REFERENCES pira_association(id) ON DELETE RESTRICT
);
CREATE INDEX pira_outbox_scope_idx ON pira_outbox(association_id,company_id);

CREATE UNIQUE INDEX pira_principal_subject_unique ON pira_principal((data->>'issuer'),(data->>'subject')) WHERE data->>'subject' IS NOT NULL;
CREATE UNIQUE INDEX pira_application_number_unique ON pira_application((data->>'number'));
CREATE UNIQUE INDEX pira_order_number_unique ON pira_order((data->>'number'));
CREATE INDEX pira_outbox_pending_idx ON pira_outbox((data->>'state'),(data->>'nextAt'));
CREATE FUNCTION pira_prevent_fact_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'PIRA fact is append-only'; END $$;
CREATE TRIGGER pira_order_immutable BEFORE UPDATE OR DELETE ON pira_order FOR EACH ROW EXECUTE FUNCTION pira_prevent_fact_mutation();
CREATE TRIGGER pira_audit_immutable BEFORE UPDATE OR DELETE ON pira_audit FOR EACH ROW EXECUTE FUNCTION pira_prevent_fact_mutation();
CREATE TRIGGER pira_terms_immutable BEFORE UPDATE OR DELETE ON pira_terms FOR EACH ROW EXECUTE FUNCTION pira_prevent_fact_mutation();
-- Explicitly override historical Production default CRUD ACL; do not change global defaults.
DO $$
DECLARE r TEXT; t TEXT;
BEGIN
 FOREACH r IN ARRAY ARRAY['sales_tools_app','sales_tools_runtime'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   FOREACH t IN ARRAY ARRAY['pira_association','pira_principal','pira_membership','pira_affiliation','pira_identity','pira_external_link','pira_terms','pira_application','pira_order','pira_audit','pira_outbox'] LOOP
    EXECUTE format('REVOKE ALL ON TABLE %I FROM %I',t,r);
    EXECUTE format('GRANT SELECT, INSERT ON TABLE %I TO %I',t,r);
    IF t NOT IN ('pira_audit','pira_order','pira_terms') THEN
     EXECUTE format('GRANT UPDATE ON TABLE %I TO %I',t,r);
    END IF;
   END LOOP;
  END IF;
 END LOOP;
END $$;

