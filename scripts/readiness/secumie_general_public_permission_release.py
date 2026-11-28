#!/usr/bin/env python3
"""Resume public release after permission-only overlay. No staff or DB/IAM writes."""
import argparse
import copy
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import uuid
import yaml
import secumie_general_production_candidate as c
import secumie_general_public_release as release
from secumie_general_production_candidate_resume import OLD_DIGESTS, PROXY_MANIFEST, verify_candidate

SUFFIX="-lead-perm-f53ec9c"
BUILD_SOURCE="f53ec9cbea2b5f059cb0a2759e476f1afc5a21dc"
LB_IP="136.69.71.191"
CVE={"CVE-2026-107493","CVE-2026-84786","CVE-2026-107496"}

def check_scan(scan):
    c.require(re.fullmatch(r"projects/msp-zabbix/locations/asia/scans/[0-9a-f-]{36}",scan) is not None,"SCAN_ID_STOP")
    rows=c.gj(["artifacts","docker","images","list-vulnerabilities",scan],"PERMISSION_SCAN")
    c.require(isinstance(rows,list),"SCAN_FORMAT_STOP")
    counts={}
    for row in rows:
        v=row.get("vulnerability") or {}
        sev=v.get("effectiveSeverity") or "UNKNOWN"
        counts[sev]=counts.get(sev,0)+1
        if sev in ("LOW","MEDIUM","MINIMAL"):
            continue
        issues=v.get("packageIssue",[])
        if not (sev=="HIGH" and row.get("noteName","").split("/")[-1] in CVE and issues
                and all(x.get("affectedPackage")=="openssl" and
                        (x.get("affectedVersion") or {}).get("fullName")=="3.5.9-1~deb13u1" and
                        x.get("packageType")=="OS" and not (x.get("fixedVersion") or {}).get("fullName")
                        for x in issues)):
            print("SECURITY_UNAGREED="+json.dumps({"severity":sev,"note":row.get("noteName")}),flush=True)
            raise c.Stop("SECURITY_SCOPE_STOP")
    print("PERMISSION_SCAN_COUNTS="+json.dumps(counts,sort_keys=True),flush=True)
    print("SECURITY_FINDINGS_WITHIN_AGREED_SCOPE=PASS",flush=True)

def revision_check(service,rev,image,original):
    oldspec=original["spec"]
    spec=rev["spec"]
    c.require(spec.get("serviceAccountName")==oldspec.get("serviceAccountName"),"SA_CHANGED_"+service)
    a={x["name"]:x for x in spec["containers"]}
    b={x["name"]:x for x in oldspec["containers"]}
    c.require(set(a)==set(b)=={"app","sql-proxy"},"CONTAINER_SET_STOP_"+service)
    c.require(a["app"]["image"]==image and a["sql-proxy"]["image"] in (c.PROXY,PROXY_MANIFEST),
              "IMAGE_STOP_"+service)
    c.require(c.envmap(a["app"])==c.envmap(b["app"]),"APP_ENV_CHANGED_"+service)
    for key in ("args","resources","startupProbe","ports","command","volumeMounts"):
        c.require(a["app"].get(key)==b["app"].get(key),"APP_CONFIG_CHANGED_"+key+"_"+service)
    for key in ("args","resources","startupProbe"):
        c.require(a["sql-proxy"].get(key)==b["sql-proxy"].get(key),"PROXY_CONFIG_CHANGED_"+key+"_"+service)
    for key in ("containerConcurrency","timeoutSeconds","volumes"):
        c.require(spec.get(key)==oldspec.get(key),"RUNTIME_CONFIG_CHANGED_"+key+"_"+service)
    ann=rev["metadata"].get("annotations",{})
    prev=original["metadata"].get("annotations",{})
    for key in ("autoscaling.knative.dev/maxScale","autoscaling.knative.dev/minScale","run.googleapis.com/vpc-access-egress",
                "run.googleapis.com/network-interfaces","run.googleapis.com/container-dependencies"):
        c.require(ann.get(key)==prev.get(key),"RUNTIME_ANNOTATION_CHANGED_"+key+"_"+service)
    c.require(any(x.get("type")=="Ready" and x.get("status")=="True" for x in rev["status"].get("conditions",[])),
              "REVISION_NOT_READY_"+service)

