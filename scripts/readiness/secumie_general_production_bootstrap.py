#!/usr/bin/env python3
"""One-shot GENERAL production logical DB only. No Cloud Run, IAM or existing DB changes."""
import argparse
import datetime as dt
import ipaddress
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import ssl
import subprocess
import sys
import tempfile
import time

# Reuse only the proven operator utilities. Staging target functions are never called.
from secumie_general_staging_bootstrap import Stop, require, command, gc, gc_json, capacity, scram_verifier
from secumie_general_production_migrate import (
    DB, MIGRATION, WRITER, STAFF, production_files, batch_sql, verify_sql, verify_result, TABLES,
)

PROJECT = "msp-zabbix"
REGION = "asia-northeast1"
INSTANCE = "secumie-sg-shared-prod-db"
CONNECTION = f"{PROJECT}:{REGION}:{INSTANCE}"
TARGET = f"{CONNECTION}/{DB}"
VM = "msp-frontend-server"
BOOT = "secumie-prod-db-bootstrap-password"
ROLES = {
    MIGRATION: (1, "secumie-general-prod-db-migration-password"),
    WRITER: (4, "secumie-general-prod-db-writer-password"),
    STAFF: (40, "secumie-general-prod-db-staff-password"),
}
RECEIPT = "secumie-general-prod-receipt-secret"
EXISTING_DBS = {"postgres", "cloudsqladmin", "secumie_insight"}
EXISTING_ROLES = {"secumie_admin_prod": 40, "secumie_maintenance_prod": 1,
                  "secumie_migration_prod": 1, "secumie_otp_prod": 6, "secumie_pira_prod": 6}
EXISTING_BUDGET = 78
REQUIRED = EXISTING_BUDGET + sum(v[0] for v in ROLES.values()) + 2  # operator + future maintenance
NAMES = {v[1] for v in ROLES.values()} | {RECEIPT}

def metadata(work):
    for name in ("gcloud", "psql"):
        require(shutil.which(name), "MISSING_" + name.upper())
    instance = gc_json(["sql", "instances", "describe", INSTANCE], "PRODUCTION_INSTANCE")
    settings = instance.get("settings", {})
    cfg = settings.get("ipConfiguration", {})
    ips = instance.get("ipAddresses", [])
    private = [x["ipAddress"] for x in ips if x.get("type") == "PRIVATE"]
    require(instance.get("name") == INSTANCE and instance.get("region") == REGION
            and instance.get("connectionName") == CONNECTION and instance.get("state") == "RUNNABLE"
            and instance.get("databaseVersion") == "POSTGRES_16"
            and settings.get("tier") == "db-custom-2-7680"
            and settings.get("availabilityType") == "REGIONAL"
            and settings.get("deletionProtectionEnabled") is True
            and settings.get("backupConfiguration", {}).get("enabled") is True
            and settings.get("backupConfiguration", {}).get("pointInTimeRecoveryEnabled") is True
            and cfg.get("ipv4Enabled") is False
            and (cfg.get("privateNetwork") or "").endswith("/global/networks/default")
            and len(private) == 1 and ipaddress.ip_address(private[0]).is_private
            and not any(x.get("type") == "PRIMARY" for x in ips), "PRODUCTION_INSTANCE_MISMATCH")
    # Trust the CA obtained for the exact instance via authenticated GCP metadata.
    # Operator IAP connection uses verify-ca, not plaintext/require-only fallback.
    require(cfg.get("serverCaMode", "GOOGLE_MANAGED_INTERNAL_CA") == "GOOGLE_MANAGED_INTERNAL_CA",
            "PRODUCTION_CA_MODE_REVIEW_REQUIRED")
    ca = instance.get("serverCaCert", {}).get("cert", "")
    require(isinstance(ca, str) and ca.startswith("-----BEGIN CERTIFICATE-----"), "PRODUCTION_CA_MISSING")
    ssl.PEM_cert_to_DER_cert(ca)
    ca_path = Path(work) / "server-ca.pem"
    ca_path.write_text(ca)
    os.chmod(ca_path, 0o600)
    backups = gc_json(["sql", "backups", "list", "--instance=" + INSTANCE, "--limit=30"], "PRODUCTION_BACKUPS")
    recent = [dt.datetime.fromisoformat(b["endTime"].replace("Z", "+00:00")) for b in backups
              if b.get("status") == "SUCCESSFUL" and b.get("type") == "AUTOMATED" and b.get("endTime")]
    require(recent and dt.datetime.now(dt.timezone.utc) - max(recent) < dt.timedelta(hours=48),
            "RECENT_PRODUCTION_BACKUP_REQUIRED")
    names = {x["name"].rsplit("/", 1)[-1] for x in gc_json(["secrets", "list"], "SECRET_INVENTORY")}
    require(BOOT in names and not names.intersection(NAMES), "PRODUCTION_SECRET_COLLISION_OR_BOOTSTRAP_MISSING")
    require(gc_json(["secrets", "versions", "describe", "1", "--secret=" + BOOT],
                    "BOOTSTRAP_VERSION").get("state") == "ENABLED", "BOOTSTRAP_VERSION_DISABLED")
    vms = gc_json(["compute", "instances", "list", "--filter=name=" + VM], "IAP_VM")
    require(len(vms) == 1 and vms[0].get("name") == VM and vms[0].get("status") == "RUNNING"
            and any((n.get("network") or "").endswith("/global/networks/default")
                    for n in vms[0].get("networkInterfaces", [])), "IAP_VM_MISMATCH")
    zone = vms[0]["zone"].rsplit("/", 1)[-1]
    require(zone.startswith(REGION + "-"), "IAP_VM_ZONE_MISMATCH")
    print("PRODUCTION_METADATA_PREFLIGHT=PASS", flush=True)
    return private[0], zone, ca_path

