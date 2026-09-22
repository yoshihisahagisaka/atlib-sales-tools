-- Staging currently separates migration and runtime database roles.
-- Grant the runtime role access to the InfraVision table created by migration 017.
-- Production role grants are managed separately because the production runtime role differs.

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE infravision_partner_leads
TO sales_tools_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE sales_tools_migration
IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sales_tools_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE sales_tools_migration
IN SCHEMA public
GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO sales_tools_runtime;
