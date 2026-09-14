import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export type RetentionClass = 'GENERAL_RAW_DIAGNOSIS'|'TRANSCRIPT_RECORDING'|'RAW_AI_IO'|'APPROVED_DECISION_EVIDENCE';

interface RequestRow {
  id:string;
  diagnosis_case_id:string;
  status:string;
  scoped_data_classes:RetentionClass[];
  restricted_retention_json:Array<{dataClass?:RetentionClass;reason?:string}>;
  executed_by_user_id:string|null;
  executed_at:Date|null;
}

export interface DeletionExecutionResult {
  request_id:string;
  diagnosis_case_id:string;
  status:'COMPLETED'|'PARTIALLY_RETAINED';
  anonymized:{ source_records:number; survey_responses:number; participants:number; organizations:number; ai_executions:number };
  restricted_classes:RetentionClass[];
  tombstones_written:number;
  idempotent:boolean;
}

function assertStaffUserId(userId:string):void {
  if (!userId.trim()) throw new Error('DELETION_EXECUTOR_REQUIRED');
}

async function addTombstone(
  c:PoolClient,
  requestId:string,
  caseId:string,
  dataClass:RetentionClass,
  targetKind:string,
  targetId:string,
  action:'ANONYMIZE'|'RESTRICT_RETAIN',
  actorId:string,
):Promise<number> {
  const result=await c.query(`INSERT INTO diagnosis_deletion_tombstones
    (id,diagnosis_case_id,deletion_request_id,data_class,target_kind,target_id,action,created_by_user_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT(target_kind,target_id,action) DO NOTHING`,
  [randomUUID(),caseId,requestId,dataClass,targetKind,targetId,action,actorId]);
  return result.rowCount ?? 0;
}

async function anonymizeSourceRecords(c:PoolClient,requestId:string,caseId:string,dataClass:RetentionClass,transcript:boolean,actorId:string) {
  const {rows}=await c.query<{id:string}>(`SELECT id FROM source_records WHERE diagnosis_case_id=$1 AND ${transcript ? "source_type='TRANSCRIPT'" : "source_type<>'TRANSCRIPT'"} ORDER BY id FOR UPDATE`,[caseId]);
  let changed=0,tombstones=0;
  for(const row of rows){
    const result=await c.query(`UPDATE source_records SET content='[REDACTED]',speaker_participant_id=NULL,external_reference=NULL,updated_at=now()
      WHERE id=$1 AND diagnosis_case_id=$2 AND (content<>'[REDACTED]' OR speaker_participant_id IS NOT NULL OR external_reference IS NOT NULL)`,[row.id,caseId]);
    if(result.rowCount) changed++;
    tombstones+=await addTombstone(c,requestId,caseId,dataClass,'SOURCE_RECORD',row.id,'ANONYMIZE',actorId);
  }
  return {changed,tombstones};
}

async function anonymizeOrganizationIdentity(c:PoolClient,requestId:string,caseId:string,actorId:string){
  const caseRow=(await c.query<{organization_id:string}>(`SELECT organization_id FROM diagnosis_cases WHERE id=$1 FOR UPDATE`,[caseId])).rows[0];
  if(!caseRow) throw new Error('DIAGNOSIS_CASE_NOT_FOUND');
  const refs=await c.query<{count:string}>(`SELECT count(*)::text AS count FROM diagnosis_cases WHERE organization_id=$1`,[caseRow.organization_id]);
  // Current creation flow gives each Case its own Organization, but do not rely on that as an undeclared invariant.
  // A shared Organization needs a separately reviewed cross-Case deletion decision, so fail closed instead of
  // anonymizing another Case's identity as a side effect.
  if(Number(refs.rows[0]?.count ?? 0)!==1) throw new Error('SHARED_ORGANIZATION_CLASSIFICATION_REQUIRES_REVIEW');
  const replacement=`削除済み組織-${caseRow.organization_id}`;
  const result=await c.query(`UPDATE organizations SET name=$2 WHERE id=$1 AND name<>$2`,[caseRow.organization_id,replacement]);
  const tombstone=await addTombstone(c,requestId,caseId,'GENERAL_RAW_DIAGNOSIS','ORGANIZATION_IDENTITY',caseRow.organization_id,'ANONYMIZE',actorId);
  return {changed:result.rowCount?1:0,tombstones:tombstone};
}

