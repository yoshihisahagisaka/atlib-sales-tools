(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./data.js'));else root.PiraDiagnosis=factory(root.PiraContent);})(typeof globalThis!=='undefined'?globalThis:this,function(C){
'use strict';
const option=(id,label)=>({id,label});
const standard=[option('READY','対象を決め、運用している'),option('PARTIAL','一部だけ実施している'),option('NOT_DONE','手順を設けていない')];
const Q=[
 {id:'C01',text:'事務局が現在行っている業務を選んでください',label:'現在の業務',multi:4,options:[option('WORKFORCE','外国人材の監理・支援'),option('PURCHASING','共同購買・契約請求'),option('MEMBERSHIP','会員管理・会報や研修案内'),option('OTHER','その他の事務局業務')],hint:'複数選べます。教育・研修の案内は「会員管理・会報や研修案内」に含みます。'},
 {id:'C02',text:'現在扱っている情報の種類を選んでください',label:'扱う情報',multi:6,options:[option('IDENTITY','旅券・在留資格等の本人確認情報'),option('CASE_RECORD','面談・訪問・相談記録'),option('MEMBER_CONTACT','会員の担当者・連絡先'),option('TRANSACTION','契約・請求・取引情報'),option('OTHER_IMPORTANT','その他の重要情報'),option('NONE','いずれも扱っていない')],exclusive:['NONE'],hint:'実物や番号の入力は不要です。分かる範囲を選び、把握できない場合は「分からない」を選んでください。'},
 {id:'C03',text:'退職・異動した人の業務アカウント権限を解除する手順はありますか',label:'退職・異動時の権限解除',options:standard,na:option('NO_BUSINESS_ACCOUNT','業務アカウントがない')},
 {id:'C04',text:'重要情報を外部へ送る前に、宛先と送信する内容を確認する手順を運用していますか',label:'重要情報の外部送信前確認',options:standard,na:option('NO_EXTERNAL_TRANSFER','重要情報を外部へ送らない')},
 {id:'C05',text:'外部から利用できる業務アカウントで、多要素認証を使っていますか',label:'外部利用アカウントの多要素認証',hint:'パスワードに加え、確認コードなど別の方法でも本人を確認する仕組みです。',options:[option('READY','対象のアカウントで使用している'),option('PARTIAL','一部の対象だけ使用している'),option('NOT_DONE','使用していない')],na:option('NO_REMOTE_ACCOUNT','外部から利用するアカウントがない')},
 {id:'C06',text:'業務で使うパソコンのOS更新を行う担当と手順を決め、更新していますか',label:'業務PCのOS更新',hint:'OSはWindowsやmacOSなど、パソコンの基本ソフトです。ウイルス対策の質問とは別です。',options:[option('READY','担当と手順を決め、更新している'),option('PARTIAL','一部だけ実施している'),option('NOT_DONE','担当と手順を決めていない')],na:option('NO_BUSINESS_PC','業務用パソコンがない')},
 {id:'C07',text:'重要な電子データをバックアップから戻せるか、復元確認をしていますか',label:'電子データの復元確認',hint:'保存していることだけでなく、実際に戻せるかを確認した状況をお答えください。',options:[option('READY','対象を決め、復元確認をしている'),option('PARTIAL','一部だけ復元確認をしている'),option('NOT_DONE','復元確認をしていない')],na:option('NO_IMPORTANT_DIGITAL_DATA','重要な電子データがない')},
 {id:'B01',business:'WORKFORCE',text:'監理・支援に伴う本人確認資料や相談記録について、保管期限を決め、期限後の処理を行っていますか',label:'監理・支援資料の保管期限と期限後処理',options:[option('READY','期限と処理を決め、運用している'),option('PARTIAL','一部だけ実施している'),option('NOT_DONE','期限後の処理を決めていない')],na:option('NO_WORKFORCE_RECORD','該当する資料・記録がない')},
 {id:'B02',business:'PURCHASING',text:'振込先変更の依頼を受けたとき、依頼メール等とは別の既知の連絡先で確認する手順はありますか',label:'振込先変更時の別経路確認',options:[option('READY','別の既知の連絡先で確認している'),option('PARTIAL','一部だけ実施している'),option('NOT_DONE','手順を設けていない')],na:option('NO_BANK_TRANSFER','振込を扱わない')},
 {id:'B03',business:'MEMBERSHIP',text:'会員向け一斉案内で、送信前にテスト送信し宛名差込と配布対象を確認していますか',label:'会員向け案内の差込・配布対象テスト',options:[option('READY','テスト送信で確認している'),option('PARTIAL','一部だけ実施している'),option('NOT_DONE','実施していない')],na:option('NO_BULK_NOTICE','一斉案内をしない')},
 {id:'B04',business:'ANY',text:'情報の誤送信・不審アクセス・端末紛失を見つけたとき、最初の連絡先を決めていますか',label:'事故時の第一連絡先',options:[option('READY','連絡先を決め、周知している'),option('PARTIAL','一部だけ決めている'),option('NOT_DONE','決めていない')]}
];
const T=[
 ['T01','本人資料・記録の保管期限',['B01'],'K01'],['T02','外部送信・一斉案内',['C04','B03'],'K02'],['T03','退職異動時の権限',['C03'],'K03'],['T04','多要素認証',['C05'],'K04'],['T05','PCのOS更新',['C06'],'K05'],['T06','電子データ復元確認',['C07'],'K06'],['T07','振込先変更の確認',['B02'],'K07'],['T08','事故時の第一連絡先',['B04'],'K08']
].map(([id,title,questions,checklist])=>({id,title,questions,checklist}));
const clone=x=>JSON.parse(JSON.stringify(x));
function activeQuestions(draft){const b=draft.C01;return Q.filter(q=>!q.business||(b?.responseState==='ANSWERED'&&(q.business==='ANY'||b.optionIds.includes(q.business))));}
function envelope(draft){return {answerContractVersion:C.versions.answerContractVersion,answerRevision:1,entryChannel:'SELF',respondentRole:'OFFICE',answers:activeQuestions(draft).filter(q=>draft[q.id]).map(q=>clone(draft[q.id]))};}
 function answer(questionId,value){return ['UNKNOWN','NOT_IN_POSITION_TO_ANSWER'].includes(value)?{questionId,responseState:value,optionIds:[]}:typeof value==='string'&&value.startsWith('NO_')?{questionId,responseState:'NOT_APPLICABLE',optionIds:[],notApplicableReason:value}:{questionId,responseState:'ANSWERED',optionIds:Array.isArray(value)?value:[value]};}
class InputError extends Error{constructor(code,questionIds=[]){super(code);this.code=code;this.questionIds=questionIds;this.status='INVALID_INPUT';}}
function fail(code,ids){throw new InputError(code,ids);}
function validate(input){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('入力形式を確認してください');
 const allowed=['answerContractVersion','answerRevision','entryChannel','respondentRole','answers'];if(Object.keys(input).some(k=>!allowed.includes(k)))fail('定義外の項目があります');
 if(input.answerContractVersion!==C.versions.answerContractVersion)fail('回答の版が対応していません');
 if(!Number.isInteger(input.answerRevision)||input.answerRevision<1||!['SELF','PROXY'].includes(input.entryChannel)||!['OFFICE','EXECUTIVE','IT_SUPPORT','OTHER','UNKNOWN'].includes(input.respondentRole))fail('回答情報を確認してください');
 if(!Array.isArray(input.answers)||input.answers.length>11)fail('回答数を確認してください');
 const draft={};for(const a of input.answers){
  if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!['questionId','responseState','optionIds','notApplicableReason','scopeConfirmation'].includes(k)))fail('回答の形式を確認してください');
  const q=Q.find(q=>q.id===a.questionId);if(!q||draft[a.questionId])fail('質問が未定義または重複しています',[a.questionId]);
  if(!['ANSWERED','UNKNOWN','NOT_IN_POSITION_TO_ANSWER','NOT_APPLICABLE'].includes(a.responseState)||!Array.isArray(a.optionIds))fail('回答状態を確認してください',[q.id]);
  if(a.responseState==='ANSWERED'){
   if(a.optionIds.length<1||a.optionIds.length>(q.multi||1)||new Set(a.optionIds).size!==a.optionIds.length||a.optionIds.some(v=>!q.options.some(o=>o.id===v)))fail('選択肢を確認してください',[q.id]);
   if(q.exclusive?.some(v=>a.optionIds.includes(v))&&a.optionIds.length>1)fail('「いずれも扱っていない」は他の情報と同時に選べません',[q.id]);
   if(a.notApplicableReason!==undefined||a.scopeConfirmation!==undefined)fail('回答の補足を確認してください',[q.id]);
  }else{
   if(a.optionIds.length)fail('未確認・担当外・該当なしには選択肢を併記できません',[q.id]);
   if(a.responseState==='NOT_APPLICABLE') {if(!q.na||q.na.id!==a.notApplicableReason)fail('該当しない理由を確認してください',[q.id]);}
   else if(a.notApplicableReason!==undefined||a.scopeConfirmation!==undefined)fail('回答の補足を確認してください',[q.id]);
  }
  if(a.scopeConfirmation!==undefined&&(q.id!=='B01'||a.responseState!=='NOT_APPLICABLE'||a.scopeConfirmation!=='OTHER_WORKFLOW'))fail('適用範囲の補足を確認してください',[q.id]);
  draft[q.id]=clone(a);
 }
 const active=activeQuestions(draft);const missing=active.filter(q=>!draft[q.id]);if(missing.length)fail('未回答の質問があります',missing.map(q=>q.id));
 for(const q of Q.filter(q=>!active.includes(q)))if(draft[q.id])fail('現在の業務では表示されない質問の回答が含まれています',[q.id]);
 if(draft.C03.responseState==='NOT_APPLICABLE'&&draft.C05.responseState==='ANSWERED')fail('業務アカウントなしと認証の回答を確認してください',['C03','C05']);
 if(draft.B01?.responseState==='NOT_APPLICABLE'&&draft.C02.optionIds.some(v=>['IDENTITY','CASE_RECORD'].includes(v))&&draft.B01.scopeConfirmation!=='OTHER_WORKFLOW')fail('本人資料・記録が別業務由来か確認してください',['B01','C02']);
 if(draft.C02.optionIds.includes('NONE')&&['C04','C07'].some(id=>draft[id].responseState==='ANSWERED'))fail('扱う情報と送信・復元の対象を確認してください',['C02','C04','C07']);
 return Q.map(q=>draft[q.id]?{...draft[q.id],optionIds:q.options.filter(o=>draft[q.id].optionIds.includes(o.id)).map(o=>o.id)}:{questionId:q.id,responseState:'SKIPPED_BY_BRANCH',optionIds:[]});
}
const stateName={READY:'REPORTED_READY',PARTIAL:'REPORTED_PARTIAL',NOT_DONE:'REPORTED_NOT_DONE',UNKNOWN:'UNCONFIRMED',NOT_IN_POSITION_TO_ANSWER:'AUTHORITY_CONFIRMATION',NOT_APPLICABLE:'NOT_APPLICABLE',SKIPPED_BY_BRANCH:'SKIPPED'};
function project(answers){return answers.filter(a=>a.responseState!=='SKIPPED_BY_BRANCH').map(a=>({questionId:a.questionId,state:a.responseState==='ANSWERED'?(stateName[a.optionIds[0]]||'REPORTED_SELECTION'):stateName[a.responseState],optionIds:clone(a.optionIds),...(a.notApplicableReason?{notApplicableReason:a.notApplicableReason}:{}),...(a.scopeConfirmation?{scopeConfirmation:a.scopeConfirmation}:{})}));}
function evaluate(input){
 const normalizedAnswers=validate(input),a=Object.fromEntries(normalizedAnswers.map(x=>[x.questionId,x]));
 const answered=id=>a[id]?.responseState==='ANSWERED',open=id=>answered(id)&&['PARTIAL','NOT_DONE'].includes(a[id].optionIds[0]),has=id=>a.C01.optionIds.includes(id);
 const active=id=>a[id].responseState!=='SKIPPED_BY_BRANCH';
 const rel=[has('WORKFORCE')&&active('B01'),answered('C04')||has('MEMBERSHIP'),answered('C03'),answered('C05'),answered('C06'),answered('C07'),has('PURCHASING')&&active('B02'),answered('C01')&&active('B04')];
 const themeEvidence={};T.forEach(t=>{const ids=t.questions.filter(open);if(ids.length)themeEvidence[t.id]=ids;});
 const candidateThemeIds=Object.keys(themeEvidence),priorityThemeIds=candidateThemeIds.slice(0,3),deferredThemeIds=candidateThemeIds.slice(3);
 const select=state=>normalizedAnswers.filter(a=>a.responseState===state).map(a=>a.questionId);
 const unknownQuestionIds=select('UNKNOWN'),authorityQuestionIds=select('NOT_IN_POSITION_TO_ANSWER'),notApplicableQuestionIds=select('NOT_APPLICABLE'),skippedQuestionIds=select('SKIPPED_BY_BRANCH');
 const uncertain=unknownQuestionIds.length+authorityQuestionIds.length>0;
 const status=candidateThemeIds.length?'ACTION_CONFIRMATION':uncertain?'CONFIRMATION_PENDING':'NO_ADDITIONAL_CONFIRMATION';
 const checklistIds=priorityThemeIds.map(id=>T.find(t=>t.id===id).checklist);if(uncertain)checklistIds.push('KU');else if(!candidateThemeIds.length)checklistIds.push('K00');
 const appliedRuleIds=['G01',...(unknownQuestionIds.length?['G02']:[]),...(authorityQuestionIds.length?['G03']:[]),...(notApplicableQuestionIds.length+skippedQuestionIds.length?['G04']:[]),'D01','REL01',...candidateThemeIds.map(id=>'R-'+id),...(open('C04')&&open('B03')?['DEP01']:[]),...(candidateThemeIds.includes('T03')&&candidateThemeIds.includes('T04')?['DEP02']:[]),'SEL01','KSEL01',status==='ACTION_CONFIRMATION'?'H03':uncertain?'H02':'H01'];
 return {...C.versions,status,businessIds:clone(a.C01.optionIds),informationIds:clone(a.C02.optionIds),currentStates:project(normalizedAnswers),relevanceThemeIds:T.filter((_,i)=>rel[i]).map(t=>t.id),candidateThemeIds,priorityThemeIds,deferredThemeIds,themeEvidence,unknownQuestionIds,authorityQuestionIds,notApplicableQuestionIds,skippedQuestionIds,checklistIds,contentCardIds:C.sourceCards.filter(c=>c.verified).map(c=>c.id),nextActionIds:['SELF_REVIEW','OPTIONAL_CONSULTATION','OPTIONAL_MEMBER_INVITATION'],appliedRuleIds,normalizedAnswers};
}
// Adapted from src/domain/diagnosisReport.ts contentHash at PR15 base: same recursive key ordering.
function canonicalString(value){const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;return JSON.stringify(ordered(value));}
async function hash(value){const bytes=new TextEncoder().encode(canonicalString(value));const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');}
// Adapted from the existing Business Web self-check's esc helper; no external markup is accepted.
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const titles=['最近の事故・統計','組合の業務と重要情報','現在の管理状況','優先確認テーマ','実務チェックリスト','次の取り組み'];
const ready={C03:'対象と担当を決め運用しているという回答です',C04:'手順を運用しているという回答です',C05:'対象で使用しているという回答です',C06:'担当と手順を決め更新しているという回答です',C07:'対象を決め復元確認しているという回答です',B01:'期限と処理を決め運用しているという回答です',B02:'別経路確認を運用しているという回答です',B03:'テスト送信で確認しているという回答です',B04:'連絡先を決め周知しているという回答です'};
const notDone={C03:'手順を設けていない',C04:'手順を設けていない',C05:'使用していない',C06:'担当と手順を決めていない',C07:'復元確認をしていない',B01:'期限後の処理を決めていない',B02:'手順を設けていない',B03:'実施していない',B04:'決めていない'};
function recognition(a){const q=Q.find(q=>q.id===a.questionId);if(a.responseState==='UNKNOWN')return '今回は分かりませんでした';if(a.responseState==='NOT_IN_POSITION_TO_ANSWER')return '回答者の担当外で確認が必要です';if(a.responseState==='NOT_APPLICABLE')return q.na.label+'ため、今回は対象外と回答しています';if(a.optionIds[0]==='READY')return ready[q.id];if(a.optionIds[0]==='PARTIAL')return q.id==='C05'?'一部の対象で使用しているという回答です':'一部で運用しているという回答です';if(a.optionIds[0]==='NOT_DONE')return notDone[q.id]+'という回答です';return a.optionIds.map(id=>q.options.find(o=>o.id===id).label).join('、')+'という回答です';}
const labelList=ids=>ids.map(id=>Q.find(q=>q.id===id).label).join('、');
function checklistText(id,r){if(id!=='K02')return C.checklist[id];let text='';const e=r.themeEvidence.T02||[];if(e.includes('C04'))text+='実際の送信前に宛先一覧と送るファイル・共有範囲を照合する手順を一枚にする。';if(e.includes('B03'))text+='ダミーデータのテスト送信で宛名差込と配布対象を確認する工程を追記する。';return text+'成果物：送信確認票。埋込データの有無も確認対象の例として示し、存在を断定しない。';}
function priorityText(t,r){const a=Object.fromEntries(r.normalizedAnswers.map(a=>[a.questionId,a]));const e=r.themeEvidence[t.id];const key=t.id+':'+e.join(',')+':'+e.map(id=>a[id].optionIds[0]).join(',');const keys=['T01:B01:NOT_DONE','T02:C04:NOT_DONE','T03:C03:PARTIAL','T04:C05:PARTIAL','T06:C07:NOT_DONE','T07:B02:NOT_DONE','T02:C04,B03:PARTIAL,NOT_DONE','T08:B04:NOT_DONE'];const ix=keys.indexOf(key);if(ix>=0)return C.priorityMessages[ix].slice(2);return t.title+'：'+e.map(id=>Q.find(q=>q.id===id).label+'は'+recognition(a[id])).join('。')+'。現在の手順を続けるか見直すかの判断材料として、'+checklistText(t.checklist,r)+'（根拠'+e.join('・')+'、R-'+t.id+'）';}
function report(r){
 const a=Object.fromEntries(r.normalizedAnswers.map(x=>[x.questionId,x]));const one=r.businessIds.length===1?r.businessIds[0]:null;
 const infoMatch={WORKFORCE:['IDENTITY','CASE_RECORD'],PURCHASING:['TRANSACTION'],MEMBERSHIP:['MEMBER_CONTACT']};
 let s2;if(one&&canonicalString(r.informationIds)===canonicalString(infoMatch[one]))s2=C.businessParagraphs[one];else s2='ご回答では、'+recognition(a.C01)+'。扱う情報は、'+recognition(a.C02)+'。実物や番号は受け取っていません。業務から情報の保有を推定していません。';
 const controls=r.normalizedAnswers.filter(x=>!['C01','C02'].includes(x.questionId)&&x.responseState!=='SKIPPED_BY_BRANCH');
 let s3='|確認した対象|今回の回答|\n|---|---|\n'+controls.map(x=>'|'+Q.find(q=>q.id===x.questionId).label+'|'+recognition(x)+'|').join('\n')+'\n\n';
 const skippedLabels={B01:'監理・支援資料の期限処理',B02:'共同購買の振込先確認',B03:'会員向け一斉案内',B04:'事故時の第一連絡先'};
 if(r.skippedQuestionIds.length){if(a.C01.responseState!=='ANSWERED')s3+='業務が未確認のため、業務別の質問は表示・評価していません。';else{let text=r.skippedQuestionIds.map(id=>skippedLabels[id]).join('と');if(one==='WORKFORCE')text='共同購買の振込先確認と会員向け一斉案内';s3+=text+'は、選択業務外のため評価していません。';}}
 if(!r.unknownQuestionIds.length&&!r.authorityQuestionIds.length&&!r.notApplicableQuestionIds.length)s3+='未確認・担当外・該当なしの回答はありません。';
 else if(!r.authorityQuestionIds.length&&!r.notApplicableQuestionIds.length)s3+='担当外・該当なしの回答はありません。';
 if(a.C07.responseState==='UNKNOWN')s3+='復元確認が分からないことだけで、バックアップがないとは判断していません。';
 if(a.C07.optionIds[0]==='NOT_DONE')s3+='復元確認をしていないという回答から、バックアップが存在しないとは判断していません。';
 s3+=r.deferredThemeIds.length?'今回の表示上限外：'+r.deferredThemeIds.map(id=>T.find(t=>t.id===id).title).join('、')+'。危険度の順位ではありません。':'表示上限外の確認テーマはありません。';
 let s4;if(!r.priorityThemeIds.length)s4=r.status==='CONFIRMATION_PENDING'?'未確認の項目があるため、今回の回答では優先確認テーマを選定していません':'今回の回答では追加の優先確認テーマはありません';else s4='以下は危険度の順ではなく、実務を整理する固定の手順順です。'+(r.priorityThemeIds.length===2?'確認テーマは2件で、3件に増やすための項目は追加していません。':'')+'\n'+r.priorityThemeIds.map(id=>'- '+priorityText(T.find(t=>t.id===id),r)).join('\n');
 const s5=r.checklistIds.map(id=>{if(id==='KU'){const u='今回の未確認項目は'+(r.unknownQuestionIds.length?labelList(r.unknownQuestionIds)+'（'+r.unknownQuestionIds.join('・')+'）':'ありません');const auth=r.authorityQuestionIds.length?'、担当外の項目は'+labelList(r.authorityQuestionIds)+'です。':'、担当外の項目はありません。';return '- '+C.checklist.KU.replace('成果物：',u+auth+'成果物：');}return '- '+checklistText(id,r);}).join('\n');
 const bodies=[C.incidentMarkdown,s2,s3,s4,s5,C.nextMarkdown];const sections=bodies.map((body,i)=>({key:'S'+(i+1),title:titles[i],markdown:body}));
 return {intro:C.intro,sections,markdown:C.intro+'\n\n'+sections.map((s,i)=>'### '+(i+1)+'. '+s.title+'\n'+s.markdown).join('\n\n'),sourceCards:clone(C.sourceCards.filter(c=>c.verified))};
}
const formColumns={K01:['資料の種類','期限の根拠・期限','処理担当','処理日・記録'],K02:['送付する書類・内容','宛先・共有範囲','テスト・照合の確認者','確認日'],K03:['アカウントの種類','解除の依頼先','実施確認者','完了日'],K04:['外部利用の種類','認証の対応可否','確認先','対応の判断'],K05:['対象PCの管理番号','更新担当','確認日','対応予定日'],K06:['戻すデータの種類','確認方法・日程','担当者','確認結果'],K07:['変更依頼の概要','既知の確認経路','確認者','承認日'],K08:['発見時の連絡窓口','不在時の代行先','連絡方法','見直し日'],KU:['未確認・担当外の項目','確認する相手','確認日','分かったこと'],K00:['継続する手順','担当者','変更時の確認','見直し日']};
function visibleChecklists(r){return r.checklistIds.filter(id=>id!=='KU'||r.priorityThemeIds.length===0).slice(0,3);}
async function snapshot(input,r,rep){const semantic={definitionId:C.versions.definitionId,answerContractVersion:C.versions.answerContractVersion,answers:r.normalizedAnswers};const inputHash=await hash(semantic);const resultHash=await hash(r);const renderedContentHash=await hash(rep);return {prototype:true,...C.versions,sourceDesignSha:'48ef973b749021ef314cbe01ac80b210a7dac3e4',answerRevision:input.answerRevision,reportRevision:1,inputHash,resultHash,renderedContentHash,executionKey:await hash({inputHash,...C.versions}),answers:r.normalizedAnswers,result:r,report:rep};}
return {questions:Q,themes:T,versions:C.versions,activeQuestions,envelope,answer,validate,project,evaluate,report,recognition,checklistText,visibleChecklists,formColumns,canonicalString,hash,escapeHtml,snapshot,InputError};
});