def public_get(path):
    url=release.HOST+path+"?release_check="+uuid.uuid4().hex
    p=subprocess.run(["curl","-sS","--noproxy","*","--resolve","service.atlib.jp:443:"+LB_IP,
                      "--max-time","45","-H","Cache-Control: no-cache","-w","\n%{http_code}",url],
                     capture_output=True,timeout=50)
    body,sep,status=p.stdout.rpartition(b"\n")
    print("PUBLIC_HTTP="+(status.decode("ascii",errors="replace") if sep else "000")+"; PATH="+path+
          "; CURL_EXIT="+str(p.returncode),flush=True)
    c.require(p.returncode==0 and status==b"200","PUBLIC_HTTP_STOP_"+path)
    return body.decode("utf-8")

def smoke(kind):
    prefix=release.PATHS[kind]
    page=public_get(prefix)
    for marker in ('id="general-intake"','name="companyName"','name="personName"','name="email"',
                   'name="salesContactAllowed"','原則2年間保存','同意して診断に進む'):
        c.require(marker in page,"PUBLIC_FORM_MARKER_STOP_"+kind)
    c.require("__GENERAL_SITE_KEY__" not in page,"PUBLIC_SITEKEY_STOP_"+kind)
    js=public_get(prefix+"general.js")
    c.require("leadReceipt" in js and "consultation" in js,"PUBLIC_JS_STOP_"+kind)
    print("PUBLIC_NEW_FORM_AND_JS=PASS; KIND="+kind,flush=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image",required=True)
    parser.add_argument("--build-id",required=True)
    parser.add_argument("--scan",required=True)
    parser.add_argument("--apply",action="store_true")
    args=parser.parse_args()
    c.deadline()
    image=args.image
    c.require(re.fullmatch(re.escape(c.BASE)+r"@sha256:[a-f0-9]{64}",image) is not None and image!=c.IMAGE,"NEW_IMAGE_STOP")
    build=c.gj(["builds","describe",args.build_id,"--region="+c.REGION],"PERMISSION_BUILD")
    c.require(build.get("status")=="SUCCESS" and any(x.get("digest")==image.split("@")[1] for x in build.get("results",{}).get("images",[])),
              "PERMISSION_BUILD_DIGEST_STOP")
    c.require(any("--build-arg=SOURCE_REVISION="+BUILD_SOURCE in x.get("args",[]) for x in build.get("steps",[])),
              "PERMISSION_BUILD_SOURCE_STOP")
    c.require(c.gc(["artifacts","docker","images","describe",image,"--format=value(image_summary.digest)"],"PERMISSION_ARTIFACT").strip()==image.split("@")[1],
              "PERMISSION_ARTIFACT_STOP")
    check_scan(args.scan)
    staff=c.read_service(release.STAFF)
    c.require(c.traffic_is_old(staff,release.STAFF_OLD),"STAFF_ACTIVE_CHANGED")
    staff_traffic=release.traffic(staff)
    originals={}
    policies={}
    initial={}
    configs={}
    for service,(_,old) in c.SERVICES.items():
        ss=c.read_service(service)
        oldrev=c.read_revision(old)
        c.require(c.actual_digest(oldrev)==OLD_DIGESTS[service],"OLD_ROLLBACK_DIGEST_STOP_"+service)
        verify_candidate(service,ss,oldrev)
        prev=service+"-lead-42ca513"
        originals[service]=c.read_revision(prev)
        policies[service]=c.binding_set(c.policy(service))
        initial[service]=ss
        doc=yaml.safe_load(c.gc(c.runargs("services","describe",service)+["--format=export"],"EXPORT_"+service))
        tmpl=doc["spec"]["template"]
        containers={x["name"]:x for x in tmpl["spec"]["containers"]}
        c.require(set(containers)=={"app","sql-proxy"},"ORIGINAL_TEMPLATE_STOP_"+service)
        # The exact prior candidate revision was verified above; template image string is not authority.
        c.require(c.envmap(containers["app"])==c.envmap(next(x for x in originals[service]["spec"]["containers"] if x["name"]=="app")),
                  "TEMPLATE_ENV_STOP_"+service)
        containers["app"]["image"]=image
        tmpl["metadata"]["name"]=service+SUFFIX
        doc["spec"]["traffic"]=[{"revisionName":old,"percent":100}]
        configs[service]=doc
    print("PERMISSION_CANDIDATE_DEFINITIONS=PASS",flush=True)
    if not args.apply:
        return
    with tempfile.TemporaryDirectory(prefix="secumie-permission-release-") as tmp:
        for service,(_,old) in c.SERVICES.items():
            c.deadline()
            ss=c.read_service(service)
            release.check_public(service,ss,old)
            c.require(ss["spec"]==initial[service]["spec"],"SERVICE_TEMPLATE_CHANGED_"+service)
            file=Path(tmp)/(service+".yaml")
            file.write_text(yaml.safe_dump(configs[service],sort_keys=False))
            c.gc(c.runargs("services","replace",str(file)),"PERMISSION_CANDIDATE_DEPLOY_"+service)
            after=c.read_service(service)
            release.check_public(service,after,old)
            new=service+SUFFIX
            c.require(after["status"].get("latestCreatedRevisionName")==new,"CANDIDATE_NAME_STOP_"+service)
            revision_check(service,c.read_revision(new),image,originals[service])
            c.require(c.binding_set(c.policy(service))==policies[service],"PUBLIC_IAM_CHANGED_"+service)
            print("PERMISSION_CANDIDATE_READY="+new+"; TRAFFIC=0",flush=True)
    attempted=[]
    try:
        for service,(kind,old) in c.SERVICES.items():
            c.deadline()
            release.check_public(service,c.read_service(service),old)
            c.require(release.traffic(c.read_service(release.STAFF))==staff_traffic,"STAFF_TRAFFIC_CHANGED")
            new=service+SUFFIX
            attempted.append(service)
            release.switch(service,new)
            for attempt in range(3):
                try:
                    smoke(kind)
                    break
                except (c.Stop,subprocess.TimeoutExpired,OSError,UnicodeError):
                    if attempt==2:raise
                    time.sleep(5)
            print("PUBLIC_TRAFFIC_100="+new,flush=True)
        for service in c.SERVICES:
            release.check_public(service,c.read_service(service),service+SUFFIX)
        c.require(release.traffic(c.read_service(release.STAFF))==staff_traffic,"STAFF_TRAFFIC_CHANGED")
    except BaseException:
        failures=[]
        for service in reversed(attempted):
            old=c.SERVICES[service][1]
            try:
                ss=c.read_service(service)
                if c.traffic_is_old(ss,old):continue
                if not c.traffic_is_old(ss,service+SUFFIX):
                    failures.append(service);continue
                release.switch(service,old)
                print("ROLLBACK_PASS="+service,flush=True)
            except Exception:
                failures.append(service)
        print("ROLLBACK_MANUAL_CHECK_REQUIRED="+",".join(failures) if failures else "ATTEMPTED_PUBLIC_TRAFFIC_RESTORED",file=sys.stderr,flush=True)
        raise
    print("PUBLIC_GENERAL_TRAFFIC_RELEASE=PASS; STAFF_UNCHANGED",flush=True)
    print("PUBLIC_READ_ONLY_SMOKE=PASS; REAL_DIAGNOSIS_DB_SMTP_E2E=PENDING",flush=True)

if __name__=="__main__":
    try:
        main()
    except c.Stop as e:
        print("STOP: "+str(e)+"; preserve partial state",file=sys.stderr)
        sys.exit(2)
    except Exception:
        print("STOP: UNEXPECTED_FAILURE; preserve partial state; no config dump",file=sys.stderr)
        sys.exit(3)
