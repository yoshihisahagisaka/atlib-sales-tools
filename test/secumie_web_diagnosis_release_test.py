#!/usr/bin/env python3
import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts/readiness"))
import secumie_web_diagnosis_release as m

class ReleaseGuard(unittest.TestCase):
    def setUp(self):
        self.old={"metadata":{"name":m.w.OLD,"annotations":{"run.googleapis.com/secrets":"existing-ref"}},"spec":{"serviceAccountName":"existing-sa","containerConcurrency":10,"containers":[{"name":"app","image":m.w.BASE_IMAGE,"env":[{"name":"EXAMPLE","valueFrom":{"secretKeyRef":{"name":"existing","key":"1"}}}]},{"name":"sql-proxy","image":"existing-proxy","args":["existing"]}]},"status":{"conditions":[{"type":"Ready","status":"True"}]}}
        self.new=copy.deepcopy(self.old)
        self.new["metadata"]["name"]=m.NEW
        self.new["spec"]["containers"][0]["image"]=m.IMAGE

    def test_only_app_image_changes(self):
        m.verify_revision(self.old,self.new)

    def test_reject_any_runtime_delta(self):
        for change in ("proxy","env","concurrency","secret","ready"):
            with self.subTest(change=change):
                new=copy.deepcopy(self.new)
                if change=="proxy":new["spec"]["containers"][1]["image"]="changed"
                if change=="env":new["spec"]["containers"][0]["env"]=[]
                if change=="concurrency":new["spec"]["containerConcurrency"]=11
                if change=="secret":new["metadata"]["annotations"]["run.googleapis.com/secrets"]="changed"
                if change=="ready":new["status"]["conditions"]=[]
                with self.assertRaises(m.c.Stop):m.verify_revision(self.old,new)

    def test_exact_candidate_approval(self):
        self.assertEqual(len(m.APPROVED),3)
        self.assertEqual(m.IMAGE.split("@")[1],"sha256:f98843288576903f19e2f3325d3e38e80845a98afa036895bae4ab9417e77502")
        self.assertEqual(m.w.SERVICE,"secumie-web-general-prod")

    def test_traffic_split_denied(self):
        with patch.object(m.c,"read_service",return_value={"status":{"traffic":[{"revisionName":m.NEW,"percent":90},{"revisionName":m.w.OLD,"percent":10}]},"metadata":{"annotations":{}}}):
            with self.assertRaises(m.c.Stop):m.check_traffic(m.NEW)

if __name__=="__main__":
    unittest.main()
