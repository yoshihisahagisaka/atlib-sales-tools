import test from 'node:test';
import assert from 'node:assert/strict';
import {formatSecumieConsultationNotification as format} from '../src/services/secumieConsultationNotification';
import type {ConsultationNotice} from '../src/services/secumieConsultationHandoff';
const base:ConsultationNotice={kind:'WEB',companyName:'株式会社サンプル',personName:'担当者',email:'synthetic@example.invalid',phone:'000',receivedAt:'2026-11-28T15:30:57.097Z',reference:'test-reference',targetUrl:'https://example.org/'};
test('WEB displays Japanese timestamp and readable findings, not internal JSON',()=>{
 const out=format({...base,report:{findings:[
  {id:'TLS_VALID',title:'HTTPS通信',status:'設定確認済み',observation:'証明書が有効です。',details:[{raw:'INTERNAL_RAW_MARKER'}]},
  {id:'DMARC_NONE',title:'DMARC',status:'追加確認推奨',observation:'ポリシーの確認をおすすめします。'}
 ]}});
 assert.equal(out.subject,'【SECU:MIE WEB】無料相談申込：株式会社サンプル');
 assert.match(out.text,/2026\/11\/29 00:30:57（日本時間）/);
 assert.match(out.text,/追加確認推奨：1件/);
 assert.match(out.text,/設定確認済み：1件/);
 assert.match(out.text,/診断対象URL：https:\/\/example.org\//);
 assert.match(out.text,/記載なし/);
 assert.match(out.text,/受付番号：test-reference/);
 assert.doesNotMatch(out.text,/INTERNAL_RAW_MARKER|TLS_VALID|DMARC_NONE|"findings"/);
});
test('Insight displays priorities and questions with human-readable answers',()=>{
 const out=format({...base,kind:'INSIGHT',targetUrl:undefined,note:'相談希望\n補足',report:{priorities:['アカウント管理'],answers:[{question:'利用権限を見直していますか？',label:'一部について見直している',questionId:'T03',answerId:'T03_A2'}]}});
 assert.match(out.subject,/Insight/);
 assert.match(out.text,/アカウント管理/);
 assert.match(out.text,/回答：一部について見直している/);
 assert.match(out.text,/相談希望\n補足/);
 assert.doesNotMatch(out.text,/T03_A2|questionId|診断対象URL/);
});
test('Unexpected report shapes do not break notification or leak raw data',()=>{
 const out=format({...base,companyName:'会社\r\nテスト',report:{findings:[null,123,{raw:'DO_NOT_MAIL'}]},receivedAt:'invalid'});
 assert.doesNotMatch(out.subject,/[\r\n]/);
 assert.match(out.text,/日時不明/);
 assert.match(out.text,/表示対象の診断項目はありません/);
 assert.doesNotMatch(out.text,/DO_NOT_MAIL/);
});
