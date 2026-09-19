'use strict';
(() => {
  const staff = document.body.dataset.mode === 'staff';
  if(staff&&!new URLSearchParams(location.search).get('id')){location.replace('/admin/sales-conversation.html');return;}
  const base = staff ? '/api/admin/it-management-diagnosis' : '/api/it-management-diagnosis';
  const el = id => document.getElementById(id);
  const fragment = new URLSearchParams(location.hash.slice(1));
  let id = staff ? new URLSearchParams(location.search).get('id') : fragment.get('case');
  let token = staff ? null : fragment.get('token');
  let survey;
  let chain = Promise.resolve();
  const dirty = new Map();
  const saved = new Map();
  const fields = new Map();
  let finishing = false;

  function error(message) { el('diagnosis-error').textContent = message; el('diagnosis-error').hidden = !message; }
  async function api(path, method = 'GET', body) {
    const headers = { 'Content-Type': 'application/json' };
    if (staff) headers['X-Diagnosis-Command'] = '1';
    else if (token) headers.Authorization = `Bearer ${token}`;
    let response;
    try { response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' }); }
    catch { throw new Error('通信できませんでした。入力内容を残したまま、接続を確認して再度保存してください。'); }
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) {
      if (data.questionCodes) fields.get(data.questionCodes[0])?.focus();
      throw new Error(staff && response.status === 401 ? 'ログインの有効期限が切れました。別のタブで管理画面にログインし、再度保存してください。' : data.error || '操作に失敗しました。');
    }
    return data;
  }
  function progress() {
    const count = survey.questions.filter(q => q.is_required && (saved.get(q.question_code)?.length ?? 0) > 0).length;
    el('survey-progress').value = count;
    el('progress-text').textContent = `必須9問のうち ${count}問を保存済み`;
  }
  async function flush() {
    for (const [code, value] of [...dirty]) {
      const q = survey.questions.find(q => q.question_code === code);
      await api(`/cases/${id}/survey/responses/${code}`, 'PUT', { questionVersion: q.version, rawValue: value });
      saved.set(code, value);
      if (dirty.get(code) === value) dirty.delete(code);
      progress();
    }
    el('save-status').textContent = dirty.size ? '未保存の変更があります。' : '回答を保存しました。このページを閉じても再開できます。';
  }
  function queueSave() {
    el('save-status').textContent = '保存中…';
    chain = chain.catch(() => {}).then(flush);
    chain.catch(e => { error(e.message); el('save-status').textContent = '未保存の変更があります。「途中保存する」で再度保存してください。'; });
    return chain;
  }
  function renderQuestion(q) {
    const field = document.createElement('fieldset');
    field.className = 'card diagnosis-question'; field.tabIndex = -1;
    field.dataset.questionCode = q.question_code;
    fields.set(q.question_code, field);
    const legend = document.createElement('legend');
    legend.textContent = `${q.display_order}. ${q.question_text}`;
    field.append(legend);
    const origin=survey.responses.find(r=>r.question_code===q.question_code)?.intake_origin_id;
    if(staff&&origin){const hint=document.createElement('p');hint.textContent='営業会話で伺った回答を引き継いでいます。必要に応じて現在も同じか確認してください。';field.append(hint);}
    const value = saved.get(q.question_code);
    if (q.answer_type === 'TEXT') {
      const input = document.createElement('textarea'); input.name = q.question_code; input.maxLength = 4000;
      input.setAttribute('aria-label', q.question_text); input.value = value || '';
      input.addEventListener('input', () => { dirty.set(q.question_code, input.value); el('save-status').textContent = '未保存の変更があります。'; });
      input.addEventListener('change', () => { if (!finishing) queueSave(); });
      field.append(input);
    } else {
      const group = document.createElement('div'); group.className = 'radio-group';
      q.options_json.forEach(option => {
        const label = document.createElement('label'); const input = document.createElement('input');
        input.type = q.answer_type === 'MULTI_SELECT' ? 'checkbox' : 'radio';
        input.name = q.question_code; input.value = option;
        input.checked = Array.isArray(value) ? value.includes(option) : value === option;
        input.addEventListener('change', () => {
          dirty.set(q.question_code, q.answer_type === 'MULTI_SELECT'
            ? [...group.querySelectorAll('input:checked')].map(i => i.value) : input.value);
          if (!finishing) queueSave();
        });
        label.append(input, document.createTextNode(' ' + option)); group.append(label);
      });
      field.append(group);
    }
    return field;
  }
  async function load() {
    error(''); el('reload-survey').hidden = true;
    el('application-form').hidden = true;
    try {
      survey = await api(`/cases/${id}/survey`);
      el('company-display').textContent = survey.organization_display_name; el('company-display').hidden = false;
      if (staff) {
        el('case-overview').href = `/admin/it-management-diagnosis-detail.html?id=${id}`;
        el('overview-link').hidden = false;
      } else el('resume-link').value = `${location.origin}${location.pathname}#${new URLSearchParams({ case: id, token })}`;
      if (survey.survey.status === 'SURVEY_COMPLETED') {
        el('survey-section').hidden = true; el('survey-success').hidden = false; dirty.clear(); return;
      }
      if (survey.diagnosis_status === 'APPLICATION_STARTED') await api(`/cases/${id}/survey/start`, 'POST');
      saved.clear(); fields.clear(); dirty.clear();
      survey.responses.forEach(r => saved.set(r.question_code, r.raw_value_json));
      el('survey-questions').replaceChildren(...survey.questions.map(renderQuestion));
      el('survey-section').hidden = false; progress(); el('save-status').textContent = '保存済みの回答を読み込みました。';
    } catch (e) { error(e.message); el('reload-survey').hidden = false; }
  }
  el('application-form').addEventListener('submit', async event => {
    event.preventDefault(); error('');
    if (!staff && !el('policy-acknowledged')?.checked) {
      error('サービス内容とデータ利用について確認してください。');
      el('policy-acknowledged')?.focus();
      return;
    }
    el('apply-button').disabled = true;
    try {
      const body = { companyName: el('company-name').value, contactName: el('contact-name').value,
        email: el('email').value, phone: el('phone').value };
      if (!staff) {
        body.policyNoticeVersion = el('application-form').dataset.policyNoticeVersion;
        body.policyAcknowledged = true;
      }
      const data = await api('/cases', 'POST', body);
      id = data.id; token = data.access_token;
      history.replaceState(null, '', staff ? `${location.pathname}?id=${id}` : `${location.pathname}#${new URLSearchParams({ case: id, token })}`);
      await load();
    } catch (e) { error(e.message); }
    finally { el('apply-button').disabled = false; }
  });
  el('save-button').addEventListener('click', async () => {
    error(''); el('save-button').disabled = true;
    try { await queueSave(); } catch (e) { error(e.message); }
    finally { el('save-button').disabled = false; }
  });
  el('survey-form').addEventListener('submit', async event => {
    event.preventDefault(); if (finishing) return;
    finishing = true; error('');
    el('survey-form').querySelectorAll('input,textarea,button').forEach(i => { i.disabled = true; });
    try {
      await queueSave(); await api(`/cases/${id}/survey/complete`, 'POST'); await load();
    } catch (e) { error(e.message); el('reload-survey').hidden = false; }
    finally { finishing = false; el('survey-form').querySelectorAll('input,textarea,button').forEach(i => { i.disabled = false; }); }
  });
  el('copy-link').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(el('resume-link').value); el('copy-status').textContent = ' コピーしました。'; }
    catch { el('resume-link').select(); el('copy-status').textContent = ' リンクを選択しました。コピーしてください。'; }
  });
  el('reload-survey').addEventListener('click', () => {
    if (!dirty.size || window.confirm('未保存の変更を破棄して、保存済みの回答を読み込みますか？')) load();
  });
  window.addEventListener('beforeunload', event => { if (dirty.size) { event.preventDefault(); event.returnValue = ''; } });
  if (!staff) window.addEventListener('hashchange', () => location.reload());
  if (id) load();
  else if (!staff && (fragment.has('token') || fragment.has('case'))) {
    el('application-form').hidden = true; error('再開リンクの形式が正しくありません。元のリンクをご確認ください。');
  } else {
    const prefill = new URLSearchParams(location.search);
    [['company', 'company-name'], ['name', 'contact-name'], ['email', 'email'], ['phone', 'phone']].forEach(([key, target]) => {
      if (prefill.has(key)) el(target).value = prefill.get(key);
    });
    history.replaceState(null, '', location.pathname);
  }
})();
