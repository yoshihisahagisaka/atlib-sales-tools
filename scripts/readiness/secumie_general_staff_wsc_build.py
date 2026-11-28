#!/usr/bin/env python3
"""Build only the staff WSC overlay from the verified phase3 security image."""
import argparse, datetime as dt, hashlib, json, re, subprocess, sys, tempfile
from pathlib import Path
import secumie_general_production_candidate as c
import secumie_general_staff_production_candidate as staff
from secumie_general_staff_security_delta import read_scan, normalize, compare, BLOCKERS

ROOT=Path(__file__).resolve().parents[2]
SOURCE="50a1ed5fcdf1529ce946e16e00feafa16c753500"
LEGACY="340076c356121ac58d9c6ca13ed4581b28734961"
BASE=staff.BASE+"@sha256:4909dbae09d33a927de125d72343d3612020ffe9164b8071735f3c6c6f48ecad"
BASE_SCAN="projects/msp-zabbix/locations/asia/scans/0625ce30-9a67-4c9b-aefd-69ca59f63a5d"
OVERLAY=ROOT/"release/secumie-general-staff-wsc-overlay"
FILES={
    "src/wsc/vendor/tools/wsc-phase2c/restricted-network-probe.mjs": [
        "650030bbe6b4afd42aee97c9ce81f6989658a170",
        "fd5a2e6d7a8365aaf85d4c3f6af3e02af6afb96d",
        "25cccef9d3f6639f03e0f604709128a5e65a496f"
    ],
    "src/wsc/vendor/tools/wsc-vs1/engine.mjs": [
        "888617f4d6c70a6eb4d2b19e866d0abcd52a7267",
        "5388d1c452960eabd3a200b735e4d6d1e1993be8",
        "0d577a4d8c58b1c413c890ef80f5cc455ea9ecb8"
    ],
    "src/wsc/vendor/tools/wsc-vs1/explanations.json": [
        "ea27f5f3623d5ff68050fcf2607dae48417497e9",
        "ea27f5f3623d5ff68050fcf2607dae48417497e9",
        "e6563ffd68d9e083e8b66fb7c991cdf1801ea51c"
    ],
    "src/wsc/vendor/tools/wsc-vs1/rules.json": [
        "ac6c1448d205d6987197ce3d4095a4551bbf7b7d",
        "ac6c1448d205d6987197ce3d4095a4551bbf7b7d",
        "ad3aa436079aacd96275d5c4a56b5b5215a836fa"
    ]
}
TESTS=("test/wscMailDns.test.mjs","test/wscDiagnosisAccuracy.test.mjs","test/wscPublicDestination.test.mjs","test/wscPresentation.test.mjs")
PUBLIC={"secumie-web-general-prod":"secumie-web-general-prod-wsc-copy-50a1ed5","secumie-insight-general-prod":"secumie-insight-general-prod-notify-03e48d9"}

def git(*args):
    p=subprocess.run(["git","-C",str(ROOT),*args],capture_output=True,timeout=120)
    c.require(p.returncode==0,"GIT_SOURCE_READ_STOP")
    return p.stdout

def blob(b):
    return hashlib.sha1(("blob "+str(len(b))+"\0").encode()+b).hexdigest()

def write(path,b):
    path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(b);path.chmod(0o644)

def context(dest):
    for name,hashes in FILES.items():
        data=git("show",SOURCE+":"+name)
        c.require(blob(data)==hashes[2] and git("show","HEAD:"+name)==data,"EXACT_WSC_SOURCE_STOP_"+Path(name).name)
        write(dest/name,data)
    for name in TESTS:write(dest/name,git("show",SOURCE+":"+name))
    for suite in ("wsc-vs1","wsc-phase2c"):
        write(dest/"test"/"vendor"/suite/"test.mjs",git("show",SOURCE+":src/wsc/vendor/tools/"+suite+"/test.mjs"))
    for name in ("engine.mjs","rules.json","explanations.json"):
        write(dest/"test"/"legacy"/name,git("show",LEGACY+":src/wsc/vendor/tools/wsc-vs1/"+name))
    for name in ("Dockerfile","verify.cjs","staff-regression.cjs"):write(dest/name,(OVERLAY/name).read_bytes())
    write(dest/"schema-probe.cjs",(ROOT/"release/secumie-general-staff-security-zod/probe.cjs").read_bytes())
    write(dest/"manifest.json",json.dumps(FILES,sort_keys=True).encode())
    for p in dest.rglob("*"):
        if p.is_dir():p.chmod(0o755)
    print("APPROVED_WSC_SOURCE=PASS; FOUR_RUNTIME_FILES",flush=True)

