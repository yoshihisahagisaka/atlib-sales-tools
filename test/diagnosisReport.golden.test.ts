import assert from 'node:assert/strict';
import {before,after,beforeEach,test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {createDiagnosisHarness} from './support/diagnosisHarness';
import {operator,completedCase} from './support/preparationFixtures';
import {reviewCase,humanInsight} from './support/reviewFixtures';
import {reportCase,FakeReportProvider} from './support/reportFixtures';
import {manualReport,validateReportOutput,sameWording,contentHash,REPORT_JSON_SCHEMA} from '../src/domain/diagnosisReport';
import {ReportDraftWorker} from '../src/services/reportDraftWorker';
import {AnthropicReportDraftProvider} from '../src/services/reportDraftProvider';
import type {ReportExecutionInput} from '../src/services/diagnosisReportRepo';
let h:Awaited<ReturnType<typeof createDiagnosisHarness>>;const provider=new FakeReportProvider();
before(async()=>{h=await createDiagnosisHarness(undefined,undefined,undefined,undefined,provider);});after(async()=>{await h?.close();});beforeEach(()=>{provider.run=async c=>manualReport(c);});
const read=(id:string)=>h.report.read(id,operator),status=(n:number)=>(e:unknown)=>(e as {status:number})?.status===n;
async function manual(id:string){return h.report.manual(id,operator,(await read(id)).version);}
async function approve(id:string){const d=await read(id);await h.report.approve(id,operator,d.reports[0]!.id,d.version);return read(id);}
async function deliver(id:string){const d=await read(id);await h.report.deliver(id,operator,d.reports[0]!.id,d.version);return read(id);}
async function run(id:string){await h.report.enqueue(id,operator,provider.provider,provider.model);await h.reportWorker.tick();return read(id);}
async function post(id:string,path:string,body:unknown={},auth=true,header=true){return fetch(`${h.url}/api/admin/it-management-diagnosis/cases/${id}${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Cookie:h.staffCookie}:{}),...(header?{'X-Diagnosis-Command':'1'}:{})},body:JSON.stringify(body)});}

test('1–3: provider boundary excludes raw sources, survey, secret, proposals and non-approved Insight',async()=>{
 const c=await reviewCase(h);
 await h.db.query("UPDATE source_records SET content='PRIVATE_RAW_TRANSCRIPT' WHERE id=$1",[c.source.id]);
 const old=await h.review.createInsight(c.id,operator,humanInsight(c.source.id));
 const replacement=await h.review.supersede(c.id,old.id,operator,{...humanInsight(c.source.id),content:'担当者の役割は未確認'},'更新');
 for(const state of ['DRAFT','REJECTED']){const i=await h.review.createInsight(c.id,operator,{...humanInsight(c.source.id),content:state+'_PRIVATE'});await h.db.query('UPDATE diagnosis_insights SET review_status=$2 WHERE id=$1',[i.id,state]);}
 await h.review.complete(c.id,operator,(await h.review.read(c.id,operator)).version,false);
 await run(c.id);const ctx=provider.inputs.at(-1)!;assert.deepEqual(ctx.insights.map(i=>i.id),[replacement.id]);
 assert.deepEqual(Object.keys(ctx).sort(),['assessment_confirmation_items','future','insights','organization_display_name','provider_display_name']);
 const serialized=JSON.stringify(ctx);for(const forbidden of ['PRIVATE_RAW_TRANSCRIPT','DRAFT_PRIVATE','REJECTED_PRIVATE','raw_value_json','source_refs','responses','sources','token','cookie','score','suggestedServices',c.access_token!])assert.equal(serialized.includes(forbidden),false,forbidden);
 assert.equal(serialized.includes(old.id),false);assert.equal(ctx.insights[0]!.version,2);
});

test('4–7: semantic labels, strict output schema and same approved Case grounding',async()=>{
 const c=await reportCase(h),foreign=await reportCase(h),ctx=(await read(c.id)).context,good=manualReport(ctx);
 assert.deepEqual(validateReportOutput(good,ctx),good);const blocks=good.sections.flatMap(s=>s.blocks);
 assert.ok(blocks.some(b=>b.text.startsWith('未確認（UNRESOLVED）')));assert.ok(blocks.some(b=>b.text.startsWith('仮説：')));assert.ok(blocks.some(b=>b.text.startsWith('Root Cause仮説：')));
 for(const field of ['FACT','CONFIRMED_FACT','score','maturity','rating','semantic_type','case_id','approved_by','system_metadata']){const bad=structuredClone(good);(bad.sections[1]!.blocks[0] as any)[field]=true;assert.throws(()=>validateReportOutput(bad,ctx));}
 for(const ref of [randomUUID(),foreign.unknown.id]){const bad=structuredClone(good);bad.sections[1]!.blocks[0]!.insight_refs=[ref];assert.throws(()=>validateReportOutput(bad,ctx));}
 for(const text of ['御社は管理できていません','原因は役割分担です','サービスを導入すべきです','50％改善します','FACT：確定','台帳は最新です']){const bad=structuredClone(good);bad.sections[1]!.blocks[0]!.text=text;assert.throws(()=>validateReportOutput(bad,ctx));}
 const noRef=structuredClone(good);noRef.sections[1]!.blocks[0]!.insight_refs=[];assert.throws(()=>validateReportOutput(noRef,ctx));
 const noUnknownLabel=structuredClone(good);noUnknownLabel.sections[1]!.blocks[0]!.text=ctx.insights[0]!.content;assert.throws(()=>validateReportOutput(noUnknownLabel,ctx));
 assert.equal(JSON.stringify(REPORT_JSON_SCHEMA).includes('additionalProperties'),true);
 provider.run=async()=>noRef;const failed=await run(c.id);assert.equal(failed.executions[0].status,'FAILED');assert.equal(failed.reports.length,0);
});

test('8,12,22,25: AI creates only unapproved draft; failure and no key permit Human-only with SURVEY_STATED',async()=>{
 const c=await reportCase(h),before=await h.workspace.read(c.id,operator),d=await run(c.id);
 assert.equal(d.executions[0].status,'SUCCEEDED');assert.equal(d.reports[0]!.status,'REVIEW_REQUIRED');assert.equal(d.diagnosis_status,'REPORT_REVIEW_REQUIRED');assert.equal(d.version,before.version);assert.deepEqual(await h.workspace.read(c.id,operator),before);
 assert.equal(d.context.organization_display_name,'ABC株式会社様');assert.equal(d.context.provider_display_name,'atLIB株式会社');assert.equal(d.context.future.intent_status,'SURVEY_STATED');assert.ok(d.context.future.report_text.includes('アンケート回答時点'));
 for(const configured of [false,true]){const c=await reportCase(h);provider.run=async()=>{throw Error('private error');};await h.report.enqueue(c.id,operator,'fake','test');await (configured?h.reportWorker:new ReportDraftWorker(h.preparation,h.report,new AnthropicReportDraftProvider())).tick();assert.equal((await read(c.id)).executions[0].status,'FAILED');await manual(c.id);assert.equal((await approve(c.id)).diagnosis_status,'REPORT_APPROVED');}
});

test('9–10: wording is cosmetic; new meaning requires explicit Human Review and a new grounded draft',async()=>{
 const c=await reportCase(h),r=await manual(c.id),d=await read(c.id),b=d.reports[0]!.content_json.sections.flatMap(s=>s.blocks).find(b=>b.insight_refs.includes(c.hypothesis.id))!;
 const input={report_id:r.id,expectedVersion:d.version,blocks:[{block_id:b.block_id,text:b.text.replace('可能性がある','可能性があります')}]};await h.report.wording(c.id,operator,input);
 const edited=await read(c.id);assert.equal(edited.reports[0]!.content_version,2);assert.equal(edited.reports[0]!.content_json.sections.flatMap(s=>s.blocks).find(x=>x.block_id===b.block_id)!.insight_refs[0],c.hypothesis.id);
 await assert.rejects(h.report.wording(c.id,operator,{...input,expectedVersion:edited.version,blocks:[{block_id:b.block_id,text:'原因は情報共有です'}]}),status(422));
 await h.report.revision(c.id,operator,r.id,edited.version,'診断Contextの確認が必要',true);assert.equal((await read(c.id)).diagnosis_status,'HUMAN_REVIEW_REQUIRED');await assert.rejects(approve(c.id),status(409));
 const newer=await h.review.supersede(c.id,c.unknown.id,operator,{...humanInsight(c.source.id),content:'担当者と更新頻度は未確認'},'範囲変更');
 await h.review.complete(c.id,operator,(await h.review.read(c.id,operator)).version,false);await assert.rejects(approve(c.id),status(409));
 const next=await manual(c.id);assert.equal(next.version,2);const approved=await approve(c.id);assert.ok(approved.reports[0]!.snapshot_json.insights.some((i:any)=>i.id===newer.id));assert.equal(approved.reports[1]!.status,'REVISION_REQUIRED');
});

test('13–17: snapshot freeze, direct SQL immutability, reissue and Supersede retain historical report',async()=>{
 const c=await reportCase(h);await manual(c.id);const approved=await approve(c.id),old=approved.reports[0]!,snapshot=old.snapshot_json;
 assert.equal(snapshot.future.id,approved.context.future.id);assert.equal(snapshot.future.version,approved.context.future.version);assert.equal(snapshot.future.intent_status,'SURVEY_STATED');assert.deepEqual(snapshot.insights.map((i:any)=>[i.id,i.version,i.semantic_type]),approved.context.insights.map(i=>[i.id,i.version,i.semantic_type]));assert.deepEqual(snapshot.assessment_confirmation_items,approved.context.assessment_confirmation_items);
 assert.equal(snapshot.content_hash,contentHash(old.content_json));assert.equal(snapshot.approved_by,operator.kind==='STAFF'?operator.userId:'');assert.ok(snapshot.approved_at&&snapshot.prompt_version&&snapshot.policy_version);
 for(const sql of ["UPDATE diagnosis_reports SET content_json='{}' WHERE id=$1","UPDATE diagnosis_reports SET snapshot_json='{}' WHERE id=$1","UPDATE diagnosis_reports SET status='REVIEW_REQUIRED' WHERE id=$1",'DELETE FROM diagnosis_reports WHERE id=$1'])await assert.rejects(h.db.query(sql,[old.id]));
 await assert.rejects(h.report.wording(c.id,operator,{report_id:old.id,expectedVersion:approved.version,blocks:[{block_id:old.content_json.sections[0]!.blocks[0]!.block_id,text:'更新'}]}),status(409));
 const newer=await h.report.reissue(c.id,operator,approved.version,'再確認して再発行');assert.equal(newer.version,2);await h.report.revision(c.id,operator,newer.id,(await read(c.id)).version,'意味の確認',true);
 await h.review.supersede(c.id,c.unknown.id,operator,{...humanInsight(c.source.id),content:'責任の所在は未確認'},'追加のHuman Review');await h.review.complete(c.id,operator,(await h.review.read(c.id,operator)).version,false);await manual(c.id);await approve(c.id);
 const retained=(await read(c.id)).reports.find(r=>r.id===old.id)!;assert.deepEqual(retained,old);
});

test('18–21: human delivery and Feedback raw statements preserve reports and create no Insight',async()=>{
 const c=await reportCase(h);await manual(c.id);await assert.rejects(deliver(c.id),status(409));const a=await approve(c.id);await assert.rejects(h.report.startFeedback(c.id,operator,a.version),status(409));
 const d=await deliver(c.id);assert.equal(d.diagnosis_status,'FEEDBACK_PENDING');assert.equal(d.reports[0]!.status,'DELIVERED');assert.ok(d.reports[0]!.delivered_at);await assert.rejects(h.report.feedbackStatement(c.id,operator,{content:'まだ開始前'}),status(409));await assert.rejects(h.report.completeFeedback(c.id,operator,d.version),status(409));
 await h.report.startFeedback(c.id,operator,d.version);const raw='  IT環境は完全に把握できています\n分からないこともあります。  ',insights=await h.review.read(c.id,operator);
 const s=await h.report.feedbackStatement(c.id,operator,{content:raw,speaker_participant_id:d.participants[0]?.id});
 const f=await read(c.id);assert.equal(f.feedback[0].id,s.id);assert.equal(f.feedback[0].content,raw);assert.equal(f.feedback[0].source_type,'FEEDBACK_STATEMENT');assert.equal(f.feedback[0].feedback_report_id,d.reports[0]!.id);assert.deepEqual(f.reports,d.reports);assert.deepEqual((await h.review.read(c.id,operator)).approved_insights,insights.approved_insights);
 await h.report.completeFeedback(c.id,operator,f.version);assert.equal((await read(c.id)).diagnosis_status,'FEEDBACK_COMPLETED');assert.deepEqual((await read(c.id)).reports,d.reports);await assert.rejects(h.report.feedbackStatement(c.id,operator,{content:'終了後'}),status(409));
 const transitions=await h.db.query<{command:string}>('SELECT command FROM case_transitions WHERE diagnosis_case_id=$1',[c.id]);assert.ok(transitions.rows.some(r=>r.command==='MarkReportDelivered'));assert.ok(transitions.rows.some(r=>r.command==='CompleteFeedback'));
});

test('11,23–24: staff, customer token, cross-site, header, state and foreign-Case guards',async()=>{
 const c=await reportCase(h),other=await reportCase(h),early=await completedCase(h);const r=await manual(c.id);
 await assert.rejects(h.report.approve(c.id,c.actor,r.id,(await read(c.id)).version),status(403));await assert.rejects(h.report.enqueue(early.id,operator,'fake','test'),status(409));await assert.rejects(h.report.read(randomUUID(),operator),status(404));
 for(const path of ['/report/ai/run','/report/manual','/report/wording','/report/revision-request','/report/approve','/report/deliver','/report/reissue','/feedback/start','/feedback/statements','/feedback/complete']){
  assert.equal((await post(c.id,path,{},false)).status,401);assert.equal((await post(c.id,path,{},true,false)).status,403);
  const url=`${h.url}/api/admin/it-management-diagnosis/cases/${c.id}${path}`;assert.equal((await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${c.access_token}`}})).status,401);assert.equal((await fetch(url,{method:'POST',headers:{Cookie:h.staffCookie,'X-Diagnosis-Command':'1','Sec-Fetch-Site':'cross-site'}})).status,403);
 }
 assert.equal((await fetch(`${h.url}/api/admin/it-management-diagnosis/cases/${c.id}/report`,{headers:{Authorization:`Bearer ${c.access_token}`}})).status,401);
 await assert.rejects(h.report.approve(other.id,operator,r.id,(await read(other.id)).version),status(409));await approve(c.id);const d=await deliver(c.id);await h.report.startFeedback(c.id,operator,d.version);
 await assert.rejects(h.report.feedbackStatement(c.id,operator,{content:'外部参照',parent_source_record_id:other.source.id}),status(422));await assert.rejects(h.report.feedbackStatement(c.id,operator,{content:'外部話者',speaker_participant_id:(await read(other.id)).participants[0].id}),status(422));
});

