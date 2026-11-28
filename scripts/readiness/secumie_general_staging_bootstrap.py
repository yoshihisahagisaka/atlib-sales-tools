#!/usr/bin/env python3
"""One-shot staging-only bootstrap. No production, migration, or runtime deployment."""
import argparse
import base64
import datetime as dt
import hashlib
import hmac
import json
import os
import secrets
import shutil
import socket
import subprocess
import sys
import time

PROJECT = "msp-zabbix"
INSTANCE = "secumie-sg-shared-staging-db"
REGION = "asia-northeast1"
IP = "172.20.0.3"
VM = "msp-frontend-server"
DB = "secumie_general_staging"
DEADLINE = dt.datetime.fromisoformat("2026-12-04T10:12:12+09:00")
BOOT = "secumie-stg-db-bootstrap-password"
ROLES = {
    "secumie_general_migration_staging": (1, "secumie-general-stg-db-migration-password"),
    "secumie_general_writer_staging": (4, "secumie-general-stg-db-writer-password"),
    "secumie_general_staff_staging": (2, "secumie-general-stg-db-staff-password"),
}
RECEIPT = "secumie-general-stg-receipt-secret"
EXPECTED_DBS = {"postgres", "cloudsqladmin", "secumie_insight_staging", "secumie_web_staging", "secure_guard_staging"}
EXPECTED_ROLES = {
    "secumie_admin_staging": 40, "secumie_maintenance_staging": 1,
    "secumie_migration_staging": 1, "secumie_otp_staging": 6,
    "secumie_pira_staging": 6, "secumie_web_admin_staging": -1,
    "secumie_web_migration_staging": -1, "secure_guard_migration_staging": 1,
    "secure_guard_overage_staging": 2, "secure_guard_runtime_staging": 2,
}
class Stop(Exception):
    pass

def require(ok, code):
    if not ok:
        raise Stop(code)

