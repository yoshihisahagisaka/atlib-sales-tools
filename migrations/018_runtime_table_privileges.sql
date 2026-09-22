-- Grant the application runtime role access to the InfraVision table created by migration 017.
-- ALTER DEFAULT PRIVILEGES applies to objects subsequently created by sales_tools_migration,
-- preventing the same runtime-permission gap for future migrations.

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE infravision_partner_leads
TO sales_tools_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE sales_tools_migration
IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sales_tools_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE sales_tools_migration
IN SCHEMA public
GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO sales_tools_runtime;
