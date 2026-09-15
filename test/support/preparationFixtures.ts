import type { AIProvider } from '../../src/services/preDiagnosisProvider';
import type { PreDiagnosisContext } from '../../src/services/preDiagnosisContext';
import type { OrganizerOutput } from '../../src/domain/diagnosisPreparation';
import { SURVEY_QUESTIONS, type Actor } from '../../src/domain/itManagementDiagnosis';
import { DIAGNOSIS_POLICY_NOTICE_VERSION } from '../../src/routes/itManagementDiagnosis';
import type { createDiagnosisHarness } from './diagnosisHarness';

export const operator: Actor = { kind: 'STAFF', userId: 'operator@atlib.jp' };
export function validOutput(context: PreDiagnosisContext): OrganizerOutput {
  return { themes: [{ title: 'Futureに必要なIT情報の確認', future_relation: '顧客が目指す未来とIT情報の関係を確認する',
    why_it_matters: '自己回答だけでは経営判断への接続はまだ確認できていないため',
    available_context: [{ text: '顧客はIT環境を完全に把握できていると回答している', source_refs: [{ source_ref_type: 'SURVEY_RESPONSE',source_ref_id: context.responses.find(r=>r.question_code==='Q04_IT_VISIBILITY')!.id,relation:'SUPPORTS' }] }],
    unknowns: [{ text: '誰が経営へ報告するかは未確認',unknown_type:'NOT_YET_CONFIRMED' }],
    hypotheses: [{ text: '担当者の情報と経営者が必要とする情報に差がある可能性' }],
    recommended_questions: [{ text: '経営判断に必要なIT情報はどのように届きますか？',purpose:'Futureとの関係を確認する' }],
    evidence_candidates: [{ text: 'IT管理台帳の存在を確認する候補',purpose:'Assessmentで確認する必要があるかを対話する' }],
  }] };
}
export class FakePreparationProvider implements AIProvider {
  readonly provider='fake'; readonly model='deterministic-test';
  run: (context: PreDiagnosisContext, signal: AbortSignal) => Promise<unknown> = async context => validOutput(context);
  organize(context: PreDiagnosisContext, signal: AbortSignal) { return this.run(context,signal); }
}
export async function completedCase(h: Awaited<ReturnType<typeof createDiagnosisHarness>>) {
  const result = await h.repo.createCase(
    {companyName:'ABC株式会社',contactName:'回答者',email:'private@example.test',phone:'PRIVATE_PHONE'},
    'WEB',
    {kind:'CUSTOMER',token:''},
    {noticeVersion:DIAGNOSIS_POLICY_NOTICE_VERSION},
  );
  const actor: Actor={kind:'CUSTOMER',token:result.access_token!};
  await h.repo.startSurvey(result.id,actor);
  for (const q of SURVEY_QUESTIONS.filter(q=>q.is_required)) {
    await h.repo.submitResponse(result.id,q.question_code,2,q.question_code==='Q04_IT_VISIBILITY' ? 'IT環境は完全に把握できている' : q.answer_type==='MULTI_SELECT' ? ['分からない'] : '分からない',actor);
  }
  await h.repo.completeSurvey(result.id,actor);
  return {...result,actor};
}