async function anonymizeGeneralRaw(c:PoolClient,requestId:string,caseId:string,actorId:string){
  const source=await anonymizeSourceRecords(c,requestId,caseId,'GENERAL_RAW_DIAGNOSIS',false,actorId);
  const {rows:responses}=await c.query<{id:string}>(`SELECT id FROM survey_responses WHERE diagnosis_case_id=$1 ORDER BY id FOR UPDATE`,[caseId]);
  let survey=0,participants=0,tombstones=source.tombstones;
  for(const row of responses){
    const result=await c.query(`UPDATE survey_responses SET raw_value_json='null'::jsonb WHERE id=$1 AND diagnosis_case_id=$2 AND raw_value_json<>'null'::jsonb`,[row.id,caseId]);
    if(result.rowCount) survey++;
    tombstones+=await addTombstone(c,requestId,caseId,'GENERAL_RAW_DIAGNOSIS','SURVEY_RESPONSE_RAW',row.id,'ANONYMIZE',actorId);
  }
  const {rows:people}=await c.query<{id:string}>(`SELECT id FROM participants WHERE diagnosis_case_id=$1 ORDER BY id FOR UPDATE`,[caseId]);
  for(const row of people){
    const replacement=`deleted+${row.id}@invalid.local`;
    const result=await c.query(`UPDATE participants SET name='削除済み',email=$3,phone=NULL,job_title=NULL,updated_at=now()
      WHERE id=$1 AND diagnosis_case_id=$2 AND (name<>'削除済み' OR email<>$3 OR phone IS NOT NULL OR job_title IS NOT NULL)`,[row.id,caseId,replacement]);
    if(result.rowCount) participants++;
    tombstones+=await addTombstone(c,requestId,caseId,'GENERAL_RAW_DIAGNOSIS','PARTICIPANT_IDENTITY',row.id,'ANONYMIZE',actorId);
  }
  const organization=await anonymizeOrganizationIdentity(c,requestId,caseId,actorId);
  tombstones+=organization.tombstones;
  return {source:source.changed,survey,participants,organizations:organization.changed,tombstones};
}

async function anonymizeRawAi(c:PoolClient,requestId:string,caseId:string,actorId:string){
  const {rows}=await c.query<{id:string}>(`SELECT id FROM ai_executions WHERE diagnosis_case_id=$1 ORDER BY id FOR UPDATE`,[caseId]);
  let changed=0,tombstones=0;
  for(const row of rows){
    const result=await c.query(`UPDATE ai_executions SET input_snapshot_json='{}'::jsonb,raw_output_json=NULL,updated_at=now()
      WHERE id=$1 AND diagnosis_case_id=$2 AND (input_snapshot_json<>'{}'::jsonb OR raw_output_json IS NOT NULL)`,[row.id,caseId]);
    if(result.rowCount) changed++;
    tombstones+=await addTombstone(c,requestId,caseId,'RAW_AI_IO','AI_EXECUTION_RAW_IO',row.id,'ANONYMIZE',actorId);
  }
  return {changed,tombstones};
}

