#!/usr/bin/env python3
"""WEB diagnosis overlay: read-only preflight, one build and one new image scan. Never deploy."""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile

import secumie_general_production_candidate as c
import secumie_general_public_release as release

ROOT=Path(__file__).resolve().parents[2]
SOURCE="340076c356121ac58d9c6ca13ed4581b28734961"
SERVICE="secumie-web-general-prod"
OLD=SERVICE+"-notify-03e48d9"
BASE_IMAGE=c.BASE+"@sha256:4baf0622413b8d671d2d66c6f606ddfc313dfeb7ee417d9a964a35f04f97c9c8"
BASE_SCAN="projects/msp-zabbix/locations/asia/scans/9cb2789c-131e-4ea3-9b76-5bdd7a0d692c"
PREFIX="src/wsc/vendor/tools/"
FILES={
 PREFIX+"wsc-phase2c/restricted-network-probe.mjs":("fd5a2e6d7a8365aaf85d4c3f6af3e02af6afb96d","25cccef9d3f6639f03e0f604709128a5e65a496f"),
 PREFIX+"wsc-vs1/engine.mjs":("5388d1c452960eabd3a200b735e4d6d1e1993be8","6953e023a95dcdeb51e81aa02c65e486737d701d"),
 PREFIX+"wsc-vs1/explanations.json":("ea27f5f3623d5ff68050fcf2607dae48417497e9","9e9bcf8a8632c1f28abfaa6cc54062ecab7f7c25"),
 PREFIX+"wsc-vs1/rules.json":("ac6c1448d205d6987197ce3d4095a4551bbf7b7d","3627eea79b3a1ebffa5dc2b4faaeca7ef6e3590d"),
}
TESTS=("test/wscMailDns.test.mjs","test/wscDiagnosisAccuracy.test.mjs","test/wscPublicDestination.test.mjs")
CVE={"CVE-2026-107493","CVE-2026-84786","CVE-2026-107496"}
OVERLAY=ROOT/"release/secumie-web-diagnosis-overlay"

def git(*args):
    p=subprocess.run(["git","-C",str(ROOT),*args],capture_output=True,timeout=120)
    c.require(p.returncode==0,"GIT_SOURCE_READ_STOP")
    return p.stdout

def blob(data):
    return hashlib.sha1(("blob "+str(len(data))+"\0").encode()+data).hexdigest()

