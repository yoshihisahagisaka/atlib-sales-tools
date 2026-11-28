import test from 'node:test';
import assert from 'node:assert/strict';
import {formatSecumieConsultationNotification as format,formatSecumieConsultationSlack as slack,dispatchSecumieConsultationNotification as dispatch,SECUMIE_GENERAL_ADMIN_URL} from '../src/services/secumieConsultationNotification';
import type {ConsultationNotice} from '../src/services/secumieConsultationHandoff';
const base:ConsultationNotice={kind:'WEB',companyName:'株式会社サンプル',personName:'担当者',email:'synthetic@example.invalid',phone:'000',receivedAt:'2026-11-28T15:30:57.097Z',reference:'test-reference',targetUrl:'https://example.org/'};
test('WEB email is application information and staff link only, no report',()=>{
 const out=format({...base,report:{findings:[{title:'INTERNAL_DIAGNOSIS',details:[{raw:'SECRET_EVIDENCE'}]}]}});
 assert.equal(out.subject,'【SECU:MIE WEB】無料相談申込：株式会社サンプル');
 assert.match(out.text,/2026\/11\/29 00:30:57/);
 assert.match(out.text,/診断対象URL：https:\/\/example.org\//);
 assert.match(out.text,/相談内容：記載なし/);
 assert.match(out.text,/受付番号：test-reference/);
 assert.ok(out.text.includes(SECUMIE_GENERAL_ADMIN_URL));
 assert.doesNotMatch(out.text,/INTERNAL_DIAGNOSIS|SECRET_EVIDENCE|"findings"|■ 診断結果/);
});
test('Insight uses same format, no WEB URL or answers',()=>{
 const out=format({...base,kind:'INSIGHT',targetUrl:undefined,note:'相談希望\n補足',report:{answers:[{question:'INTERNAL_QUESTION',label:'INTERNAL_ANSWER'}]}});
 assert.match(out.subject,/Insight/);
 assert.match(out.text,/相談希望\n補足/);
 assert.ok(out.text.includes(SECUMIE_GENERAL_ADMIN_URL));
 assert.doesNotMatch(out.text,/INTERNAL_QUESTION|INTERNAL_ANSWER|診断対象URL/);
});
test('Slack is minimal and cannot contain user-controlled mentions or sensitive report/contact details',()=>{
 const out=slack({...base,companyName:'会社 <!channel> & <https://example.invalid>',note:'PRIVATE_NOTE',report:{raw:'PRIVATE_REPORT'}});
 assert.match(out,/&lt;!channel&gt; &amp; &lt;https:\/\/example.invalid&gt;/);
 assert.ok(out.includes(SECUMIE_GENERAL_ADMIN_URL));
 assert.doesNotMatch(out,/<!channel>|synthetic@example.invalid|電話番号|PRIVATE_NOTE|PRIVATE_REPORT|https:\/\/example.org/);
});
test('Slack failure never changes successful email outcome',async()=>{
 let mail=0,slackCalls=0;
 await dispatch(base,async()=>{mail++},async()=>{slackCalls++;throw Error('synthetic')});
 assert.equal(mail,1);assert.equal(slackCalls,1);
});
test('Slack is still attempted once if mail fails; email outcome remains failed',async()=>{
 let slackCalls=0;
 await assert.rejects(dispatch(base,async()=>{throw Error('synthetic')},async()=>{slackCalls++}),/SECUMIE_MAIL_NOTIFICATION_FAILED/);
 assert.equal(slackCalls,1);
});
