#!/usr/bin/env python3
"""One operator command: immutable notification-only overlay, scoped Slack Secret, public release."""
import argparse
import copy
import datetime as dt
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import yaml
import secumie_general_production_candidate as c
import secumie_general_public_release as release
from secumie_general_public_permission_release import check_scan, smoke
from secumie_general_production_candidate_resume import PROXY_MANIFEST

SOURCE="03e48d93817d9c97e29af8afa6c5de4125ebdeef"
BASE_SOURCE="42ca51304bea9bb0e9ff17599174a792347748c3"
SUFFIX="-notify-03e48d9"
OLD_SUFFIX="-lead-perm-f53ec9c"
SECRET_PROJECT="atlib-corporate-site"
SECRET="corporate-site-secumie-web-slack-webhook"
ALIAS="secumie-general-sales-slack"
CHANNEL="C0BMF78CES1"
ENV="SLACK_WEBHOOK_DIAGNOSTIC"
ROOT=Path(__file__).resolve().parents[2]

def command(args,label,timeout=120):
    try:
        p=subprocess.run(args,capture_output=True,timeout=timeout)
    except (OSError,subprocess.TimeoutExpired):
        raise c.Stop(label+"_EXECUTION_FAILED") from None
    c.require(p.returncode==0,label+"_FAILED")
    return p.stdout

def corp(args,label):
    return json.loads(command(["gcloud",*args,"--project="+SECRET_PROJECT,"--quiet","--format=json"],label))

def staff_traffic():
    s=c.read_service(release.STAFF)
    c.require(c.traffic_is_old(s,release.STAFF_OLD),"STAFF_TRAFFIC_CHANGED")
    return release.traffic(s)

def baseline():
    states={}
    digests=set()
    for service,(kind,_) in c.SERVICES.items():
        old=service+OLD_SUFFIX
        s=c.read_service(service)
        release.check_public(service,s,old)
        c.require(s["status"].get("latestCreatedRevisionName")==old,"UNEXPECTED_OTHER_CANDIDATE_"+service)
        rev=c.read_revision(old)
        spec=rev["spec"]
        c.require(spec.get("serviceAccountName")==service+"@"+c.PROJECT+".iam.gserviceaccount.com","SA_CHANGED_"+service)
        a={x["name"]:x for x in spec["containers"]}
        c.require(set(a)=={"app","sql-proxy"} and a["sql-proxy"]["image"] in (c.PROXY,PROXY_MANIFEST),"PROXY_STOP_"+service)
        env=c.envmap(a["app"])
        c.require(env.get("SECUMIE_GENERAL_KIND",{}).get("value")==kind and env.get("SECUMIE_GENERAL_ENABLED",{}).get("value")=="true","RUNTIME_KIND_STOP_"+service)
        c.require(ENV not in env,"SLACK_ALREADY_CONFIGURED_"+service)
        digest=a["app"]["image"]
        c.require(re.fullmatch(re.escape(c.BASE)+r"@sha256:[0-9a-f]{64}",digest) is not None,"LIVE_IMAGE_DIGEST_STOP_"+service)
        digests.add(digest)
        states[service]=(s,rev,c.binding_set(c.policy(service)))
    c.require(len(digests)==1,"PUBLIC_BASE_IMAGE_MISMATCH")
    image=digests.pop()
    c.require(c.gc(["artifacts","docker","images","describe",image,"--format=value(image_summary.digest)"],"LIVE_ARTIFACT").strip()==image.split("@")[1],"LIVE_ARTIFACT_STOP")
    print("LIVE_PUBLIC_BASE="+image,flush=True)
    return states,image

