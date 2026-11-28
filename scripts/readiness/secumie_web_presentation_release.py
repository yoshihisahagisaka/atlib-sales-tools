#!/usr/bin/env python3
"""Release the approved immutable WEB presentation overlay only; no build, scan or other service writes."""
import argparse
import copy
import json
from pathlib import Path
import sys
import tempfile
import time

import yaml
import secumie_general_production_candidate as c
import secumie_general_public_release as release
from secumie_general_public_permission_release import smoke
from secumie_general_production_candidate_resume import PROXY_MANIFEST
import secumie_web_presentation_build as w

IMAGE=c.BASE+"@sha256:673231bbdec86d0bc4edfea9c7b17a0f9f48a3a2ef48e55d06e5993dc3cf3cce"
BUILD="95bf4aa6-f876-46f8-ba11-360b3c77fe75"
SCAN="projects/msp-zabbix/locations/asia/scans/3f0aa8f1-e394-41ba-8f48-eec561ed4c9f"
NEW=w.SERVICE+"-wsc-copy-50a1ed5"
APPROVED={(name,"HIGH","openssl","3.5.9-1~deb13u1","OS","") for name in w.CVE}
# Owner approved this exact digest and existing review deadline only.
ANNOTATIONS=("autoscaling.knative.dev/maxScale","autoscaling.knative.dev/minScale","run.googleapis.com/network-interfaces","run.googleapis.com/vpc-access-egress","run.googleapis.com/container-dependencies","run.googleapis.com/secrets","run.googleapis.com/cloudsql-instances","run.googleapis.com/execution-environment","run.googleapis.com/cpu-throttling","run.googleapis.com/startup-cpu-boost","run.googleapis.com/sessionAffinity","run.googleapis.com/vpc-access-connector","run.googleapis.com/encryption-key")

def artifacts():
    c.deadline()
    build=c.gj(["builds","describe",BUILD,"--region="+c.REGION],"WSC_RELEASE_BUILD")
    c.require(build.get("status")=="SUCCESS","BUILD_NOT_SUCCESS")
    c.require(any(x.get("digest")==IMAGE.split("@")[1] and x.get("name","").startswith(c.BASE+":web-wsc-copy-"+w.SOURCE[:7]+"-") for x in build.get("results",{}).get("images",[])),"BUILD_DIGEST_STOP")
    c.require(any({"--build-arg=BASE_IMAGE="+w.BASE_IMAGE,"--build-arg=SOURCE_REVISION="+w.SOURCE,"--target=runtime"}<=set(x.get("args",[])) for x in build.get("steps",[])),"BUILD_SOURCE_STOP")
    c.require(c.gc(["artifacts","docker","images","describe",IMAGE,"--format=value(image_summary.digest)"],"WSC_RELEASE_IMAGE").strip()==IMAGE.split("@")[1],"ARTIFACT_DIGEST_STOP")
    rows=w.scan_rows(SCAN)
    c.require(bool(rows),"SCAN_EMPTY_STOP")
    for row in rows:
        resource=row.get("resourceUri")
        if resource:
            c.require(resource.removeprefix("https://")==IMAGE,"SCAN_RESOURCE_MISMATCH")
    counts,blockers=w.summarize(rows)
    c.require(blockers<=APPROVED,"NEW_BLOCKER_STOP")
    print("APPROVED_SCAN_COUNTS="+json.dumps(counts,sort_keys=True),flush=True)
    print("DIGEST_SPECIFIC_SECURITY_GATE=PASS; REVIEW_DEADLINE=2026-12-05T00:00:00+09:00",flush=True)

def containers(spec):
    items=spec.get("containers",[])
    result={x["name"]:x for x in items}
    c.require(len(items)==2 and set(result)=={"app","sql-proxy"},"CONTAINER_SET_STOP")
    return result

def template_proxy_matches(template, revision):
    # Cloud Run resolves the pinned multi-platform index to the previously
    # verified amd64 manifest. Accept only this exact known pair (or identical
    # known digests), not arbitrary different images or other settings.
    a=copy.deepcopy(template)
    b=copy.deepcopy(revision)
    if a.get("image") not in (c.PROXY,PROXY_MANIFEST) or b.get("image")!=PROXY_MANIFEST:
        return False
    a["image"]=PROXY_MANIFEST
    return a==b

def verify_revision(old,new):
    c.require(new["metadata"]["name"]==NEW,"CANDIDATE_IDENTITY_STOP")
    c.require(any(x.get("type")=="Ready" and x.get("status")=="True" for x in new.get("status",{}).get("conditions",[])),"CANDIDATE_NOT_READY")
    expected=copy.deepcopy(old["spec"])
    before=containers(expected)
    after=containers(new["spec"])
    c.require(before["app"]["image"]==w.BASE_IMAGE and after["app"]["image"]==IMAGE,"IMAGE_IDENTITY_STOP")
    before["app"]["image"]=IMAGE
    # Revision comparison covers all container fields, environment/secret refs,
    # sidecar, volumes, service account, resource limits, concurrency and timeout.
    c.require(expected==new["spec"],"REVISION_SPEC_DELTA_STOP")
    oldann=old["metadata"].get("annotations",{})
    newann=new["metadata"].get("annotations",{})
    for key in ANNOTATIONS:
        c.require(oldann.get(key)==newann.get(key),"REVISION_ANNOTATION_DELTA_STOP_"+key)

