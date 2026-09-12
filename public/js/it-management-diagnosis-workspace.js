'use strict';
(() => {
 const el=id=>document.getElementById(id),node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 const id=new URLSearchParams(location.search).get('id');
 const base='/api/admin/it-management-diagnosis/cases/'+encodeURIComponent(id);
 const labels={INTERVIEW_STATEMENT:'顧客発言',OPERATOR_NOTE:'担当者メモ',TRANSCRIPT:'Transcript',SCREEN_SHARED_INFORMATION:'画面共有の情報',DOCUMENT_EXISTENCE_OBSERVED:'Evidence存在観察'};
 let data=null,busy=false,poll=null;
 el('back').href='/admin/it-management-diagnosis-detail.html?id='+encodeURIComponent(id);
 el('preparation-link').href='/admin/it-management-diagnosis-preparation.html?id='+encodeURIComponent(id);
 const error=message=>{el('workspace-error').textContent=message;el('workspace-error').hidden=!message;};
 async function api(path,body) {
  const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Diagnosis-Command':'1'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
  if(r.status===401)throw new Error('ログインの有効期限が切れました。管理画面にログインし直してください。');
  const result=r.status===204?null:await r.json();if(!r.ok)throw new Error(result.error||'操作に失敗しました。');return result;
 }
 const active=()=>data?.diagnosis_status==='DIAGNOSIS_IN_PROGRESS';
 function controls() {
  document.querySelectorAll('.editable').forEach(n=>{n.hidden=!active();});
  document.querySelectorAll('button').forEach(n=>{n.disabled=busy||n.dataset.blocked==='true';});
  el('start').disabled=busy||data?.diagnosis_status!=='READY_FOR_DIAGNOSIS';el('finish').disabled=busy||!active();
  el('run-ai').disabled=busy||!active()||data?.executions.some(e=>['PENDING','RUNNING'].includes(e.status));
 }
 async function command(path,body,after) {
  if(busy)return;busy=true;clearTimeout(poll);error('');controls();
  try {await api(path,body);if(after)after();await load();}catch(e){error(e.message);}finally{busy=false;controls();}
 }
 function options(key,items,empty) {
  const select=el(key),value=select.value;select.replaceChildren();
  const first=node('option',empty);first.value='';select.append(first);
  items.forEach(item=>{const n=node('option',item.text);n.value=item.id;select.append(n);});select.value=items.some(i=>i.id===value)?value:'';
 }
 function render() {
  el('company').textContent=data.organization_display_name;el('case-status').textContent=data.diagnosis_status;el('next-action').textContent=data.current_next_action;
  el('session-time').textContent=data.started_at?'開始：'+new Date(data.started_at).toLocaleString('ja-JP')+(data.completed_at?' / 終了：'+new Date(data.completed_at).toLocaleString('ja-JP'):''):'';
  el('future').textContent=data.future?.statement||'';el('future-status').textContent=data.future?.intent_status||'';
  el('future-history').replaceChildren(...data.future_history.map(f=>node('p',`v${f.version} ${f.intent_status}：${f.statement}${f.reconfirmed_by_user_id?' / '+f.reconfirmed_by_user_id:''}`)));
  el('themes').replaceChildren(...data.themes.map(t=>node('p',`${t.priority_order}. ${t.title} / ${t.future_relation}`)));
  el('plan-items').replaceChildren(...data.plan_items.map(p=>node('p',`${p.item_type}：${p.text}`)));
  el('confirmed-plan').replaceChildren(...(data.plan_snapshot_json?.plan_items||[]).map(p=>node('p',p.text)));
  options('statement-speaker',data.participants.map(p=>({id:p.id,text:p.name})),'話者を指定しない');
  options('statement-parent',data.sources.filter(s=>s.source_type==='TRANSCRIPT').map(s=>({id:s.id,text:s.content.slice(0,60)})),'元Transcriptなし');
  options('future-source',data.sources.filter(s=>['INTERVIEW_STATEMENT','TRANSCRIPT'].includes(s.source_type)).map(s=>({id:s.id,text:labels[s.source_type]+'：'+s.content.slice(0,60)})),'元の記録を選択');
  options('plan-theme',data.themes.map(t=>({id:t.id,text:t.title})),'案件全体');
  el('sources').replaceChildren(...data.sources.map(s=>{
   const card=node('section','');card.className='source-card';card.dataset.sourceId=s.id;
   card.append(node('h4',labels[s.source_type]));const raw=node('p',s.content);raw.className='diagnosis-raw';card.append(raw);
   const speaker=data.participants.find(p=>p.id===s.speaker_participant_id);
   card.append(node('p',`${speaker?'話者：'+speaker.name+' / ':''}入力：${s.entered_by_user_id} / ${new Date(s.created_at).toLocaleString('ja-JP')}`));
   if(s.parent_source_record_id)card.append(node('p','元記録：'+s.parent_source_record_id));card.append(node('small','Source ID: '+s.id));return card;
  }));
  el('executions').replaceChildren(...data.executions.map(e=>node('p',`${e.status}${e.error_code?' / '+e.error_code:''}`)));
  const latest=data.executions[0];el('ai-status').textContent=latest?.status==='FAILED'?'AIの実行に失敗しました。再実行するか、AIなしで記録・診断終了を続けられます。':latest?.status==='SUCCEEDED'?'候補を確認してください。追加確認の価値がない場合は0件です。':latest?'確認候補を整理しています。対話の記録は続けられます。':'必要なときに担当者が実行してください。';
  el('suggestions').replaceChildren(...data.proposals.map(p=>{
   const s=p.content_json,card=node('section','');card.className='suggestion-card';card.dataset.proposalId=p.id;
   card.append(node('h3',s.suggestion_type),node('p',s.text),node('p','目的：'+s.purpose));
   const status={GENERATED:'未判断',UNDER_REVIEW:'Later',ACCEPTED:'Ask',REJECTED:'Unnecessary'}[p.status];card.append(node('p','判断：'+status));
   const trace=node('details','');trace.append(node('summary','出典を見る'));
   for(const ref of s.source_refs) {
    const source=ref.source_ref_type==='SOURCE_RECORD'?data.sources.find(r=>r.id===ref.source_ref_id):data.responses.find(r=>r.id===ref.source_ref_id);
    const content=ref.source_ref_type==='SOURCE_RECORD'?source?.content:JSON.stringify(source?.raw_value_json);
    const label=ref.source_ref_type==='SOURCE_RECORD'?labels[source?.source_type]:'アンケートの生回答';
    trace.append(node('p',`${label||ref.source_ref_type} / ${ref.source_ref_type} / ${ref.relation} / ${ref.source_ref_id}`),node('p',content||'出典を再読み込みしてください。'));
   }
   card.append(trace);
   for(const [action,label] of [['ASK','Ask（質問する）'],['LATER','Later（後で確認）'],['UNNECESSARY','Unnecessary（今回は不要）']]) {
    const b=node('button',label);b.className='btn btn-secondary';b.dataset.blocked=String(!active()||!['GENERATED','UNDER_REVIEW'].includes(p.status));
    b.addEventListener('click',()=>command('/interview-assistant/proposals/'+encodeURIComponent(p.id)+'/resolve',{action}));card.append(b);
   }
   const decisions=data.resolutions.filter(r=>r.detail_json.proposal_id===p.id);
   for(const r of decisions)card.append(node('small',`${r.detail_json.action} / ${r.actor_user_id} / ${new Date(r.created_at).toLocaleString('ja-JP')}`));return card;
  }));controls();
 }
 async function load() {
  clearTimeout(poll);const next=await api('/workspace');data=next;render();
  if(data.executions.some(e=>['PENDING','RUNNING'].includes(e.status)))poll=setTimeout(()=>{if(!busy)load().catch(e=>error(e.message));},1500);
 }
 el('refresh').onclick=()=>{if(!busy)load().catch(e=>error(e.message));};
 el('start').onclick=()=>command('/diagnosis/start',{expectedVersion:data.version});
 el('finish').onclick=()=>{if(window.confirm('対話の記録を保存済みであることを確認し、診断を終了しますか？未確認事項は残したままHuman Reviewへ進みます。'))command('/diagnosis/finish',{expectedVersion:data.version});};
 el('run-ai').onclick=()=>command('/interview-assistant/run',{});
 const saveSource=(form,key,path,extras=()=>({}))=>{el(form).onsubmit=e=>{e.preventDefault();command('/sources/'+path,{content:el(key).value,...extras()},()=>el(form).reset());};};
 saveSource('statement-form','statement-content','interview-statements',()=>({speaker_participant_id:el('statement-speaker').value||null,parent_source_record_id:el('statement-parent').value||null}));
 saveSource('note-form','note-content','operator-notes');saveSource('transcript-form','transcript-content','transcripts');
 saveSource('evidence-form','evidence-content','evidence-existence',()=>({voluntarily_presented:el('evidence-voluntary').checked}));
 el('future-form').onsubmit=e=>{e.preventDefault();if(window.confirm('この顧客発言をもとにFutureを再確認したと記録しますか？'))command('/future/reconfirm',{statement:el('future-statement').value,time_horizon:el('future-horizon').value||null,source_record_id:el('future-source').value,expectedVersion:data.version},()=>el('future-form').reset());};
 el('theme-form').onsubmit=e=>{e.preventDefault();command('/workspace/themes',{title:el('theme-title').value,future_relation:el('theme-relation').value},()=>el('theme-form').reset());};
 el('plan-form').onsubmit=e=>{e.preventDefault();command('/workspace/plan-items',{text:el('plan-text').value,item_type:'QUESTION',diagnosis_theme_id:el('plan-theme').value||null},()=>el('plan-form').reset());};
 window.addEventListener('beforeunload',e=>{if([...document.querySelectorAll('textarea')].some(n=>n.value.trim())){e.preventDefault();e.returnValue='';}});
 load().catch(e=>error(e.message));
})();
