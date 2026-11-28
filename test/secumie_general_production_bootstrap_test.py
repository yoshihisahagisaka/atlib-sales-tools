import subprocess
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/readiness"))
import secumie_general_production_bootstrap as b
import secumie_general_production_migrate as m

class TestProductionContract(unittest.TestCase):
    def test_scope_and_budget(self):
        self.assertEqual(b.TARGET,"msp-zabbix:asia-northeast1:secumie-sg-shared-prod-db/secumie_general")
        self.assertEqual(sum(v[0] for v in b.ROLES.values()),45)
        self.assertEqual(b.REQUIRED,125)
        self.assertEqual(len(b.NAMES),4)
        self.assertTrue(all("prod" in s and "stg" not in s for s in b.NAMES))
    def test_wrong_target_stops_before_cloud(self):
        p=subprocess.run([sys.executable,str(ROOT/"scripts/readiness/secumie_general_production_bootstrap.py"),
                          "--target","msp-zabbix:asia-northeast1:secumie-sg-shared-staging-db/secumie_general_staging","--apply"],
                         capture_output=True,text=True)
        self.assertEqual(p.returncode,2)
        self.assertIn("PRODUCTION_TARGET_MISMATCH",p.stderr)
        self.assertEqual(p.stdout,"")
    def test_equivalence(self):
        files=m.production_files(ROOT)
        self.assertEqual(len(files),6)
        batch=m.batch_sql(files)
        self.assertEqual(batch.count("MIGRATION_APPLIED="),6)
        self.assertIn("pg_try_advisory_lock(17492026,1)",batch)
        self.assertNotIn("secumie_general_staging",batch)
        self.assertNotIn("secumie_general_migration_staging",batch)
        self.assertIn("secumie_general_staff_prod",batch)
        self.assertLess(batch.index("GENERAL_MIGRATION_PREFLIGHT_STOP"),batch.index("CREATE TABLE public.schema_migrations"))

if __name__=="__main__":
    unittest.main()
