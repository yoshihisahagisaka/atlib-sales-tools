#!/usr/bin/env python3
"""Owner-approved public-only GENERAL traffic release. Sales Tools remains untouched."""
import argparse
import json
import subprocess
import sys
import time
import uuid
import secumie_general_production_candidate as c
from secumie_general_production_candidate_resume import OLD_DIGESTS, verify_candidate

HOST="https://service.atlib.jp"
STAFF="sales-tools"
STAFF_OLD="sales-tools-fds-20261124-01"
STAFF_DIGEST="asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/sales-tools@sha256:e681628f03c83258ce12332a4abe5bfea46704a97ae09e3a9123d1449139f263"
PATHS={"WEB":"/secumie-web/","INSIGHT":"/secumie-insight/"}

def traffic(s):
    return sorted((x.get("revisionName",""),x.get("tag",""),x.get("percent") or 0)
                  for x in s.get("status",{}).get("traffic",[]))

def check_public(service,s,revision):
    c.require(c.traffic_is_old(s,revision),"TRAFFIC_STOP_"+service)
    a=s["metadata"].get("annotations",{})
    c.require(a.get("run.googleapis.com/ingress")=="internal-and-cloud-load-balancing"
              and a.get("run.googleapis.com/default-url-disabled")=="true","PUBLIC_BOUNDARY_STOP_"+service)

def get(path):
    # Known external trailing-slash rule. Cache-busting GET only, no form submissions.
    url=HOST+path+"?release_check="+uuid.uuid4().hex
    result=subprocess.run(["curl","-fsS","--max-time","45","--retry","0",
                           "-H","Cache-Control: no-cache",url],capture_output=True,timeout=50)
    c.require(result.returncode==0,"PUBLIC_HTTP_STOP_"+path)
    return result.stdout.decode("utf-8")

def smoke(kind):
    prefix=PATHS[kind]
    page=get(prefix)
    for marker in ('id="general-intake"','name="companyName"','name="personName"','name="email"',
                   'name="salesContactAllowed"','原則2年間保存','同意して診断に進む'):
        c.require(marker in page,"PUBLIC_NEW_FORM_MARKER_STOP_"+kind)
    c.require("__GENERAL_SITE_KEY__" not in page,"PUBLIC_TURNSTILE_SITEKEY_PLACEHOLDER_"+kind)
    js=get(prefix+"general.js")
    c.require("leadReceipt" in js and "consultation" in js,"PUBLIC_JS_MARKER_STOP_"+kind)
    print("PUBLIC_NEW_FORM_AND_JS=PASS; KIND="+kind,flush=True)

def switch(service,revision):
    c.gc(c.runargs("services","update-traffic",service,"--to-revisions="+revision+"=100"),
         "TRAFFIC_SWITCH_"+service)
    check_public(service,c.read_service(service),revision)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply",action="store_true")
    args=parser.parse_args()
    c.deadline()
    staff=c.read_service(STAFF)
    c.require(c.traffic_is_old(staff,STAFF_OLD),"STAFF_SERVING_CHANGED")
    c.require(c.read_revision(STAFF_OLD).get("status",{}).get("imageDigest")==STAFF_DIGEST,
              "STAFF_DIGEST_CHANGED")
    staff_traffic=traffic(staff)
    policies={}
    for service,(kind,old) in c.SERVICES.items():
        rev=c.read_revision(old)
        c.require(c.actual_digest(rev)==OLD_DIGESTS[service],"ROLLBACK_IMAGE_CHANGED_"+service)
        verify_candidate(service,c.read_service(service),rev)
        policies[service]=c.binding_set(c.policy(service))
        print("ROLLBACK_TARGET="+service+":"+old,flush=True)
    if not args.apply:
        print("READ_ONLY_RELEASE_PREFLIGHT=PASS",flush=True);return
    attempted=[]
    try:
        for service,(kind,old) in c.SERVICES.items():
            c.deadline()
            check_public(service,c.read_service(service),old)
            c.require(traffic(c.read_service(STAFF))==staff_traffic,"STAFF_TRAFFIC_CHANGED")
            new=service+"-lead-42ca513"
            attempted.append(service)
            switch(service,new)
            # First invocation may cold-start both containers. Allow bounded retries on GET only.
            for attempt in range(3):
                try:
                    smoke(kind)
                    break
                except (c.Stop,subprocess.TimeoutExpired,OSError,UnicodeError):
                    if attempt==2:
                        raise
                    time.sleep(5)
            c.require(c.binding_set(c.policy(service))==policies[service],"PUBLIC_IAM_CHANGED_"+service)
            print("PUBLIC_TRAFFIC_100="+new,flush=True)
        for service in c.SERVICES:
            check_public(service,c.read_service(service),service+"-lead-42ca513")
        c.require(traffic(c.read_service(STAFF))==staff_traffic,"STAFF_TRAFFIC_CHANGED")
    except BaseException:
        # Roll back only revisions this command attempted to promote, never another lane.
        failures=[]
        for service in reversed(attempted):
            old=c.SERVICES[service][1]
            new=service+"-lead-42ca513"
            try:
                current=c.read_service(service)
                if c.traffic_is_old(current,old):
                    print("ROLLBACK_ALREADY_OLD="+service,flush=True)
                elif c.traffic_is_old(current,new):
                    switch(service,old)
                    print("ROLLBACK_PASS="+service,flush=True)
                else:
                    failures.append(service)
            except Exception:
                failures.append(service)
        if failures:
            print("ROLLBACK_MANUAL_CHECK_REQUIRED="+",".join(failures),file=sys.stderr,flush=True)
        else:
            print("ATTEMPTED_PUBLIC_TRAFFIC_RESTORED",file=sys.stderr,flush=True)
        raise
    print("PUBLIC_GENERAL_TRAFFIC_RELEASE=PASS; STAFF_UNCHANGED",flush=True)
    print("PUBLIC_READ_ONLY_SMOKE=PASS; REAL_DIAGNOSIS_DB_SMTP_E2E=PENDING",flush=True)
    print("NO_BUILD; NO_SCAN; NO_IAM_WRITE; NO_MIGRATION; NO_STAFF_DEPLOY",flush=True)

if __name__=="__main__":
    try:
        main()
    except c.Stop as e:
        print("STOP: "+str(e),file=sys.stderr)
        sys.exit(2)
    except KeyboardInterrupt:
        print("STOP: INTERRUPTED; check rollback status",file=sys.stderr)
        sys.exit(130)
    except Exception:
        print("STOP: UNEXPECTED_RELEASE_FAILURE; check rollback status; no config dump",file=sys.stderr)
        sys.exit(3)
