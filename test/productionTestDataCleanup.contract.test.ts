import assert from 'node:assert/strict';
import {test} from 'node:test';
import path from 'node:path';
import fs from 'node:fs';

const contract=require('../scripts/cleanup/productionTestDataCleanupContract.cjs');
const runner=require('../scripts/cleanup/runProductionTestDataCleanup.cjs');
const manifestPath=path.resolve(__dirname,'../cleanup-manifests/production-test-data-cleanup-20261013.json');

test('cleanup manifest is fail-closed and fixes exactly the reviewed 16 Case IDs',()=>{
 const {manifest,manifestSha256}=contract.readManifest(manifestPath);
 assert.equal(manifest.execution_authorized,false);assert.equal(manifest.status,'PREPARED_NOT_AUTHORIZED');
 assert.equal(manifest.historical_v1_case_ids.length,1);assert.equal(manifest.vs1_case_ids.length,15);
 assert.equal(new Set([...manifest.historical_v1_case_ids,...manifest.vs1_case_ids]).size,16);
 assert.match(manifestSha256,/^[a-f0-9]{64}$/);assert.equal(manifest.preserve.marketing_initiative_ids[0],'1a1f0d34-2ffa-421c-a375-a2a13e35bbcf');
});

test('cleanup code contains no time/name based target discovery and disables only reviewed named triggers',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../scripts/cleanup/runProductionTestDataCleanup.cjs'),'utf8');
 assert.doesNotMatch(source,/company\.name|contact\.name|created_at\s*[<>=]|TRUNCATE|DISABLE TRIGGER ALL/i);
 assert.deepEqual(runner.TRIGGERS.map((entry:[string,string])=>entry[1]),[
  'diagnosis_reports_freeze','trg_hearing_statement_v2_immutable','trg_assessment_structure_suggestion_immutable',
  'original_survey_snapshot_v2_immutable','current_state_revision_v2_immutable','analysis_result_v2_immutable',
  'generated_narrative_v2_immutable','human_edited_narrative_v2_immutable',
 ]);
});

test('package preserves migration and initiative identities',()=>{
 const {manifest}=contract.readManifest(manifestPath);
 assert.deepEqual(contract.EXPECTED_LEDGER.slice(-2),['033_free_diagnosis_design_v2_persistence.sql','034_marketing_initiative_v1.sql']);
 assert.equal(manifest.expected_before.initiative_matching_activities,4);
 assert.equal(manifest.expected_before.approved_reports,1);
});
