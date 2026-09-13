import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {createDiagnosisHarness} from './support/diagnosisHarness';
import {operator,completedCase} from './support/preparationFixtures';
import {feedbackCase} from './support/assessmentFixtures';
import {humanInsight} from './support/reviewFixtures';
import {buildAssessmentHandoffSnapshot} from '../src/services/assessmentHandoffSnapshot';
import {handoffSnapshotSchema} from '../src/domain/diagnosisAssessment';
import {contentHash} from '../src/domain/diagnosisReport';
let h:Awaited<ReturnType<typeof createDiagnosisHarness>>;
before(async()=>{h=await createDiagnosisHarness();});after(async()=>{await h?.close();});
const read=(id:string)=>h.assessment.read(id,operator),status=(n:number)=>(e:unknown)=>(e as {status:number})?.status===n;
async function act(id:string,action:'propose'|'pending'|'accept'|'decline'){await h.assessment.lifecycle(id,operator,action,(await read(id)).version,'担当者が回答を確認');return read(id);}
async function accepted(){const c=await feedbackCase(h);await act(c.id,'propose');await act(c.id,'accept');return c;}
async function generate(id:string){return h.assessment.generate(id,operator,(await read(id)).version,'引継ぎ');}
async function transfer(id:string,key?:string){const d=await read(id);await h.assessment.transfer(id,operator,key??d.latest_handoff!.id,d.version,'担当者へ引渡し');return read(id);}
async function close(id:string){await h.assessment.close(id,operator,(await read(id)).version,'無料診断完了');return read(id);}
async function snapshot(id:string){const c=await h.pool.connect();try{return await buildAssessmentHandoffSnapshot(c,id,'2026-09-13T00:00:00.000Z');}finally{c.release();}}
async function post(id:string,path:string,body:unknown={},auth=true,header=true){return fetch(`${h.url}/api/admin/it-management-diagnosis/cases/${id}${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Cookie:h.staffCookie}:{}),...(header?{'X-Diagnosis-Command':'1'}:{})},body:JSON.stringify(body)});}

test('1–4,24: separate sales lifecycle; early proposal, AI actor, pending close, early Handoff refused',async()=>{
 const early=await completedCase(h);await assert.rejects(act(early.id,'propose'),status(409));const c=await feedbackCase(h);
 for(const state of ['NOT_PROPOSED','PROPOSED','PENDING']){const d=await read(c.id);assert.equal(d.assessment_status,state);assert.equal(d.diagnosis_status,'FEEDBACK_COMPLETED');assert.equal(d.close_eligibility.eligible,false);await assert.rejects(close(c.id),status(409));await assert.rejects(generate(c.id),status(409));if(state==='NOT_PROPOSED')await act(c.id,'propose');if(state==='PROPOSED')await act(c.id,'pending');}
 await assert.rejects(h.assessment.lifecycle(c.id,{kind:'AI'} as any,'accept',(await read(c.id)).version,''),status(403));await assert.rejects(act(c.id,'propose'),status(409));await act(c.id,'accept');await assert.rejects(act(c.id,'decline'),status(409));
});

test('5–6,16,19: deterministic snapshot, System clock/hash, no AIExecution or automatic close',async()=>{
 const c=await accepted(),before=await h.db.query('SELECT id FROM ai_executions WHERE diagnosis_case_id=$1',[c.id]),a=await snapshot(c.id),b=await snapshot(c.id);assert.deepEqual(a,b);assert.equal(contentHash(a),contentHash(b));await generate(c.id);const d=await read(c.id);assert.equal(d.latest_handoff!.status,'READY');assert.equal(d.latest_handoff!.snapshot_hash,contentHash(d.latest_handoff!.snapshot_json));assert.equal(d.diagnosis_status,'FEEDBACK_COMPLETED');assert.deepEqual((await h.db.query('SELECT id FROM ai_executions WHERE diagnosis_case_id=$1',[c.id])).rows,before.rows);
 assert.equal(a.future.intent_status,'SURVEY_STATED');assert.ok(a.report.approval_snapshot_hash);assert.equal(a.report.id,(await h.report.read(c.id,operator)).reports[0]!.id);
});

test('7–14: approved semantic types and source refs preserved; separate OPEN confirmation items; no raw duplication',async()=>{
 const c=await accepted();
 // Explicit Human return to Review to prepare all seven canonical semantic types and history.
 await h.report.reissue(c.id,operator,(await read(c.id)).version,'追加Review');let r=await h.report.read(c.id,operator);await h.report.revision(c.id,operator,r.reports[0]!.id,r.version,'確認候補を整理',true);
 const replacement=await h.review.supersede(c.id,c.unknown.id,operator,{...humanInsight(c.source.id),content:'担当者と更新頻度は未確認'},'範囲変更');
 for(const state of ['DRAFT','REJECTED']){const i=await h.review.createInsight(c.id,operator,{...humanInsight(c.source.id),content:state+'_HIDDEN'});await h.db.query('UPDATE diagnosis_insights SET review_status=$2 WHERE id=$1',[i.id,state]);}
 for(const semantic_type of ['EVIDENCE_CANDIDATE','OBSERVATION','GAP_CANDIDATE','KAIZEN_DIRECTION'] as const)await h.review.createInsight(c.id,operator,{...humanInsight(c.source.id),semantic_type,unknown_type:null,content:semantic_type==='OBSERVATION'?'台帳の存在が画面共有で記録されている':'Assessmentで確認する候補'});
 await h.review.createAssessment(c.id,operator,{title:'対象外項目',purpose:'今は不要',priority:2,diagnosis_theme_id:null,related_insight_id:null,related_evidence_candidate_id:null,source_ai_proposal_id:null,source_ai_execution_id:null,source_candidate_index:null});await h.db.query("UPDATE assessment_confirmation_items SET status='NOT_REQUIRED' WHERE diagnosis_case_id=$1 AND title='対象外項目'",[c.id]);
 await h.review.complete(c.id,operator,(await h.review.read(c.id,operator)).version,false);await h.report.manual(c.id,operator,(await read(c.id)).version);r=await h.report.read(c.id,operator);await h.report.approve(c.id,operator,r.reports[0]!.id,r.version);r=await h.report.read(c.id,operator);await h.report.deliver(c.id,operator,r.reports[0]!.id,r.version);await h.report.startFeedback(c.id,operator,(await read(c.id)).version);await h.report.completeFeedback(c.id,operator,(await read(c.id)).version);
 const s=await snapshot(c.id),approved=(await h.review.read(c.id,operator)).approved_insights;
 assert.equal(s.insights.length,7);for(const i of s.insights){const original=approved.find(x=>x.id===i.id)!;assert.equal(i.semantic_type,original.semantic_type);assert.equal(i.review_status,'HUMAN_APPROVED');assert.deepEqual(i.source_refs,original.source_refs);assert.equal(i.content,original.content);}
 assert.ok(s.insights.some(i=>i.id===replacement.id&&i.unknown_type==='UNRESOLVED'));assert.equal(s.insights.some(i=>i.id===c.unknown.id),false);assert.ok(s.insights.some(i=>i.semantic_type==='EVIDENCE_CANDIDATE'));assert.equal(s.assessment_confirmation_items.length,1);assert.equal('semantic_type' in s.assessment_confirmation_items[0]!,false);
 const json=JSON.stringify(s);for(const forbidden of ['raw_value_json','DRAFT_HIDDEN','REJECTED_HIDDEN','verified','FACT','引き続き分からない点を確認したい',c.access_token!])assert.equal(json.includes(forbidden),false,forbidden);
 for(const type of ['FACT','CONFIRMED_FACT','VERIFIED_EVIDENCE','ROOT_CAUSE']){const bad=structuredClone(s);(bad.insights[0] as any).semantic_type=type;assert.equal(handoffSnapshotSchema.safeParse(bad).success,false);}
});

test('15,25–26: staff/customer/header/cross-site gates and cross-Case Handoff/report FK',async()=>{
 const c=await accepted(),other=await accepted(),foreign=await generate(other.id);await generate(c.id);await assert.rejects(transfer(c.id,foreign.id),status(409));await assert.rejects(h.assessment.read(randomUUID(),operator),status(404));
 for(const path of ['/assessment/propose','/assessment/pending','/assessment/accept','/assessment/decline','/assessment/handoff/generate','/assessment/handoff/transfer','/close']){assert.equal((await post(c.id,path,{},false)).status,401);assert.equal((await post(c.id,path,{},true,false)).status,403);const url=`${h.url}/api/admin/it-management-diagnosis/cases/${c.id}${path}`;assert.equal((await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${c.access_token}`}})).status,401);assert.equal((await fetch(url,{method:'POST',headers:{Cookie:h.staffCookie,'X-Diagnosis-Command':'1','Sec-Fetch-Site':'cross-site'}})).status,403);}
 assert.equal((await fetch(`${h.url}/api/admin/it-management-diagnosis/cases/${c.id}/assessment`,{headers:{Authorization:`Bearer ${c.access_token}`}})).status,401);
 const foreignReport=(await read(other.id)).latest_handoff!.report_id;await assert.rejects(h.db.query(`INSERT INTO assessment_handoffs(id,diagnosis_case_id,version,status,report_id,snapshot_json,snapshot_hash,created_by_user_id) VALUES($1,$2,99,'DRAFT',$3,'{}',$4,'operator')`,[randomUUID(),c.id,foreignReport,'a'.repeat(64)]));
 assert.equal((await post(c.id,'/assessment/handoff/generate',{expectedVersion:(await read(c.id)).version,report_id:foreignReport})).status,422);
});

