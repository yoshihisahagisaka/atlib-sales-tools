"""Exact staging-only SQL set; uses psql with the existing advisory lock/ledger protocol.
The separate operator path avoids npm install on Cloud Shell. Never executes production SQL."""
import hashlib

MANIFEST = {
    "001_general_lead_staging.sql": "8bab6ae77ff37aa305de436d6646a37a5ef42e4e",
    "002_general_consultation_staging.sql": "4bf31fcf9e99db35fee1816a50bd855550f0c74d",
    "003_insight_result_history_staging.sql": "76ac7cd538265805c6ad0b65aa9990d4a48e7017",
    "004_company_group_staging.sql": "9820d5e7f12b24e36d04e4d3382fdf1b7de5b0f2",
    "005_general_role_acl_staging.sql": "7238a9a5382781b7fdea44cc2ae24effefae40bb",
    "006_insight_revision_limit_staging.sql": "cdd6f5cfe36a2b80e317ec4b40c07a58bed672a0",
}
ROLE = "secumie_general_migration_staging"
TABLES = ["company_group", "company_group_audit", "insight_result_history", "lead", "staff_change"]

def read_migrations(directory):
    if not directory.is_dir() or {p.name for p in directory.iterdir()} != set(MANIFEST):
        raise ValueError("MIGRATION_FILE_SET_MISMATCH")
    files = {}
    for name, expected in MANIFEST.items():
        path = directory / name
        if not path.is_file() or path.is_symlink():
            raise ValueError("MIGRATION_FILE_INVALID")
        data = path.read_bytes()
        digest = hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()
        if digest != expected:
            raise ValueError("MIGRATION_BLOB_MISMATCH")
        files[name] = data.decode("utf-8")
    return files

def migration_preflight_sql():
    return """
DO $guard$
BEGIN
 IF current_database() <> 'secumie_general_staging'
 OR current_user <> 'secumie_general_migration_staging'
 OR current_setting('server_version_num')::int NOT BETWEEN 160000 AND 169999
 OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) <> 'postgres'
 OR to_regnamespace('secumie_general') IS NOT NULL
 OR to_regclass('public.schema_migrations') IS NOT NULL
 OR NOT has_database_privilege(current_user,current_database(),'CREATE')
 OR NOT has_schema_privilege(current_user,'public','CREATE')
 OR EXISTS (SELECT 1 FROM pg_database d, LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a
    WHERE d.datname=current_database() AND a.grantee=0 AND a.privilege_type IN ('CONNECT','TEMPORARY'))
 OR EXISTS (SELECT 1 FROM pg_namespace n, LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
    WHERE n.nspname='public' AND a.grantee=0 AND a.privilege_type IN ('USAGE','CREATE'))
 OR EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname IN ('secumie_general_writer_staging','secumie_general_staff_staging')
    AND (has_database_privilege(r.rolname,current_database(),'CREATE') OR has_schema_privilege(r.rolname,'public','CREATE')))
 THEN RAISE EXCEPTION 'GENERAL_MIGRATION_PREFLIGHT_STOP'; END IF;
END $guard$;
"""

def migration_batch(files):
    if list(files) != list(MANIFEST):
        raise ValueError("MIGRATION_ORDER_MISMATCH")
    parts = [
        "DO $lock$ BEGIN IF NOT pg_try_advisory_lock(17492026,1) THEN RAISE EXCEPTION 'GENERAL_MIGRATION_LOCK_BUSY'; END IF; END $lock$;",
        migration_preflight_sql(),
        "BEGIN; CREATE TABLE public.schema_migrations(filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now()); COMMIT;",
    ]
    for name, sql in files.items():
        parts.extend(["BEGIN;", sql, "INSERT INTO public.schema_migrations(filename) VALUES ('" + name + "');", "COMMIT;", "\\echo MIGRATION_APPLIED=" + name])
    parts.append("SELECT pg_advisory_unlock(17492026,1);")
    return "\n".join(parts) + "\n"

def verify_sql():
    return """
SELECT json_build_object(
 'database',current_database(),
 'ledger',(SELECT json_agg(filename ORDER BY filename) FROM public.schema_migrations),
 'tables',(SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='secumie_general'),
 'owners_ok',(SELECT count(*)=5 AND bool_and(tableowner=current_user) FROM pg_tables WHERE schemaname='secumie_general'),
 'schema_owner_ok',(SELECT pg_get_userbyid(nspowner)=current_user FROM pg_namespace WHERE nspname='secumie_general'),
 'ledger_owner_ok',(SELECT tableowner=current_user FROM pg_tables WHERE schemaname='public' AND tablename='schema_migrations'),
 'public_schema_denied',NOT EXISTS(SELECT 1 FROM pg_namespace n,LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='secumie_general' AND a.grantee=0 AND a.privilege_type IN ('USAGE','CREATE')),
 'writer_insert',has_column_privilege('secumie_general_writer_staging','secumie_general.lead','company_name','INSERT'),
 'writer_revision_update',has_column_privilege('secumie_general_writer_staging','secumie_general.lead','insight_revision_count','UPDATE'),
 'staff_sales_update',has_column_privilege('secumie_general_staff_staging','secumie_general.lead','sales_status','UPDATE'),
 'forbidden_denied',NOT (
   has_column_privilege('secumie_general_staff_staging','secumie_general.lead','receipt_hash','SELECT')
   OR has_column_privilege('secumie_general_writer_staging','secumie_general.lead','staff_note','SELECT')
   OR has_column_privilege('secumie_general_writer_staging','secumie_general.lead','sales_status','UPDATE')
   OR has_table_privilege('secumie_general_writer_staging','secumie_general.company_group','SELECT')
   OR has_table_privilege('secumie_general_staff_staging','secumie_general.lead','DELETE')
   OR has_table_privilege('secumie_general_writer_staging','secumie_general.lead','DELETE')
   OR has_schema_privilege('secumie_general_writer_staging','secumie_general','CREATE')
   OR has_schema_privilege('secumie_general_staff_staging','secumie_general','CREATE')
 ),
 'lead_count',(SELECT count(*) FROM secumie_general.lead)
);
"""

def verify_result(evidence):
    if (evidence.get("database") != "secumie_general_staging" or evidence.get("ledger") != list(MANIFEST)
        or evidence.get("tables") != TABLES or evidence.get("lead_count") != 0
        or not all(evidence.get(key) is True for key in ("owners_ok","schema_owner_ok","ledger_owner_ok","public_schema_denied","writer_insert","writer_revision_update","staff_sales_update","forbidden_denied"))):
        raise ValueError("MIGRATION_VERIFICATION_STOP")