def command(args, label, data=None, env=None, timeout=90):
    try:
        proc = subprocess.run(args, input=data, env=env, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise Stop(label + "_EXECUTION_FAILED") from None
    # Never echo command stdout/stderr on failures: secret access and SQL can contain credentials.
    require(proc.returncode == 0, label + "_FAILED")
    return proc.stdout

def gc(args, label, data=None):
    return command(["gcloud", *args, "--project=" + PROJECT, "--quiet"], label, data)

def gc_json(args, label):
    try:
        return json.loads(gc([*args, "--format=json"], label))
    except (ValueError, TypeError):
        raise Stop(label + "_INVALID_JSON") from None

def scram_verifier(password, salt=None):
    salt = salt or secrets.token_bytes(16)
    iterations = 4096
    salted = hashlib.pbkdf2_hmac("sha256", password.encode("ascii"), salt, iterations)
    client = hmac.digest(salted, b"Client Key", "sha256")
    stored = hashlib.sha256(client).digest()
    server = hmac.digest(salted, b"Server Key", "sha256")
    b64 = lambda value: base64.b64encode(value).decode("ascii")
    return f"SCRAM-SHA-256${iterations}:{b64(salt)}${b64(stored)}:{b64(server)}"

def capacity(maximum, superuser, reserved, observed):
    reserve = max(10, (maximum + 4) // 5, superuser + reserved + 5, observed + 5)
    return maximum - reserve

def check_deadline():
    require(dt.datetime.now(dt.timezone.utc) < DEADLINE, "STAGING_PRESERVATION_EXPIRED")

def psql(port, database, user, password, sql, label, timeout=45):
    env = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
    env.update(PGPASSWORD=password, PGSSLMODE="require", PGCONNECT_TIMEOUT="8",
               PGAPPNAME="secumie-general-staging-bootstrap",
               PGOPTIONS="-c statement_timeout=15000 -c lock_timeout=2000")
    return command(["psql", "-X", "-qAt", "-w", "-v", "ON_ERROR_STOP=1",
                    "-h", "127.0.0.1", "-p", str(port), "-U", user, "-d", database],
                   label, sql.encode("utf-8"), env, timeout=timeout).decode("utf-8").strip()

def list_secret_versions(secret_name):
    # gcloud secrets versions list takes SECRET as a positional argument.
    return gc_json(["secrets", "versions", "list", secret_name], "RECOVERY_SECRET_VERSIONS_" + secret_name)

def metadata_preflight(recover=False):
    check_deadline()
    for executable in ("gcloud", "psql"):
        require(shutil.which(executable), "MISSING_" + executable.upper())
    instance = gc_json(["sql", "instances", "describe", INSTANCE], "INSTANCE")
    settings = instance.get("settings", {})
    ips = instance.get("ipAddresses", [])
    require(instance.get("name") == INSTANCE and instance.get("region") == REGION
            and instance.get("state") == "RUNNABLE" and instance.get("databaseVersion") == "POSTGRES_16"
            and settings.get("tier") == "db-custom-2-7680"
            and settings.get("availabilityType") == "ZONAL"
            and settings.get("deletionProtectionEnabled") is True
            and settings.get("backupConfiguration", {}).get("enabled") is True
            and settings.get("backupConfiguration", {}).get("pointInTimeRecoveryEnabled") is True
            and [x.get("ipAddress") for x in ips if x.get("type") == "PRIVATE"] == [IP]
            and not any(x.get("type") == "PRIMARY" for x in ips), "STAGING_INSTANCE_MISMATCH")
    backups = gc_json(["sql", "backups", "list", "--instance=" + INSTANCE, "--limit=30"], "BACKUPS")
    recent = []
    for backup in backups:
        if backup.get("status") == "SUCCESSFUL" and backup.get("type") == "AUTOMATED" and backup.get("endTime"):
            recent.append(dt.datetime.fromisoformat(backup["endTime"].replace("Z", "+00:00")))
    require(recent and dt.datetime.now(dt.timezone.utc) - max(recent) < dt.timedelta(hours=48), "RECENT_AUTOMATED_BACKUP_REQUIRED")
    existing = gc_json(["secrets", "list"], "SECRET_INVENTORY")
    names = {x["name"].rsplit("/", 1)[-1] for x in existing}
    require(BOOT in names, "BOOTSTRAP_SECRET_MISSING")
    new_secrets = {v[1] for v in ROLES.values()} | {RECEIPT}
    if recover:
        require(new_secrets <= names, "RECOVERY_SECRET_SET_MISMATCH")
        for secret_name in sorted(new_secrets):
            versions = list_secret_versions(secret_name)
            require(len(versions) == 1 and versions[0]["name"].endswith("/1") and versions[0]["state"] == "ENABLED",
                    "RECOVERY_SECRET_VERSION_MISMATCH")
    else:
        require(not names.intersection(new_secrets), "GENERAL_SECRET_COLLISION_STOP")
    version = gc_json(["secrets", "versions", "describe", "1", "--secret=" + BOOT], "BOOTSTRAP_VERSION")
    require(version.get("state") == "ENABLED", "BOOTSTRAP_VERSION_DISABLED")
    vms = gc_json(["compute", "instances", "list", "--filter=name=" + VM], "IAP_VM")
    require(len(vms) == 1 and vms[0].get("name") == VM and vms[0].get("status") == "RUNNING", "IAP_VM_MISMATCH")
    zone = vms[0]["zone"].rsplit("/", 1)[-1]
    require(zone.startswith(REGION + "-"), "IAP_VM_ZONE_MISMATCH")
    print("METADATA_PREFLIGHT=PASS", flush=True)
    return zone

def db_preflight(port, password, recover=False, migrate=False):
    sql = """
SELECT json_build_object(
 'db',current_database(),'usr',current_user,
 'version',current_setting('server_version_num')::int,
 'max',current_setting('max_connections')::int,
 'super',current_setting('superuser_reserved_connections')::int,
 'reserved',coalesce(current_setting('reserved_connections',true),'0')::int,
 'observed',(SELECT count(*) FROM pg_stat_activity),
 'dbs',(SELECT json_agg(datname ORDER BY datname) FROM pg_database WHERE NOT datistemplate),
 'roles',(SELECT json_object_agg(rolname,rolconnlimit) FROM pg_roles WHERE rolcanlogin AND rolname ~* '(secumie|secure.?guard|sales.?tools)'),
 'new_roles',(SELECT count(*) FROM pg_roles WHERE rolname IN ('secumie_general_migration_staging','secumie_general_writer_staging','secumie_general_staff_staging')),
 'valid_new_roles',(SELECT coalesce(json_object_agg(rolname,rolconnlimit),'{}'::json) FROM pg_roles
  WHERE rolname IN ('secumie_general_migration_staging','secumie_general_writer_staging','secumie_general_staff_staging')
  AND rolcanlogin AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls)
  AND NOT EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=pg_roles.oid OR m.roleid=pg_roles.oid)),
 'bootstrap_createdb',(SELECT rolcreatedb FROM pg_roles WHERE rolname=current_user),
 'bootstrap_superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=current_user),
 'public_connect',(SELECT coalesce(json_agg(d.datname),'[]'::json) FROM pg_database d WHERE NOT d.datistemplate AND d.datname NOT IN ('postgres','cloudsqladmin') AND EXISTS(SELECT 1 FROM aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a WHERE a.grantee=0 AND a.privilege_type='CONNECT')),
 'log_statement',current_setting('log_statement'),
 'log_min_duration',current_setting('log_min_duration_statement'),
 'log_min_sample',current_setting('log_min_duration_sample',true),
 'pgaudit',coalesce(current_setting('pgaudit.log',true),'none'),
 'web_clients',(SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend' AND usename IN ('secumie_web_admin_staging','secumie_web_migration_staging'))
);
"""
    m = json.loads(psql(port, "postgres", "postgres", password, sql, "DB_PREFLIGHT"))
    require(m["db"] == "postgres" and m["usr"] == "postgres" and 160000 <= m["version"] < 170000, "DB_IDENTITY_STOP")
    expected_roles = dict(EXPECTED_ROLES)
    new_roles = {name: value[0] for name, value in ROLES.items()}
    if recover:
        expected_roles.update(new_roles)
        require(m["new_roles"] == 3 and m["valid_new_roles"] == new_roles, "RECOVERY_ROLE_ATTRIBUTES_STOP")
    else:
        require(m["new_roles"] == 0, "GENERAL_ROLE_COLLISION_STOP")
    expected_dbs = EXPECTED_DBS | ({DB} if migrate else set())
    require(set(m["dbs"]) == expected_dbs and m["roles"] == expected_roles, "EXISTING_DB_OR_ROLE_INVENTORY_CHANGED")
    require(m["bootstrap_createdb"] and not m["bootstrap_superuser"], "BOOTSTRAP_ROLE_IDENTITY_STOP")
    available = capacity(m["max"], m["super"], m["reserved"], m["observed"])
    require(available >= 86 and m["observed"] < int(m["max"] * .7), "CAPACITY_STOP")
    require(m["web_clients"] == 0, "UNBOUNDED_WEB_ROLE_ACTIVE_STOP")
    require(not m["public_connect"], "EXISTING_APPLICATION_DB_PUBLIC_CONNECT_STOP:" + ",".join(m["public_connect"]))
    require(m["log_statement"] == "none" and m["log_min_duration"] == "-1"
            and m["log_min_sample"] in (None, "-1") and m["pgaudit"].lower() in ("none", ""),
            "SQL_STATEMENT_LOGGING_STOP")
    print(json.dumps({"event": "DB_PREFLIGHT_PASS", "available": available, "observed": m["observed"],
                      "existing_budget": 78, "new_stage_role_budget": 7, "operator_reserve": 1}), flush=True)

def provision(port, bootstrap):
    check_deadline()
    passwords = {name: secrets.token_urlsafe(48) for name in ROLES}
    receipt = secrets.token_urlsafe(48)
    for name, (_, secret_name) in ROLES.items():
        check_deadline()
        gc(["secrets", "create", secret_name, "--replication-policy=automatic", "--data-file=-"],
           "SECRET_CREATE_" + secret_name, passwords[name].encode("ascii"))
        print("CREATED_SECRET=" + secret_name, flush=True)
    gc(["secrets", "create", RECEIPT, "--replication-policy=automatic", "--data-file=-"],
       "SECRET_CREATE_RECEIPT", receipt.encode("ascii"))
    print("CREATED_SECRET=" + RECEIPT, flush=True)
    check_deadline()
    statements = ["BEGIN;"]
    for name, (limit, _) in ROLES.items():
        # Only a client-generated SCRAM verifier, not the password, reaches the DDL statement.
        verifier = scram_verifier(passwords[name])
        statements.append(f"CREATE ROLE {name} LOGIN PASSWORD '{verifier}' CONNECTION LIMIT {limit} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;")
    statements.append("COMMIT;")
    psql(port, "postgres", "postgres", bootstrap, "\n".join(statements), "CREATE_ROLES")
    print("CREATED_ROLES=3", flush=True)
    check_deadline()
    create_database_and_acl(port, bootstrap, passwords)

def create_database_and_acl(port, bootstrap, passwords):
    # Cloud SQL's non-superuser postgres cannot SET ROLE to independently created login roles.
    # Reuse the successful Insight recovery pattern: postgres owns only this new database.
    check_deadline()
    psql(port, "postgres", "postgres", bootstrap,
         f"CREATE DATABASE {DB};", "CREATE_DATABASE")
    print("CREATED_DATABASE=" + DB, flush=True)
    psql(port, DB, "postgres", bootstrap,
         f"BEGIN; REVOKE CONNECT,TEMPORARY ON DATABASE {DB} FROM PUBLIC;"
         f" GRANT CONNECT ON DATABASE {DB} TO postgres,{','.join(ROLES)};"
         f" GRANT CREATE ON DATABASE {DB} TO secumie_general_migration_staging;"
         " REVOKE ALL ON SCHEMA public FROM PUBLIC;"
         " GRANT USAGE,CREATE ON SCHEMA public TO secumie_general_migration_staging;"
         " COMMIT;", "DATABASE_ACL")
    result = json.loads(psql(port, DB, "postgres", bootstrap, """
SELECT json_build_object(
 'owner',(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()),
 'public_connect',(SELECT EXISTS(SELECT 1 FROM aclexplode(coalesce(datacl,acldefault('d',datdba))) WHERE grantee=0 AND privilege_type IN ('CONNECT','TEMPORARY')) FROM pg_database WHERE datname=current_database()),
 'roles',(SELECT json_object_agg(rolname,rolconnlimit) FROM pg_roles WHERE rolname IN ('secumie_general_migration_staging','secumie_general_writer_staging','secumie_general_staff_staging') AND rolcanlogin AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls) AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=pg_roles.oid)),
 'public_schema_access',(SELECT EXISTS(SELECT 1 FROM aclexplode(coalesce(nspacl,acldefault('n',nspowner))) WHERE grantee=0 AND privilege_type IN ('USAGE','CREATE')) FROM pg_namespace WHERE nspname='public'),
 'migration_create',has_database_privilege('secumie_general_migration_staging',current_database(),'CREATE') AND has_schema_privilege('secumie_general_migration_staging','public','USAGE') AND has_schema_privilege('secumie_general_migration_staging','public','CREATE'),
 'runtime_create',(SELECT bool_or(has_database_privilege(rolname,current_database(),'CREATE') OR has_schema_privilege(rolname,'public','CREATE')) FROM pg_roles WHERE rolname IN ('secumie_general_writer_staging','secumie_general_staff_staging')),
 'connect_count',(SELECT count(*) FROM pg_roles WHERE rolname IN ('secumie_general_migration_staging','secumie_general_writer_staging','secumie_general_staff_staging') AND has_database_privilege(rolname,current_database(),'CONNECT')),
 'schema_exists',EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='secumie_general'));
""", "POSTCHECK"))
    require(result["owner"] == "postgres" and result["public_connect"] is False
            and result["public_schema_access"] is False and result["migration_create"] is True
            and result["runtime_create"] is False and result["connect_count"] == 3
            and result["roles"] == {name: value[0] for name, value in ROLES.items()}
            and result["schema_exists"] is False, "POSTCHECK_MISMATCH")
    for name, pwd in passwords.items():
        identity = psql(port, DB, name, pwd, "SELECT current_user;", "ROLE_AUTH_" + name)
        require(identity == name, "ROLE_IDENTITY_MISMATCH")
    for _, secret_name in ROLES.values():
        require(gc_json(["secrets", "versions", "describe", "1", "--secret=" + secret_name], "SECRET_POSTCHECK").get("state") == "ENABLED", "SECRET_VERSION_NOT_ENABLED")
    require(gc_json(["secrets", "versions", "describe", "1", "--secret=" + RECEIPT], "SECRET_POSTCHECK").get("state") == "ENABLED", "SECRET_VERSION_NOT_ENABLED")
    print("DATABASE_OWNER=postgres; ROLE_AUTH=PASS; DATABASE_ACL=PASS", flush=True)
    print("GENERAL_STAGING_BOOTSTRAP=PASS", flush=True)
    print("MIGRATION=NOT_APPLIED; PRODUCTION=UNCHANGED", flush=True)

def recover_database(port, bootstrap):
    passwords = {name: gc(["secrets", "versions", "access", "1", "--secret=" + secret_name],
                         "RECOVERY_SECRET_ACCESS").decode("utf-8")
                 for name, (_, secret_name) in ROLES.items()}
    require(all(len(pwd) >= 32 and "\n" not in pwd and "\r" not in pwd for pwd in passwords.values())
            and len(set(passwords.values())) == 3, "RECOVERY_SECRET_FORMAT_STOP")
    # Authenticate the preserved role passwords before any new DDL. Existing postgres
    # database is used solely to verify current_user; no data or changes.
    for name, pwd in passwords.items():
        require(psql(port, "postgres", name, pwd, "SELECT current_user;", "RECOVERY_ROLE_AUTH") == name,
                "RECOVERY_ROLE_IDENTITY_STOP")
    print("PRESERVED_SECRETS=4; PRESERVED_ROLES=3; RECOVERY_ROLE_AUTH=PASS", flush=True)
    create_database_and_acl(port, bootstrap, passwords)

def migrate_database(port, migration_dir, apply):
    from pathlib import Path
    from secumie_general_staging_migrate import read_migrations, migration_preflight_sql, migration_batch, verify_sql, verify_result
    files = read_migrations(Path(migration_dir))
    print("MIGRATION_MANIFEST=PASS; FILES=6", flush=True)
    migration = "secumie_general_migration_staging"
    password = gc(["secrets", "versions", "access", "1", "--secret=" + ROLES[migration][1]], "MIGRATION_SECRET_ACCESS").decode("utf-8")
    require(len(password) >= 32 and "\n" not in password and "\r" not in password, "MIGRATION_SECRET_FORMAT_STOP")
    # Repeat the exact preflight inside the advisory-lock session before any DDL.
    psql(port, DB, migration, password, migration_preflight_sql(), "MIGRATION_PREFLIGHT")
    print("MIGRATION_TARGET_PREFLIGHT=PASS; DATABASE=" + DB, flush=True)
    if not apply:
        print("READ_ONLY_PREFLIGHT=PASS; NO_MIGRATIONS_APPLIED", flush=True)
        return
    check_deadline()
    result = psql(port, DB, migration, password, migration_batch(files), "MIGRATION_BATCH", timeout=180)
    for line in result.splitlines():
        if line.startswith("MIGRATION_APPLIED="):
            print(line, flush=True)
    evidence = json.loads(psql(port, DB, migration, password, verify_sql(), "MIGRATION_VERIFY"))
    verify_result(evidence)
    for role in ("secumie_general_writer_staging", "secumie_general_staff_staging"):
        pwd = gc(["secrets", "versions", "access", "1", "--secret=" + ROLES[role][1]], "RUNTIME_SECRET_ACCESS").decode("utf-8")
        require(len(pwd) >= 32 and "\n" not in pwd and "\r" not in pwd, "RUNTIME_SECRET_FORMAT_STOP")
        actual = psql(port, DB, role, pwd, "SELECT current_user; SELECT id FROM secumie_general.lead LIMIT 0;", "RUNTIME_ROLE_AUTH")
        require(actual == role, "RUNTIME_ROLE_IDENTITY_STOP")
    print(json.dumps({"event": "GENERAL_STAGING_MIGRATION_VERIFIED", **evidence}), flush=True)
    print("GENERAL_STAGING_MIGRATION=PASS; PRODUCTION=UNCHANGED", flush=True)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="only after owner-authorized staging bootstrap")
    parser.add_argument("--recover", action="store_true", help="resume after committed secrets and roles; only when target DB absent")
    parser.add_argument("--migrate", metavar="DIRECTORY", help="apply exact fresh staging migrations 001-006; never resume partial ledger")
    args = parser.parse_args()
    require(not (args.recover and args.migrate), "MODE_CONFLICT_STOP")
    zone = metadata_preflight(args.recover or bool(args.migrate))
    # Use established IAP route, no network/firewall configuration change.
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    proc = subprocess.Popen(["gcloud", "compute", "ssh", VM, "--project=" + PROJECT, "--zone=" + zone,
        "--tunnel-through-iap", "--quiet", "--", "-N", "-L", f"127.0.0.1:{port}:{IP}:5432",
        "-o", "ExitOnForwardFailure=yes", "-o", "BatchMode=yes"],
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    try:
        for _ in range(40):
            require(proc.poll() is None, "IAP_TUNNEL_FAILED")
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=1):
                    break
            except OSError:
                time.sleep(1)
        else:
            raise Stop("IAP_TUNNEL_TIMEOUT")
        bootstrap = gc(["secrets", "versions", "access", "1", "--secret=" + BOOT], "BOOTSTRAP_ACCESS").decode("utf-8")
        require(len(bootstrap) >= 32 and "\n" not in bootstrap and "\r" not in bootstrap, "BOOTSTRAP_SECRET_FORMAT_STOP")
        db_preflight(port, bootstrap, args.recover or bool(args.migrate), bool(args.migrate))
        if args.migrate:
            migrate_database(port, args.migrate, args.apply)
        elif args.apply:
            if args.recover:
                recover_database(port, bootstrap)
            else:
                provision(port, bootstrap)
        else:
            print("READ_ONLY_PREFLIGHT=PASS; NO_RESOURCES_CREATED", flush=True)
    finally:
        import signal
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            proc.wait()

if __name__ == "__main__":
    try:
        main()
    except Stop as exc:
        print("STOP: " + str(exc) + " — do not rerun blindly; preserve preceding creation markers.", file=sys.stderr)
        sys.exit(2)
    except Exception:
        print("STOP: UNEXPECTED_FAILURE — no credential or exception dump; inspect only non-secret metadata.", file=sys.stderr)
        sys.exit(3)
