#!/usr/bin/env python3
"""Staff-only production candidate: reuse live Sales Tools and already completed scan."""
import argparse
import copy
import json
from pathlib import Path
import sys
import tempfile
import yaml
import secumie_general_production_candidate as c
from secumie_general_production_candidate_resume import PROXY_MANIFEST

SERVICE="sales-tools"
OLD="sales-tools-fds-20261124-01"
NEW="sales-tools-secumie-staff-5dcaaa6"
SA="sales-tools-sa@msp-zabbix.iam.gserviceaccount.com"
BASE="asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/sales-tools"
OLD_IMAGE=BASE+"@sha256:e681628f03c83258ce12332a4abe5bfea46704a97ae09e3a9123d1449139f263"
IMAGE=BASE+"@sha256:49e25ba4a8ce41d1cb06f6184d6451e24ad98e67a4872641e468ab3d792e3e9a"
SCAN="projects/msp-zabbix/locations/asia/scans/543797ec-b2f9-4ece-b64c-c9429fffa885"
SECRET="secumie-general-prod-db-staff-password"

def security():
    findings=c.gj(["artifacts","docker","images","list-vulnerabilities",SCAN],"STAFF_SCAN_READBACK")
    c.require(isinstance(findings,list),"STAFF_SCAN_FORMAT_STOP")
    counts={}
    blockers=[]
    for f in findings:
        v=f.get("vulnerability") or {}
        sev=v.get("effectiveSeverity") or "UNKNOWN"
        counts[sev]=counts.get(sev,0)+1
        if sev not in ("MEDIUM","LOW","MINIMAL"):
            blockers.append({"severity":sev,"cve":f.get("noteName","").split("/")[-1],
                "packages":[{"package":i.get("affectedPackage"),"installed":(i.get("affectedVersion") or {}).get("fullName"),
                "fixed":(i.get("fixedVersion") or {}).get("fullName")} for i in v.get("packageIssue",[])]})
    print("STAFF_SCAN_COUNTS="+json.dumps(counts,sort_keys=True),flush=True)
    if blockers:
        print("STAFF_SCAN_BLOCKERS="+json.dumps(blockers),flush=True)
    c.require(not blockers,"STAFF_SECURITY_GATE_STOP")
    print("STAFF_SECURITY_GATE=PASS; NO_RESCAN",flush=True)

def traffic_signature(s):
    return sorted((x.get("revisionName") or "",x.get("tag") or "",x.get("percent") or 0)
                  for x in s.get("status",{}).get("traffic",[]))

def check_old(s):
    c.require(c.traffic_is_old(s,OLD),"STAFF_ACTIVE_REVISION_CHANGED")
    st=s["status"]
    c.require(st.get("latestCreatedRevisionName")==OLD and st.get("latestReadyRevisionName")==OLD,
              "STAFF_OTHER_CANDIDATE_PRESENT")

