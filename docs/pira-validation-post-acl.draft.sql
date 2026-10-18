-- REVIEW ONLY. After separately approved fixture baseline + frozen PIRA DDL.
DO $$ BEGIN
 IF current_database()<>'pira_joint_purchase_validation' THEN RAISE EXCEPTION 'Wrong validation database'; END IF;
END $$;
GRANT SELECT,INSERT ON company TO sales_tools_app;
GRANT SELECT ON estimates TO sales_tools_app;
GRANT SELECT (id,name,corporate_number) ON company TO pira_validation_readonly;
-- Ledger SELECT only if an approved migration profile created it; do not fabricate ledger.
DO $$ BEGIN
 IF to_regclass('public.schema_migrations') IS NOT NULL THEN
  GRANT SELECT ON schema_migrations TO pira_validation_readonly;
 END IF;
END $$;
-- Recreate the known historical DEFAULT CRUD ACL only in an additional isolated rehearsal
-- before PIRA DDL, then verify the frozen DDL explicitly revokes mutation on fixed facts.
-- Never change Production default privileges for this validation.