test('17–18: READY snapshot is immutable, new version retains old and latest-only transfer',async()=>{
 const c=await accepted();await generate(c.id);const old=(await read(c.id)).latest_handoff!;
 for(const sql of ["UPDATE assessment_handoffs SET snapshot_json='{}' WHERE id=$1","UPDATE assessment_handoffs SET snapshot_hash=repeat('b',64) WHERE id=$1","UPDATE assessment_handoffs SET status='DRAFT' WHERE id=$1",'DELETE FROM assessment_handoffs WHERE id=$1'])await assert.rejects(h.db.query(sql,[old.id]));
 await generate(c.id);const d=await read(c.id);assert.equal(d.latest_handoff!.version,2);assert.deepEqual(d.handoffs[1],old);await assert.rejects(transfer(c.id,old.id),status(409));await transfer(c.id);assert.deepEqual((await read(c.id)).handoffs[1],old);
});

test('20–23: Human transfer preserves snapshot and OPEN items, enables Human Close; decline closes without Handoff',async()=>{
 const c=await accepted();await assert.rejects(close(c.id),status(409));await generate(c.id);await assert.rejects(close(c.id),status(409));const before=await read(c.id),items=await h.db.query('SELECT * FROM assessment_confirmation_items WHERE diagnosis_case_id=$1',[c.id]);const transferred=await transfer(c.id);assert.equal(transferred.close_eligibility.eligible,true);assert.deepEqual(transferred.latest_handoff!.snapshot_json,before.latest_handoff!.snapshot_json);assert.equal(transferred.latest_handoff!.snapshot_hash,before.latest_handoff!.snapshot_hash);assert.deepEqual((await h.db.query('SELECT * FROM assessment_confirmation_items WHERE diagnosis_case_id=$1',[c.id])).rows,items.rows);
 const closed=await close(c.id);assert.equal(closed.diagnosis_status,'CLOSED');assert.equal(closed.assessment_status,'ACCEPTED');assert.ok(closed.closed_at);assert.equal(closed.closed_by_user_id,'operator@atlib.jp');assert.equal(closed.current_next_action,'完了');await assert.rejects(close(c.id),status(409));await assert.rejects(generate(c.id),status(409));await assert.rejects(transfer(c.id),status(409));
 const declined=await feedbackCase(h);await act(declined.id,'propose');await act(declined.id,'pending');await act(declined.id,'decline');assert.equal((await close(declined.id)).diagnosis_status,'CLOSED');assert.equal((await read(declined.id)).handoffs.length,0);
});

