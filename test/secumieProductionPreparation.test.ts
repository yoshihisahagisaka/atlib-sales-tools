import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { evaluateProductionConnectionCapacity, SECU_PRODUCTION_MIGRATIONS, SECU_PRODUCTION_TARGET } from '../src/db/secumieProductionContract';

const root=path.resolve(__dirname,'..');
const verifier=path.join(root,'scripts','readiness','verifySecumieMigrationManifest.cjs');
const manifest=path.join(root,'migration-manifests','secumie-insight-production-037-041.json');

test('production manifest contains exactly approved migrations 037-041',()=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'secumie-production-migrations-'));
  for(const filename of SECU_PRODUCTION_MIGRATIONS) copyFileSync(path.join(root,'migrations',filename),path.join(directory,filename));
  const result=JSON.parse(execFileSync(process.execPath,[verifier,manifest,directory,'true'],{encoding:'utf8'}));
  assert.equal(result.database,'secumie_insight');
  assert.deepEqual(result.filenames,SECU_PRODUCTION_MIGRATIONS);
  const first=path.join(directory,SECU_PRODUCTION_MIGRATIONS[0]);
  writeFileSync(first,`${readFileSync(first,'utf8')}\n-- forbidden change\n`);
  const tampered=spawnSync(process.execPath,[verifier,manifest,directory,'true'],{encoding:'utf8'});
  assert.notEqual(tampered.status,0);
  assert.match(tampered.stderr,/SHA-256 mismatch/);
});

test('production target and capacity contract are fixed',()=>{
  assert.equal(SECU_PRODUCTION_TARGET,'msp-zabbix:asia-northeast1:secumie-sg-shared-prod-db/secumie_insight');
  assert.equal(evaluateProductionConnectionCapacity({maxConnections:100,superuserReserved:3,reserved:0,observedConnections:6}).pass,true);
  assert.equal(evaluateProductionConnectionCapacity({maxConnections:97,superuserReserved:3,reserved:0,observedConnections:6}).pass,false);
  assert.equal(evaluateProductionConnectionCapacity({maxConnections:120,superuserReserved:3,reserved:0,observedConnections:40}).pass,false);
});