def psql(port, ca, database, user, password, sql, label, timeout=45):
    env = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
    env.update(PGPASSWORD=password, PGSSLMODE="verify-ca", PGSSLROOTCERT=str(ca), PGCONNECT_TIMEOUT="8",
               PGAPPNAME="secumie-general-production-operator",
               PGOPTIONS="-c statement_timeout=15000 -c lock_timeout=2000")
    return command(["psql", "-X", "-qAt", "-w", "-v", "ON_ERROR_STOP=1",
                    "-h", "127.0.0.1", "-p", str(port), "-U", user, "-d", database],
                   label, sql.encode("utf-8"), env, timeout=timeout).decode("utf-8").strip()

def preflight(port, ca, pwd):
    m = json.loads(psql(port, ca, "postgres", "postgres", pwd, """
SELECT json_build_object(
 'db',current_database(),'usr',current_user,'version',current_setting('server_version_num')::int,
 'ssl',(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),
 'max',current_setting('max_connections')::int,
 'super',current_setting('superuser_reserved_connections')::int,
 'reserved',coalesce(nullif(current_setting('reserved_connections',true),''),'0')::int,
 'observed',(SELECT count(*) FROM pg_stat_activity),
 'dbs',(SELECT json_agg(datname ORDER BY datname) FROM pg_database WHERE NOT datistemplate),
 'roles',(SELECT json_object_agg(rolname,rolconnlimit) FROM pg_roles WHERE rolcanlogin AND rolname ~* '(secumie|secure.?guard|sales.?tools)'),
 'bootstrap_ok',(SELECT rolcreatedb AND rolcreaterole AND NOT rolsuper FROM pg_roles WHERE rolname=current_user),
 'public_connect',(SELECT count(*) FROM pg_database d WHERE NOT d.datistemplate AND d.datname NOT IN ('postgres','cloudsqladmin')
    AND EXISTS(SELECT 1 FROM aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a WHERE a.grantee=0 AND a.privilege_type='CONNECT')),
 'log_statement',current_setting('log_statement'),
 'log_min_duration',current_setting('log_min_duration_statement'),
 'log_min_sample',current_setting('log_min_duration_sample',true),
 'pgaudit',coalesce(current_setting('pgaudit.log',true),'none'));
""", "PRODUCTION_DB_PREFLIGHT"))
    require(m["db"] == "postgres" and m["usr"] == "postgres" and m["ssl"] is True
            and 160000 <= m["version"] < 170000 and m["bootstrap_ok"] is True, "PRODUCTION_DB_IDENTITY_STOP")
    require(set(m["dbs"]) == EXISTING_DBS and m["roles"] == EXISTING_ROLES,
            "PRODUCTION_DB_OR_ROLE_INVENTORY_CHANGED")
    require(m["public_connect"] == 0, "EXISTING_APPLICATION_DB_PUBLIC_CONNECT_STOP")
    require(m["log_statement"] == "none" and m["log_min_duration"] == "-1"
            and m["log_min_sample"] in (None, "-1") and m["pgaudit"].lower() in ("none", ""),
            "SQL_STATEMENT_LOGGING_STOP")
    available = capacity(m["max"], m["super"], m["reserved"], m["observed"])
    require(available >= REQUIRED and m["observed"] < int(m["max"] * .7), "PRODUCTION_CAPACITY_STOP")
    print(json.dumps({"event":"PRODUCTION_DB_PREFLIGHT_PASS","available":available,"observed":m["observed"],
                      "existing_budget":EXISTING_BUDGET,"new_role_budget":sum(v[0] for v in ROLES.values()),
                      "required_including_reserve":REQUIRED}), flush=True)

