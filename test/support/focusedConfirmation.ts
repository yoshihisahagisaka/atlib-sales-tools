import type {createDiagnosisHarness} from './diagnosisHarness';
import {operator} from './preparationFixtures';
/** Execute the existing Human loop, without resolving any UNKNOWN or selecting another route. */
export async function focusedConfirmation(h:Awaited<ReturnType<typeof createDiagnosisHarness>>,id:string){
 await h.workspace.addSource(id,operator,'INTERVIEW_STATEMENT',{content:'追加確認しても更新担当者はまだ分かりません'});
 await h.workspace.transition(id,operator,'FINISH',(await h.workspace.read(id,operator)).version);
 await h.review.complete(id,operator,(await h.review.read(id,operator)).version,true);
 await h.report.manual(id,operator,(await h.report.read(id,operator)).version);
 let r=await h.report.read(id,operator);await h.report.approve(id,operator,r.reports[0]!.id,r.version);
 r=await h.report.read(id,operator);await h.report.deliver(id,operator,r.reports[0]!.id,r.version);
 await h.report.startFeedback(id,operator,(await h.report.read(id,operator)).version);
 await h.report.completeFeedback(id,operator,(await h.report.read(id,operator)).version);
}