async function approvedEvidenceInventory(c:PoolClient,caseId:string){
  const one=async(sql:string)=>Number((await c.query<{count:string}>(sql,[caseId])).rows[0]?.count ?? 0);
  return {
    approved_or_delivered_reports:await one(`SELECT count(*)::text AS count FROM diagnosis_reports WHERE diagnosis_case_id=$1 AND status IN ('APPROVED','DELIVERED')`),
    ready_or_transferred_handoffs:await one(`SELECT count(*)::text AS count FROM assessment_handoffs WHERE diagnosis_case_id=$1 AND status IN ('READY','TRANSFERRED','ACCEPTED')`),
    human_approved_insights:await one(`SELECT count(*)::text AS count FROM diagnosis_insights WHERE diagnosis_case_id=$1 AND review_status='HUMAN_APPROVED'`),
    human_reviews:await one(`SELECT count(*)::text AS count FROM human_reviews WHERE diagnosis_case_id=$1`),
    assessment_confirmation_items:await one(`SELECT count(*)::text AS count FROM assessment_confirmation_items WHERE diagnosis_case_id=$1`),
    lifecycle_transitions:await one(`SELECT count(*)::text AS count FROM case_transitions WHERE diagnosis_case_id=$1`),
    audit_logs:await one(`SELECT count(*)::text AS count FROM diagnosis_audit_logs WHERE diagnosis_case_id=$1`),
    policy_acknowledgements:await one(`SELECT count(*)::text AS count FROM diagnosis_policy_acknowledgements WHERE diagnosis_case_id=$1`),
    transcript_consent_records:await one(`SELECT count(*)::text AS count FROM diagnosis_transcript_consents WHERE diagnosis_case_id=$1`),
    deletion_request_records:await one(`SELECT count(*)::text AS count FROM diagnosis_deletion_requests WHERE diagnosis_case_id=$1`),
  };
}

export class RetentionDeletionWorker {
  constructor(private readonly pool:Pool){}

  async executeApprovedRequest(caseId:string,requestId:string,executedByUserId:string):Promise<DeletionExecutionResult>{
    assertStaffUserId(executedByUserId);
    const c=await this.pool.connect();
    try{
      await c.query('BEGIN');
      const req=(await c.query<RequestRow>(`SELECT id,diagnosis_case_id,status,scoped_data_classes,restricted_retention_json,executed_by_user_id,executed_at
        FROM diagnosis_deletion_requests WHERE id=$1 AND diagnosis_case_id=$2 FOR UPDATE`,[requestId,caseId])).rows[0];
      if(!req) throw new Error('DELETION_REQUEST_NOT_FOUND');
      if(['COMPLETED','PARTIALLY_RETAINED'].includes(req.status)){
        await c.query('COMMIT');
        return {request_id:requestId,diagnosis_case_id:caseId,status:req.status as 'COMPLETED'|'PARTIALLY_RETAINED',anonymized:{source_records:0,survey_responses:0,participants:0,organizations:0,ai_executions:0},restricted_classes:[],tombstones_written:0,idempotent:true};
      }
      if(req.status!=='APPROVED') throw new Error('DELETION_REQUEST_NOT_APPROVED');
      const scoped=new Set(req.scoped_data_classes ?? []);
      if(!scoped.size) throw new Error('DELETION_SCOPE_EMPTY');

      const activeHolds=await c.query<{data_class:RetentionClass}>(`SELECT data_class FROM diagnosis_retention_holds
        WHERE diagnosis_case_id=$1 AND ended_at IS NULL AND (expires_at IS NULL OR expires_at>now()) FOR UPDATE`,[caseId]);
      const held=new Set(activeHolds.rows.map(r=>r.data_class));
      const restrictedFromDecision=new Set((req.restricted_retention_json ?? []).map(v=>v.dataClass).filter(Boolean) as RetentionClass[]);
      const restricted=new Set<RetentionClass>([...held,...restrictedFromDecision]);

      // Approved Decision/Audit/Report/Handoff evidence has a separate 5-year policy and is never destructively changed by this worker.
      // Exact retained tables are exposed by approvedEvidenceInventory() below. Requests that include this class are
      // restricted-retain until a separately reviewed expiry worker is approved for those immutable/accountability records.
      if(scoped.has('APPROVED_DECISION_EVIDENCE')) restricted.add('APPROVED_DECISION_EVIDENCE');

      let sourceRecords=0,surveyResponses=0,participants=0,organizations=0,aiExecutions=0,tombstones=0;
      if(scoped.has('GENERAL_RAW_DIAGNOSIS')&&!restricted.has('GENERAL_RAW_DIAGNOSIS')){
        const r=await anonymizeGeneralRaw(c,requestId,caseId,executedByUserId);
        sourceRecords+=r.source; surveyResponses+=r.survey; participants+=r.participants; organizations+=r.organizations; tombstones+=r.tombstones;
      }
      if(scoped.has('TRANSCRIPT_RECORDING')&&!restricted.has('TRANSCRIPT_RECORDING')){
        const r=await anonymizeSourceRecords(c,requestId,caseId,'TRANSCRIPT_RECORDING',true,executedByUserId);
        sourceRecords+=r.changed; tombstones+=r.tombstones;
      }
      if(scoped.has('RAW_AI_IO')&&!restricted.has('RAW_AI_IO')){
        const r=await anonymizeRawAi(c,requestId,caseId,executedByUserId);
        aiExecutions+=r.changed; tombstones+=r.tombstones;
      }

      for(const dataClass of [...restricted].filter(v=>scoped.has(v))){
        tombstones+=await addTombstone(c,requestId,caseId,dataClass,'DATA_CLASS',`${caseId}:${dataClass}`,'RESTRICT_RETAIN',executedByUserId);
      }

      const restrictedClasses=[...restricted].filter(v=>scoped.has(v));
      const status: 'COMPLETED'|'PARTIALLY_RETAINED'=restrictedClasses.length?'PARTIALLY_RETAINED':'COMPLETED';
      await c.query(`UPDATE diagnosis_deletion_requests SET status=$3,executed_by_user_id=$4,executed_at=now(),updated_at=now(),failure_code=NULL
        WHERE id=$1 AND diagnosis_case_id=$2`,[requestId,caseId,status,executedByUserId]);
      await c.query(`INSERT INTO diagnosis_audit_logs(id,diagnosis_case_id,command,actor_type,actor_user_id,detail_json)
        VALUES($1,$2,'ExecuteDeletionRequest','STAFF',$3,$4)`,[randomUUID(),caseId,executedByUserId,JSON.stringify({deletion_request_id:requestId,status,restricted_classes:restrictedClasses,anonymized:{source_records:sourceRecords,survey_responses:surveyResponses,participants,organizations,ai_executions:aiExecutions},tombstones_written:tombstones})]);
      await c.query('COMMIT');
      return {request_id:requestId,diagnosis_case_id:caseId,status,anonymized:{source_records:sourceRecords,survey_responses:surveyResponses,participants,organizations,ai_executions:aiExecutions},restricted_classes:restrictedClasses,tombstones_written:tombstones,idempotent:false};
    }catch(error){
      await c.query('ROLLBACK');
      throw error;
    }finally{ c.release(); }
  }