def provision(port, ca, bootstrap, files):
    passwords = {name: secrets.token_urlsafe(48) for name in ROLES}
    for name, (_, secret_name) in ROLES.items():
        gc(["secrets", "create", secret_name, "--replication-policy=automatic", "--data-file=-"],
           "CREATE_" + secret_name, passwords[name].encode("ascii"))
        print("CREATED_SECRET=" + secret_name, flush=True)
    gc(["secrets", "create", RECEIPT, "--replication-policy=automatic", "--data-file=-"],
       "CREATE_RECEIPT", secrets.token_urlsafe(48).encode("ascii"))
    print("CREATED_SECRET=" + RECEIPT, flush=True)
    sql = ["BEGIN;"]
    for name, (limit, _) in ROLES.items():
        sql.append(f"CREATE ROLE {name} LOGIN PASSWORD '{scram_verifier(passwords[name])}' CONNECTION LIMIT {limit} "
                   "NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;")
    sql.append("COMMIT;")
    psql(port, ca, "postgres", "postgres", bootstrap, "\n".join(sql), "CREATE_PRODUCTION_ROLES")
    print("CREATED_ROLES=3", flush=True)
    # Prior Cloud SQL owner-boundary recovery: never CREATE DATABASE OWNER <migration>.
    psql(port, ca, "postgres", "postgres", bootstrap, f"CREATE DATABASE {DB};", "CREATE_PRODUCTION_DATABASE")
    print("CREATED_DATABASE=" + DB, flush=True)
    psql(port, ca, DB, "postgres", bootstrap,
         f"BEGIN; REVOKE CONNECT,TEMPORARY ON DATABASE {DB} FROM PUBLIC;"
         f" GRANT CONNECT ON DATABASE {DB} TO postgres,{','.join(ROLES)};"
         f" GRANT CREATE ON DATABASE {DB} TO {MIGRATION};"
         " REVOKE ALL ON SCHEMA public FROM PUBLIC;"
         f" GRANT USAGE,CREATE ON SCHEMA public TO {MIGRATION}; COMMIT;", "PRODUCTION_DATABASE_ACL")
    roles = json.loads(psql(port, ca, DB, "postgres", bootstrap, """
SELECT coalesce(json_object_agg(rolname,rolconnlimit),'{}'::json) FROM pg_roles
WHERE rolname IN ('secumie_general_migration_prod','secumie_general_writer_prod','secumie_general_staff_prod')
AND rolcanlogin AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls)
AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member=pg_roles.oid OR roleid=pg_roles.oid)
AND has_database_privilege(rolname,current_database(),'CONNECT');
""", "PRODUCTION_ROLE_POSTCHECK"))
    require(roles == {name: v[0] for name,v in ROLES.items()}, "PRODUCTION_ROLE_POSTCHECK_STOP")
    for name, pwd in passwords.items():
        require(psql(port, ca, DB, name, pwd, "SELECT current_database(),current_user;", "ROLE_AUTH_" + name)
                == DB + "|" + name, "PRODUCTION_ROLE_AUTH_STOP")
    for name in sorted(NAMES):
        versions = gc_json(["secrets", "versions", "list", name], "SECRET_VERSION_POSTCHECK")
        require(len(versions) == 1 and versions[0]["name"].endswith("/1") and versions[0]["state"] == "ENABLED",
                "PRODUCTION_SECRET_VERSION_STOP")
        require(not gc_json(["secrets","get-iam-policy",name], "SECRET_IAM_POSTCHECK").get("bindings"),
                "UNEXPECTED_DIRECT_SECRET_IAM_STOP")
    print("PRODUCTION_BOOTSTRAP=PASS; ROLE_AUTH=PASS", flush=True)
    result = psql(port, ca, DB, MIGRATION, passwords[MIGRATION], batch_sql(files), "PRODUCTION_MIGRATION_BATCH", timeout=180)
    for line in result.splitlines():
        if line.startswith("MIGRATION_APPLIED="):
            print(line, flush=True)
    evidence = json.loads(psql(port, ca, DB, MIGRATION, passwords[MIGRATION], verify_sql(), "PRODUCTION_MIGRATION_VERIFY"))
    verify_result(evidence, files)
    for table in TABLES:
        require(psql(port, ca, DB, MIGRATION, passwords[MIGRATION],
                     "SELECT count(*) FROM secumie_general." + table + ";", "EMPTY_TABLE_POSTCHECK") == "0",
                "UNEXPECTED_GENERAL_ROWS_STOP")
    for name in (WRITER, STAFF):
        require(psql(port, ca, DB, name, passwords[name],
                     "SELECT current_user; SELECT id FROM secumie_general.lead LIMIT 0;", "RUNTIME_ROLE_AUTH") == name,
                "RUNTIME_ROLE_AUTH_STOP")
    print(json.dumps({"event":"GENERAL_PRODUCTION_MIGRATION_VERIFIED", **evidence}), flush=True)
    print("GENERAL_PRODUCTION_DB=PASS; APPLICATION_TRAFFIC=UNCHANGED; NO_DEPLOY", flush=True)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    require(args.target == TARGET, "PRODUCTION_TARGET_MISMATCH")
    files = production_files(Path(__file__).resolve().parents[2])
    print("PRODUCTION_MIGRATION_EQUIVALENCE=PASS; FILES=6", flush=True)
    with tempfile.TemporaryDirectory(prefix="secumie-general-prod-") as work:
        ip, zone, ca = metadata(work)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        proc = subprocess.Popen(["gcloud","compute","ssh",VM,"--project="+PROJECT,"--zone="+zone,
                                 "--tunnel-through-iap","--quiet","--","-N","-L",f"127.0.0.1:{port}:{ip}:5432",
                                 "-o","ExitOnForwardFailure=yes","-o","BatchMode=yes"],
                                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                start_new_session=True)
        try:
            for _ in range(40):
                require(proc.poll() is None, "PRODUCTION_IAP_TUNNEL_FAILED")
                try:
                    with socket.create_connection(("127.0.0.1",port),timeout=1):
                        break
                except OSError:
                    time.sleep(1)
            else:
                raise Stop("PRODUCTION_IAP_TUNNEL_TIMEOUT")
            pwd = gc(["secrets","versions","access","1","--secret="+BOOT], "BOOTSTRAP_ACCESS").decode("utf-8")
            require(len(pwd) >= 32 and "\n" not in pwd and "\r" not in pwd, "BOOTSTRAP_SECRET_FORMAT_STOP")
            preflight(port, ca, pwd)
            if args.apply:
                provision(port, ca, pwd, files)
            else:
                print("READ_ONLY_PREFLIGHT=PASS; NO_RESOURCES_CREATED", flush=True)
        finally:
            try:
                os.killpg(proc.pid,signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(proc.pid,signal.SIGKILL)
                except ProcessLookupError:
                    pass
                proc.wait()

if __name__ == "__main__":
    try:
        main()
    except Stop as exc:
        print("STOP: "+str(exc)+"; preserve partial evidence, do not rerun blindly.",file=sys.stderr)
        sys.exit(2)
    except Exception:
        print("STOP: UNEXPECTED_PRODUCTION_FAILURE; no secret/exception dump.",file=sys.stderr)
        sys.exit(3)