test('26: legacy API/table survives new migration; no legacy fields in Report API',async()=>{
 const legacy=await h.db.query<{company_name:string}>('SELECT company_name FROM kaizen_diagnostics');assert.equal(legacy.rows[0]!.company_name,'Legacy株式会社');assert.equal((await fetch(h.url+'/api/kaizen-diagnostic/questions')).status,200);
 const c=await reportCase(h);await manual(c.id);const response=await fetch(`${h.url}/api/admin/it-management-diagnosis/cases/${c.id}/report`,{headers:{Cookie:h.staffCookie}});assert.equal(response.status,200);const json=JSON.stringify(await response.json());for(const key of ['"score"','"maturity"','"suggestedServices"','"radar"','"FACT"','"CONFIRMED_FACT"'])assert.equal(json.includes(key),false);
});

test('queue isolation, duplicate enqueue and late AI cannot overwrite Human draft or approval',async()=>{
 const c=await reportCase(h);await h.report.enqueue(c.id,operator,'fake','test');await assert.rejects(h.report.enqueue(c.id,operator,'fake','test'),status(409));await h.worker.tick();await h.interviewWorker.tick();await h.postWorker.tick();assert.equal((await read(c.id)).executions[0].status,'PENDING');
 const e=await h.preparation.claimExecution<ReportExecutionInput>('REPORT_DRAFT_GENERATOR');assert.ok(e);await manual(c.id);const approved=await approve(c.id);await h.report.finishExecution(e,manualReport(e.input_snapshot_json.context));const result=await read(c.id);assert.equal(result.executions[0].error_code,'REPORT_CONTEXT_CHANGED');assert.deepEqual(result.reports,approved.reports);assert.equal(result.diagnosis_status,'REPORT_APPROVED');
});

