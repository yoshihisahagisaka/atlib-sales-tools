import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDiagnosisHarness } from './support/diagnosisHarness';
import { operator } from './support/preparationFixtures';
import { startedCase } from './support/workspaceFixtures';
import { RetentionDeletionWorker } from '../src/services/retentionDeletionWorker';

let h:Awaited<ReturnType<typeof createDiagnosisHarness>>;
let worker:RetentionDeletionWorker;
const operatorUserId=operator.kind==='STAFF'?operator.userId:(()=>{throw new Error('STAFF test actor required');})();
before(async()=>{h=await createDiagnosisHarness();worker=new RetentionDeletionWorker(h.pool);});
after(async()=>{await h?.close();});

test('approved deletion request anonymizes raw classes, preserves provenance IDs, restrict-retains approved evidence and is idempotent',async()=>{
  const c=await startedCase(h);
  const note=await h.workspace.addSource(c.id,operator,'OPERATOR_NOTE',{content:'削除対象の補足',external_reference:'customer-secret'});
  const transcript=await h.workspace.addSource(c.id,operator,'TRANSCRIPT',{content:'削除対象Transcript'});
  const req=await h.repo.createDeletionRequest(c.id,operator,'customer-request-001');
  await h.repo.scopeDeletionRequest(c.id,req.id,operator,
    ['GENERAL_RAW_DIAGNOSIS','TRANSCRIPT_RECORDING','APPROVED_DECISION_EVIDENCE'],
    [{dataClass:'APPROVED_DECISION_EVIDENCE',reason:'Business policy 5-year restricted retention'}],
  );
  await h.repo.decideDeletionRequest(c.id,req.id,operator,'APPROVE','本人確認済みの削除要求');

  const result=await worker.executeApprovedRequest(c.id,req.id,operatorUserId);
  assert.equal(result.status,'PARTIALLY_RETAINED');
  assert.deepEqual(result.restricted_classes,['APPROVED_DECISION_EVIDENCE']);
  assert.ok(result.anonymized.source_records>=2);
  assert.ok(result.anonymized.survey_responses>0);
  assert.ok(result.anonymized.participants>0);

  const sources=await h.db.query<{id:string;content:string;external_reference:string|null}>('SELECT id,content,external_reference FROM source_records WHERE id IN ($1,$2) ORDER BY id',[note.id,transcript.id]);
  assert.equal(sources.rows.length,2);
  assert.ok(sources.rows.every(r=>r.content==='[REDACTED]'&&r.external_reference===null));
  const responses=await h.db.query<{raw_value_json:unknown}>('SELECT raw_value_json FROM survey_responses WHERE diagnosis_case_id=$1',[c.id]);
  assert.ok(responses.rows.length>0);
  assert.ok(responses.rows.every(r=>r.raw_value_json===null));
  const participant=await h.db.query<{name:string;email:string;phone:string|null}>('SELECT name,email,phone FROM participants WHERE diagnosis_case_id=$1',[c.id]);
  assert.ok(participant.rows.every(p=>p.name==='削除済み'&&p.email.endsWith('@invalid.local')&&p.phone===null));

  const request=await h.db.query<{status:string;executed_by_user_id:string|null}>('SELECT status,executed_by_user_id FROM diagnosis_deletion_requests WHERE id=$1',[req.id]);
  assert.equal(request.rows[0]!.status,'PARTIALLY_RETAINED');
  assert.equal(request.rows[0]!.executed_by_user_id,operatorUserId);
  const audit=await h.db.query<{command:string;detail_json:any}>('SELECT command,detail_json FROM diagnosis_audit_logs WHERE diagnosis_case_id=$1 AND command=\'ExecuteDeletionRequest\'',[c.id]);
  assert.equal(audit.rows.length,1);
  assert.equal(audit.rows[0]!.detail_json.deletion_request_id,req.id);

  const replay=await worker.executeApprovedRequest(c.id,req.id,operatorUserId);
  assert.equal(replay.idempotent,true);
  assert.equal(replay.status,'PARTIALLY_RETAINED');
  assert.equal((await h.db.query('SELECT id FROM diagnosis_audit_logs WHERE diagnosis_case_id=$1 AND command=\'ExecuteDeletionRequest\'',[c.id])).rows.length,1);
});

test('active Hold prevents scoped class anonymization while allowing request to finish as PARTIALLY_RETAINED',async()=>{
  const c=await startedCase(h);
  const note=await h.workspace.addSource(c.id,operator,'OPERATOR_NOTE',{content:'Hold中の原文'});
  await h.db.query(`INSERT INTO diagnosis_retention_holds(id,diagnosis_case_id,data_class,reason,approved_by_user_id)
    VALUES($1,$2,'GENERAL_RAW_DIAGNOSIS','係争対応', $3)`,[randomUUID(),c.id,operatorUserId]);
  const req=await h.repo.createDeletionRequest(c.id,operator,'customer-request-hold');
  await h.repo.scopeDeletionRequest(c.id,req.id,operator,['GENERAL_RAW_DIAGNOSIS']);
  await h.repo.decideDeletionRequest(c.id,req.id,operator,'APPROVE','削除要求は承認、Hold優先');
  const result=await worker.executeApprovedRequest(c.id,req.id,operatorUserId);
  assert.equal(result.status,'PARTIALLY_RETAINED');
  assert.deepEqual(result.restricted_classes,['GENERAL_RAW_DIAGNOSIS']);
  assert.equal((await h.db.query<{content:string}>('SELECT content FROM source_records WHERE id=$1',[note.id])).rows[0]!.content,'Hold中の原文');
  const tombstone=await h.db.query<{action:string}>('SELECT action FROM diagnosis_deletion_tombstones WHERE deletion_request_id=$1 AND data_class=\'GENERAL_RAW_DIAGNOSIS\'',[req.id]);
  assert.equal(tombstone.rows[0]!.action,'RESTRICT_RETAIN');
});

test('worker refuses non-approved request and policy expiry preview uses calendar intervals',async()=>{
  const c=await startedCase(h);
  const req=await h.repo.createDeletionRequest(c.id,operator,'not-approved');
  await h.repo.scopeDeletionRequest(c.id,req.id,operator,['GENERAL_RAW_DIAGNOSIS']);
  await assert.rejects(()=>worker.executeApprovedRequest(c.id,req.id,operatorUserId),/DELETION_REQUEST_NOT_APPROVED/);
  await h.db.query(`UPDATE diagnosis_cases SET closed_at=now()-interval '1 year 1 day' WHERE id=$1`,[c.id]);
  const preview=await worker.previewPolicyExpiry(c.id) as any;
  assert.equal(preview.general_raw_due,true);
  assert.equal(preview.raw_ai_due,true);
  assert.equal(preview.approved_evidence_due,false);
});