def write(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(data)
    path.chmod(0o644)

def context(directory):
    manifest={}
    for path,(old,new) in FILES.items():
        data=git("show",SOURCE+":"+path)
        c.require(blob(data)==new,"SOURCE_BLOB_STOP_"+Path(path).name)
        write(directory/path,data)
        manifest[path]={"before":old,"after":new}
    for path in TESTS:
        write(directory/path,git("show",SOURCE+":"+path))
    for name in ("Dockerfile","verify.cjs"):
        write(directory/name,(OVERLAY/name).read_bytes())
    write(directory/"manifest.json",json.dumps(manifest,sort_keys=True).encode())
    for path in directory.rglob("*"):
        if path.is_dir():path.chmod(0o755)
    print("APPROVED_SOURCE_FILES=PASS; FILE_COUNT=4",flush=True)

def baseline():
    state=c.read_service(SERVICE)
    release.check_public(SERVICE,state,OLD)
    c.require(release.traffic(state)==[(OLD,"",100)],"UNEXPECTED_WEB_TRAFFIC_TAG")
    rev=c.read_revision(OLD)
    c.require(any(x.get("type")=="Ready" and x.get("status")=="True" for x in rev.get("status",{}).get("conditions",[])),"WEB_NOT_READY")
    containers={x["name"]:x for x in rev["spec"]["containers"]}
    c.require(set(containers)=={"app","sql-proxy"} and containers["app"]["image"]==BASE_IMAGE,"SERVING_IMAGE_STOP")
    env=c.envmap(containers["app"])
    c.require(env.get("SECUMIE_GENERAL_KIND",{}).get("value")=="WEB" and env.get("SECUMIE_GENERAL_ENABLED",{}).get("value")=="true","WEB_RUNTIME_STOP")
    c.require(rev["spec"].get("serviceAccountName")==SERVICE+"@"+c.PROJECT+".iam.gserviceaccount.com","WEB_SA_STOP")
    c.require(c.gc(["artifacts","docker","images","describe",BASE_IMAGE,"--format=value(image_summary.digest)"],"BASE_IMAGE").strip()==BASE_IMAGE.split("@")[1],"BASE_DIGEST_STOP")
    print("WEB_BASELINE=PASS; REVISION="+OLD+"; IMAGE="+BASE_IMAGE,flush=True)
    return state

def scan_rows(scan):
    c.require(re.fullmatch(r"projects/msp-zabbix/locations/asia/scans/[0-9a-f-]{36}",scan) is not None,"SCAN_ID_STOP")
    rows=c.gj(["artifacts","docker","images","list-vulnerabilities",scan],"SCAN_VULNERABILITIES")
    c.require(isinstance(rows,list),"SCAN_FORMAT_STOP")
    return rows

def summarize(rows):
    counts={}
    blockers=set()
    for row in rows:
        v=row.get("vulnerability") or {}
        sev=v.get("effectiveSeverity") or "UNKNOWN"
        counts[sev]=counts.get(sev,0)+1
        if sev in ("LOW","MEDIUM","MINIMAL"):continue
        name=row.get("noteName","").split("/")[-1]
        issues=v.get("packageIssue") or []
        c.require(sev=="HIGH" and name in CVE and issues,"SECURITY_SCOPE_STOP_"+name)
        for issue in issues:
            package=issue.get("affectedPackage")
            ver=(issue.get("affectedVersion") or {}).get("fullName")
            fixed=(issue.get("fixedVersion") or {}).get("fullName") or ""
            typ=issue.get("packageType")
            c.require(package=="openssl" and ver=="3.5.9-1~deb13u1" and typ=="OS" and not fixed and not issue.get("fixAvailable"),"SECURITY_SCOPE_STOP_"+name)
            blockers.add((name,sev,package,ver,typ,fixed))
    return counts,blockers

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--build",action="store_true")
    p.add_argument("--check-source",action="store_true",help="local source/context check only")
    args=p.parse_args()
    c.require(not(args.build and args.check_source),"MODE_STOP")
    with tempfile.TemporaryDirectory(prefix="secumie-web-wsc-") as tmp:
        work=Path(tmp);src=work/"context";src.mkdir()
        context(src)
        if args.check_source:return
        c.deadline()
        state=baseline()
        base_counts,base_blockers=summarize(scan_rows(BASE_SCAN))
        print("BASELINE_SCAN_COUNTS="+json.dumps(base_counts,sort_keys=True),flush=True)
        if not args.build:
            print("READ_ONLY_PREFLIGHT=PASS; NO_BUILD_NO_DEPLOY",flush=True);return
        tag=c.BASE+":web-wsc-340076c-"+dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d%H%M%S")
        config={"steps":[{"name":"gcr.io/cloud-builders/docker","args":["build","--platform=linux/amd64","--network=none","--target=runtime","--build-arg=BASE_IMAGE="+BASE_IMAGE,"--build-arg=SOURCE_REVISION="+SOURCE,"--tag="+tag,"."]}],"images":[tag],"timeout":"1200s"}
        file=work/"build.json";file.write_text(json.dumps(config));file.chmod(0o600)
        bid=c.gc(["builds","submit",str(src),"--region="+c.REGION,"--config="+str(file),"--async","--format=value(id)"],"WSC_BUILD_SUBMIT").strip()
        c.require(re.fullmatch(r"[0-9a-f-]{36}",bid) is not None,"BUILD_ID_STOP")
        print("BUILD_ID="+bid,flush=True)
        proc=subprocess.run(["gcloud","builds","log",bid,"--project="+c.PROJECT,"--region="+c.REGION,"--stream"],timeout=1500)
        c.require(proc.returncode==0,"BUILD_LOG_STOP")
        build=c.gj(["builds","describe",bid,"--region="+c.REGION],"WSC_BUILD")
        c.require(build.get("status")=="SUCCESS","BUILD_NOT_SUCCESS")
        digests=[x.get("digest") for x in build.get("results",{}).get("images",[]) if x.get("name")==tag]
        c.require(len(digests)==1 and re.fullmatch(r"sha256:[a-f0-9]{64}",digests[0] or "") is not None,"BUILD_DIGEST_STOP")
        image=c.BASE+"@"+digests[0]
        c.require(image!=BASE_IMAGE,"IMAGE_UNCHANGED")
        print("WSC_CANDIDATE_IMAGE="+image,flush=True)
        scan=c.gc(["artifacts","docker","images","scan",image,"--remote","--location=asia","--format=value(response.scan)"],"WSC_SCAN").strip()
        print("SCAN_ID="+scan,flush=True)
        counts,blockers=summarize(scan_rows(scan))
        print("CANDIDATE_SCAN_COUNTS="+json.dumps(counts,sort_keys=True),flush=True)
        print("RESIDUAL_HIGH="+json.dumps(sorted(blockers)),flush=True)
        c.require(blockers<=base_blockers,"NEW_OR_CHANGED_BLOCKER_STOP")
        c.require(c.read_service(SERVICE)["spec"]==state["spec"],"WEB_SPEC_CHANGED_DURING_BUILD")
        release.check_public(SERVICE,c.read_service(SERVICE),OLD)
        print("WSC_CANDIDATE_BUILD_AND_SCAN=PASS; NO_NEW_BLOCKERS; RESIDUAL_EXCEPTION_REVIEW_REQUIRED="+str(bool(blockers)).lower(),flush=True)
        print("SOURCE="+SOURCE+"; IMAGE="+image+"; BUILD_ID="+bid+"; SCAN_ID="+scan,flush=True)
        print("PRODUCTION_TRAFFIC=UNCHANGED; NO_DEPLOY; NO_DB_OR_IAM_WRITE",flush=True)

if __name__=="__main__":
    try:
        main()
    except c.Stop as exc:
        print("STOP: "+str(exc)+"; preserve build/scan IDs; do not blindly rerun",file=sys.stderr)
        sys.exit(2)
    except Exception:
        print("STOP: UNEXPECTED_FAILURE; preserve partial state; no config dump",file=sys.stderr)
        sys.exit(3)
