#!/usr/bin/env python3
"""Prepare only GENERAL public production revisions at 0%; never promote traffic."""
import argparse
import copy
import datetime as dt
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import yaml

PROJECT = "msp-zabbix"
REGION = "asia-northeast1"
INSTANCE = "secumie-sg-shared-prod-db"
BASE = f"{REGION}-docker.pkg.dev/{PROJECT}/cloud-run-source-deploy/secumie-general"
IMAGE = BASE + "@sha256:a5c507d825e67377cd12a58d84a42c4794110b3c17e17acc6d241830439ba24f"
PROXY = "gcr.io/cloud-sql-connectors/cloud-sql-proxy@sha256:e0cbea7b63455c1635d354ef456696d019dd02a5db47bf1994e849823e71ae89"
WRITER = "secumie-general-prod-db-writer-password"
RECEIPT = "secumie-general-prod-receipt-secret"
SERVICES = {
    "secumie-web-general-prod": ("WEB", "secumie-web-general-prod-ux-afbf1c2"),
    "secumie-insight-general-prod": ("INSIGHT", "secumie-insight-general-prod-report-5152c14"),
}
SQL_TITLE = "secumie-prod-cloudsql-instance-only"
SQL_EXPR = 'resource.type == "sqladmin.googleapis.com/Instance" && resource.name == "projects/msp-zabbix/instances/secumie-sg-shared-prod-db"'
# Earlier approved risk review boundary; no implicit extension.
REVIEW = dt.datetime.fromisoformat("2026-12-05T00:00:00+09:00")

class Stop(Exception):
    pass

def require(ok, label):
    if not ok:
        raise Stop(label)

def gc(args, label):
    try:
        p = subprocess.run(["gcloud", *args, "--project="+PROJECT, "--quiet"],
                           capture_output=True, text=True, timeout=600)
    except (OSError, subprocess.TimeoutExpired):
        raise Stop(label+"_EXECUTION_FAILED") from None
    # Cloud Run export/revision errors can contain literal environment values.
    require(p.returncode == 0, label+"_FAILED")
    return p.stdout

def gj(args, label):
    try:
        return json.loads(gc([*args,"--format=json"],label))
    except (ValueError, TypeError):
        raise Stop(label+"_JSON_INVALID") from None

def runargs(*args):
    return ["run", *args, "--region="+REGION]

def read_service(service):
    return gj(runargs("services","describe",service), "SERVICE_"+service)

def read_revision(revision):
    return gj(runargs("revisions","describe",revision), "REVISION_"+revision)

def policy(service):
    return gj(runargs("services","get-iam-policy",service), "IAM_"+service)

def binding_set(p):
    return sorted(json.dumps(x,sort_keys=True) for x in p.get("bindings",[]))

def traffic_is_old(s,old):
    traffic=s.get("status",{}).get("traffic",[])
    return (len([x for x in traffic if (x.get("percent") or 0)>0])==1
            and any(x.get("revisionName")==old and x.get("percent")==100 for x in traffic))

def check_baseline(s,service,old):
    status=s.get("status",{})
    a=s.get("metadata",{}).get("annotations",{})
    require(traffic_is_old(s,old), "SERVING_REVISION_CHANGED_"+service)
    require(status.get("latestReadyRevisionName")==old and status.get("latestCreatedRevisionName")==old,
            "UNEXPECTED_EXISTING_CANDIDATE_"+service)
    require(a.get("run.googleapis.com/ingress")=="internal-and-cloud-load-balancing"
            and a.get("run.googleapis.com/default-url-disabled")=="true",
            "PUBLIC_BOUNDARY_CHANGED_"+service)
    require(s["spec"]["template"]["spec"].get("serviceAccountName")==service+"@"+PROJECT+".iam.gserviceaccount.com",
            "SERVICE_ACCOUNT_MISMATCH_"+service)