test('timeout, invalid output audit and Human-only recovery',async()=>{
 const c=await reportCase(h);provider.run=()=>new Promise(()=>{});await h.report.enqueue(c.id,operator,'fake','test');await new ReportDraftWorker(h.preparation,h.report,provider,10).tick();assert.equal((await read(c.id)).executions[0].error_code,'AI_TIMEOUT');
 provider.run=async()=>({score:100});const d=await run(c.id);assert.equal(d.executions[0].status,'FAILED');assert.equal(d.reports.length,0);await manual(c.id);await approve(c.id);
});

test('audit failure rolls back report approval and Feedback atomically; optimistic concurrency',async()=>{
 const c=await reportCase(h);await manual(c.id);const before=await read(c.id);await assert.rejects(h.report.approve(c.id,operator,before.reports[0]!.id,before.version-1),status(409));
 await h.db.exec(`CREATE FUNCTION fail_report_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.command IN ('ApproveReport','RecordFeedbackStatement','CompleteFeedback') THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_report_audit BEFORE INSERT ON diagnosis_audit_logs FOR EACH ROW EXECUTE FUNCTION fail_report_audit();`);
 try{await assert.rejects(approve(c.id));assert.deepEqual(await read(c.id),before);}finally{await h.db.exec('DROP TRIGGER fail_report_audit ON diagnosis_audit_logs;');}
 await approve(c.id);const delivered=await deliver(c.id);await h.report.startFeedback(c.id,operator,delivered.version);const started=await read(c.id);await h.db.exec('CREATE TRIGGER fail_report_audit BEFORE INSERT ON diagnosis_audit_logs FOR EACH ROW EXECUTE FUNCTION fail_report_audit();');
 try{await assert.rejects(h.report.feedbackStatement(c.id,operator,{content:'保存失敗'}));await assert.rejects(h.report.completeFeedback(c.id,operator,started.version));assert.deepEqual(await read(c.id),started);}finally{await h.db.exec('DROP TRIGGER fail_report_audit ON diagnosis_audit_logs; DROP FUNCTION fail_report_audit();');}
});

