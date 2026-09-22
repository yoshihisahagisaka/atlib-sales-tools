-- Grant InfraVision table access to the runtime role that exists in each environment.
-- Staging currently uses sales_tools_runtime; Production currently uses sales_tools_app.
-- The migration is executed by the migration role, so ALTER DEFAULT PRIVILEGES without
-- FOR ROLE applies to the actual migration owner in that environment.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sales_tools_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE infravision_partner_leads TO sales_tools_runtime;

    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sales_tools_runtime;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO sales_tools_runtime;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sales_tools_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE infravision_partner_leads TO sales_tools_app;

    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sales_tools_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO sales_tools_app;
  END IF;
END
$$;
