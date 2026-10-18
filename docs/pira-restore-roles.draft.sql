-- REVIEW ONLY. Separate empty PIRA RESTORE cluster after separate approval; no role overwrite.
DO $$ BEGIN
 IF current_database()<>'pira_joint_purchase_restore' THEN RAISE EXCEPTION 'Wrong restore database'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('sales_tools_migration','sales_tools_app','pira_validation_readonly')) THEN RAISE EXCEPTION 'Roles already exist: inspect, do not overwrite'; END IF;
END $$;
CREATE ROLE sales_tools_migration LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
CREATE ROLE sales_tools_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
CREATE ROLE pira_validation_readonly LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON DATABASE pira_joint_purchase_restore FROM PUBLIC;
GRANT CONNECT ON DATABASE pira_joint_purchase_restore TO sales_tools_migration,sales_tools_app,pira_validation_readonly;
GRANT USAGE,CREATE ON SCHEMA public TO sales_tools_migration;
GRANT USAGE ON SCHEMA public TO sales_tools_app,pira_validation_readonly;
ALTER ROLE pira_validation_readonly SET default_transaction_read_only=on;
-- Supply distinct passwords through psql \password outside Git, then restore owner/ACL from dump.
