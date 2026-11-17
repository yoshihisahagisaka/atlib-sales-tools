import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {parseCsv,previewDeviceCsv,suggestMapping} from '../src/domain/assessmentDeviceImportPreview';

test('CSV quoting, BOM and multiline are parsed without data loss',()=>{
 assert.deepEqual(parseCsv('\uFEFF資産番号,PC名\r\n"PC,01","営業""PC"\n予備"'),[['資産番号','PC名'],['PC,01','営業"PC"\n予備']]);
});
test('known columns mapped, user and status remain source-only, not VERIFIED',()=>{
 const p=previewDeviceCsv('資産番号,PC名,シリアル番号,利用者,状態\nPC-01,営業PC,SN1,田中,利用中');
 assert.deepEqual(p.mapping.map(m=>m.targetField),['asset_tag','display_name','serial_number',null,null]);
 assert.equal(p.rows[0].outcome,'COMPARISON_PENDING');
 assert.deepEqual(p.rows[0].mappedCandidate,{asset_tag:'PC-01',display_name:'営業PC',serial_number:'SN1'});
});
test('duplicate and missing key require review',()=>{
 const p=previewDeviceCsv('資産番号,PC名\nPC-01,A\nPC-01,B\n,C');
 assert.deepEqual(p.rows.map(r=>r.outcome),['NEEDS_REVIEW','NEEDS_REVIEW','NEEDS_REVIEW']);
 assert.ok(p.rows[0].issues.includes('DUPLICATE_ASSET_TAG_IN_FILE'));
});
test('ambiguous column does not auto-map',()=>{
 const p=previewDeviceCsv('番号,PC名\nPC-01,A');
 assert.ok(p.issues.includes('MISSING_REQUIRED_MAPPING:asset_tag'));
 assert.equal(p.rows[0].outcome,'NEEDS_REVIEW');
});
test('human mapping can resolve ambiguous column',()=>{
 const m=suggestMapping(['番号','PC名']);
 m[0]={sourceColumnIndex:0,targetField:'asset_tag',origin:'HUMAN'};
 const p=previewDeviceCsv('番号,PC名\nPC-01,A',m);
 assert.equal(p.rows[0].outcome,'COMPARISON_PENDING');
});
test('never infers create/update or deletes missing records',()=>{
 const p=previewDeviceCsv('資産番号,PC名\nPC-01,A');
 assert.equal(p.rows[0].outcome,'COMPARISON_PENDING');
 assert.equal('device_status' in p.rows[0].mappedCandidate,false);
});
test('invalid quoted CSV fails closed',()=>assert.throws(()=>parseCsv('資産番号,PC名\n"PC-01,A'),/UNCLOSED_CSV_QUOTE/));
