'use strict';
(() => {
  const el = id => document.getElementById(id);
  const id = new URLSearchParams(location.search).get('id');
  const base = `/api/admin/it-management-diagnosis/cases/${encodeURIComponent(id)}`;
  const labels = { SURVEY_COMPLETED: 'アンケート回答完了', PREPARATION_IN_PROGRESS: '診断準備中', READY_FOR_DIAGNOSIS: '診断Plan確定', DIAGNOSIS_IN_PROGRESS: '診断中', HUMAN_REVIEW_REQUIRED: 'Human Review待ち', REPORT_REVIEW_REQUIRED: 'Report作成待ち', REPORT_APPROVED: 'Report承認済み', FEEDBACK_PENDING: 'Feedback待ち', FEEDBACK_COMPLETED: 'Feedback完了', CLOSED: '完了' };
  const types = { THEME: '重点テーマ', QUESTION: '質問', UNKNOWN: '未確認', HYPOTHESIS: '仮説', EVIDENCE_CANDIDATE: 'Evidence確認候補' };
  const statusLabels = { GENERATED: '未レビュー', UNDER_REVIEW: 'レビュー中', ACCEPTED: '採用済み', ACCEPTED_WITH_EDIT: '編集して採用済み', REJECTED: '却下済み' };
  let state, overview, timer, busy = false, themeEdit = null, planEdit = null;
  const node = (tag,text) => { const n = document.createElement(tag); n.textContent = text; return n; };
  const editing = () => state?.diagnosis_status === 'PREPARATION_IN_PROGRESS';
  const pending = () => state?.executions.some(e => ['PENDING','RUNNING'].includes(e.status));
  const error = message => { el('preparation-error').textContent = message; el('preparation-error').hidden = !message; };
  async function api(path,method='GET',body) {
    const res = await fetch(base+path,{ method,headers: { 'Content-Type':'application/json','X-Diagnosis-Command':'1' },cache:'no-store',body: body === undefined ? undefined : JSON.stringify(body) });
    const data = res.status === 204 ? null : await res.json();
    if (!res.ok) throw new Error(res.status === 401 ? 'ログインの有効期限が切れました。別タブで管理画面にログインして再度お試しください。' : data.error || '操作に失敗しました。');
    return data;
  }
  async function action(path,body={},after) {
    if (busy) return; busy = true; error(''); controls();
    try { await api('/preparation'+path,'POST',body); if (after) after(); await load(); }
    catch (e) { error(e.message); }
    finally { busy = false; controls(); }
  }
  function button(text,fn,disabled=false) {
    const b = node('button',text); b.type='button'; b.className='btn btn-secondary'; b.disabled=disabled || busy;
    b.dataset.blocked=String(disabled);
    b.addEventListener('click',fn); return b;
  }
  function controls() {
    el('start').disabled = busy || state?.diagnosis_status !== 'SURVEY_COMPLETED';
    el('run-ai').disabled = busy || pending() || !['SURVEY_COMPLETED','PREPARATION_IN_PROGRESS'].includes(state?.diagnosis_status);
    el('confirm').disabled = busy || !editing() || !state.themes.length || !state.plan_items.length;
    el('human-editor').hidden = !editing();
    el('human-editor').querySelectorAll('input,textarea,button,select').forEach(n => { n.disabled = busy; });
    if (planEdit?.lockType) el('plan-type').disabled = true;
    document.querySelectorAll('button[data-blocked]').forEach(b=>{ b.disabled=busy || b.dataset.blocked==='true'; });
  }
  function resetTheme() { themeEdit=null; el('theme-form').reset(); el('theme-form-title').textContent='テーマを追加'; }
  function resetPlan() { planEdit=null; el('plan-form').reset(); el('plan-type').disabled=false; el('plan-form-title').textContent='確認項目を追加'; }
  function editTheme(t,proposal=false) {
    themeEdit={ id:t.id,proposal };
    const c = proposal ? t.content_json : t;
    el('theme-title').value=t.title; el('theme-relation').value=c.future_relation; el('theme-description').value=proposal ? c.why_it_matters : c.description || '';
    el('theme-form-title').textContent=proposal ? 'AI原文を保持して編集採用' : '採用・作成済みテーマを編集'; el('theme-form').scrollIntoView(); el('theme-title').focus();
  }
  function editPlan(p,proposal=false) {
    const type=proposal ? p.proposal_type==='QUESTION' ? 'QUESTION' : p.proposal_type==='EVIDENCE_CANDIDATE' ? 'EVIDENCE_CANDIDATE_CHECK' : 'CONFIRMATION' : p.item_type;
    const c=proposal ? p.content_json : p;
    planEdit={ id:p.id,proposal,lockType:proposal || !!p.source_ai_proposal_id };
    el('plan-type').value=type; el('plan-text').value=c.text; el('plan-purpose').value=c.purpose || c.unknown_type || '';
    el('plan-theme').value=p.diagnosis_theme_id || ''; el('plan-type').disabled=planEdit.lockType;
    el('plan-form-title').textContent=proposal ? 'AI原文を保持して編集採用' : '採用・作成済み確認項目を編集'; el('plan-form').scrollIntoView(); el('plan-text').focus();
  }
  function sources(p) {
    const d=document.createElement('details'); d.append(node('summary','出典の回答を確認'));
    for (const ref of p.sources) {
      const r=overview.responses.find(r=>r.id===ref.source_ref_id);
      const q=overview.questions.find(q=>q.question_code===r?.question_code);
      const text=node('p',`${q?.question_text || ref.source_ref_id}\n${Array.isArray(r?.raw_value_json) ? r.raw_value_json.join(' / ') : r?.raw_value_json || '未回答'}\n関係：${ref.relation}`);
      text.className='diagnosis-raw'; d.append(text);
    }
    return d;
  }
  function proposal(p) {
    const card=node('section',''); card.className='card'; card.dataset.proposalId=p.id;
    card.append(node('h3',`[AI] ${types[p.proposal_type]} — ${p.title}`),node('p',statusLabels[p.status]));
    if (p.proposal_type==='THEME') {
      card.append(node('p',`Futureとの関係：${p.content_json.future_relation}`),node('p',`確認する理由：${p.content_json.why_it_matters}`));
      p.content_json.available_context.forEach(c=>card.append(node('p',`回答からの情報：${c.text}`)));
    } else card.append(node('p',p.content_json.purpose || p.content_json.unknown_type || '仮説として確認する候補'));
    card.append(sources(p));
    const disabled=!editing() || !['GENERATED','UNDER_REVIEW'].includes(p.status);
    const actions=node('div',''); actions.className='diagnosis-actions';
    actions.append(button('採用',()=>action(`/proposals/${p.id}/accept`),disabled),
      button('編集して採用',()=>p.proposal_type==='THEME' ? editTheme(p,true) : editPlan(p,true),disabled),
      button('却下',()=>action(`/proposals/${p.id}/reject`),disabled));
    card.append(actions); return card;
  }
  function renderAI() {
    el('ai-status').textContent=pending() ? 'AI整理を実行しています。担当者だけで準備を続けることもできます。' : state.executions[0]?.status==='FAILED'
      ? 'AIによる整理に失敗しました。再実行するか、担当者のみで診断準備を続けられます。' : state.executions.length ? 'AI提案は担当者の採用・確認を待っています。' : 'AIはまだ実行していません。手動でも準備できます。';
    el('run-ai').textContent=state.executions.length ? 'AI事前整理を再実行する' : 'AI事前整理を実行する';
    el('executions').replaceChildren(...state.executions.map(e=>node('p',`${e.status} / ${e.model} / ${new Date(e.created_at).toLocaleString('ja-JP')}${e.error_code ? ' / '+e.error_code : ''}`)));
    const cards=[];
    for (const p of state.proposals.filter(p=>p.proposal_type==='THEME')) {
      const card=proposal(p);
      state.proposals.filter(child=>child.parent_theme_proposal_id===p.id).forEach(child=>card.append(proposal(child)));
      cards.push(card);
    }
    el('proposals').replaceChildren(...cards);
  }
  function move(kind,index,delta) {
    const themes=state.themes.map(t=>t.id), items=state.plan_items.map(p=>p.id);
    const values=kind==='themes' ? themes : items;
    [values[index],values[index+delta]]=[values[index+delta],values[index]];
    action('/order',{ theme_ids:themes,plan_item_ids:items });
  }
  function renderPlan() {
    for (const [kind,list] of [['themes',state.themes],['plan-items',state.plan_items]]) {
      el(kind).replaceChildren(...list.map((item,index)=>{
        const card=node('section',''); card.className='card'; card.dataset.itemId=item.id;
        card.append(node('h3',`${index+1}. ${item.title || item.text}`),node('p',item.future_relation || item.purpose || ''),
          node('p',item.created_by==='HUMAN' ? '[Human] 担当者が作成' : '[Human Accepted] AI提案を担当者が採用'));
        if (item.description) card.append(node('p',item.description));
        if (item.item_type) card.append(node('p',item.item_type));
        const actions=node('div',''); actions.className='diagnosis-actions';
        actions.append(button('編集',()=>kind==='themes' ? editTheme(item) : editPlan(item),!editing()),
          button('削除',()=>action(`/${kind}/${item.id}/remove`),!editing()),
          button('上へ',()=>move(kind,index,-1),!editing() || index===0),button('下へ',()=>move(kind,index,1),!editing() || index===list.length-1));
        card.append(actions); return card;
      }));
    }
    const selected=el('plan-theme').value;
    el('plan-theme').replaceChildren(new Option('案件全体',''),...state.themes.map(t=>new Option(t.title,t.id))); el('plan-theme').value=selected;
  }
  async function load(aiOnly=false) {
    clearTimeout(timer);
    try {
      const [next,nextOverview]=await Promise.all([api('/preparation'),api('/overview')]);
      el('workspace-link').href='/admin/it-management-diagnosis-workspace.html?id='+encodeURIComponent(id);
      el('workspace-link').hidden=!['READY_FOR_DIAGNOSIS','DIAGNOSIS_IN_PROGRESS','HUMAN_REVIEW_REQUIRED','REPORT_REVIEW_REQUIRED','REPORT_APPROVED','FEEDBACK_PENDING','FEEDBACK_COMPLETED','CLOSED'].includes(next.diagnosis_status);
      state=next; overview=nextOverview;
      el('company').textContent=overview.organization_display_name;
      el('future').textContent=overview.future?.statement || '未設定'; el('future-status').textContent=`意図：${overview.future?.intent_status || '—'}`;
      el('case-status').textContent=`${labels[state.diagnosis_status] || state.diagnosis_status} (${state.diagnosis_status})`;
      el('next-action').textContent=overview.current_next_action;
      el('confirmation').textContent=state.plan_confirmed_at ? `担当者 ${state.plan_confirmed_by_user_id} が ${new Date(state.plan_confirmed_at).toLocaleString('ja-JP')} に確定しました。` : '';
      renderAI(); renderPlan(); controls();
      if (pending()) timer=setTimeout(()=>load(true),2000);
    } catch(e) { error(e.message); }
  }
  el('back').href=`/admin/it-management-diagnosis-detail.html?id=${encodeURIComponent(id)}`;
  el('refresh').addEventListener('click',()=>load());
  el('start').addEventListener('click',()=>action('/start'));
  el('run-ai').addEventListener('click',()=>action('/ai/run'));
  el('confirm').addEventListener('click',()=>{ if(window.confirm('表示されているテーマ・確認項目・順序を診断Planとして確定しますか？')) action('/confirm',{expectedVersion:state.version}); });
  el('cancel-theme').addEventListener('click',resetTheme); el('cancel-plan').addEventListener('click',resetPlan);
  el('theme-form').addEventListener('submit',event=>{ event.preventDefault();
    const input={title:el('theme-title').value,description:el('theme-description').value,future_relation:el('theme-relation').value};
    const path=themeEdit ? themeEdit.proposal ? `/proposals/${themeEdit.id}/accept-with-edit` : `/themes/${themeEdit.id}/update` : '/themes';
    action(path,input,resetTheme);
  });
  el('plan-form').addEventListener('submit',event=>{ event.preventDefault();
    const input={text:el('plan-text').value,purpose:el('plan-purpose').value,item_type:el('plan-type').value,diagnosis_theme_id:el('plan-theme').value || null};
    const path=planEdit ? planEdit.proposal ? `/proposals/${planEdit.id}/accept-with-edit` : `/plan-items/${planEdit.id}/update` : '/plan-items';
    action(path,input,resetPlan);
  });
  load();
})();