def build(work,base):
    src=work/"source";src.mkdir()
    archive=command(["git","-C",str(ROOT),"archive",SOURCE,"package.json","package-lock.json","tsconfig.json","src","test/secumieConsultationNotification.test.ts"],"GIT_ARCHIVE")
    import io,tarfile
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        tar.extractall(src,filter="data")
    # Explicit modes: avoid the known Cloud Shell umask 077 regression.
    for p in src.rglob("*"):
        p.chmod(0o755 if p.is_dir() or (p.stat().st_mode & 0o111) else 0o644)
    docker=(ROOT/"release/secumie-general-notification-overlay/Dockerfile").read_bytes()
    (src/"Dockerfile").write_bytes(docker);(src/"Dockerfile").chmod(0o644)
    tag=c.BASE+":prod-notify-03e48d9-"+dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d%H%M%S")
    cfg={"steps":[{"name":"gcr.io/cloud-builders/docker","args":["build","--platform=linux/amd64","--target=runtime","--build-arg=BASE_IMAGE="+base,"--build-arg=SOURCE_REVISION="+SOURCE,"--tag="+tag,"."]}],"images":[tag],"timeout":"1200s"}
    file=work/"build.yaml";file.write_text(yaml.safe_dump(cfg,sort_keys=False))
    bid=c.gc(["builds","submit",str(src),"--region="+c.REGION,"--config="+str(file),"--async","--format=value(id)"],"NOTIFICATION_BUILD_SUBMIT").strip()
    c.require(re.fullmatch(r"[0-9a-f-]{36}",bid) is not None,"BUILD_ID_STOP")
    print("BUILD_ID="+bid,flush=True)
    proc=subprocess.run(["gcloud","builds","log",bid,"--project="+c.PROJECT,"--region="+c.REGION,"--stream"],timeout=1500)
    c.require(proc.returncode==0,"BUILD_LOG_STOP")
    result=c.gj(["builds","describe",bid,"--region="+c.REGION],"NOTIFICATION_BUILD")
    c.require(result.get("status")=="SUCCESS","BUILD_NOT_SUCCESS")
    matches=[x["digest"] for x in result["results"]["images"] if x.get("name")==tag]
    c.require(len(matches)==1 and re.fullmatch(r"sha256:[a-f0-9]{64}",matches[0]) is not None,"BUILD_DIGEST_STOP")
    image=c.BASE+"@"+matches[0]
    print("NOTIFICATION_IMAGE="+image,flush=True)
    scan=c.gc(["artifacts","docker","images","scan",image,"--remote","--location=asia","--format=value(response.scan)"],"NOTIFICATION_SCAN").strip()
    print("SCAN_ID="+scan,flush=True)
    check_scan(scan)
    return image,bid,scan

def webhook_metadata():
    # Prior 11/19 owner-approved channel binding; Secret value never accessed by this script.
    number=c.gc(["projects","describe",SECRET_PROJECT,"--format=value(projectNumber)"],"SECRET_PROJECT_NUMBER").strip()
    c.require(number.isdigit(),"SECRET_PROJECT_NUMBER_STOP")
    ver=corp(["secrets","versions","describe","1","--secret="+SECRET],"SLACK_SECRET_VERSION")
    c.require(ver.get("state")=="ENABLED" and ver.get("name","").endswith("/versions/1"),"SLACK_SECRET_DISABLED")
    print("SLACK_CHANNEL="+CHANNEL+"; EXISTING_SECRET_VERSION=1",flush=True)
    return "projects/"+number+"/secrets/"+SECRET

def grant():
    for service in c.SERVICES:
        member="serviceAccount:"+service+"@"+c.PROJECT+".iam.gserviceaccount.com"
        command(["gcloud","secrets","add-iam-policy-binding",SECRET,"--project="+SECRET_PROJECT,
                 "--member="+member,"--role=roles/secretmanager.secretAccessor","--condition=None","--quiet","--format=none"],
                "SLACK_SECRET_IAM_"+service)
    policy=corp(["secrets","get-iam-policy",SECRET],"SLACK_SECRET_POLICY")
    expected={"serviceAccount:"+s+"@"+c.PROJECT+".iam.gserviceaccount.com" for s in c.SERVICES}
    c.require(any(x.get("role")=="roles/secretmanager.secretAccessor" and not x.get("condition")
                  and expected<=set(x.get("members",[])) for x in policy.get("bindings",[])),"SLACK_SECRET_IAM_STOP")
    print("SLACK_SECRET_ACCESS=PASS; NO_SECRET_VALUE_READ",flush=True)