test('regeneration after transfer requires latest version transfer; changed Context cannot close',async()=>{
 const c=await accepted();await generate(c.id);await transfer(c.id);await generate(c.id);await assert.rejects(close(c.id),status(409));await transfer(c.id);
 // Simulate administrative context correction outside the normal command path.
 await h.db.query("UPDATE diagnosis_insights SET content='担当者の範囲は未確認' WHERE id=$1",[c.unknown.id]);assert.equal((await read(c.id)).close_eligibility.eligible,false);await assert.rejects(close(c.id),status(409));await generate(c.id);await transfer(c.id);await close(c.id);
});

test('Audit failure rolls back lifecycle, handoff, transfer and close; optimistic version guards',async()=>{
 const c=await feedbackCase(h),before=await read(c.id);await assert.rejects(h.assessment.lifecycle(c.id,operator,'propose',before.version-1,''),status(409));
 await h.db.exec(`CREATE FUNCTION fail_assessment_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.command IN ('ProposeAssessment','GenerateAssessmentHandoff','TransferAssessmentHandoff','CloseDiagnosisCase') THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$;`);
 const enable=()=>h.db.exec('CREATE TRIGGER fail_assessment_audit BEFORE INSERT ON diagnosis_audit_logs FOR EACH ROW EXECUTE FUNCTION fail_assessment_audit();'),disable=()=>h.db.exec('DROP TRIGGER fail_assessment_audit ON diagnosis_audit_logs;');
 await enable();try{await assert.rejects(act(c.id,'propose'));assert.deepEqual(await read(c.id),before);}finally{await disable();}await act(c.id,'propose');await act(c.id,'accept');
 for(const action of [()=>generate(c.id),()=>transfer(c.id),()=>close(c.id)]){const before=await read(c.id);await enable();try{await assert.rejects(action());assert.deepEqual(await read(c.id),before);}finally{await disable();}await action();}await h.db.exec('DROP FUNCTION fail_assessment_audit();');
});