def anchors():
    s=c.read_service(staff.SERVICE)
    c.require(c.traffic_is_old(s,staff.OLD),"STAFF_LIVE_REVISION_CHANGED")
    c.require(c.read_revision(staff.OLD)["status"]["imageDigest"]==staff.OLD_IMAGE,"STAFF_LIVE_IMAGE_CHANGED")
    for service,revision in PUBLIC.items():
        c.require(c.traffic_is_old(c.read_service(service),revision),"PUBLIC_TRAFFIC_DRIFT_"+service)
    return s["spec"]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build",action="store_true")
    parser.add_argument("--check-source",action="store_true")
    a=parser.parse_args()
    c.require(not(a.build and a.check_source),"MODE_STOP")
    with tempfile.TemporaryDirectory(prefix="staff-wsc-") as tmp:
        work=Path(tmp);src=work/"source";src.mkdir();context(src)
        if a.check_source:return
        before=anchors()
        c.require(c.gc(["artifacts","docker","images","describe",BASE,"--format=value(image_summary.digest)"],"BASE_IMAGE").strip()==BASE.split("@")[1],"STAFF_BASE_DIGEST_STOP")
        old=read_scan(BASE_SCAN);counts,findings=normalize(old)
        c.require(dict(counts)=={"CRITICAL":1,"HIGH":30,"MEDIUM":39,"LOW":143,"MINIMAL":103,"UNKNOWN":13},"STAFF_BASE_SCAN_COUNTS_STOP")
        c.require(not any(k[-1] in BLOCKERS and any(v) for k,v in findings.items()),"BASE_FIX_AVAILABLE_STOP")
        if not a.build:print("READ_ONLY_PREFLIGHT=PASS");return
        tag=staff.BASE+":secumie-staff-wsc-"+SOURCE[:7]+"-"+dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d%H%M%S")
        head=git("rev-parse","HEAD").decode().strip()
        config={"steps":[{"name":"gcr.io/cloud-builders/docker","args":["build","--platform=linux/amd64","--network=none","--target=runtime","--build-arg=SOURCE_REVISION="+head,"--tag="+tag,"."]}],"images":[tag],"timeout":"1800s"}
        f=work/"build.json";f.write_text(json.dumps(config))
        bid=c.gc(["builds","submit",str(src),"--region="+c.REGION,"--config="+str(f),"--async","--format=value(id)"],"STAFF_WSC_BUILD").strip()
        c.require(re.fullmatch(r"[a-f0-9-]{36}",bid) is not None,"BUILD_ID_STOP");print("BUILD_ID="+bid,flush=True)
        proc=subprocess.run(["gcloud","builds","log",bid,"--project="+c.PROJECT,"--region="+c.REGION,"--stream"],timeout=1900)
        c.require(proc.returncode==0,"BUILD_LOG_STOP")
        build=c.gj(["builds","describe",bid,"--region="+c.REGION],"STAFF_WSC_BUILD_RESULT")
        c.require(build.get("status")=="SUCCESS","BUILD_NOT_SUCCESS")
        ds=[x["digest"] for x in build["results"]["images"] if x.get("name")==tag]
        c.require(len(ds)==1 and re.fullmatch(r"sha256:[0-9a-f]{64}",ds[0]) is not None,"BUILD_DIGEST_STOP")
        image=staff.BASE+"@"+ds[0];c.require(image!=BASE,"IMAGE_UNCHANGED");print("STAFF_WSC_IMAGE="+image,flush=True)
        scan=c.gc(["artifacts","docker","images","scan",image,"--remote","--location=asia","--format=value(response.scan)"],"STAFF_WSC_SCAN").strip()
        print("SCAN_ID="+scan,flush=True)
        new=read_scan(scan);compare(old,new)
        nc,nf=normalize(new)
        c.require(not any(k[-1] in BLOCKERS for k in set(nf)-set(findings)),"NEW_OR_CHANGED_BLOCKER_STOP")
        c.require(not any(k[-1] in BLOCKERS and any(v) for k,v in nf.items()),"FIX_AVAILABLE_BLOCKER_STOP")
        c.require(anchors()==before,"STAFF_SPEC_CHANGED_DURING_BUILD")
        print("STAFF_WSC_BUILD_SCAN=PASS; RESIDUAL_STAFF_SECURITY_APPROVAL_REQUIRED",flush=True)
        print("SOURCE="+SOURCE+"; IMAGE="+image+"; BUILD_ID="+bid+"; SCAN_ID="+scan,flush=True)
        print("PRODUCTION_UNCHANGED; NO_DB_WRITE; NO_MIGRATION; NO_DEPLOY",flush=True)

if __name__=="__main__":
    try:main()
    except c.Stop as e:print("STOP: "+str(e)+"; preserve existing state and build/scan IDs",file=sys.stderr);sys.exit(2)
    except Exception:print("STOP: UNEXPECTED_FAILURE; no configuration dump",file=sys.stderr);sys.exit(3)
