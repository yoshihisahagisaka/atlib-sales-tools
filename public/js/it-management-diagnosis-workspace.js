'use strict';
(() => {
 const el=id=>document.getElementById(id),node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 const id=new URLSearchParams(location.search).get('id');
 const base='/api/admin/it-management-diagnosis/cases/'+encodeURIComponent(id);
 const labels={FEEDBACK_STATEMENT:'経営フィードバックでの顧客発言',INTERVIEW_STATEMENT:'顧客発言',OPERATOR_NOTE:'担当者メモ',TRANSCRIPT:'会話記録',SCREEN_SHARED_INFORMATION:'画面共有の情報',DOCUMENT_EXISTENCE_OBSERVED:'資料等の存在を確認'};
 const stageLabels={"SURVEY_COMPLETED":"回答完了","PREPARATION_IN_PROGRESS":"診断準備中","READY_FOR_DIAGNOSIS":"確認内容確定","DIAGNOSIS_IN_PROGRESS":"確認・分析中","HUMAN_REVIEW_REQUIRED":"分析内容の確認待ち","REPORT_REVIEW_REQUIRED":"経営フィードバック資料作成待ち","REPORT_APPROVED":"経営フィードバック資料承認済み","FEEDBACK_PENDING":"経営フィードバック待ち","FEEDBACK_COMPLETED":"経営フィードバック完了","CLOSED":"完了"};
 let data=null,busy=false,poll=null,activePlan=null;
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
  el('review-link').href='/admin/it-management-diagnosis-review.html?id='+encodeURIComponent(id);
  el('review-link').hidden=!['HUMAN_REVIEW_REQUIRED','REPORT_REVIEW_REQUIRED','REPORT_APPROVED','FEEDBACK_PENDING','FEEDBACK_COMPLETED','CLOSED'].includes(data.diagnosis_status);
  el('company').textContent=data.organization_display_name;el('case-status').textContent=stageLabels[data.diagnosis_status]||'状況確認中';el('next-action').textContent=data.current_next_action.replaceAll('Future','目指している会社の姿').replaceAll('Human Review','分析内容の確認');
  el('session-time').textContent=data.started_at?'開始：'+new Date(data.started_at).toLocaleString('ja-JP')+(data.completed_at?' / 終了：'+new Date(data.completed_at).toLocaleString('ja-JP'):''):'';
  el('future').textContent=data.future?.statement||'';el('future-status').textContent=data.future?.intent_status==='INTERVIEW_RECONFIRMED'?'顧客の発言として再確認':'顧客の回答として記録';
  el('future-history').replaceChildren(...data.future_history.map(f=>node('p',`第${f.version}版 ${f.intent_status==='INTERVIEW_RECONFIRMED'?'顧客の発言として再確認':'顧客の回答として記録'}：${f.statement}${f.reconfirmed_by_user_id?' / '+f.reconfirmed_by_user_id:''}`)));
  el('themes').replaceChildren(...data.themes.map(t=>node('p',`${t.priority_order}. ${t.title} / ${t.future_relation}`)));
  el('plan-items').replaceChildren(...data.plan_items.map(p=>node('p',p.text)));
  el('confirmed-plan').replaceChildren(...(data.plan_snapshot_json?.plan_items||[]).map(p=>node('p',p.text)));
  options('statement-speaker',data.participants.map(p=>({id:p.id,text:p.name})),'話者を指定しない');
  options('statement-parent',data.sources.filter(s=>s.source_type==='TRANSCRIPT').map(s=>({id:s.id,text:s.content.slice(0,60)})),'元の会話記録なし');
  options('future-source',data.sources.filter(s=>['INTERVIEW_STATEMENT','TRANSCRIPT'].includes(s.source_type)).map(s=>({id:s.id,text:labels[s.source_type]+'：'+s.content.slice(0,60)})),'元の記録を選択');
  options('plan-theme',data.themes.map(t=>({id:t.id,text:t.title})),'案件全体');
  el('sources').replaceChildren(...data.sources.map(s=>{
   const card=node('section','');card.className='source-card';card.dataset.sourceId=s.id;
   card.append(node('h4',labels[s.source_type]));const raw=node('p',s.content);raw.className='diagnosis-raw';card.append(raw);
   const speaker=data.participants.find(p=>p.id===s.speaker_participant_id);
   card.append(node('p',`${speaker?'話者：'+speaker.name+' / ':''}入力：${s.entered_by_user_id} / ${new Date(s.created_at).toLocaleString('ja-JP')}`));
   if(s.source_type==='TRANSCRIPT') {
    if(s.purpose_completed_at) {
     card.append(node('p','取得目的完了：'+new Date(s.purpose_completed_at).toLocaleString('ja-JP')+' / 原則保持上限：'+new Date(new Date(s.purpose_completed_at).getTime()+90*86400000).toLocaleString('ja-JP')));
    } else {
     const label=node('label','取得目的が完了した日時：'),input=document.createElement('input');input.type='datetime-local';input.step='0.001';label.append(input);
     const button=node('button','取得目的の完了を記録');button.type='button';button.className='btn btn-secondary';
     button.onclick=()=>{
      const completed=new Date(input.value);
      if(!input.value||!Number.isFinite(completed.getTime())){error('取得目的が完了した日時を入力してください。');return;}
      if(window.confirm('このTranscriptの取得目的が完了したことを記録します。原則90日以内の保持上限が設定され、完了日時は変更できません。記録しますか？'))command('/sources/'+encodeURIComponent(s.id)+'/purpose-completion',{completedAt:completed.toISOString()});
     };
     card.append(node('p','取得目的の完了が未記録です。完了後に担当者が日時を記録してください。'),label,button);
    }
   }
   if(s.parent_source_record_id){const trace=node('details','');trace.append(node('summary','もとになった情報を見る'),node('p',data.sources.find(p=>p.id===s.parent_source_record_id)?.content||'元の会話記録を確認してください。'));card.append(trace);}return card;
  }));
  el('executions').replaceChildren(...data.executions.map(e=>node('p',({PENDING:'整理待ち',RUNNING:'整理中',SUCCEEDED:'整理完了',FAILED:'整理失敗'})[e.status]||'状況確認中')));
  const latest=data.executions[0];el('ai-status').textContent=latest?.status==='FAILED'?'AIの実行に失敗しました。再実行するか、AIなしで記録・診断終了を続けられます。':latest?.status==='SUCCEEDED'?'候補を確認してください。追加確認の価値がない場合は0件です。':latest?'確認候補を整理しています。対話の記録は続けられます。':'必要なときに担当者が実行してください。';
  el('suggestions').replaceChildren(...data.proposals.map(p=>{
   const s=p.content_json,card=node('section','');card.className='suggestion-card';card.dataset.proposalId=p.id;
   card.append(node('h3',({FOLLOW_UP:'追加で確認する候補',CLARIFY:'内容を明確にする候補',CHECK_UNKNOWN:'まだ分かっていない内容の確認候補',CHECK_CONTRADICTION:'一致していない情報の確認候補',NEW_THEME:'追加テーマの候補'})[s.suggestion_type]||'確認候補'),node('p',s.text),node('p','目的：'+s.purpose));
   const status={GENERATED:'未判断',UNDER_REVIEW:'後で確認',ACCEPTED:'今回確認する',REJECTED:'今回は確認しない'}[p.status];card.append(node('p','判断：'+status));
   const trace=node('details','');trace.append(node('summary','もとになった情報を見る'));
   for(const ref of s.source_refs) {
    const source=ref.source_ref_type==='SOURCE_RECORD'?data.sources.find(r=>r.id===ref.source_ref_id):data.responses.find(r=>r.id===ref.source_ref_id);
    const content=ref.source_ref_type==='SOURCE_RECORD'?source?.content:JSON.stringify(source?.raw_value_json);
    const label=ref.source_ref_type==='SOURCE_RECORD'?labels[source?.source_type]:'アンケートの生回答';
    trace.append(node('p',`${label||'元の情報'} / ${{SUPPORTS:'参考にした情報',CONTRADICTS:'一致していない情報',RELATED:'関連する情報'}[ref.relation]||'関連する情報'}`),node('p',content||'出典を再読み込みしてください。'));
   }
   card.append(trace);
   for(const [action,label] of [['ASK','今回確認する'],['LATER','後で確認する'],['UNNECESSARY','今回は確認しない']]) {
    const b=node('button',label);b.className='btn btn-secondary';b.dataset.blocked=String(!active()||!['GENERATED','UNDER_REVIEW'].includes(p.status));
    b.addEventListener('click',()=>command('/interview-assistant/proposals/'+encodeURIComponent(p.id)+'/resolve',{action}));card.append(b);
   }
   const decisions=data.resolutions.filter(r=>r.detail_json.proposal_id===p.id);
   for(const r of decisions)card.append(node('small',`${{ASK:'今回確認する',LATER:'後で確認',UNNECESSARY:'今回は確認しない'}[r.detail_json.action]||'担当者の判断'} / ${r.actor_user_id} / ${new Date(r.created_at).toLocaleString('ja-JP')}`));return card;
  }));controls();
 }
 async function load() {
  clearTimeout(poll);const next=await api('/workspace');data=next;render();window.dispatchEvent(new Event('diagnosis-data-loaded'));const plan=new URLSearchParams(location.search).get('plan');if(plan&&!activePlan&&active()){const p=data.plan_items.find(p=>p.id===plan);if(p)selectPlan(p);}
  if(data.executions.some(e=>['PENDING','RUNNING'].includes(e.status)))poll=setTimeout(()=>{if(!busy)load().catch(e=>error(e.message));},1500);
 }
 el('refresh').onclick=()=>{if(!busy)load().catch(e=>error(e.message));};
 el('start').onclick=()=>command('/diagnosis/start',{expectedVersion:data.version});
 el('finish').onclick=()=>{if(window.confirm('対話の記録を保存済みであることを確認し、診断を終了しますか？未確認事項は残したまま分析内容を確認する進みます。'))command('/diagnosis/finish',{expectedVersion:data.version});};
 el('run-ai').onclick=()=>command('/interview-assistant/run',{});
 const saveSource=(form,key,path,extras=()=>({}))=>{el(form).onsubmit=e=>{e.preventDefault();command('/sources/'+path,{content:el(key).value,...extras()},()=>el(form).reset());};};
 el('statement-form').onsubmit=e=>{e.preventDefault();command(activePlan?'/progressive-reuse/plan-items/'+encodeURIComponent(activePlan.id)+'/statements':'/sources/interview-statements',{content:el('statement-content').value,speaker_participant_id:el('statement-speaker').value||null,parent_source_record_id:el('statement-parent').value||null},()=>{el('statement-form').reset();activePlan=null;document.getElementById('selected-confirmation')?.remove();});};
 saveSource('note-form','note-content','operator-notes');saveSource('transcript-form','transcript-content','transcripts');
 saveSource('evidence-form','evidence-content','evidence-existence',()=>({voluntarily_presented:el('evidence-voluntary').checked}));
 el('future-form').onsubmit=e=>{e.preventDefault();if(window.confirm('この顧客発言をもとにFutureを再確認したと記録しますか？'))command('/future/reconfirm',{statement:el('future-statement').value,time_horizon:el('future-horizon').value||null,source_record_id:el('future-source').value,expectedVersion:data.version},()=>el('future-form').reset());};
 el('theme-form').onsubmit=e=>{e.preventDefault();command('/workspace/themes',{title:el('theme-title').value,future_relation:el('theme-relation').value},()=>el('theme-form').reset());};
 el('plan-form').onsubmit=e=>{e.preventDefault();command('/workspace/plan-items',{text:el('plan-text').value,item_type:'QUESTION',diagnosis_theme_id:el('plan-theme').value||null},()=>el('plan-form').reset());};
 window.addEventListener('beforeunload',e=>{if([...document.querySelectorAll('textarea')].some(n=>n.value.trim())){e.preventDefault();e.returnValue='';}});
 function selectPlan(p){
  if(!active())return;
  if(el('statement-content').value.trim()&&activePlan?.id!==p.id){error('入力中の発言を保存してから確認内容を切り替えてください。');return;}
  activePlan=p;let hint=document.getElementById('selected-confirmation');if(!hint){hint=node('p','');hint.id='selected-confirmation';el('statement-form').prepend(hint);}
  hint.textContent='今回確認する内容：'+p.text+'。下には質問文ではなく、お客様が話した内容を記録してください。';
  const url=new URL(location.href);url.searchParams.delete('plan');history.replaceState(null,'',url);
  el('statement-content').focus();el('statement-form').scrollIntoView({block:'center'});
 }
 window.addEventListener('reuse-record',e=>selectPlan(e.detail));
 window.addEventListener('reuse-changed',()=>load().catch(e=>error(e.message)));
 load().catch(e=>error(e.message));
})();