def envmap(c):
    items=c.get("env",[])
    m={x["name"]:x for x in items}
    require(len(m)==len(items),"DUPLICATE_ENV")
    return m

def actual_digest(revision):
    value=revision.get("status",{}).get("imageDigest","")
    # The actual serving revision, NOT a mutable service-template tag, is the baseline.
    if re.fullmatch(r"sha256:[a-f0-9]{64}",value):
        value=BASE+"@"+value
    require(re.fullmatch(re.escape(BASE)+r"@sha256:[a-f0-9]{64}",value) is not None,
            "SERVING_IMAGE_DIGEST_UNVERIFIED")
    return value

def definition(doc,rev,service,kind,old):
    doc=copy.deepcopy(doc)
    require(rev.get("metadata",{}).get("name")==old,"REVISION_IDENTITY_MISMATCH_"+service)
    require(any(x.get("type")=="Ready" and x.get("status")=="True"
                for x in rev.get("status",{}).get("conditions",[])),"SERVING_REVISION_NOT_READY_"+service)
    template=doc["spec"]["template"]
    spec=template["spec"]
    oldspec=rev["spec"]
    sa=service+"@"+PROJECT+".iam.gserviceaccount.com"
    require(spec.get("serviceAccountName")==sa and oldspec.get("serviceAccountName")==sa,"SA_MISMATCH_"+service)
    require(len(spec["containers"])==1 and len(oldspec["containers"])==1,"UNEXPECTED_SIDECAR_"+service)
    require(not spec.get("volumes") and not oldspec.get("volumes"),"UNEXPECTED_VOLUME_"+service)
    oldapp=oldspec["containers"][0]
    env=envmap(oldapp)
    for key,value in {"SECUMIE_GENERAL_KIND":kind,"SECUMIE_GENERAL_ENABLED":"true",
                      "SECUMIE_GENERAL_HOST":"service.atlib.jp"}.items():
        require(env.get(key,{}).get("value")==value,"SERVING_ENV_MISMATCH_"+key+"_"+service)
    for key in ("SECUMIE_TURNSTILE_SITE_KEY","SECUMIE_TURNSTILE_SECRET","SMTP_HOST",
                "SMTP_USER","SMTP_PASSWORD","SMTP_FROM","SECUMIE_CONSULTATION_NOTIFY_EMAIL"):
        require(key in env,"SERVING_ENV_MISSING_"+key+"_"+service)
    for key in ("SMTP_PASSWORD","SECUMIE_TURNSTILE_SECRET"):
        require(bool(env[key].get("valueFrom",{}).get("secretKeyRef")),
                "SERVING_SECRET_REF_MISSING_"+key+"_"+service)
    require(not any(k.startswith("SECUMIE_GENERAL_DB_") or k=="SECUMIE_GENERAL_RECEIPT_SECRET" for k in env),
            "GENERAL_DB_ALREADY_CONFIGURED_"+service)
    # Deliberately no raw template.image == revision.image assertion.
    # Copy the real serving revision's container, including exact original env/Secret refs.
    app=copy.deepcopy(oldapp)
    app.update(name="app",image=IMAGE,startupProbe={
        "httpGet":{"path":"/healthz","port":8080},"periodSeconds":5,"timeoutSeconds":3,"failureThreshold":20})
    require(any(x.get("containerPort")==8080 for x in app.get("ports",[])),"SERVING_PORT_MISMATCH_"+service)
    app["env"].extend({"name":k,"value":v} for k,v in {
        "SECUMIE_GENERAL_DB_NAME":"secumie_general","SECUMIE_GENERAL_DB_USER":"secumie_general_writer_prod",
        "SECUMIE_GENERAL_DB_HOST":"127.0.0.1","SECUMIE_GENERAL_DB_PORT":"5432"}.items())
    for key,secret in (("SECUMIE_GENERAL_DB_PASSWORD",WRITER),("SECUMIE_GENERAL_RECEIPT_SECRET",RECEIPT)):
        app["env"].append({"name":key,"valueFrom":{"secretKeyRef":{"name":secret,"key":"1"}}})
    spec["containers"]=[app,{"name":"sql-proxy","image":PROXY,
        "args":["--private-ip","--address=0.0.0.0","--port=5432","--run-connection-test",
                PROJECT+":"+REGION+":"+INSTANCE],
        "resources":{"limits":{"cpu":"1","memory":"256Mi"}},
        "startupProbe":{"tcpSocket":{"port":5432},"periodSeconds":5,"timeoutSeconds":3,"failureThreshold":20}}]
    for key in ("containerConcurrency","timeoutSeconds"):
        if key in oldspec:
            spec[key]=oldspec[key]
    meta=template.setdefault("metadata",{})
    meta["name"]=service+"-lead-42ca513"
    annotations=meta.setdefault("annotations",{})
    annotations.update({"autoscaling.knative.dev/minScale":"0","autoscaling.knative.dev/maxScale":"1",
       "run.googleapis.com/network-interfaces":'[{"network":"default","subnetwork":"default"}]',
       "run.googleapis.com/vpc-access-egress":"private-ranges-only",
       "run.googleapis.com/container-dependencies":'{"app":["sql-proxy"]}'})
    # All original traffic is retained, including any existing zero-percent tags.
    traffic=doc["spec"].get("traffic",[])
    require(len(traffic)==1,"UNEXPECTED_TRAFFIC_SPEC_"+service)
    doc["spec"]["traffic"]=[{"revisionName":old,"percent":100}]
    return doc