def candidate_definition(service,state,image,resource):
    initial,rev,policy=state
    doc=yaml.safe_load(c.gc(c.runargs("services","describe",service)+["--format=export"],"EXPORT_"+service))
    template=doc["spec"]["template"]
    old={x["name"]:x for x in rev["spec"]["containers"]}
    containers={x["name"]:x for x in template["spec"]["containers"]}
    c.require(set(containers)==set(old)=={"app","sql-proxy"},"CONTAINER_STOP_"+service)
    c.require(c.envmap(containers["app"])==c.envmap(old["app"]),"TEMPLATE_ENV_STOP_"+service)
    c.require(ENV not in c.envmap(containers["app"]),"SLACK_ENV_COLLISION")
    containers["app"]["image"]=image
    containers["app"]["env"].append({"name":ENV,"valueFrom":{"secretKeyRef":{"name":ALIAS,"key":"1"}}})
    metadata=template["metadata"];metadata["name"]=service+SUFFIX
    ann=metadata.setdefault("annotations",{})
    entries=[x for x in ann.get("run.googleapis.com/secrets","").split(",") if x]
    c.require(not any(x.startswith(ALIAS+":") for x in entries),"SECRET_ALIAS_COLLISION")
    entries.append(ALIAS+":"+resource)
    ann["run.googleapis.com/secrets"]=",".join(entries)
    doc["spec"]["traffic"]=[{"revisionName":service+OLD_SUFFIX,"percent":100}]
    return doc

