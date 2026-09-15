import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDiagnosisHarness } from './support/diagnosisHarness';
import { operator } from './support/preparationFixtures';
import { startedCase } from './support/workspaceFixtures';
import { RetentionDeletionWorker } from '../src/services/retentionDeletionWorker';
import { buildDeletionReconciliationManifest, reconcileDeletionManifest } from '../src/services/deletionReconciliation';

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
  assert.equal(result.anonymized.organizations,1);

  const sources=await h.db.query<{id:string;content:string;external_reference:string|null}>('SELECT id,content,external_reference FROM source_records WHERE id IN ($1,$2) ORDER BY id',[note.id,transcript.id]);
  assert.equal(sources.rows.length,2);
  assert.ok(sources.rows.every(r=>r.content==='[REDACTED]'&&r.external_reference===null));
  const responses=await h.db.query<{raw_value_json:unknown}>('SELECT raw_value_json FROM survey_responses WHERE diagnosis_case_id=$1',[c.id]);
  assert.ok(responses.rows.length>0);
  assert.ok(responses.rows.every(r=>r.raw_value_json===null));
  const participant=await h.db.query<{name:string;email:string;phone:string|null}>('SELECT name,email,phone FROM participants WHERE diagnosis_case_id=$1',[c.id]);
  assert.ok(participant.rows.every(p=>p.name==='削除済み'&&p.email.endsWith('@invalid.local')&&p.phone===null));
  const organization=await h.db.query<{name:string}>(`SELECT o.name FROM organizations o JOIN diagnosis_cases c ON c.organization_id=o.id WHERE c.id=$1`,[c.id]);
  assert.match(organization.rows[0]!.name,/^削除済み組織-/);

  const request=await h.db.query<{status:string;executed_by_user_id:string|null}>('SELECT status,executed_by_user_id FROM diagnosis_deletion_requests WHERE id=$1',[req.id]);
  assert.equal(request.rows[0]!.status,'PARTIALLY_RETAINED');
  assert.equal(request.rows[0]!.executed_by_user_id,operatorUserId);
  const audit=await h.db.query<{command:string;detail_json:any}>('SELECT command,detail_json FROM diagnosis_audit_logs WHERE diagnosis_case_id=$1 AND command=\'ExecuteDeletionRequest\'',[c.id]);
  assert.equal(audit.rows.length,1);
  assert.equal(audit.rows[0]!.detail_json.deletion_request_id,req.id);

  const manifest=await buildDeletionReconciliationManifest(h.pool);
  const verify=await reconcileDeletionManifest(h.pool,manifest,operatorUserId,'VERIFY');
  assert.equal(verify.status,'SUCCEEDED');
  assert.equal(verify.unsupported_count,0);

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

test('worker refuses non-approved request and policy expiry preview uses calendar intervals with explicit approved evidence inventory',async()=>{
  const c=await startedCase(h);
  const req=await h.repo.createDeletionRequest(c.id,operator,'not-approved');
  await h.repo.scopeDeletionRequest(c.id,req.id,operator,['GENERAL_RAW_DIAGNOSIS']);
  await assert.rejects(()=>worker.executeApprovedRequest(c.id,req.id,operatorUserId),/DELETION_REQUEST_NOT_APPROVED/);
  await h.db.query(`UPDATE diagnosis_cases SET closed_at=now()-interval '1 year 1 day' WHERE id=$1`,[c.id]);
  const preview=await worker.previewPolicyExpiry(c.id) as any;
  assert.equal(preview.general_raw_due,true);
  assert.equal(preview.raw_ai_due,true);
  assert.equal(preview.approved_evidence_due,false);
  assert.equal(preview.approved_decision_evidence_execution_enabled,false);
  assert.equal(preview.organization_identity_policy,'ANONYMIZE_IF_CASE_EXCLUSIVE_ELSE_REVIEW');
  assert.ok(preview.approved_decision_evidence_inventory.audit_logs>=1);
  assert.ok(preview.approved_decision_evidence_inventory.policy_acknowledgements>=1);
  assert.ok(preview.approved_decision_evidence_inventory.transcript_consent_records>=1);
});

