import type { InterviewProvider } from '../../src/services/interviewAssistantProvider';
import type { InterviewContext } from '../../src/services/interviewAssistantContext';
import type { InterviewOutput } from '../../src/domain/diagnosisWorkspace';
import { completedCase,operator } from './preparationFixtures';
import type { createDiagnosisHarness } from './diagnosisHarness';
export function interviewOutput(context:InterviewContext):InterviewOutput {
 const source=context.sources[0];
 return {suggestions:['FOLLOW_UP','CLARIFY','CHECK_UNKNOWN','CHECK_CONTRADICTION','NEW_THEME'].map(suggestion_type=>({
  suggestion_type:suggestion_type as InterviewOutput['suggestions'][number]['suggestion_type'],text:'次の判断のために何を確認したいですか？',purpose:'Futureに重要な未確認事項を対話で確認する',related_theme_id:context.themes[0]!.id,
  source_refs:[{source_ref_type:source?'SOURCE_RECORD':'SURVEY_RESPONSE',source_ref_id:source?.id??context.responses[0]!.id,relation:'RELATED'}],
 }))};
}
export class FakeInterviewProvider implements InterviewProvider {
 readonly provider='fake';readonly model='deterministic-interview-test';calls=0;
 run:(context:InterviewContext,signal:AbortSignal)=>Promise<unknown>=async context=>interviewOutput(context);
 suggest(context:InterviewContext,signal:AbortSignal){this.calls++;return this.run(context,signal);}
}
export async function readyCase(h:Awaited<ReturnType<typeof createDiagnosisHarness>>) {
 const c=await completedCase(h);await h.preparation.start(c.id,operator);
 await h.preparation.addTheme(c.id,operator,{title:'重要な情報の確認',description:'',future_relation:'未来への判断に必要な情報'});
 await h.preparation.addPlan(c.id,operator,{text:'分からないことは何ですか？',purpose:'確認',item_type:'QUESTION',diagnosis_theme_id:null});
 await h.preparation.confirm(c.id,operator,(await h.preparation.read(c.id,operator)).version);return c;
}
export async function startedCase(h:Awaited<ReturnType<typeof createDiagnosisHarness>>) {
 const c=await readyCase(h);await h.workspace.transition(c.id,operator,'START',(await h.workspace.read(c.id,operator)).version);return c;
}