def prepare(state,old):
    c.require(state["status"].get("latestCreatedRevisionName")==w.OLD and state["status"].get("latestReadyRevisionName")==w.OLD,"OTHER_CANDIDATE_EXISTS")
    doc=yaml.safe_load(c.gc(c.runargs("services","describe",w.SERVICE)+["--format=export"],"WEB_EXPORT"))
    c.require(doc["metadata"]["name"]==w.SERVICE,"SERVICE_EXPORT_STOP")
    template=doc["spec"]["template"]
    app=containers(template["spec"])["app"]
    oldapp=containers(old["spec"])["app"]
    c.require(app["image"]==w.BASE_IMAGE and c.envmap(app)==c.envmap(oldapp),"TEMPLATE_DRIFT_STOP")
    c.require(template["spec"]["serviceAccountName"]==old["spec"]["serviceAccountName"],"TEMPLATE_SA_STOP")
    c.require(template_proxy_matches(containers(template["spec"])["sql-proxy"],containers(old["spec"])["sql-proxy"]),"TEMPLATE_PROXY_STOP")
    print("PROXY_INDEX_MANIFEST_IDENTITY=PASS; PROXY_CONFIG_UNCHANGED",flush=True)
    app["image"]=IMAGE
    template["metadata"]["name"]=NEW
    doc["spec"]["traffic"]=[{"revisionName":w.OLD,"percent":100}]
    return doc

def check_traffic(revision):
    state=c.read_service(w.SERVICE)
    release.check_public(w.SERVICE,state,revision)
    c.require(release.traffic(state)==[(revision,"",100)],"TRAFFIC_TAG_OR_SPLIT_STOP")
    return state

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply",action="store_true")
    args=parser.parse_args()
    artifacts()
    state=w.baseline()
    old=c.read_revision(w.OLD)
    policy=c.binding_set(c.policy(w.SERVICE))
    doc=prepare(state,old)
    print("WEB_RELEASE_PREFLIGHT=PASS",flush=True)
    if not args.apply:return
    c.deadline()
    c.require(check_traffic(w.OLD)["spec"]==state["spec"],"SERVICE_CHANGED_BEFORE_CANDIDATE")
    with tempfile.TemporaryDirectory(prefix="web-wsc-release-") as tmp:
        file=Path(tmp)/"service.yaml"
        file.write_text(yaml.safe_dump(doc,sort_keys=False))
        file.chmod(0o600)
        c.gc(c.runargs("services","replace",str(file)),"WEB_CANDIDATE_DEPLOY")
    candidate_state=check_traffic(w.OLD)
    c.require(candidate_state["status"].get("latestCreatedRevisionName")==NEW,"CANDIDATE_NAME_STOP")
    verify_revision(old,c.read_revision(NEW))
    c.require(c.binding_set(c.policy(w.SERVICE))==policy,"WEB_IAM_CHANGED")
    print("WEB_CANDIDATE_READY=PASS; REVISION="+NEW+"; TRAFFIC=0",flush=True)
    print("CANDIDATE_RUNTIME_REGRESSION=BUILD_EVIDENCE; LIVE_DIAGNOSIS_AFTER_PROMOTION",flush=True)
    c.deadline()
    c.require(check_traffic(w.OLD)["spec"]==candidate_state["spec"],"SERVICE_CHANGED_BEFORE_PROMOTION")
    try:
        release.switch(w.SERVICE,NEW)
        for attempt in range(3):
            try:
                smoke("WEB")
                break
            except (c.Stop,OSError,UnicodeError):
                if attempt==2:raise
                time.sleep(5)
        check_traffic(NEW)
        verify_revision(old,c.read_revision(NEW))
        c.require(c.binding_set(c.policy(w.SERVICE))==policy,"WEB_IAM_CHANGED")
    except BaseException:
        try:
            current=c.read_service(w.SERVICE)
            if release.traffic(current)==[(NEW,"",100)]:
                release.switch(w.SERVICE,w.OLD)
                check_traffic(w.OLD)
                print("WEB_ROLLBACK=PASS",flush=True)
            elif release.traffic(current)==[(w.OLD,"",100)]:
                print("WEB_ROLLBACK=ALREADY_OLD",flush=True)
            else:
                print("WEB_ROLLBACK_MANUAL_CHECK_REQUIRED",flush=True)
        except BaseException:
            print("WEB_ROLLBACK_MANUAL_CHECK_REQUIRED",flush=True)
        raise
    print("WEB_PRESENTATION_RELEASE=PASS; REVISION="+NEW+"; TRAFFIC=100",flush=True)
    print("IMAGE="+IMAGE+"; ROLLBACK_REVISION="+w.OLD,flush=True)
    print("PUBLIC_READ_ONLY_SMOKE=PASS; LIVE_ATLIB_DIAGNOSIS=PENDING",flush=True)
    print("NO_BUILD; NO_SCAN; NO_DB_OR_IAM_WRITE; NO_INSIGHT_OR_STAFF_WRITE",flush=True)

if __name__=="__main__":
    try:
        main()
    except c.Stop as exc:
        print("STOP: "+str(exc)+"; preserve state; do not blindly rerun",file=sys.stderr)
        sys.exit(2)
    except Exception:
        print("STOP: UNEXPECTED_FAILURE; preserve state; no config dump",file=sys.stderr)
        sys.exit(3)
