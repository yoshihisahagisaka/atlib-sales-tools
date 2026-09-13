'use strict';
(() => {
 const el=id=>document.getElementById(id),node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 const id=new URLSearchParams(location.search).get('id'),base='/api/admin/it-management-diagnosis/cases/'+encodeURIComponent(id);
 let data,busy=false,timer,selectedId=null,editing=null;
 el('back').href='/admin/it-management-diagnosis-detail.html?id='+encodeURIComponent(id);el('review-link').href='/admin/it-management-diagnosis-review.html?id='+encodeURIComponent(id);
 const selected=()=>data?.reports.find(r=>r.id===selectedId)||data?.reports[0];
 const editable=()=>data?.diagnosis_status==='REPORT_REVIEW_REQUIRED'&&selected()?.id===data?.reports[0]?.id&&['DRAFT','REVIEW_REQUIRED','REVISION_REQUIRED'].includes(selected()?.status);
 function error(text){el('report-error').textContent=text;el('report-error').hidden=!text;}
 function controls(){document.querySelectorAll('button').forEach(b=>{b.disabled=busy||b.dataset.blocked==='true';});el('tab-assessment').disabled=true;
  el('run-ai').disabled=busy||data?.diagnosis_status!=='REPORT_REVIEW_REQUIRED'||data?.executions.some(e=>['PENDING','RUNNING'].includes(e.status));
  el('manual').disabled=busy||data?.diagnosis_status!=='REPORT_REVIEW_REQUIRED';el('request-revision').disabled=busy||!editable();
  el('approve').disabled=busy||!editable()||selected()?.status==='REVISION_REQUIRED';el('deliver').disabled=busy||data?.diagnosis_status!=='REPORT_APPROVED'||selected()?.id!==data?.reports[0]?.id||selected()?.status!=='APPROVED';
  el('reissue').disabled=busy||!['REPORT_APPROVED','FEEDBACK_PENDING','FEEDBACK_COMPLETED'].includes(data?.diagnosis_status);el('print').disabled=busy||!selected();
  el('start-feedback').disabled=busy||data?.diagnosis_status!=='FEEDBACK_PENDING'||!!data?.feedback_started_at;
  const feedbackActive=data?.diagnosis_status==='FEEDBACK_PENDING'&&data?.feedback_started_at;el('save-feedback').disabled=busy||!feedbackActive;el('complete-feedback').disabled=busy||!feedbackActive;
 }
 async function api(path,body){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Diagnosis-Command':'1'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});if(r.status===401)throw Error('管理画面にログインし直してください。');const result=r.status===204?null:await r.json();if(!r.ok)throw Error(result.error||'操作に失敗しました。');return result;}
 async function command(path,body,after){if(busy)return;busy=true;clearTimeout(timer);error('');controls();try{const result=await api(path,body);if(result?.id&&path.startsWith('/report/')&&path!=='/report/wording')selectedId=result.id;if(after)after();await load();}catch(e){error(e.message==='REPORT_MEANING_CHANGE_REQUIRES_REVIEW'?'承認済みInsightの意味を変える編集は保存できません。修正依頼からHuman Reviewへ戻してください。':e.message);}finally{busy=false;controls();}}
 const target=()=>({report_id:selected().id,expectedVersion:data.version});
 function render(){
  el('company').textContent=data.context.organization_display_name;el('case-status').textContent=data.diagnosis_status;el('next-action').textContent=data.current_next_action;
  el('report-version').replaceChildren(...data.reports.map(r=>{const n=node('option',`v${r.version} / ${r.status}`);n.value=r.id;return n;}));const report=selected();selectedId=report?.id||null;el('report-version').value=selectedId||'';
  const context=report?.snapshot_json||report?.context_json||data.context;
  el('report-company').textContent=context.organization_display_name;el('report-future-status').textContent=context.future?.intent_status||'';
  el('print-report-status').textContent=report?`Report v${report.version} / 本文version ${report.content_version} / ${report.approved_at?'承認済み（'+new Date(report.approved_at).toLocaleString('ja-JP')+'）':'未承認Draft'}`:'Draft未作成';
  el('report-status').textContent=report?`Report v${report.version} / ${report.status}`:'Draft未作成';el('content-version').textContent=report?`本文version ${report.content_version}`:'';
  el('report-sections').replaceChildren(...(report?.content_json.sections||[]).map(s=>{const section=node('section','');section.append(node('h2',s.title));for(const b of s.blocks){const card=node('section','');card.className='report-block';card.dataset.blockId=b.block_id;card.append(node('p',b.text));
   const trace=node('details','');trace.className='no-print';trace.append(node('summary','承認済みInsight・Contextの参照'));
   for(const ref of b.insight_refs){const i=context.insights.find(i=>i.id===ref);trace.append(node('p',i?`${i.semantic_type} / v${i.version} / ${i.id}\n${i.content}`:'この版の参照を確認してください。'));}
   for(const ref of b.assessment_refs){const a=context.assessment_confirmation_items.find(a=>a.id===ref);trace.append(node('p',a?`Assessment確認項目 / ${a.id}\n${a.title} / ${a.purpose}`:'参照を確認してください。'));}
   if(b.block_type==='FUTURE')trace.append(node('p',`Future v${context.future.version} / ${context.future.id} / ${context.future.intent_status}`));card.append(trace);
   const button=node('button','表現を調整する');button.className='btn btn-secondary no-print';button.dataset.blocked=String(!editable());button.onclick=()=>{editing=b.block_id;el('wording-text').value=b.text;el('wording-editor').hidden=false;el('wording-editor').scrollIntoView();};card.append(button);section.append(card);
  }return section;}));
  el('approval-info').textContent=report?.approved_at?`承認：${report.snapshot_json.approved_by} / ${new Date(report.approved_at).toLocaleString('ja-JP')}${report.delivered_at?' / 送付記録：'+new Date(report.delivered_at).toLocaleString('ja-JP'):''}`:'';el('snapshot').textContent=report?.snapshot_json?JSON.stringify(report.snapshot_json,null,2):'未承認';
  const latest=data.executions[0];el('ai-status').textContent=latest?.status==='FAILED'?'AI Draft生成に失敗しました。再実行するか、AIなしでDraftを作成できます。':latest?.status==='SUCCEEDED'?'Draftを確認し、担当者として承認してください。':latest?'Draft生成中です。Human-onlyの作成も可能です。':'AIを使わずに承認済みContextから作成することもできます。';el('executions').replaceChildren(...data.executions.map(e=>node('p',`${e.status}${e.error_code?' / '+e.error_code:''}`)));
  const speaker=el('feedback-speaker').value;el('feedback-speaker').replaceChildren();const blank=node('option','話者を指定しない');blank.value='';el('feedback-speaker').append(blank);for(const p of data.participants){const n=node('option',p.name);n.value=p.id;el('feedback-speaker').append(n);}el('feedback-speaker').value=speaker;
  el('feedback-status').textContent=`${data.diagnosis_status} / 対象Report：${data.feedback_report_id||'未送付'}${data.feedback_started_at?' / 開始：'+new Date(data.feedback_started_at).toLocaleString('ja-JP'):''}${data.feedback_completed_at?' / 完了：'+new Date(data.feedback_completed_at).toLocaleString('ja-JP'):''}`;
  el('feedback-sources').replaceChildren(...data.feedback.map(s=>{const card=node('section','');card.append(node('h3','Feedback発言（Raw Source）'),node('p',s.content),node('p',`話者：${data.participants.find(p=>p.id===s.speaker_participant_id)?.name||'未指定'} / 入力：${s.entered_by_user_id} / Report：${s.feedback_report_id}`));return card;}));if(!editable())el('wording-editor').hidden=true;controls();
 }
 async function load(){clearTimeout(timer);const followLatest=!selectedId||selectedId===data?.reports[0]?.id;data=await api('/report');if(followLatest)selectedId=data.reports[0]?.id||null;render();if(data.executions.some(e=>['PENDING','RUNNING'].includes(e.status)))timer=setTimeout(()=>{if(!busy)load().catch(e=>error(e.message));},1500);}
 for(const tab of ['report','feedback'])el('tab-'+tab).onclick=()=>{for(const t of ['report','feedback']){el(t+'-tab').hidden=t!==tab;el('tab-'+t).setAttribute('aria-selected',String(t===tab));el('tab-'+t).classList.toggle('btn-secondary',t!==tab);}};
 el('refresh').onclick=()=>{if(!busy)load().catch(e=>error(e.message));};el('report-version').onchange=()=>{selectedId=el('report-version').value;editing=null;el('wording-editor').hidden=true;render();};
 el('manual').onclick=()=>command('/report/manual',{expectedVersion:data.version});el('run-ai').onclick=()=>command('/report/ai/run',{});el('print').onclick=()=>window.print();
 el('wording-form').onsubmit=e=>{e.preventDefault();command('/report/wording',{...target(),blocks:[{block_id:editing,text:el('wording-text').value}]},()=>{editing=null;el('wording-editor').hidden=true;el('wording-form').reset();});};el('cancel-wording').onclick=()=>{editing=null;el('wording-editor').hidden=true;el('wording-form').reset();};
 el('revision-form').onsubmit=e=>{e.preventDefault();command('/report/revision-request',{...target(),reason:el('revision-reason').value,return_to_review:el('return-review').checked},()=>el('revision-form').reset());};
 el('approve').onclick=()=>{if(window.confirm('このReportを承認し、本文と参照Contextのsnapshotを固定しますか？'))command('/report/approve',target());};
 el('deliver').onclick=()=>{if(window.confirm('このReportは顧客へ送付済みですか？送付済みとして記録します。'))command('/report/deliver',target());};
 el('reissue-form').onsubmit=e=>{e.preventDefault();command('/report/reissue',{expectedVersion:data.version,reason:el('reissue-reason').value},()=>el('reissue-form').reset());};
 el('start-feedback').onclick=()=>command('/feedback/start',{expectedVersion:data.version});el('feedback-form').onsubmit=e=>{e.preventDefault();command('/feedback/statements',{content:el('feedback-content').value,speaker_participant_id:el('feedback-speaker').value||null},()=>el('feedback-form').reset());};
 el('complete-feedback').onclick=()=>{if(window.confirm('発言を保存済みであることを確認し、Feedbackを完了しますか？'))command('/feedback/complete',{expectedVersion:data.version});};
 window.addEventListener('beforeunload',e=>{if([...document.querySelectorAll('textarea')].some(n=>n.value.trim())){e.preventDefault();e.returnValue='';}});load().catch(e=>error(e.message));
})();
