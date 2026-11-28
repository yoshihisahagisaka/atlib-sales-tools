import importlib.util
import hashlib
import hmac
import base64
import unittest
from pathlib import Path

path=Path(__file__).resolve().parents[1]/"scripts/readiness/secumie_general_staging_bootstrap.py"
spec=importlib.util.spec_from_file_location("bootstrap",path)
bootstrap=importlib.util.module_from_spec(spec)
spec.loader.exec_module(bootstrap)

class TestBootstrap(unittest.TestCase):
    def test_capacity(self):
        self.assertEqual(bootstrap.capacity(400,3,0,10),320)
        self.assertEqual(bootstrap.capacity(100,3,0,25),70)
    def test_verifier(self):
        value=bootstrap.scram_verifier("synthetic-password-not-for-production",b"x"*16)
        algorithm,params,keys=value.split("$")
        self.assertEqual(algorithm,"SCRAM-SHA-256")
        count,salt=params.split(":")
        stored,server=keys.split(":")
        key=hashlib.pbkdf2_hmac("sha256",b"synthetic-password-not-for-production",base64.b64decode(salt),int(count))
        self.assertEqual(base64.b64decode(stored),hashlib.sha256(hmac.digest(key,b"Client Key","sha256")).digest())
        self.assertEqual(base64.b64decode(server),hmac.digest(key,b"Server Key","sha256"))
    def test_recovery_create_uses_current_owner(self):
        import inspect
        source=inspect.getsource(bootstrap.create_database_and_acl)
        self.assertIn('CREATE DATABASE {DB};',source)
        self.assertNotIn('CREATE DATABASE {DB} OWNER',source)
        self.assertIn('GRANT CREATE ON DATABASE {DB} TO secumie_general_migration_staging',source)
        self.assertIn('REVOKE ALL ON SCHEMA public FROM PUBLIC',source)

    def test_scope(self):
        self.assertEqual(bootstrap.INSTANCE,"secumie-sg-shared-staging-db")
        self.assertEqual(bootstrap.DB,"secumie_general_staging")
        self.assertEqual(sum(x[0] for x in bootstrap.ROLES.values()),7)
        self.assertEqual(len(set(x[1] for x in bootstrap.ROLES.values())|{bootstrap.RECEIPT}),4)

if __name__=="__main__":
    unittest.main()
