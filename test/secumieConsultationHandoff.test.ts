import test from 'node:test';
import assert from 'node:assert/strict';
import { ConsultationHandoff, SECUMIE_SCHEDULE_URLS, consultationSchema, type ConsultationNotice } from '../src/services/secumieConsultationHandoff';
const context = {kind:'WEB' as const,companyName:'Synthetic',registeredAddress:'Tokyo',targetUrl:'https://example.org/',report:{findings:[]}};
const input = (receipt:string) => consultationSchema.parse({receipt,personName:'Synthetic',email:'synthetic@example.org',phone:'000',accepted:true});
test('WEB receipt transfers server report and returns only fixed WEB schedule once', async()=>{
 const notices:ConsultationNotice[]=[];
 const h=new ConsultationHandoff(async n=>{notices.push(n)},SECUMIE_SCHEDULE_URLS.WEB);
 try{const receipt=h.issue(context);assert.equal(await h.submit(input(receipt)),SECUMIE_SCHEDULE_URLS.WEB);assert.equal(await h.submit(input(receipt)),SECUMIE_SCHEDULE_URLS.WEB);assert.equal(notices.length,1);assert.deepEqual(notices[0]?.report,context.report);await assert.rejects(h.submit({...input(receipt),phone:'111'}),/ALREADY_SUBMITTED/);}finally{h.close()}
});
test('capacity and expiry are enforced',async()=>{
 let now=0;const h=new ConsultationHandoff(async()=>{},SECUMIE_SCHEDULE_URLS.WEB,()=>now,1000,1);
 try{const receipt=h.issue(context);assert.throws(()=>h.issue(context),/HANDOFF_CAPACITY/);now=1001;await assert.rejects(h.submit(input(receipt)),/RECEIPT_EXPIRED/);h.issue(context);}finally{h.close()}
});
test('failed notification does not return schedule and can retry',async()=>{
 let fail=true;const h=new ConsultationHandoff(async()=>{if(fail)throw Error('synthetic')},SECUMIE_SCHEDULE_URLS.WEB);
 try{const receipt=h.issue(context);await assert.rejects(h.submit(input(receipt)),/NOTIFICATION_FAILED/);fail=false;assert.equal(await h.submit(input(receipt)),SECUMIE_SCHEDULE_URLS.WEB);}finally{h.close()}
});
test('Insight rejects invalid answers and uses server evaluation',async()=>{
 const answers=Array.from({length:8},(_,i)=>({questionId:'T'+i,answerId:'A'+i}));const notices:ConsultationNotice[]=[];
 const h=new ConsultationHandoff(async n=>{notices.push(n)},SECUMIE_SCHEDULE_URLS.INSIGHT,Date.now,7200000,500,a=>{if(a.some(x=>!answers.some(y=>x.questionId===y.questionId&&x.answerId===y.answerId)))throw Error('invalid');return {evaluated:true}});
 try{const receipt=h.issue({kind:'INSIGHT',companyName:'Synthetic',registeredAddress:'Tokyo'});await assert.rejects(h.submit({...input(receipt),answers:answers.map(x=>({...x,answerId:'invalid'}))}),/INVALID_ANSWERS/);assert.equal(await h.submit({...input(receipt),answers}),SECUMIE_SCHEDULE_URLS.INSIGHT);assert.deepEqual(notices[0]?.report,{evaluated:true});}finally{h.close()}
});
