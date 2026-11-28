#!/usr/bin/env python3
"""Resume only missing Insight candidate after WEB creation and IAM PASS."""
import argparse
import copy
import sys
import tempfile
from pathlib import Path
import yaml
import secumie_general_production_candidate as c

# Canonical 19.21.1: already verified index -> linux/amd64 manifest.
PROXY_MANIFEST="gcr.io/cloud-sql-connectors/cloud-sql-proxy@sha256:d3e789e2d9fab9a3fdcb7c177dec9d42f76ccab97dd488e252290f3f3010a116"
WEB="secumie-web-general-prod"
INSIGHT="secumie-insight-general-prod"
OLD_DIGESTS={
    WEB:c.BASE+"@sha256:913601fc8480af5f7357b7b6ce488c7e9a2411f43ab299913303c2192de878b9",
    INSIGHT:c.BASE+"@sha256:1f3e0a7a2ffaacd3e6f2f0c1cc1d9072c06e0984e7f3ff7f49a0c520d00d505d",
}

def check_traffic(service,s):
    old=c.SERVICES[service][1]
    a=s["metadata"].get("annotations",{})
    c.require(c.traffic_is_old(s,old),"OLD_TRAFFIC_CHANGED_"+service)
    c.require(a.get("run.googleapis.com/ingress")=="internal-and-cloud-load-balancing"
              and a.get("run.googleapis.com/default-url-disabled")=="true","PUBLIC_BOUNDARY_CHANGED_"+service)

def verify_candidate(service,s,oldrev):
    check_traffic(service,s)
    kind,old=c.SERVICES[service]
    new=service+"-lead-42ca513"
    c.require(s["status"].get("latestCreatedRevisionName")==new,"CANDIDATE_NAME_STOP_"+service)
    rev=c.read_revision(new)
    c.require(rev["metadata"]["name"]==new and any(x.get("type")=="Ready" and x.get("status")=="True"
              for x in rev["status"].get("conditions",[])),"REVISION_NOT_READY_"+service)
    spec=rev["spec"]
    c.require(spec.get("serviceAccountName")==service+"@"+c.PROJECT+".iam.gserviceaccount.com","SA_STOP_"+service)
    containers={x["name"]:x for x in spec["containers"]}
    c.require(set(containers)=={"app","sql-proxy"},"CONTAINERS_STOP_"+service)
    app,proxy=containers["app"],containers["sql-proxy"]
    c.require(app["image"]==c.IMAGE and proxy["image"] in (c.PROXY,PROXY_MANIFEST),"IMAGE_STOP_"+service)
    expected=c.envmap(oldrev["spec"]["containers"][0]).copy()
    for key,value in {
      "SECUMIE_GENERAL_DB_NAME":"secumie_general","SECUMIE_GENERAL_DB_USER":"secumie_general_writer_prod",
      "SECUMIE_GENERAL_DB_HOST":"127.0.0.1","SECUMIE_GENERAL_DB_PORT":"5432"}.items():
        expected[key]={"name":key,"value":value}
    for key,secret in (("SECUMIE_GENERAL_DB_PASSWORD",c.WRITER),("SECUMIE_GENERAL_RECEIPT_SECRET",c.RECEIPT)):
        expected[key]={"name":key,"valueFrom":{"secretKeyRef":{"name":secret,"key":"1"}}}
    c.require(c.envmap(app)==expected,"ENV_STOP_"+service)
    c.require(proxy.get("args")==["--private-ip","--address=0.0.0.0","--port=5432","--run-connection-test",
              c.PROJECT+":"+c.REGION+":"+c.INSTANCE],"PROXY_ARGS_STOP_"+service)
    a=rev["metadata"].get("annotations",{})
    c.require(a.get("autoscaling.knative.dev/maxScale")=="1"
              and a.get("run.googleapis.com/vpc-access-egress")=="private-ranges-only","NETWORK_OR_SCALE_STOP_"+service)
    print("CANDIDATE_READY="+new,flush=True)
    print("PROXY_MANIFEST_IDENTITY=PASS; SERVICE="+service,flush=True)
    print("CANDIDATE_TRAFFIC=0; CURRENT_PRODUCTION="+old,flush=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply",action="store_true")
    args=parser.parse_args()
    c.deadline()
    oldrevs={}
    for service,(_,old) in c.SERVICES.items():
        oldrevs[service]=c.read_revision(old)
        c.require(c.actual_digest(oldrevs[service])==OLD_DIGESTS[service],"OLD_DIGEST_CHANGED_"+service)
    verify_candidate(WEB,c.read_service(WEB),oldrevs[WEB])
    print("NO_WEB_REDEPLOY",flush=True)
    kind,old=c.SERVICES[INSIGHT]
    initial=c.read_service(INSIGHT)
    check_traffic(INSIGHT,initial)
    if initial["status"].get("latestCreatedRevisionName")==INSIGHT+"-lead-42ca513":
        verify_candidate(INSIGHT,initial,oldrevs[INSIGHT])
        print("NO_INSIGHT_REDEPLOY",flush=True)
    else:
        c.check_baseline(initial,INSIGHT,old)
        policy=c.binding_set(c.policy(INSIGHT))
        doc=yaml.safe_load(c.gc(c.runargs("services","describe",INSIGHT)+["--format=export"],"EXPORT_INSIGHT"))
        desired=c.definition(doc,oldrevs[INSIGHT],INSIGHT,kind,old)
        if not args.apply:
            print("READ_ONLY_PREFLIGHT=PASS; NO_CHANGES",flush=True)
            return
        c.deadline()
        now=c.read_service(INSIGHT)
        c.check_baseline(now,INSIGHT,old)
        c.require(now["spec"]==initial["spec"],"INSIGHT_TEMPLATE_CHANGED")
        with tempfile.TemporaryDirectory(prefix="secumie-insight-resume-") as work:
            path=Path(work)/"insight.yaml"
            path.write_text(yaml.safe_dump(desired,sort_keys=False))
            c.gc(c.runargs("services","replace",str(path)),"INSIGHT_DEPLOY")
        verify_candidate(INSIGHT,c.read_service(INSIGHT),oldrevs[INSIGHT])
        c.require(c.binding_set(c.policy(INSIGHT))==policy,"INSIGHT_PUBLIC_IAM_CHANGED")
    check_traffic(WEB,c.read_service(WEB))
    staff=c.read_service("sales-tools")
    active=[x for x in staff["status"].get("traffic",[]) if (x.get("percent") or 0)>0]
    c.require(len(active)==1 and active[0]["percent"]==100,"STAFF_TRAFFIC_NOT_SINGLE")
    rev=c.read_revision(active[0]["revisionName"])
    print("SALES_TOOLS_SERVING_REVISION="+active[0]["revisionName"],flush=True)
    print("SALES_TOOLS_SERVING_IMAGE="+rev.get("status",{}).get("imageDigest","UNAVAILABLE"),flush=True)
    print("PRODUCTION_CANDIDATES_COMPLETE; NO_IAM_WRITE; NO_WEB_REDEPLOY; CURRENT_PUBLIC_TRAFFIC=UNCHANGED",flush=True)

if __name__=="__main__":
    try:
        main()
    except c.Stop as e:
        print("STOP: "+str(e)+"; preserve partial state",file=sys.stderr)
        sys.exit(2)
    except Exception:
        print("STOP: UNEXPECTED_FAILURE; no configuration or secret dump",file=sys.stderr)
        sys.exit(3)