test('shared Organization identity fails closed instead of anonymizing another Case',async()=>{
  const first=await startedCase(h);
  const second=await startedCase(h);
  const org=(await h.db.query<{organization_id:string}>('SELECT organization_id FROM diagnosis_cases WHERE id=$1',[first.id])).rows[0]!.organization_id;
  await h.db.query('UPDATE diagnosis_cases SET organization_id=$2 WHERE id=$1',[second.id,org]);
  const req=await h.repo.createDeletionRequest(first.id,operator,'shared-org-review');
  await h.repo.scopeDeletionRequest(first.id,req.id,operator,['GENERAL_RAW_DIAGNOSIS']);
  await h.repo.decideDeletionRequest(first.id,req.id,operator,'APPROVE','raw deletion approved');
  await assert.rejects(()=>worker.executeApprovedRequest(first.id,req.id,operatorUserId),/SHARED_ORGANIZATION_CLASSIFICATION_REQUIRES_REVIEW/);
  const row=await h.db.query<{status:string}>('SELECT status FROM diagnosis_deletion_requests WHERE id=$1',[req.id]);
  assert.equal(row.rows[0]!.status,'APPROVED');
  const organization=await h.db.query<{name:string}>('SELECT name FROM organizations WHERE id=$1',[org]);
  assert.equal(organization.rows[0]!.name,'ABC株式会社');
});

test('RAW_AI_IO wipes execution snapshots and structured AI proposal wording while keeping provenance rows',async()=>{
  const c=await startedCase(h);
  const executionId=randomUUID();
  const proposalId=randomUUID();
  await h.db.query(`INSERT INTO ai_executions
    (id,diagnosis_case_id,process_type,status,provider,model,prompt_version,policy_version,input_snapshot_json,raw_output_json,validation_status,requested_by_user_id,completed_at)
    VALUES($1,$2,'INTERVIEW_ASSISTANT','SUCCEEDED','fake','fake-model','p1','policy1',$3,$4,'VALID',$5,now())`,
    [executionId,c.id,JSON.stringify({secret:'customer-context'}),JSON.stringify({suggestion:'sensitive-ai-output'}),operatorUserId]);
  await h.db.query(`INSERT INTO ai_proposals
    (id,diagnosis_case_id,ai_execution_id,proposal_type,status,title,content_json,display_order)
    VALUES($1,$2,$3,'HYPOTHESIS','REJECTED','AIが生成した仮説',$4,1)`,
    [proposalId,c.id,executionId,JSON.stringify({text:'sensitive structured suggestion'})]);
  const req=await h.repo.createDeletionRequest(c.id,operator,'raw-ai-retention');
  await h.repo.scopeDeletionRequest(c.id,req.id,operator,['RAW_AI_IO']);
  await h.repo.decideDeletionRequest(c.id,req.id,operator,'APPROVE','Raw AI I/O retention expiry');
  const result=await worker.executeApprovedRequest(c.id,req.id,operatorUserId);
  assert.equal(result.status,'COMPLETED');
  assert.equal(result.anonymized.ai_executions,1);
  assert.equal(result.anonymized.ai_proposals,1);
  const execution=await h.db.query<{input_snapshot_json:any;raw_output_json:any;provider:string;model:string}>('SELECT input_snapshot_json,raw_output_json,provider,model FROM ai_executions WHERE id=$1',[executionId]);
  assert.deepEqual(execution.rows[0]!.input_snapshot_json,{});
  assert.equal(execution.rows[0]!.raw_output_json,null);
  assert.equal(execution.rows[0]!.provider,'fake');
  const proposal=await h.db.query<{title:string;content_json:any;status:string}>('SELECT title,content_json,status FROM ai_proposals WHERE id=$1',[proposalId]);
  assert.equal(proposal.rows[0]!.title,'[REDACTED]');
  assert.deepEqual(proposal.rows[0]!.content_json,{});
  assert.equal(proposal.rows[0]!.status,'REJECTED');
  const manifest=await buildDeletionReconciliationManifest(h.pool);
  const verify=await reconcileDeletionManifest(h.pool,manifest,operatorUserId,'VERIFY');
  assert.equal(verify.unsupported_count,0);
});
