import assert from 'node:assert/strict';
import type {Pool} from 'pg';
import {SalesIntakeRepo} from '../../src/services/salesIntakeRepo';
import {ItManagementDiagnosisRepo} from '../../src/services/itManagementDiagnosisRepo';
import {DiagnosisPreparationRepo} from '../../src/services/diagnosisPreparationRepo';
import {DiagnosisWorkspaceRepo} from '../../src/services/diagnosisWorkspaceRepo';
import {DiagnosisReviewRepo} from '../../src/services/diagnosisReviewRepo';
import {buildPostDiagnosisContext} from '../../src/services/postDiagnosisContext';
import {SURVEY_QUESTIONS} from '../../src/domain/itManagementDiagnosis';
import {operator} from './preparationFixtures';
import {salesRecord} from './salesIntakeScenario';
import {humanInsight} from './reviewFixtures';

export async function reuseSalesCase(pool:Pool,complete=true){
 const intake=new SalesIntakeRepo(pool),repo=new ItManagementDiagnosisRepo(pool);
 const draft=await intake.save(operator,{...salesRecord,conversationAt:'2001-01-01T00:00:00Z'});
 const c=await intake.consentAndStart(draft.id,operator,{expectedVersion:draft.version,customerAgreed:true,customerReference:'顧客役'});
 if(complete){await repo.startSurvey(c.id,operator);for(const q of SURVEY_QUESTIONS.filter(q=>q.is_required&&!Object.hasOwn(salesRecord.surveyAnswers,q.question_code)))await repo.submitResponse(c.id,q.question_code,2,q.answer_type==='MULTI_SELECT'?['分からない']:'分からない',operator);await repo.completeSurvey(c.id,operator);}
 return c;
}
export async function progressiveReuseScenario(pool:Pool,other:Pool=pool){
 const c=await reuseSalesCase(pool),prep=new DiagnosisPreparationRepo(pool),workspace=new DiagnosisWorkspaceRepo(pool),review=new DiagnosisReviewRepo(pool);
 const initial=await prep.readReuse(c.id,operator);
 assert.ok(initial.known.some(e=>e.text===salesRecord.customerStatements[0]));
 assert.ok(initial.unknown.some(e=>e.text===salesRecord.unknowns[0]));assert.ok(initial.hypotheses.some(e=>e.text===salesRecord.salespersonNotes[0]));
 assert.equal(initial.known.some(e=>e.text===salesRecord.salespersonNotes[0]),false);
 assert.ok(initial.known.some(e=>e.occurred_at==='2001-01-01T00:00:00.000Z'),'no invented age expiry');
 assert.equal(initial.candidates.some(e=>e.question_code==='Q01_FUTURE'),false,'known answers are not re-questioned');
 await prep.start(c.id,operator);
 const theme=await prep.addTheme(c.id,operator,{title:'次に必要な情報',description:'',future_relation:'目指す会社の姿に必要な作業時間を確認する'});
 const model=await prep.readReuse(c.id,operator),candidate=model.candidates.find(e=>e.origin.kind==='unknowns')!;
 const input={text:'作業時間を把握する資料はありますか',purpose:'作業時間が未確認のため',item_type:'CONFIRMATION' as const,diagnosis_theme_id:theme.id};
 const [a,b]=await Promise.all([prep.selectReuse(c.id,operator,candidate.key,model.version,input),new DiagnosisPreparationRepo(other).selectReuse(c.id,operator,candidate.key,model.version,input)]);
 assert.equal(a.id,b.id);assert.equal((await prep.readReuse(c.id,operator)).plans.length,1);
 await prep.confirm(c.id,operator,(await prep.read(c.id,operator)).version);
 await workspace.transition(c.id,operator,'START',(await workspace.read(c.id,operator)).version);
 assert.equal((await workspace.read(c.id,operator)).plan_snapshot_json.plan_items[0].text,input.text);
 const source=await workspace.addSource(c.id,operator,'INTERVIEW_STATEMENT',{content:'資料の存在はまだ分かりません'},a.id);
 const after=await prep.readReuse(c.id,operator);assert.equal(after.plans[0]!.results[0]!.id,source.id);
 assert.ok(after.known.some(e=>e.origin.id===source.id&&e.origin_label==='追加確認での顧客発言'));
 assert.ok(after.unknown.some(e=>e.key===candidate.key),'recording speech never resolves UNKNOWN automatically');
 assert.equal((await pool.query('SELECT * FROM diagnosis_insights WHERE diagnosis_case_id=$1',[c.id])).rows.length,0);
 await workspace.transition(c.id,operator,'FINISH',(await workspace.read(c.id,operator)).version);
 const client=await pool.connect();try{assert.ok((await buildPostDiagnosisContext(client,c.id)).sources.some(s=>s.id===source.id));}finally{client.release();}
 await review.createInsight(c.id,operator,humanInsight(source.id));
 assert.equal((await review.read(c.id,operator)).approved_insights[0].semantic_type,'UNKNOWN');
 return {caseId:c.id,planId:a.id,sourceId:source.id};
}
