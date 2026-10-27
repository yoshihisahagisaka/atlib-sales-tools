/* Approved v6 adapter: selection contracts from spec; shared serializer, hash, incidents and PDF remain in existing modules. */
(function(r,f){if(typeof module==='object'&&module.exports)module.exports=f(require('./v6-content'),require('./diagnosis'),require('./phase3-report'),require('./resources'),require('./phase3-content'));else r.PiraV6=f(r.PiraV6Content,r.PiraDiagnosis,r.PiraReport,r.PiraResources,r.PiraExplanations);})(globalThis,function(C,D,Legacy,R,E){
'use strict';
const questions=C.questions,order=C.order,clone=x=>JSON.parse(JSON.stringify(x));
function evaluate(input){
 if(!input||input.answerContractVersion!==C.versions.answer||!Array.isArray(input.answers)||input.answers.length!==8||Object.keys(input).some(k=>!['answerContractVersion','answers'].includes(k)))throw Error('回答内容を確認してください');
 const byId={};
 for(const a of input.answers){if(!a||Object.keys(a).some(k=>!['questionId','answerId'].includes(k)))throw Error('回答内容を確認してください');const q=questions.find(q=>q.id===a.questionId);if(!q||byId[q.id]||!q.options.some(o=>o.id===a.answerId))throw Error('回答内容を確認してください');byId[q.id]=a.answerId;}
 const answers=questions.map(q=>({questionId:q.id,answerId:byId[q.id]}));
 const states=Object.fromEntries(questions.map(q=>[q.id,q.options.find(o=>o.id===byId[q.id]).state]));
 const eligible=order.filter(id=>states[id]!=='NOT_APPLICABLE');
 const priorityCandidates=eligible.filter(id=>['NOT_DONE','PARTIAL','UNKNOWN','DELEGATED'].includes(states[id]));
 const complementCandidates=eligible.filter(id=>states[id]==='READY');
 // Reuse the existing candidate-list -> ordered head slice -> overflow mechanism.
 const candidates=[...priorityCandidates,...complementCandidates],priorityThemeIds=candidates.slice(0,3);
 const summaryId=eligible.every(id=>states[id]==='READY')?'S1':eligible.every(id=>states[id]==='UNKNOWN')?'S2':'S3';
 return {answerContractVersion:C.versions.answer,ruleSetVersion:C.versions.rule,answers,states,priorityCandidates,complementCandidates,priorityThemeIds,deferredThemeIds:candidates.slice(3),excludedThemeIds:order.filter(id=>states[id]==='NOT_APPLICABLE'),summaryId};
}
function envelope(draft){return {answerContractVersion:C.versions.answer,answers:questions.filter(q=>draft[q.id]).map(q=>({questionId:q.id,answerId:draft[q.id]}))};}
const block=(id,text,kind='paragraph')=>({id,text,kind});
const audiences=['PIRA_UNION','MEMBER_COMPANY','ATLIB_GENERAL'];
function audience(value){return audiences.includes(value)?value:'PIRA_UNION';}
function materials(result){
 const map={T02:'MAIL',T03:'ACCOUNT',T04:'EDUCATION',T05:'CALENDAR',T06:'CALENDAR',T08:'INCIDENT'},ids=[];
 result.priorityThemeIds.forEach(t=>{if(map[t]&&!ids.includes(map[t]))ids.push(map[t]);});
 C.materials.forEach(m=>{if(!ids.includes(m.id))ids.push(m.id);});
 return ids.map(id=>{const m=C.materials.find(m=>m.id===id),file=R.items.find(m=>m.id===id);return {...clone(m),format:file.format,files:clone(file.files)};});
}
function report(result,target){
 const selectedAudience=audience(target),enterprise=selectedAudience!=='PIRA_UNION';
 const themes=result.priorityThemeIds.map(id=>{const t=C.themes[id],q=questions.find(q=>q.id===id),a=q.options.find(o=>o.id===result.answers.find(a=>a.questionId===id).answerId);
  return {id,title:t.title,answerId:a.id,blocks:[block(a.id+'-INTRO',a.intro),block(id+'-COMMON',t.common),block(a.id+'-CHECK',a.check,'check')]};});
 const resources=materials(result);
 const sections=[
  {key:'S1',title:E.titles[0],blocks:Legacy.incidentBlocks()},
  {key:'S2',title:E.titles[2],blocks:[block(result.summaryId,C.summary[result.summaryId])]},
  {key:'S3',title:E.titles[3],blocks:themes.flatMap(t=>[block(t.id+'-TITLE',t.title,'heading'),...t.blocks])},
  {key:'S4',title:E.titles[4],blocks:resources.flatMap(m=>[block(m.id+'-TITLE',m.title,'heading'),block(m.id+'-DESCRIPTION',m.description)])}
 ];
 const supplements=enterprise?[
  {key:'DNS',numbered:false,title:C.dns.title,blocks:C.dns.paragraphs.map((p,i)=>block('DNS-'+(i+1),p))},
  {key:'CONTACT',numbered:false,title:C.contact.title,blocks:[...C.contact.paragraphs.map((p,i)=>block('CONTACT-'+(i+1),p)),block('CONTACT-LABEL',C.contact.label)]}
 ]:[];
 const versions={...C.versions,incident:D.versions.contentVersion,materials:'PIRA-MATERIALS-V6-20261025.1'};
 const versionText='回答版 '+versions.answer+'／診断ルール版 '+versions.rule+'／事故・統計版 '+versions.incident+'／解説版 '+versions.content+'／レポート版 '+versions.report+'／表示版 '+versions.renderer+'／実務資料版 '+versions.materials+'／提供先 '+selectedAudience;
 const title='情報管理セルフチェック',intro='',disclaimer='atLIBによる提案用試作品です。PIRAの正式な主催・承認・推奨を示すものではありません。';
 return {title,intro,disclaimer,audience:selectedAudience,versions,versionText,sourceSha256:C.amendedSha256,sections,supplements,themes,resources,selectedTextIds:[...sections,...supplements].flatMap(s=>s.blocks.map(b=>b.id)),text:[title,intro,disclaimer,...[...sections,...supplements].flatMap(s=>[s.title,...s.blocks.map(b=>b.text)]),versionText].join('\n\n')};
}
async function snapshot(input,result,model){const canonicalInput={answerContractVersion:C.versions.answer,answers:result.answers};return {input:canonicalInput,result,report:model,versions:model.versions,sourceSha256:C.amendedSha256,inputHash:await D.hash(canonicalInput),resultHash:await D.hash(result),renderedContentHash:await D.hash(model),executionKey:await D.hash({input:canonicalInput,audience:model.audience,versions:model.versions,sourceSha256:C.amendedSha256})};}
return {questions,order,evaluate,envelope,report,materials,audience,audiences,snapshot,canonicalString:D.canonicalString,hash:D.hash,escapeHtml:D.escapeHtml};
});
