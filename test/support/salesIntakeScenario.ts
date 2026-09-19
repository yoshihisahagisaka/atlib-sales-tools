import assert from 'node:assert/strict';
import type {Pool} from 'pg';
import {SalesIntakeRepo} from '../../src/services/salesIntakeRepo';
import {ItManagementDiagnosisRepo} from '../../src/services/itManagementDiagnosisRepo';
import {operator} from './preparationFixtures';
export const salesRecord={customer:{companyName:'営業合成株式会社',contactName:'顧客役',email:'synthetic@example.test'},customerStatements:['売上を増やしたいと伺った'],unknowns:['現状の作業時間はまだ分かっていない'],salespersonNotes:['効率化が必要かもしれない'],surveyAnswers:{Q01_FUTURE:['売上・事業を成長させたい'],Q04_IT_VISIBILITY:'分からない'}};
export async function salesConsentScenario(pool:Pool,other:Pool=pool){
 const repo=new SalesIntakeRepo(pool),second=new SalesIntakeRepo(other),cases=new ItManagementDiagnosisRepo(pool);
 const count=async()=>Number((await pool.query('SELECT count(*)::int AS n FROM diagnosis_cases')).rows[0].n),before=await count();
 const draft=await repo.save(operator,salesRecord);assert.equal(await count(),before);
 const saved=await repo.read(draft.id,operator);assert.deepEqual(saved.customer_statements,salesRecord.customerStatements);assert.deepEqual(saved.unknowns,salesRecord.unknowns);assert.deepEqual(saved.salesperson_notes,salesRecord.salespersonNotes);
 const consent={expectedVersion:draft.version,customerAgreed:true,customerReference:'顧客役'};
 const results=await Promise.all([repo.consentAndStart(draft.id,operator,consent),second.consentAndStart(draft.id,operator,consent)]);
 assert.equal(results[0]!.id,results[1]!.id);assert.equal(await count(),before+1);
 const row=await repo.read(draft.id,operator);assert.equal(row.consent_state,'CONSENTED');assert.equal(row.consent_recorded_by_user_id,'operator@atlib.jp');assert.ok(row.consent_recorded_at);assert.equal(row.diagnosis_case_id,results[0]!.id);
 const handoff=await repo.forCase(results[0]!.id,operator);assert.deepEqual(handoff.unknowns,salesRecord.unknowns);assert.deepEqual(handoff.salesperson_notes,salesRecord.salespersonNotes);
 const answers=await pool.query('SELECT raw_value_json,intake_origin_id,entered_by_user_id,entry_channel FROM survey_responses WHERE diagnosis_case_id=$1',[results[0]!.id]);assert.equal(answers.rows.length,2);for(const answer of answers.rows){assert.equal(answer.intake_origin_id,draft.id);assert.equal(answer.entered_by_user_id,'operator@atlib.jp');assert.equal(answer.entry_channel,'SALES_VISIT');}
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM diagnosis_insights WHERE diagnosis_case_id=$1',[results[0]!.id])).rows[0].n,0);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM source_records WHERE diagnosis_case_id=$1',[results[0]!.id])).rows[0].n,0);
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM sales_intake_audit_logs WHERE intake_id=$1 AND command='ConsentAndStartDiagnosis'",[draft.id])).rows[0].n,1);
 await cases.startSurvey(results[0]!.id,operator);
 await cases.submitResponse(results[0]!.id,'Q04_IT_VISIBILITY',2,'おおむね把握できている',operator);
 assert.equal((await pool.query("SELECT intake_origin_id FROM survey_responses r JOIN survey_questions q ON q.id=r.question_id WHERE r.diagnosis_case_id=$1 AND q.question_code='Q04_IT_VISIBILITY'",[results[0]!.id])).rows[0].intake_origin_id,null);
 assert.equal((await repo.read(draft.id,operator)).survey_answers.Q04_IT_VISIBILITY,'分からない','original remains separate from subsequent hearing');
 return {intakeId:draft.id,caseId:results[0]!.id};
}