def selftest():
    service,(kind,old)=next(iter(SERVICES.items()))
    sa=service+"@"+PROJECT+".iam.gserviceaccount.com"
    env=[{"name":k,"value":v} for k,v in {
        "SECUMIE_GENERAL_KIND":kind,"SECUMIE_GENERAL_ENABLED":"true","SECUMIE_GENERAL_HOST":"service.atlib.jp",
        "SECUMIE_TURNSTILE_SITE_KEY":"test","SMTP_HOST":"test","SMTP_USER":"test","SMTP_FROM":"test",
        "SECUMIE_CONSULTATION_NOTIFY_EMAIL":"test"}.items()]
    for k in ("SMTP_PASSWORD","SECUMIE_TURNSTILE_SECRET"):
        env.append({"name":k,"valueFrom":{"secretKeyRef":{"name":"test","key":"1"}}})
    app={"image":BASE+":old-tag","ports":[{"containerPort":8080}],"env":env}
    doc={"spec":{"template":{"spec":{"serviceAccountName":sa,"containers":[app]}},"traffic":[{"percent":100,"latestRevision":True}]}}
    old_app=copy.deepcopy(app);old_app["image"]=BASE+"@sha256:"+"a"*64
    rev={"metadata":{"name":old},"status":{"imageDigest":old_app["image"],"conditions":[{"type":"Ready","status":"True"}]},
         "spec":{"serviceAccountName":sa,"containers":[old_app]}}
    result=definition(doc,rev,service,kind,old)
    candidate=result["spec"]["template"]["spec"]["containers"][0]
    require(candidate["image"]==IMAGE and candidate["env"][:len(env)]==env
            and len(candidate["env"])==len(env)+6 and result["spec"]["traffic"]==[{"revisionName":old,"percent":100}],
            "SELFTEST_DELTA_FAILED")
    require(doc["spec"]["template"]["spec"]["containers"][0]["image"]==BASE+":old-tag","SELFTEST_MUTATION")
    print("SERVING_REVISION_BASELINE_SELFTEST=PASS",flush=True)

def verify_secret(secret):
    versions=gj(["secrets","versions","list",secret],"SECRET_VERSION_"+secret)
    require(len(versions)==1 and versions[0]["name"].endswith("/1") and versions[0]["state"]=="ENABLED",
            "SECRET_VERSION_STOP_"+secret)
    require(not gj(["secrets","get-iam-policy",secret],"SECRET_POLICY_"+secret).get("bindings"),
            "SECRET_IAM_NOT_EMPTY_"+secret)

