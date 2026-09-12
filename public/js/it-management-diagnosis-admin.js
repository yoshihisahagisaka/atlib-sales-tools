'use strict';
(() => {
  const el = id => document.getElementById(id);
  const base = '/api/admin/it-management-diagnosis';
  const statuses = { APPLICATION_STARTED: '申込受付', SURVEY_IN_PROGRESS: '回答中', SURVEY_COMPLETED: '回答完了', PREPARATION_IN_PROGRESS: '診断準備中', READY_FOR_DIAGNOSIS: '診断Plan確定' };
  const channels = { WEB: 'Web', SALES_VISIT: '営業訪問' };
  const node = (tag, text) => { const n = document.createElement(tag); n.textContent = text; return n; };
  let offset = 0; let requestNumber = 0;
  function error(message) { el('admin-error').textContent = message; el('admin-error').hidden = !message; }
  async function api(path, method = 'GET') {
    const response = await fetch(base + path, { method, headers: { 'X-Diagnosis-Command': '1' }, cache: 'no-store' });
    if (response.status === 401) throw new Error('ログインの有効期限が切れました。管理画面にログインし直してください。');
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error(data.error || '読み込みに失敗しました。');
    return data;
  }
  async function list() {
    const current = ++requestNumber;
    error(''); el('list-status').textContent = '読み込み中…'; el('previous').disabled = true; el('next').disabled = true;
    try {
      const params = new URLSearchParams({ limit: '50', offset: String(offset) });
      if (el('status-filter').value) params.set('status', el('status-filter').value);
      if (el('channel-filter').value) params.set('entryChannel', el('channel-filter').value);
      const data = await api(`/cases?${params}`);
      if (current !== requestNumber) return;
      el('case-list').replaceChildren(...data.items.map(item => {
        const tr = document.createElement('tr'); const td = document.createElement('td');
        const link = node('a', item.organization_display_name); link.href = `/admin/it-management-diagnosis-detail.html?id=${encodeURIComponent(item.id)}`;
        td.append(link); tr.append(td);
        [statuses[item.diagnosis_status] + ` (${item.diagnosis_status})`, item.current_next_action,
          channels[item.entry_channel], item.owner_user_id || '未割当', `${item.contact_name}\n${item.contact_email}`,
          item.future_summary || 'アンケート完了時に記録', `${statuses[item.survey_status]} ${item.answered_required}/${item.total_required}問`,
          item.assessment_status === 'NOT_PROPOSED' ? '未提案 (NOT_PROPOSED)' : item.assessment_status].forEach(value => tr.append(node('td', value)));
        return tr;
      }));
      el('list-status').textContent = data.total ? `${data.total}件中 ${offset + 1}〜${offset + data.items.length}件` : '該当する案件はありません。';
      el('previous').disabled = offset === 0; el('next').disabled = offset + data.items.length >= data.total;
    } catch (e) { if (current === requestNumber) { error(e.message); el('list-status').textContent = '読み込みに失敗しました。'; } }
  }
  const id = new URLSearchParams(location.search).get('id');
  async function overview() {
    error('');
    try {
      const data = await api(`/cases/${encodeURIComponent(id)}/overview`);
      el('organization').textContent = data.organization_display_name;
      el('future').textContent = data.future?.statement || 'アンケート完了時に、Q01の回答から記録されます。';
      el('future-source').textContent = data.future ? `アンケート回答時点の意図 (${data.future.intent_status}) / ${data.future.time_horizon}` : '';
      el('next-action').textContent = data.current_next_action;
      const person = data.participants[0];
      const meta = { 'Diagnosis Status': `${statuses[data.diagnosis_status]} (${data.diagnosis_status})`, 'Entry Channel': channels[data.entry_channel],
        '担当者': data.owner_user_id || '未割当', '顧客担当者': person?.name || '—', 'メール': person?.email || '—', '電話': person?.phone || '—',
        'Survey状態': `${data.survey.answered_required}/${data.survey.total_required}問 保存済み`, 'Assessment Status': data.assessment_status,
        '診断予定': data.scheduled_at ? new Date(data.scheduled_at).toLocaleString('ja-JP') : '未設定' };
      el('case-meta').replaceChildren(...Object.entries(meta).flatMap(([key, value]) => [node('dt', key), node('dd', value)]));
      el('resume-proxy').hidden = data.survey.status === 'SURVEY_COMPLETED';
      el('preparation-link').hidden = data.survey.status !== 'SURVEY_COMPLETED';
      el('preparation-link').href = `/admin/it-management-diagnosis-preparation.html?id=${encodeURIComponent(id)}`;
      el('resume-proxy').href = `/admin/it-management-diagnosis-new.html?id=${encodeURIComponent(id)}`;
      el('revoke').hidden = data.entry_channel !== 'WEB' || !!data.access.revoked_at;
      el('access-status').textContent = data.entry_channel === 'WEB'
        ? data.access.revoked_at ? '顧客の再開リンクは失効済みです。' : `顧客の再開リンク有効期限：${new Date(data.access.expires_at).toLocaleString('ja-JP')}` : '';
      el('raw-responses').replaceChildren(...data.questions.map(q => {
        const section = document.createElement('section'); const r = data.responses.find(r => r.question_code === q.question_code);
        section.append(node('h3', `${q.display_order}. ${q.question_text}`));
        const value = r?.raw_value_json; const p = node('p', Array.isArray(value) ? value.join(' / ') || '未回答' : value || '未回答');
        p.className = 'diagnosis-raw'; section.append(p);
        if (r) section.append(node('p', `入力者：${r.entered_by_user_id || '顧客'} / ${new Date(r.answered_at).toLocaleString('ja-JP')}`));
        return section;
      }));
      el('transitions').replaceChildren(...data.transitions.map(t => node('li', `${t.from_status || '新規'} → ${t.to_status} / ${t.command} / ${t.actor_user_id || '顧客'} / ${new Date(t.created_at).toLocaleString('ja-JP')}`)));
      el('overview').hidden = false;
    } catch (e) { error(e.message); }
  }
  if (document.body.dataset.view === 'list') {
    ['status-filter', 'channel-filter'].forEach(key => el(key).addEventListener('change', () => { offset = 0; list(); }));
    el('previous').addEventListener('click', () => { offset = Math.max(0, offset - 50); list(); });
    el('next').addEventListener('click', () => { offset += 50; list(); });
    el('refresh').addEventListener('click', list); list();
  } else {
    el('refresh').addEventListener('click', overview);
    el('revoke').addEventListener('click', async () => {
      if (!window.confirm('この案件の顧客向け再開リンクを失効します。失効後はスタッフが回答を扱います。実行しますか？')) return;
      el('revoke').disabled = true;
      try { await api(`/cases/${encodeURIComponent(id)}/access/revoke`, 'POST'); await overview(); }
      catch (e) { error(e.message); }
      finally { el('revoke').disabled = false; }
    });
    overview();
  }
})();