def make_definition(doc, oldrev, initial):
    d=copy.deepcopy(doc)
    t=d["spec"]["template"]
    spec=t["spec"]
    oldspec=oldrev["spec"]
    c.require(spec.get("serviceAccountName")==SA and oldspec.get("serviceAccountName")==SA,"STAFF_SA_STOP")
    c.require(len(spec["containers"])==1 and len(oldspec["containers"])==1,"STAFF_SIDECAR_COLLISION")
    app=copy.deepcopy(oldspec["containers"][0])
    env=c.envmap(app)
    c.require(c.envmap(spec["containers"][0])==env,"STAFF_TEMPLATE_ENV_CHANGED")
    c.require(bool(env.get("DB_SOCKET_PATH",{}).get("value","").startswith("/cloudsql/")),"EXISTING_DB_SOCKET_STOP")
    c.require(not any(k.startswith("SECUMIE_GENERAL_") for k in env),"STAFF_GENERAL_ENV_COLLISION")
    ann=t.setdefault("metadata",{}).setdefault("annotations",{})
    c.require(ann.get("autoscaling.knative.dev/maxScale")=="20","STAFF_SCALE_STOP")
    c.require(not ann.get("run.googleapis.com/vpc-access-connector")
              and not ann.get("run.googleapis.com/network-interfaces")
              and not ann.get("run.googleapis.com/container-dependencies"),"STAFF_EXISTING_NETWORK_REVIEW")
    c.require("msp-zabbix:asia-northeast1:msp-customer-portal-db" in
              ann.get("run.googleapis.com/cloudsql-instances","").split(","),"STAFF_EXISTING_CLOUDSQL_STOP")
    c.require(spec.get("volumes",[])==oldspec.get("volumes",[]),"STAFF_EXISTING_VOLUMES_CHANGED")
    app["name"]="app"
    app["image"]=IMAGE
    app["env"].extend({"name":k,"value":v} for k,v in {
        "SECUMIE_GENERAL_ADMIN_ENABLED":"true","SECUMIE_GENERAL_DB_NAME":"secumie_general",
        "SECUMIE_GENERAL_DB_STAFF_USER":"secumie_general_staff_prod",
        "SECUMIE_GENERAL_DB_HOST":"127.0.0.1","SECUMIE_GENERAL_DB_PORT":"5432"}.items())
    app["env"].append({"name":"SECUMIE_GENERAL_DB_STAFF_PASSWORD","valueFrom":{"secretKeyRef":{"name":SECRET,"key":"1"}}})
    spec["containers"]=[app,{"name":"sql-proxy","image":c.PROXY,
        "args":["--private-ip","--address=0.0.0.0","--port=5432","--run-connection-test",
                c.PROJECT+":"+c.REGION+":"+c.INSTANCE],
        "resources":{"limits":{"cpu":"1","memory":"256Mi"}},
        "startupProbe":{"tcpSocket":{"port":5432},"periodSeconds":5,"timeoutSeconds":3,"failureThreshold":20}}]
    t["metadata"]["name"]=NEW
    ann.update({"run.googleapis.com/network-interfaces":'[{"network":"default","subnetwork":"default"}]',
                "run.googleapis.com/vpc-access-egress":"private-ranges-only",
                "run.googleapis.com/container-dependencies":'{"app":["sql-proxy"]}'})
    # Pin existing real traffic and preserve every existing tag; never target LATEST.
    traffic=[]
    for item in initial["status"]["traffic"]:
        entry={"revisionName":item["revisionName"]}
        if item.get("tag"): entry["tag"]=item["tag"]
        if item.get("percent"): entry["percent"]=item["percent"]
        traffic.append(entry)
    d["spec"]["traffic"]=traffic
    return d

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply",action="store_true")
    args=parser.parse_args()
    c.deadline()
    security()
    for service,(_,old) in c.SERVICES.items():
        s=c.read_service(service)
        c.require(c.traffic_is_old(s,old) and s["status"].get("latestCreatedRevisionName")==service+"-lead-42ca513",
                  "PUBLIC_CANDIDATE_CHANGED_"+service)
    initial=c.read_service(SERVICE)
    check_old(initial)
    oldrev=c.read_revision(OLD)
    c.require(oldrev.get("status",{}).get("imageDigest")==OLD_IMAGE,"STAFF_OLD_DIGEST_CHANGED")
    original_policy=c.binding_set(c.policy(SERVICE))
    doc=yaml.safe_load(c.gc(c.runargs("services","describe",SERVICE)+["--format=export"],"STAFF_EXPORT"))
    desired=make_definition(doc,oldrev,initial)
    c.verify_secret(SECRET)
    iam=c.gj(["projects","get-iam-policy",c.PROJECT],"STAFF_PROJECT_IAM")
    member="serviceAccount:"+SA
    conditions=[x["condition"] for x in iam.get("bindings",[]) if x.get("role")=="roles/cloudsql.client"
        and (x.get("condition") or {}).get("title")==c.SQL_TITLE and x["condition"].get("expression")==c.SQL_EXPR]
    c.require(len(conditions)==1,"SQL_IAM_CONDITION_STOP")
    has_sql=any(x.get("role")=="roles/cloudsql.client" and member in x.get("members",[])
                and (not x.get("condition") or x["condition"]==conditions[0]) for x in iam.get("bindings",[]))
    print("STAFF_CANDIDATE_DEFINITION=PASS",flush=True)
    if not args.apply:
        print("READ_ONLY_PREFLIGHT=PASS",flush=True);return
    with tempfile.TemporaryDirectory(prefix="secumie-staff-prod-") as tmp:
        work=Path(tmp)
        c.deadline()
        now=c.read_service(SERVICE)
        check_old(now)
        c.require(now["spec"]==initial["spec"],"STAFF_TEMPLATE_CHANGED")
        c.require(c.binding_set(c.policy(SERVICE))==original_policy,"STAFF_SERVICE_IAM_CHANGED")
        if not has_sql:
            cond=work/"condition.json";cond.write_text(json.dumps(conditions[0]))
            c.gc(["projects","add-iam-policy-binding",c.PROJECT,"--member="+member,"--role=roles/cloudsql.client",
                  "--condition-from-file="+str(cond),"--format=none"],"STAFF_SQL_IAM")
        else:
            print("EXISTING_STAFF_SQL_IAM_REUSED",flush=True)
        c.gc(["secrets","add-iam-policy-binding",SECRET,"--member="+member,"--role=roles/secretmanager.secretAccessor",
              "--condition=None","--format=none"],"STAFF_SECRET_IAM")
        bindings=c.gj(["secrets","get-iam-policy",SECRET],"STAFF_SECRET_READBACK").get("bindings",[])
        c.require(len(bindings)==1 and bindings[0].get("role")=="roles/secretmanager.secretAccessor"
                  and not bindings[0].get("condition") and bindings[0].get("members")==[member],"STAFF_SECRET_IAM_STOP")
        print("STAFF_IAM=PASS",flush=True)
        path=work/"staff.yaml";path.write_text(yaml.safe_dump(desired,sort_keys=False))
        c.require(c.read_service(SERVICE)["spec"]==initial["spec"],"STAFF_TEMPLATE_CHANGED_BEFORE_DEPLOY")
        c.gc(c.runargs("services","replace",str(path)),"STAFF_CANDIDATE_DEPLOY")
        after=c.read_service(SERVICE)
        c.require(after["status"].get("latestCreatedRevisionName")==NEW,"STAFF_CANDIDATE_NAME_STOP")
        c.require(traffic_signature(after)==traffic_signature(initial),"STAFF_TRAFFIC_OR_TAG_CHANGED")
        rev=c.read_revision(NEW)
        c.require(any(x.get("type")=="Ready" and x.get("status")=="True"
                      for x in rev["status"].get("conditions",[])),"STAFF_CANDIDATE_NOT_READY")
        containers={x["name"]:x for x in rev["spec"]["containers"]}
        c.require(set(containers)=={"app","sql-proxy"} and containers["app"]["image"]==IMAGE
                  and containers["sql-proxy"]["image"] in (c.PROXY,PROXY_MANIFEST),"STAFF_IMAGE_STOP")
        c.require(c.envmap(containers["app"])==c.envmap(desired["spec"]["template"]["spec"]["containers"][0]),
                  "STAFF_ENV_STOP")
        c.require(c.binding_set(c.policy(SERVICE))==original_policy,"STAFF_PUBLIC_IAM_CHANGED")
        print("STAFF_CANDIDATE_READY="+NEW,flush=True)
        print("STAFF_CURRENT_PRODUCTION="+OLD,flush=True)
        print("STAFF_CANDIDATE_TRAFFIC=0; EXISTING_TAGS_PRESERVED=PASS",flush=True)
        print("ALL_PRODUCTION_CANDIDATES_COMPLETE; NO_PROMOTION",flush=True)

if __name__=="__main__":
    try:
        main()
    except c.Stop as e:
        print("STOP: "+str(e)+"; preserve partial state",file=sys.stderr)
        sys.exit(2)
    except Exception:
        print("STOP: UNEXPECTED_FAILURE; no configuration or secret dump",file=sys.stderr)
        sys.exit(3)