def deadline():
    require(dt.datetime.now(dt.timezone.utc)<REVIEW,"SECURITY_REVIEW_DEADLINE_STOP")

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply",action="store_true")
    parser.add_argument("--self-test",action="store_true")
    args=parser.parse_args()
    selftest()
    if args.self_test:
        return
    deadline()
    actual=gc(["artifacts","docker","images","describe",IMAGE,"--format=value(image_summary.digest)"],"FINAL_ARTIFACT").strip()
    require(actual==IMAGE.split("@")[1],"FINAL_IMAGE_DIGEST_MISMATCH")
    print("FINAL_IMAGE=PASS",flush=True)
    with tempfile.TemporaryDirectory(prefix="secumie-prod-candidate-") as tmp:
        root=Path(tmp)
        initial={}
        policies={}
        for service,(kind,old) in SERVICES.items():
            s=read_service(service);check_baseline(s,service,old)
            rev=read_revision(old)
            digest=actual_digest(rev)
            require(gc(["artifacts","docker","images","describe",digest,"--format=value(image_summary.digest)"],
                       "SERVING_ARTIFACT_"+service).strip()==digest.split("@")[1],"SERVING_ARTIFACT_MISMATCH_"+service)
            doc=yaml.safe_load(gc(runargs("services","describe",service)+["--format=export"],"EXPORT_"+service))
            candidate=definition(doc,rev,service,kind,old)
            (root/(service+".yaml")).write_text(yaml.safe_dump(candidate,sort_keys=False))
            initial[service]=s
            policies[service]=policy(service)
            print("SERVING_REVISION="+old,flush=True)
            print("SERVING_IMAGE="+digest,flush=True)
            print("CANDIDATE_DEFINITION=PASS; SERVICE="+service,flush=True)
        for secret in (WRITER,RECEIPT):
            verify_secret(secret)
        for secret in ("secumie-general-prod-db-staff-password","secumie-general-prod-db-migration-password"):
            verify_secret(secret)
        iam=gj(["projects","get-iam-policy",PROJECT],"PROJECT_IAM")
        conditions=[x["condition"] for x in iam.get("bindings",[]) if x.get("role")=="roles/cloudsql.client"
                    and x.get("condition",{}).get("title")==SQL_TITLE and x["condition"].get("expression")==SQL_EXPR]
        require(len(conditions)==1,"SQL_IAM_CONDITION_MISMATCH")
        condition=root/"condition.json";condition.write_text(json.dumps(conditions[0]))
        if not args.apply:
            print("READ_ONLY_PREFLIGHT=PASS; NO_CHANGES",flush=True);return
        deadline()
        for service,(_,old) in SERVICES.items():
            check_baseline(read_service(service),service,old)
        for service in SERVICES:
            sa="serviceAccount:"+service+"@"+PROJECT+".iam.gserviceaccount.com"
            gc(["projects","add-iam-policy-binding",PROJECT,"--member="+sa,"--role=roles/cloudsql.client",
                "--condition-from-file="+str(condition),"--format=none"],"SQL_IAM_"+service)
            for secret in (WRITER,RECEIPT):
                gc(["secrets","add-iam-policy-binding",secret,"--member="+sa,"--role=roles/secretmanager.secretAccessor",
                    "--condition=None","--format=none"],"SECRET_IAM_"+secret+"_"+service)
            print("RUNTIME_IAM_GRANTED="+service,flush=True)
        members={"serviceAccount:"+s+"@"+PROJECT+".iam.gserviceaccount.com" for s in SERVICES}
        for secret in (WRITER,RECEIPT):
            bindings=gj(["secrets","get-iam-policy",secret],"SECRET_READBACK_"+secret).get("bindings",[])
            require(len(bindings)==1 and bindings[0].get("role")=="roles/secretmanager.secretAccessor"
                    and not bindings[0].get("condition") and set(bindings[0].get("members",[]))==members,
                    "SECRET_IAM_READBACK_STOP_"+secret)
        iam=gj(["projects","get-iam-policy",PROJECT],"PROJECT_IAM_READBACK")
        require(any(x.get("role")=="roles/cloudsql.client" and x.get("condition")==conditions[0]
                    and members<=set(x.get("members",[])) for x in iam.get("bindings",[])),"SQL_IAM_READBACK_STOP")
        print("RUNTIME_IAM=PASS",flush=True)
        for service,(_,old) in SERVICES.items():
            deadline()
            s=read_service(service);check_baseline(s,service,old)
            require(s["spec"]==initial[service]["spec"],"SERVICE_TEMPLATE_CHANGED_"+service)
            require(binding_set(policy(service))==binding_set(policies[service]),"SERVICE_IAM_CHANGED_"+service)
            new=service+"-lead-42ca513"
            gc(runargs("services","replace",str(root/(service+".yaml"))),"CANDIDATE_DEPLOY_"+service)
            after=read_service(service)
            a=after["metadata"].get("annotations",{})
            require(after["status"].get("latestReadyRevisionName")==new and traffic_is_old(after,old),
                    "CANDIDATE_READY_OR_TRAFFIC_STOP_"+service)
            require(a.get("run.googleapis.com/ingress")=="internal-and-cloud-load-balancing"
                    and a.get("run.googleapis.com/default-url-disabled")=="true","PUBLIC_BOUNDARY_STOP_"+service)
            candidate=read_revision(new)
            actual_containers={x["name"]:x for x in candidate["spec"]["containers"]}
            require(set(actual_containers)=={"app","sql-proxy"}
                    and actual_containers["app"]["image"]==IMAGE
                    and actual_containers["sql-proxy"]["image"]==PROXY,"CANDIDATE_IMAGE_STOP_"+service)
            expected=yaml.safe_load((root/(service+".yaml")).read_text())
            desired=expected["spec"]["template"]["spec"]["containers"][0]
            # Secret values never read, compared or printed: compare references and literal config in memory only.
            require(envmap(actual_containers["app"])==envmap(desired),"CANDIDATE_ENV_STOP_"+service)
            require(binding_set(policy(service))==binding_set(policies[service]),"PUBLIC_IAM_CHANGED_"+service)
            print("CANDIDATE_READY="+new,flush=True)
            print("CURRENT_PRODUCTION="+old,flush=True)
            print("CANDIDATE_TRAFFIC=0",flush=True)
        staff=read_service("sales-tools")
        active=[x for x in staff["status"].get("traffic",[]) if (x.get("percent") or 0)>0]
        require(len(active)==1 and active[0]["percent"]==100,"SALES_TOOLS_TRAFFIC_NOT_SINGLE")
        staff_rev=read_revision(active[0]["revisionName"])
        print("SALES_TOOLS_SERVING_REVISION="+active[0]["revisionName"],flush=True)
        print("SALES_TOOLS_SERVING_IMAGE="+staff_rev.get("status",{}).get("imageDigest","UNAVAILABLE"),flush=True)
        print("PRODUCTION_CANDIDATES_COMPLETE; CURRENT_PUBLIC_TRAFFIC=UNCHANGED; NO_DATABASE_MIGRATION; NO_REBUILD; NO_RESCAN",flush=True)

if __name__=="__main__":
    try:
        main()
    except Stop as e:
        print("STOP: "+str(e)+"; inspect partial state; do not rerun blindly",file=sys.stderr)
        sys.exit(2)
    except Exception:
        print("STOP: UNEXPECTED_FAILURE; no configuration/secret dump",file=sys.stderr)
        sys.exit(3)