  async previewPolicyExpiry(caseId:string){
    const c=await this.pool.connect();
    try{
      const {rows}=await c.query(`SELECT c.id,c.closed_at,
        (c.closed_at IS NOT NULL AND c.closed_at + interval '1 year' <= now()) AS general_raw_due,
        (c.closed_at IS NOT NULL AND c.closed_at + interval '90 days' <= now()) AS raw_ai_due,
        (c.closed_at IS NOT NULL AND c.closed_at + interval '5 years' <= now()) AS approved_evidence_due,
        (SELECT count(*)::int FROM source_records s WHERE s.diagnosis_case_id=c.id AND s.source_type='TRANSCRIPT' AND s.purpose_completed_at IS NOT NULL AND s.purpose_completed_at + interval '90 days' <= now()) AS transcript_due_count
        FROM diagnosis_cases c WHERE c.id=$1`,[caseId]);
      if(!rows[0]) throw new Error('DIAGNOSIS_CASE_NOT_FOUND');
      return {
        ...rows[0],
        approved_decision_evidence_inventory:await approvedEvidenceInventory(c,caseId),
        approved_decision_evidence_execution_enabled:false,
        // Organization identity is General Raw only when the Organization belongs exclusively to this Case.
        // Shared Organization identity fails closed during execution instead of silently affecting another Case.
        organization_identity_policy:'ANONYMIZE_IF_CASE_EXCLUSIVE_ELSE_REVIEW',
      };
    }finally{c.release();}
  }
}