test('empty Human Review still supports a Future-only report and feedback without forced answers',async()=>{
 const c=await reviewCase(h);await h.review.complete(c.id,operator,(await h.review.read(c.id,operator)).version,false);await manual(c.id);const a=await approve(c.id);assert.equal(a.reports[0]!.content_json.sections.length,5);assert.equal(a.reports[0]!.snapshot_json.insights.length,0);const d=await deliver(c.id);await h.report.startFeedback(c.id,operator,d.version);await h.report.completeFeedback(c.id,operator,(await read(c.id)).version);assert.equal((await read(c.id)).feedback.length,0);
});

test('formatting cannot merge words/numbers; stale or revoked grounding cannot be approved',async()=>{
 assert.equal(sameWording('not able','notable'),false);assert.equal(sameWording('1 0','10'),false);assert.equal(sameWording('１ ０','１０'),false);assert.equal(sameWording('未確認：\n 担当者','未確認：担当者'),true);
 const c=await reportCase(h);await manual(c.id);const before=await read(c.id);
 await h.db.query("UPDATE diagnosis_insights SET review_status='REJECTED' WHERE id=$1",[c.unknown.id]);await assert.rejects(approve(c.id),status(409));const ctx=(await read(c.id)).context;
 assert.throws(()=>validateReportOutput(manualReport(before.context),ctx));assert.deepEqual((await read(c.id)).reports,before.reports);await manual(c.id);await approve(c.id);
});
