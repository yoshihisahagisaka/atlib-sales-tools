"""Production-only migration equivalents. Original staging bytes and guards remain unchanged."""
from pathlib import Path
from secumie_general_staging_migrate import (
    read_migrations as read_staging, migration_preflight_sql as staging_preflight,
    verify_sql as staging_verify, TABLES,
)

DB = "secumie_general"
MIGRATION = "secumie_general_migration_prod"
WRITER = "secumie_general_writer_prod"
STAFF = "secumie_general_staff_prod"
HEADER = "-- Production-only equivalent of immutable staging migration; target guards are mandatory.\n"

def target_sql(sql):
    return (sql.replace("secumie_general_staging", DB)
               .replace("secumie_general_migration_staging", MIGRATION)
               .replace("secumie_general_writer_staging", WRITER)
               .replace("secumie_general_staff_staging", STAFF)
               .replace("GENERAL_STAGING_", "GENERAL_PRODUCTION_"))

def production_files(root):
    root = Path(root)
    original = read_staging(root / "design/secumie-general/migrations")
    expected = {name.replace("_staging.sql", "_prod.sql"):
                HEADER + target_sql(sql[sql.index("SET LOCAL"):])
                for name, sql in original.items()}
    directory = root / "design/secumie-general/production-migrations"
    if not directory.is_dir() or {p.name for p in directory.iterdir()} != set(expected):
        raise ValueError("PRODUCTION_MIGRATION_FILE_SET_STOP")
    for name, sql in expected.items():
        p = directory / name
        if not p.is_file() or p.is_symlink() or p.read_bytes() != sql.encode("utf-8"):
            raise ValueError("PRODUCTION_MIGRATION_EQUIVALENCE_STOP:" + name)
    return expected

def preflight_sql():
    return target_sql(staging_preflight())

def batch_sql(files):
    parts = [
        "DO $lock$ BEGIN IF NOT pg_try_advisory_lock(17492026,1) THEN RAISE EXCEPTION 'GENERAL_MIGRATION_LOCK_BUSY'; END IF; END $lock$;",
        preflight_sql(),
        "BEGIN; CREATE TABLE public.schema_migrations(filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now()); COMMIT;",
    ]
    for name, sql in files.items():
        parts.extend(["BEGIN;", sql,
                      "INSERT INTO public.schema_migrations(filename) VALUES ('" + name + "');",
                      "COMMIT;", "\\echo MIGRATION_APPLIED=" + name])
    parts.append("SELECT pg_advisory_unlock(17492026,1);")
    return "\n".join(parts) + "\n"

def verify_sql():
    return target_sql(staging_verify())

def verify_result(evidence, files):
    if (evidence.get("database") != DB or evidence.get("ledger") != list(files)
            or evidence.get("tables") != TABLES or evidence.get("lead_count") != 0
            or not all(evidence.get(key) is True for key in (
                "owners_ok", "schema_owner_ok", "ledger_owner_ok", "public_schema_denied",
                "writer_insert", "writer_revision_update", "staff_sales_update", "forbidden_denied"))):
        raise ValueError("PRODUCTION_MIGRATION_VERIFICATION_STOP")

if __name__ == "__main__":
    import argparse
    import sys
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["check", "batch", "verify-sql"])
    args = parser.parse_args()
    files = production_files(Path(__file__).resolve().parents[2])
    if args.operation == "batch":
        sys.stdout.write(batch_sql(files))
    elif args.operation == "verify-sql":
        sys.stdout.write(verify_sql())
    else:
        print("PRODUCTION_MIGRATION_EQUIVALENCE=PASS; FILES=6")
