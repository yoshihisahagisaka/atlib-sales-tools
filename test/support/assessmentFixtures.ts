import type {createDiagnosisHarness} from './diagnosisHarness';
import {operator} from './preparationFixtures';
import {reportCase} from './reportFixtures';
export async function feedbackCase(h:Awaited<ReturnType<typeof createDiagnosisHarness>>,options:{decision?:boolean}={}){const c=await reportCase(h);
 const read=()=>h.report.read(c.id,operator);await h.report.manual(c.id,operator,(await read()).version);let d=await read();await h.report.approve(c.id,operator,d.reports[0]!.id,d.version);d=await read();await h.report.deliver(c.id,operator,d.reports[0]!.id,d.version);await h.report.startFeedback(c.id,operator,(await read()).version);const statement=await h.report.feedbackStatement(c.id,operator,{content:'引き続き分からない点を確認したい'});await h.report.completeFeedback(c.id,operator,(await read()).version);
 if(options.decision!==false){const current=await h.assessment.read(c.id,operator);await h.feedbackDecision.decide(c.id,operator,{expectedVersion:current.version,route:'DESIGN_ASSESSMENT',materialDecision:'Design Assessmentへ進む',nextAction:'Assessment提案可否をHumanが判断する',customerRestatementSourceId:statement.id});}
 return {...c,feedbackStatementId:statement.id};
}