test('27–30: WEB to CLOSED end-to-end, audit continuity, display/Next Action and legacy intact',async()=>{
 const c=await feedbackCase(h);assert.equal((await read(c.id)).current_next_action,'Assessmentを提案してください');await act(c.id,'propose');await act(c.id,'pending');assert.equal((await read(c.id)).current_next_action,'Assessment回答待ちです');await act(c.id,'accept');assert.equal((await read(c.id)).current_next_action,'Assessment Handoffを作成してください');await generate(c.id);assert.equal((await read(c.id)).current_next_action,'Assessmentへ引き渡してください');await transfer(c.id);assert.equal((await read(c.id)).current_next_action,'Caseを完了してください');const d=await close(c.id);
 assert.equal(d.organization_display_name,'ABC株式会社様');assert.equal(d.provider_display_name,'atLIB株式会社');assert.equal(d.latest_handoff!.snapshot_json.entry_channel,'WEB');
 const states=d.transitions.map(t=>t.to_status);for(const state of ['SURVEY_IN_PROGRESS','SURVEY_COMPLETED','PREPARATION_IN_PROGRESS','READY_FOR_DIAGNOSIS','DIAGNOSIS_IN_PROGRESS','HUMAN_REVIEW_REQUIRED','REPORT_REVIEW_REQUIRED','REPORT_APPROVED','FEEDBACK_PENDING','FEEDBACK_COMPLETED','CLOSED'])assert.ok(states.includes(state),state);
 for(const command of ['ProposeAssessment','MarkAssessmentPending','AcceptAssessment','GenerateAssessmentHandoff','TransferAssessmentHandoff','CloseDiagnosisCase'])assert.ok(d.audit.some(a=>a.command===command&&a.actor_type==='STAFF'&&a.actor_user_id==='operator@atlib.jp'));
 const list=await h.repo.listCases({status:'CLOSED',limit:100,offset:0});assert.equal(list.items.find(x=>x.id===c.id)!.current_next_action,'完了');assert.equal((await h.repo.getSurvey(c.id,c.actor)).survey.status,'SURVEY_COMPLETED');assert.equal((await fetch(h.url+'/api/kaizen-diagnostic/questions')).status,200);assert.equal((await h.db.query('SELECT * FROM kaizen_diagnostics')).rows.length,1);
});
