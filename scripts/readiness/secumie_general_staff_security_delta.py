#!/usr/bin/env python3
"""Read-only comparison of existing staff overlay scan against exact live base.
One baseline scan only when no previous comparable scan is available. Never deploy.
"""
import argparse
import collections
import json
import re
import sys
import secumie_general_production_candidate as c
import secumie_general_staff_production_candidate as staff

BLOCKERS={"CRITICAL","HIGH","UNKNOWN","SEVERITY_UNSPECIFIED"}
KNOWN={"CRITICAL","HIGH","MEDIUM","LOW","MINIMAL","UNKNOWN","SEVERITY_UNSPECIFIED"}

def read_scan(scan):
    c.require(re.fullmatch(r"projects/msp-zabbix/locations/asia/scans/[0-9a-f-]{36}",scan) is not None,"SCAN_ID_STOP")
    rows=c.gj(["artifacts","docker","images","list-vulnerabilities",scan],"SCAN_READ")
    c.require(isinstance(rows,list),"SCAN_FORMAT_STOP")
    return rows

def normalize(rows):
    findings={}
    counts=collections.Counter()
    for row in rows:
        v=row.get("vulnerability")
        c.require(isinstance(v,dict),"INVALID_VULNERABILITY")
        sev=v.get("effectiveSeverity") or "UNKNOWN"
        c.require(sev in KNOWN,"UNKNOWN_SEVERITY_FORMAT")
        note=(row.get("noteName") or "").split("/")[-1]
        issues=v.get("packageIssue")
        c.require(bool(note) and isinstance(issues,list) and bool(issues),"FINDING_IDENTITY_MISSING")
        counts[sev]+=1
        for i in issues:
            pkg=i.get("affectedPackage")
            installed=(i.get("affectedVersion") or {}).get("fullName")
            typ=i.get("packageType") or "UNSPECIFIED"
            c.require(bool(pkg) and bool(installed),"PACKAGE_IDENTITY_MISSING")
            key=(note,pkg,installed,typ,sev)
            fixed=(i.get("fixedVersion") or {}).get("fullName")
            findings.setdefault(key,set()).add(fixed or "")
    return counts,findings

def compare(old,new):
    oldcounts,a=normalize(old)
    newcounts,b=normalize(new)
    added=set(b)-set(a)
    gone=set(a)-set(b)
    def entry(k):
        return dict(zip(("cve","package","installed","packageType","severity"),k))
    print("BASELINE_COUNTS="+json.dumps(dict(oldcounts),sort_keys=True))
    print("OVERLAY_COUNTS="+json.dumps(dict(newcounts),sort_keys=True))
    print("ADDED_OR_CHANGED_ENTRIES="+str(len(added)))
    print("REMOVED_OR_CHANGED_ENTRIES="+str(len(gone)))
    print("ADDED_OR_CHANGED="+json.dumps([entry(k) for k in sorted(added)]))
    print("NEW_OR_CHANGED_BLOCKERS="+json.dumps([entry(k) for k in sorted(added) if k[-1] in BLOCKERS]))
    print("RESIDUAL_BLOCKERS="+str(sum(k[-1] in BLOCKERS for k in b)))
    print("FIX_AVAILABLE_BLOCKERS="+json.dumps([{**entry(k),"fixed":sorted(x for x in b[k] if x)} for k in sorted(b) if k[-1] in BLOCKERS and any(b[k])]))
    if any(k[-1] in BLOCKERS for k in added):
        print("STAFF_SECURITY_DELTA=STOP_NEW_OR_CHANGED_BLOCKERS")
    else:
        print("STAFF_SECURITY_DELTA=NO_NEW_BLOCKER")
        print("RESIDUAL_RISK_RELEASE_AUTHORIZATION=REQUIRED")
    print("NO_BUILD; NO_OVERLAY_RESCAN; NO_IAM_WRITE; NO_DEPLOY; NO_TRAFFIC_CHANGE")

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-scan",help="Only a verified scan of exact OLD_IMAGE; operator attests identity.")
    args=parser.parse_args()
    current=c.read_service(staff.SERVICE)
    c.require(c.traffic_is_old(current,staff.OLD),"STAFF_SERVING_REVISION_CHANGED")
    rev=c.read_revision(staff.OLD)
    c.require(rev.get("status",{}).get("imageDigest")==staff.OLD_IMAGE,"STAFF_SERVING_DIGEST_CHANGED")
    for service in c.SERVICES:
        s=c.read_service(service)
        c.require(c.traffic_is_old(s,service+"-notify-03e48d9"),"PUBLIC_SERVING_REVISION_CHANGED_"+service)
    new=read_scan(staff.SCAN)
    print("OVERLAY_SCAN="+staff.SCAN,flush=True)
    if args.baseline_scan:
        scan=args.baseline_scan
    else:
        scan=c.gc(["artifacts","docker","images","scan",staff.OLD_IMAGE,"--remote","--location=asia","--format=value(response.scan)"],"BASELINE_SCAN").strip()
    print("BASELINE_IMAGE="+staff.OLD_IMAGE,flush=True)
    print("BASELINE_SCAN="+scan,flush=True)
    old=read_scan(scan)
    compare(old,new)

if __name__=="__main__":
    try:
        main()
    except c.Stop as e:
        print("STOP: "+str(e),file=sys.stderr)
        sys.exit(2)
    except Exception:
        print("STOP: UNEXPECTED_COMPARISON_FAILURE; preserve scan ID; no deployment",file=sys.stderr)
        sys.exit(3)
