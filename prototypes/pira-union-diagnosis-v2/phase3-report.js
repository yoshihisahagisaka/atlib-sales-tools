(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./diagnosis.js'),require('./data.js'),require('./phase3-content.js'),require('./resources.js'));else root.PiraReport=factory(root.PiraDiagnosis,root.PiraContent,root.PiraExplanations,root.PiraResources);})(typeof globalThis!=='undefined'?globalThis:this,function(D,C,E,R){
'use strict';
const block=(id,text,kind='paragraph')=>({id,text,kind});
function build(r){
 const a=Object.fromEntries(r.normalizedAnswers.map(x=>[x.questionId,x]));
 const controls=r.currentStates.filter(x=>!['C01','C02'].includes(x.questionId));
 const ready=controls.some(x=>x.state==='REPORTED_READY'),open=r.candidateThemeIds.length>0;
 const summary=[];const add=id=>summary.push(block('S03-'+id,E.summary[id]));
 const reportedReady=id=>a[id].responseState==='ANSWERED'&&a[id].optionIds[0]==='READY';
 const adminReady=reportedReady('C03')&&reportedReady('C04'),techReady=reportedReady('C05')&&reportedReady('C06');
 if(ready)add(adminReady&&techReady?'READY_COMBINED':adminReady?'READY_ADMIN':techReady?'READY_TECH':open?'READY_MIXED':'READY_ONLY');else if(open)add('OPEN_ONLY');
 if(open){const domains=[['DATA',['T01','T02']],['SYSTEM',['T03','T04','T05','T06']],['CONTACT',['T07','T08']]].filter(([,ids])=>ids.some(id=>r.candidateThemeIds.includes(id))).map(([name])=>name);add('FOCUS_'+domains.join('_'));}
 if(r.unknownQuestionIds.length)add('UNKNOWN');
 if(r.authorityQuestionIds.length)add('AUTHORITY');
 if(r.notApplicableQuestionIds.length)add('NA');
 if(a.C07.responseState==='UNKNOWN')add('RECOVERY_UNKNOWN');
 if(a.C07.optionIds[0]==='READY')add('RECOVERY_READY');
 if(!summary.length)add('LIMITED');
 if(r.deferredThemeIds.length)add('OVERFLOW');
 const business=a.C01.responseState==='ANSWERED'?r.businessIds.map(id=>D.questions[0].options.find(o=>o.id===id).label).join('、'):null;
 const info=a.C02.responseState==='ANSWERED'?r.informationIds.filter(id=>id!=='NONE').map(id=>D.questions[1].options.find(o=>o.id===id).label).join('、'):null;
 const operations=[block('S02-BUSINESS-'+a.C01.responseState,business?'今回選ばれた業務は、'+business+'です。':'現在行っている業務の範囲を、事務局内で確認してみましょう。'),block('S02-INFO-'+(info?'SELECTED':a.C02.responseState),info?'日々の業務で、'+info+'を扱っていると回答されています。誰と受け渡し、どこに保管し、担当者が変わるときにどう引き継ぐかを整理することが、日々の仕事と情報管理をつなぐ手がかりになります。':a.C02.optionIds.includes('NONE')?'今回挙げた情報は扱っていないと回答されています。業務や情報の扱いが変わったときに、管理方法を改めて確認しましょう。':'扱っている情報の種類は、担当者と一緒に確認してみましょう。資料や記録の種類が分かると、送付や保管の手順も整理しやすくなります。')];
 const themes=r.priorityThemeIds.map(id=>{const t=D.themes.find(t=>t.id===id),c=E.themes[id];
  const blocks=[block(id+'-COMMON',c.common)];
  for(const q of r.themeEvidence[id]){const value=a[q].optionIds[0];blocks.push(block(id+'-'+q+'-'+value,id==='T02'?E.sending[q][value]:c[value==='PARTIAL'?'partial':'notDone']));}
  for(const b of r.businessIds){const text=E.examples[b]?.[id];if(text)blocks.push(block(id+'-EXAMPLE-'+b,text,'example'));}
  blocks.push(block(id+'-CHECK',c.check,'check'));return {id,title:t.title,blocks};
 });
 const confirmation=themes.flatMap(t=>[block(t.id+'-TITLE',t.title,'heading'),...t.blocks]);
 if(!themes.length){const id=r.status==='CONFIRMATION_PENDING'?'ZERO_PENDING':r.notApplicableQuestionIds.length?'ZERO_NA':'ZERO_READY';confirmation.push(block('S04-'+id,E.summary[id]));}
 const resources=selectResources(r);
 const sourceBlocks=C.sourceCards.filter(c=>c.verified).flatMap(c=>[
  block(c.id+'-TITLE',c.title,'heading'),block(c.id+'-SUMMARY',c.summary),block(c.id+'-COUNT',c.countMeaning),block(c.id+'-LIMIT',c.limitations),block(c.id+'-SOURCE','出典：'+c.publisher+'／公表：'+c.publicationDate+(c.publicationDatePrecision==='MONTH'?'（年月確認）':'')+'／対象・期間：'+c.eventPeriod+'／確認日：'+c.confirmedAt,'source'),block(c.id+'-URL',c.url,'source'),block(c.id+'-VERSION','事故・統計コンテンツ版：'+c.contentVersion,'source')]);
 sourceBlocks.push(block('S01-NOTE','これらは公表された事例・統計です。PIRA会員の事故件数や、個別の組合の被害確率を示すものではありません。2025年の集計・公表事例を用いています。'));
 const resourceBlocks=resources.flatMap(x=>[block(x.id+'-TITLE',x.title,'heading'),block(x.id+'-DESCRIPTION',x.description),block(x.id+'-FORMAT',x.format+'／'+x.files.map(f=>f.label).join('・'),'source')]);
 resourceBlocks.push(block('RESOURCE-ALL','今回紹介した資料のほかにも、実務資料一覧で全5種類をご覧いただけます。必要なものを日々の業務に合わせてお使いください。'));
 const sections=[sourceBlocks,operations,summary,confirmation,resourceBlocks].map((blocks,i)=>({key:'S'+(i+1),title:E.titles[i],blocks}));
 const versions={answer:r.answerContractVersion,rule:r.ruleSetVersion,incident:r.contentVersion,explanation:E.version,report:E.reportVersion,renderer:E.rendererVersion,resources:R.version};
 const versionText='回答版 '+versions.answer+'／診断ルール版 '+versions.rule+'／事故・統計版 '+versions.incident+'／解説版 '+versions.explanation+'／レポート版 '+versions.report+'／表示版 '+versions.renderer+'／実務資料版 '+versions.resources;
 const intro='ご回答をもとに、組合の情報管理の取り組みと、担当者と確認しておきたいことを整理しました。';
 const disclaimer='atLIBによる提案用試作品です。PIRAの正式な主催・承認・推奨を示すものではありません。';
 return {title:'組合の情報管理セルフチェック',intro,disclaimer,versions,versionText,sections,themes,resources,selectedTextIds:sections.flatMap(s=>s.blocks.map(b=>b.id)),text:[intro,disclaimer,...sections.flatMap(s=>[s.title,...s.blocks.map(b=>b.text)]),versionText].join('\n\n')};
}
function selectResources(r){
 const ids=[];const pick=id=>{if(!ids.includes(id))ids.push(id);};
 // Prefer selected themes, then pending questions, then ongoing work. No product recommendation.
 const map={T01:'CALENDAR',T02:'MAIL',T03:'ACCOUNT',T04:'EDUCATION',T05:'CALENDAR',T06:'CALENDAR',T07:'EDUCATION',T08:'INCIDENT'};
 r.priorityThemeIds.forEach(id=>pick(map[id]));
 if(r.unknownQuestionIds.length+r.authorityQuestionIds.length)pick('CALENDAR');
 if(r.businessIds.includes('MEMBERSHIP'))pick('MAIL');
 pick('EDUCATION');pick('CALENDAR');
 return ids.slice(0,3).map(id=>R.items.find(x=>x.id===id));
}
return {build,selectResources};
});