def verify(service,state,image,resource):
    initial,old,policy=state
    s=c.read_service(service)
    release.check_public(service,s,service+OLD_SUFFIX)
    new=service+SUFFIX
    c.require(s["status"].get("latestCreatedRevisionName")==new,"NEW_REVISION_STOP_"+service)
    rev=c.read_revision(new)
    c.require(any(x.get("type")=="Ready" and x.get("status")=="True" for x in rev["status"].get("conditions",[])),"REVISION_READY_STOP_"+service)
    before={x["name"]:x for x in old["spec"]["containers"]}
    after={x["name"]:x for x in rev["spec"]["containers"]}
    c.require(set(after)==set(before),"CONTAINER_STOP_"+service)
    c.require(after["app"]["image"]==image and after["sql-proxy"]["image"] in (c.PROXY,PROXY_MANIFEST),"NEW_IMAGE_STOP_"+service)
    expected=c.envmap(before["app"]).copy()
    expected[ENV]={"name":ENV,"valueFrom":{"secretKeyRef":{"name":ALIAS,"key":"1"}}}
    c.require(c.envmap(after["app"])==expected,"NEW_ENV_STOP_"+service)
    for key in ("args","resources","startupProbe","ports","command","volumeMounts"):
        c.require(before["app"].get(key)==after["app"].get(key),"APP_CONFIG_CHANGED_"+key+"_"+service)
    for key in ("args","resources","startupProbe"):
        c.require(before["sql-proxy"].get(key)==after["sql-proxy"].get(key),"PROXY_CONFIG_CHANGED_"+key+"_"+service)
    for key in ("serviceAccountName","containerConcurrency","timeoutSeconds","volumes"):
        c.require(old["spec"].get(key)==rev["spec"].get(key),"RUNTIME_CHANGED_"+key+"_"+service)
    ann=rev["metadata"].get("annotations",{});prev=old["metadata"].get("annotations",{})
    for key in ("autoscaling.knative.dev/maxScale","autoscaling.knative.dev/minScale","run.googleapis.com/network-interfaces","run.googleapis.com/vpc-access-egress","run.googleapis.com/container-dependencies"):
        c.require(ann.get(key)==prev.get(key),"RUNTIME_ANNOTATION_CHANGED_"+key+"_"+service)
    c.require(ALIAS+":"+resource in ann.get("run.googleapis.com/secrets","").split(","),"SLACK_SECRET_MAPPING_STOP")
    c.require(c.binding_set(c.policy(service))==policy,"PUBLIC_IAM_CHANGED_"+service)
    print("NOTIFICATION_CANDIDATE_READY="+new+"; TRAFFIC=0",flush=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply",action="store_true")
    args=parser.parse_args()
    c.deadline()
    # Source delta must remain exact; no other public modules or dependency changes.
    diff=command(["git","-C",str(ROOT),"diff","--name-only",BASE_SOURCE,SOURCE,"--","src","package.json","package-lock.json"],"SOURCE_DELTA").decode().splitlines()
    c.require(set(diff)=={"src/secumieGeneralServer.ts","src/services/mailer.ts","src/services/secumieConsultationNotification.ts","src/services/secumieGeneralConsultation.ts"},"SOURCE_DELTA_STOP")
    states,base=baseline()
    staff=staff_traffic()
    resource=webhook_metadata()
    if not args.apply:
        print("READ_ONLY_PREFLIGHT=PASS",flush=True);return
    with tempfile.TemporaryDirectory(prefix="secumie-notification-release-") as tmp:
        work=Path(tmp)
        image,bid,scan=build(work,base)
        c.deadline()
        c.require(staff_traffic()==staff,"STAFF_TRAFFIC_CHANGED")
        configs={}
        for service,state in states.items():
            now=c.read_service(service)
            release.check_public(service,now,service+OLD_SUFFIX)
            c.require(now["spec"]==state[0]["spec"],"SERVICE_CHANGED_DURING_BUILD_"+service)
            configs[service]=candidate_definition(service,state,image,resource)
        grant()
        for service,state in states.items():
            c.deadline()
            c.require(c.read_service(service)["spec"]==state[0]["spec"],"SERVICE_CHANGED_BEFORE_DEPLOY_"+service)
            path=work/(service+".yaml");path.write_text(yaml.safe_dump(configs[service],sort_keys=False))
            c.gc(c.runargs("services","replace",str(path)),"NOTIFICATION_DEPLOY_"+service)
            verify(service,state,image,resource)
        attempted=[]
        try:
            for service,(kind,_) in c.SERVICES.items():
                c.deadline()
                release.check_public(service,c.read_service(service),service+OLD_SUFFIX)
                c.require(staff_traffic()==staff,"STAFF_TRAFFIC_CHANGED")
                attempted.append(service)
                release.switch(service,service+SUFFIX)
                for attempt in range(3):
                    try:
                        smoke(kind);break
                    except (c.Stop,subprocess.TimeoutExpired,OSError,UnicodeError):
                        if attempt==2:raise
                        time.sleep(5)
                print("NOTIFICATION_TRAFFIC_100="+service+SUFFIX,flush=True)
            c.require(staff_traffic()==staff,"STAFF_TRAFFIC_CHANGED")
            for service in c.SERVICES:
                release.check_public(service,c.read_service(service),service+SUFFIX)
        except BaseException:
            failures=[]
            for service in reversed(attempted):
                try:
                    ss=c.read_service(service)
                    if c.traffic_is_old(ss,service+OLD_SUFFIX):continue
                    if not c.traffic_is_old(ss,service+SUFFIX):failures.append(service);continue
                    release.switch(service,service+OLD_SUFFIX)
                    print("ROLLBACK_PASS="+service,flush=True)
                except Exception:failures.append(service)
            print("ROLLBACK_MANUAL_CHECK_REQUIRED="+",".join(failures) if failures else "ATTEMPTED_PUBLIC_TRAFFIC_RESTORED",flush=True)
            raise
        print("NOTIFICATION_PUBLIC_RELEASE=PASS; STAFF_UNCHANGED",flush=True)
        print("IMAGE="+image+"; BUILD_ID="+bid+"; SCAN_ID="+scan,flush=True)
        print("MAIL_AND_SLACK_ACTUAL_DELIVERY=PENDING; NO_DB_MIGRATION",flush=True)

if __name__=="__main__":
    try:
        main()
    except c.Stop as e:
        print("STOP: "+str(e)+"; preserve partial state; do not blindly rerun",file=sys.stderr)
        sys.exit(2)
    except Exception:
        print("STOP: UNEXPECTED_FAILURE; preserve partial state; no config dump",file=sys.stderr)
        sys.exit(3)
