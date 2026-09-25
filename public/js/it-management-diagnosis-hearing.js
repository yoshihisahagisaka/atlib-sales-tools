'use strict';
(() => {
  const base = '/api/admin/it-management-diagnosis';
  const id = new URLSearchParams(location.search).get('id');
  const el = name => document.getElementById(name);
  const node = (tag, text, className) => { const e = document.createElement(tag); e.textContent = text; if (className) e.className = className; return e; };
  const error = message => { el('hearing-error').textContent = message; el('hearing-error').hidden = !message; };
  const format = value => value == null || value === '' || (Array.isArray(value) && !value.length) ? '未回答' : Array.isArray(value) ? value.join(' / ') : String(value);
  const time = value => value ? new Date(value).toLocaleString('ja-JP') : '日時不明';
  async function api(path, method = 'GET', body) {
    const response = await fetch(base + path, {method, headers: {'Content-Type':'application/json','X-Diagnosis-Command':'1'}, body: body === undefined ? undefined : JSON.stringify(body), cache:'no-store'});
    let data; try { data = await response.json(); } catch { data = {}; }
    if (!response.ok) { const e = new Error(response.status === 401 ? 'ログインの有効期限が切れました。管理画面にログインし直してください。' : data.error || `通信に失敗しました（${response.status}）。`); e.status = response.status; throw e; }
    return data;
  }
  const casePath = `/cases/${encodeURIComponent(id)}`;
  let current;
  function render() {
    const originals = new Map(current.originalResponses.map(r => [r.question_code, r]));
    const records = new Map(current.hearing.map(r => [r.question_code, r]));
    el('hearing-questions').replaceChildren(...current.questions.map(q => {
      const record = records.get(q.question_code);
      const original = originals.get(q.question_code);
      const section = node('section', '', 'card hearing-question');
      section.append(node('h2', `${q.display_order}. ${q.question_text}`));
      const columns = node('div', '', 'hearing-columns');
      const source = node('div', '', 'hearing-source');
      source.append(node('h3','事前回答（参照専用）'), node('p',original ? format(original.answer) : '事前回答なし'));
      if (original) source.append(node('p', `受付方法：${original.entry_channel || '不明'} / 記録：${time(original.answered_at)} / 引継ぎ元：${original.intake_origin_id || 'なし'}${original.intake_origin_version == null ? '' : ` (v${original.intake_origin_version})`}`, 'hearing-muted'));
      const editor = node('form', '', 'hearing-editor');
      editor.append(node('h3', 'ヒアリング回答'),node('p','未確認の場合は回答を指定せず、未確認事項に記録します。','hearing-muted'));
      const group = node('div','');
      const inputs = [];
      const existing = record ? record.answer_json : null;
      if (q.answer_type === 'TEXT') {
        const input = document.createElement('textarea'); input.maxLength = 4000; input.setAttribute('aria-label', 'ヒアリング回答'); input.value = typeof existing === 'string' ? existing : ''; group.append(input); inputs.push(input);
      } else {
        const options = Array.isArray(q.options_json) ? q.options_json : [];
        const none = document.createElement('input'); none.type = 'radio'; none.name = `${q.question_code}-answer-mode`; none.value = 'none'; none.checked = existing == null;
        const noneLabel = node('label','', 'hearing-choice'); noneLabel.append(none, document.createTextNode('回答なし・未確認')); group.append(noneLabel);
        options.forEach(option => {
          const input = document.createElement('input'); input.type = q.answer_type === 'MULTI_SELECT' ? 'checkbox' : 'radio'; input.name = q.answer_type === 'MULTI_SELECT' ? `${q.question_code}-option-${inputs.length}` : `${q.question_code}-answer-mode`; input.value = option; input.checked = Array.isArray(existing) ? existing.includes(option) : existing === option;
          input.addEventListener('change', () => { if (input.checked) none.checked = false; else if (q.answer_type === 'MULTI_SELECT' && !inputs.some(item => item.checked)) none.checked = true; });
          const label = node('label','', 'hearing-choice'); label.append(input,document.createTextNode(option)); group.append(label); inputs.push(input);
        });
        none.addEventListener('change', () => { if (none.checked) inputs.forEach(input => {input.checked = false;}); });
        group.dataset.none = '1'; group._none = none;
      }
      editor.append(group);
      function field(labelText, value, maxLength) { const label = node('label', labelText); const textarea = document.createElement('textarea'); textarea.maxLength = maxLength; textarea.value = value || ''; label.append(textarea); editor.append(label); return textarea; }
      const statement = field('顧客の発言原文', record?.statement, 4000);
      const unknown = field('未確認事項・次回確認すること', record?.unknown_note, 4000);
      const reason = record ? field('訂正理由（必須）', '', 1000) : null;
      const actions = node('div','','hearing-actions');
      const save = node('button',record ? '訂正を保存' : '記録を保存','btn'); save.type = 'submit';
      const status = node('span',record ? `保存済み v${record.version} / 更新：${time(record.updated_at)}` : '未保存','hearing-muted'); status.setAttribute('role','status');
      actions.append(save,status); editor.append(actions);
      if (record) {
        const details = document.createElement('details'); details.className = 'hearing-history';
        const summary = node('summary','訂正履歴を見る'); details.append(summary);
        const history = node('div',''); details.append(history);
        details.addEventListener('toggle', async () => { if (!details.open) return; history.textContent = '読み込み中…'; try { const result = await api(`${casePath}/hearing/${encodeURIComponent(q.question_code)}/revisions`); history.replaceChildren(...result.items.map(r => node('p',`v${r.version} / ${r.operation} / ${time(r.recorded_at)} / 操作者：${r.actor_user_id}\n理由：${r.reason || '初回記録'}\n変更前：${r.previous_json == null ? 'なし' : JSON.stringify(r.previous_json)}\n変更後：${JSON.stringify(r.current_json)}`))); } catch (e) { history.textContent = e.message; } });
        editor.append(details);
      }
      editor.addEventListener('submit', async event => {
        event.preventDefault(); error('');
        if (record && !reason.value.trim()) { status.textContent = '訂正理由を入力してください。'; reason.focus(); return; }
        let answer;
        if (q.answer_type === 'TEXT') answer = inputs[0].value.trim() || null;
        else if (group._none.checked) answer = null;
        else if (q.answer_type === 'MULTI_SELECT') { const selected = inputs.filter(input => input.checked).map(input => input.value); answer = selected.length ? selected : null; }
        else answer = inputs.find(input => input.checked)?.value || null;
        save.disabled = true; status.textContent = '保存中…';
        try {
          await api(`${casePath}/hearing`, 'PUT', {questionCode:q.question_code,questionVersion:q.version,expectedVersion:record?.version ?? null,answer,statement:statement.value,unknownNote:unknown.value,...(record ? {reason:reason.value.trim()} : {})});
        } catch (e) {
          status.textContent = e.status === 409
            ? '他の更新と競合しました。入力内容を控えてからページを再読み込みしてください。'
            : `保存失敗：${e.message}`;
          error(e.message);
          save.disabled = false;
          return;
        }
        status.textContent = '保存済み。画面を更新中…';
        try {
          const updated = await api(`${casePath}/hearing`);
          const index = current.questions.findIndex(item => item.question_code === q.question_code);
          if (index < 0) throw new Error('保存した設問を再表示できません。');
          const sections = Array.from(el('hearing-questions').children);
          current = updated;
          render();
          const refreshed = el('hearing-questions');
          sections.forEach((section, i) => {
            if (i !== index && refreshed.children[i]) refreshed.children[i].replaceWith(section);
          });
          el('hearing-status').textContent = `${q.question_code}を保存しました。`;
        } catch (e) {
          status.textContent = '保存は完了しましたが、画面更新に失敗しました。';
          error('保存済みです。二重保存せず、他の未保存入力を控えてからページを再読み込みしてください。');
          el('hearing-status').textContent = '保存済み・画面更新失敗';
        }
      });
      columns.append(source,editor); section.append(columns); return section;
    }));
  }
  async function load() {
    if (!id || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)) { error('案件IDが無効です。案件一覧から開き直してください。'); return; }
    el('back').href = `/admin/it-management-diagnosis-detail.html?id=${encodeURIComponent(id)}`;
    el('hearing-status').textContent = '読み込み中…';
    try { current = await api(`${casePath}/hearing`); render(); el('hearing-status').textContent = '設問ごとに保存できます。'; } catch (e) { error(e.message); el('hearing-status').textContent = '読み込みに失敗しました。'; }
  }
  load();
})();
