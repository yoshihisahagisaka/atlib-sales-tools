(() => {
  const ui = window.DesignV2UI;
  const params = new URLSearchParams(location.search);
  const caseId = params.get('caseId');
  const apiBase = '/api/admin/free-diagnosis-v1/cases/';
  const reviewSections = [
    ['future', '01 実現したい会社の未来'],
    ['currentUnderstanding', '02 現在どこまで分かっているか'],
    ['confirmationAndImprovement', '03 未来に向けて確認しておく価値があること'],
    ['unknowns', '04 現時点ではまだ判断できないこと'],
    ['nextFacts', '05 次に確認する価値があること'],
  ];
  let ws;

  const notice = document.querySelector('#notice');
  const root = document.querySelector('#workspace');
  const message = document.querySelector('#message');
  const answerReference = document.querySelector('#answerReference');
  const answerReferenceControl = document.querySelector('#answerReferenceControl');
  const openAnswerReference = document.querySelector('#openAnswerReference');
  const openQ1Editor = document.querySelector('#openQ1Editor');
  const q1Editor = document.querySelector('#q1Editor');
  const reportRefreshState = document.querySelector('#reportRefreshState');
  const refreshReport = document.querySelector('#refreshReport');

  function unavailable() { notice.classList.remove('hidden'); root.classList.add('hidden'); }
  function msg(text, type = '', detail = '') {
    message.replaceChildren(ui.el('strong', '', text));
    if (detail) message.append(ui.el('span', 'status-detail', detail));
    message.className = `status${type ? ` ${type}` : ''}`;
  }
  function renderReportRefreshState() { reportRefreshState.classList.toggle('hidden', !ws.reportState?.needsRefresh); }
  function syncAnswerReferencePane() {
    const expanded = answerReference.open;
    root.classList.toggle('answers-expanded', expanded);
    answerReferenceControl.classList.remove('hidden');
    openAnswerReference.classList.toggle('hidden', expanded);
    openAnswerReference.setAttribute('aria-expanded', String(expanded));
  }
  function themeInfo(id) {
    const viewpoints = ws.latestAnalysisResult?.analysis?.hearingViewpoints || [];
    const index = viewpoints.findIndex((value) => value.id === id);
    const item = viewpoints[index];
    return { id, label: item?.label || id, colorIndex: index < 0 ? 0 : index % 6 };
  }
  function themeTokens(ids) { return (ids || []).map(themeInfo); }
  function lenses(node, values) {
    const row = ui.el('div', 'lenses');
    values.forEach((value) => row.append(ui.el('span', 'badge', ui.labels[value] || value)));
    node.append(row);
  }
  function appendThemes(node, id) {
    const badges = ui.relatedBadges(themeTokens(ws.traceability?.analysisItemThemes?.[id] || []));
    if (badges) node.append(badges);
  }
  function q1Field(value) {
    const field = ui.el('fieldset', 'field compact-field');
    field.dataset.field = 'q1CompanyContext';
    field.append(ui.el('legend', '', ui.questions.q1CompanyContext));
    const groups = ui.el('div', 'q1-choice-grid');
    for (const [part, codes] of Object.entries(ui.codeGroups.q1CompanyContext)) {
      const group = ui.el('section', 'q1-choice-group');
      group.append(ui.el('strong', '', part === 'employeeRange' ? '従業員規模' : '拠点数'));
      const choices = ui.el('div', 'choices');
      codes.forEach((code) => {
        const label = ui.el('label');
        const input = document.createElement('input');
        input.type = 'radio'; input.name = `q1CompanyContext.${part}`; input.value = code; input.checked = value[part] === code;
        label.append(input, document.createTextNode(` ${ui.labels[code] || code}`)); choices.append(label);
      });
      group.append(choices);
      groups.append(group);
    }
    field.append(groups);
    return field;
  }
  function renderQ1Editor() { document.querySelector('#editor').replaceChildren(q1Field(ws.currentCompanyContext)); }
  function currentState() {
    return {
      q2Future: [...ws.currentStructuredState.q2Future], q3ItExpectations: [...ws.currentStructuredState.q3ItExpectations],
      q4CurrentInterest: ws.currentStructuredState.q4CurrentInterest, q5Visibility: ws.currentStructuredState.q5Visibility,
      q6ManagementConnection: ws.currentStructuredState.q6ManagementConnection, q7InterestThemes: [...ws.currentStructuredState.q7InterestThemes],
    };
  }
  function selected(name, fallback) { return document.querySelector(`[name="${name}"]:checked`)?.value || fallback; }
  function currentQ1() { return { employeeRange: selected('q1CompanyContext.employeeRange', ws.currentCompanyContext.employeeRange), siteRange: selected('q1CompanyContext.siteRange', ws.currentCompanyContext.siteRange) }; }
  function renderAnalysis() {
    const target = document.querySelector('#analysis'); target.replaceChildren(); const result = ws.latestAnalysisResult?.analysis; if (!result) return;
    target.append(ui.el('h2', 'column-title', '分析の詳細'));
    [['実現したい会社の未来', result.futureUnderstanding], ['現在どこまで分かっているか', result.currentUnderstanding], ['未来に向けて確認しておく価値があること', result.lensFindings], ['現時点ではまだ判断できないこと', result.unknowns]].forEach(([title, items]) => {
      const section = document.createElement('details'); section.className = 'analysis-section'; section.append(ui.el('summary', '', title));
      items.forEach((item) => { const row = ui.el('article', 'analysis-item'); row.append(ui.el('p', '', item.text)); if (item.lenses) lenses(row, item.lenses); appendThemes(row, item.id); section.append(row); }); target.append(section);
    });
    const facts = document.createElement('details'); facts.className = 'analysis-section'; facts.append(ui.el('summary', '', '次に確認する価値があること'));
    result.factCandidates.forEach((item) => { const row = ui.el('article', 'analysis-item'); row.append(ui.el('p', '', `確認すること: ${item.whatToVerify}`), ui.el('p', '', `なぜ確認するか: ${item.whyItMattersToFuture}`), ui.el('p', '', `確認すると分かりそうなこと: ${item.whatMayBecomeKnowable}`)); lenses(row, item.lenses); appendThemes(row, item.id); facts.append(row); }); target.append(facts);
  }
  function autoGrow(area) { area.style.height = 'auto'; area.style.height = `${area.scrollHeight}px`; }
  function sectionEditor(content) {
    const wrap = ui.el('section', 'narrative-editor'); wrap.append(ui.el('h3', '', '診断結果を確認・整理する'));
    reviewSections.forEach(([key, title]) => {
      const block = ui.el('div', 'narrative-block'); block.append(ui.el('h4', '', title));
      const related = ui.relatedBadges(themeTokens(ws.traceability?.narrativeSectionThemes?.[key] || [])); if (related) block.append(related);
      const area = document.createElement('textarea'); area.dataset.section = key; area.value = content[key].entries.join('\n'); area.rows = 1; area.addEventListener('input', () => autoGrow(area)); block.append(area); wrap.append(block); requestAnimationFrame(() => autoGrow(area));
    });
    const save = document.createElement('button'); save.type = 'button'; save.id = 'saveNarrative'; save.textContent = '顧客向け文面を保存'; save.disabled = ws.analysisFreshness !== 'CURRENT';
    const saveAction = document.querySelector('#narrativeSaveAction'); saveAction.replaceChildren(save); saveAction.classList.remove('hidden');
    if (ws.analysisFreshness !== 'CURRENT') wrap.append(ui.el('p', 'status warning', '現在の分析を確認してから文面を編集してください。'));
    if (ws.humanEditedNarrativeStatus === 'STALE_REVIEW_REQUIRED') wrap.append(ui.el('p', 'status warning', '前回の編集文は、現在の分析より前の内容です。確認してください。'));
    save.addEventListener('click', saveNarrative); return wrap;
  }
  function appendNarrativeReference(target, content, summary) {
    const reference = document.createElement('details'); reference.className = 'generated-reference'; reference.append(ui.el('summary', '', summary)); const body = ui.el('div', 'generated-body');
    reviewSections.forEach(([key, title]) => { const section = content[key]; if (!section) return; const block = ui.el('div', 'narrative-block'); block.append(ui.el('h4', '', title)); const related = ui.relatedBadges(themeTokens(ws.traceability?.narrativeSectionThemes?.[key] || [])); if (related) block.append(related); const list = ui.el('ul'); section.entries.forEach((entry) => list.append(ui.el('li', '', entry))); block.append(list); body.append(block); }); reference.append(body); target.append(reference);
  }
  function renderNarratives() {
    const generated = document.querySelector('#generated'), human = document.querySelector('#humanNarrative'), saveAction = document.querySelector('#narrativeSaveAction'); generated.replaceChildren(); human.replaceChildren(); saveAction.replaceChildren(); saveAction.classList.add('hidden'); const latest = ws.latestGeneratedNarrative?.content;
    if (!latest) {
      if (ws.analysisFreshness !== 'CURRENT') human.append(ui.el('p', 'status warning', '現在の分析を確認してください。'));
      if (ws.humanEditedNarrativeStatus === 'STALE_REVIEW_REQUIRED' && ws.latestHumanEditedNarrative) {
        human.append(ui.el('p', 'status warning', '前回の編集文は、現在の分析より前の内容です。確認してください。'));
        appendNarrativeReference(human, ws.latestHumanEditedNarrative.content, '前回の編集文を参考表示');
      }
      return;
    }
    const source = ws.humanEditedNarrativeStatus === 'CURRENT' ? ws.latestHumanEditedNarrative.content : latest; human.append(sectionEditor(source)); appendNarrativeReference(generated, latest, '分析から作成した元の文面'); if (ws.humanEditedNarrativeStatus === 'STALE_REVIEW_REQUIRED') appendNarrativeReference(human, ws.latestHumanEditedNarrative.content, '前回の編集文を参考表示');
  }
  function renderReference() {
    const target = document.querySelector('#original');
    ui.renderOriginal(target, ws.originalSurvey.answers, {});
    const original = ws.originalSurvey.answers.q1CompanyContext;
    const current = ws.currentCompanyContext;
    const changed = [
      ['employeeRange', '従業員規模'],
      ['siteRange', '拠点数'],
    ].filter(([key]) => original[key] !== current[key]);
    if (!changed.length) return;
    const q1 = target.querySelector('.original-card');
    const currentBlock = ui.el('section', 'current-company-context');
    currentBlock.append(ui.el('strong', '', '現在の企業基本情報'));
    const values = ui.el('div', 'answer-chips');
    changed.forEach(([key, label]) => values.append(ui.el('span', 'answer-chip', `${label}: ${ui.labels[current[key]] || current[key]}`)));
    currentBlock.append(values);
    q1?.append(currentBlock);
  }
  function renderHearingRecords() {
    const target = document.querySelector('#records'); target.replaceChildren(); const themes = ws.latestAnalysisResult?.analysis?.hearingViewpoints || [];
    themes.forEach((theme, index) => { const records = ws.hearingRecords.filter((record) => record.planItemRef === `design-v2-viewpoint:${theme.id}`); const block = ui.el('section', `theme-record theme-color-${index % 6}`), title = ui.el('div', 'viewpoint-title'); title.append(ui.el('span', 'viewpoint-number', String(index + 1)), ui.el('h3', '', theme.label)); block.append(title); const trace = (ws.traceability?.viewpoints || []).find((item) => item.id === theme.id); const related = ui.relatedBadges(trace?.relatedQuestionCodes || [], '関連Q'); if (related) block.append(related); block.append(ui.el('p', 'viewpoint-why', theme.whyUseful)); const recordList = ui.el('div', 'records'); ui.renderRecords(recordList, records); block.append(recordList); target.append(block); });
    const general = ws.hearingRecords.filter((record) => !record.planItemRef?.startsWith('design-v2-viewpoint:')); if (general.length) { const block = ui.el('details', 'supporting-details'); block.append(ui.el('summary', '', 'その他メモ')); const records = ui.el('div', 'records'); ui.renderRecords(records, general); block.append(records); target.append(block); } if (!target.children.length) target.append(ui.el('p', 'hint', 'まだ記録はありません。'));
  }
  function render() { renderReference(); renderHearingRecords(); renderQ1Editor(); renderAnalysis(); renderNarratives(); renderReportRefreshState(); syncAnswerReferencePane(); root.classList.remove('hidden'); }
  async function load() {
    if (!caseId) { unavailable(); return; }
    document.querySelector('#toHearing').href = `/admin/free-diagnosis-v2-hearing.html?caseId=${encodeURIComponent(caseId)}`;
    const response = await fetch(`${apiBase}${encodeURIComponent(caseId)}/design-v2/post-hearing-analysis`); if (!response.ok) { unavailable(); return; } ws = await response.json(); render();
  }
  async function reanalyze(revision) {
    const response = await fetch(`${apiBase}${encodeURIComponent(caseId)}/design-v2/reanalyze`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedCurrentStateRevision: revision }) });
    if (!response.ok) { msg('企業基本情報は保存されましたが、再分析に失敗しました。', 'error'); return false; }
    await load(); q1Editor.classList.add('hidden'); openQ1Editor.setAttribute('aria-expanded', 'false'); msg('企業基本情報を保存しました。'); document.querySelector('#reportPane').scrollIntoView({ block: 'start' }); return true;
  }
  async function openReport() { const button = document.querySelector('#toReport'); button.disabled = true; try { const response = await fetch(`${apiBase}${encodeURIComponent(caseId)}/design-v2/report-drafts/ensure`, { method: 'POST' }); if (!response.ok) { msg('レポートの下書きを開けませんでした。先に現在の理解を確認してください。', 'error'); return; } const report = await response.json(); location.href = `/admin/free-diagnosis-v2-report.html?caseId=${encodeURIComponent(caseId)}&reportId=${encodeURIComponent(report.id)}`; } finally { button.disabled = false; } }
  async function refreshReportDraft() {
    refreshReport.disabled = true;
    try {
      const response = await fetch(`${apiBase}${encodeURIComponent(caseId)}/design-v2/report-drafts`, { method: 'POST' });
      if (!response.ok) { msg('最新の内容でレポートを更新できませんでした。現在の理解を確認してください。', 'error'); return; }
      const report = await response.json();
      location.href = `/admin/free-diagnosis-v2-report.html?caseId=${encodeURIComponent(caseId)}&reportId=${encodeURIComponent(report.id)}`;
    } finally { refreshReport.disabled = false; }
  }
  async function saveQ1(event) {
    event.preventDefault(); const response = await fetch(`${apiBase}${encodeURIComponent(caseId)}/design-v2/current-state-revisions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedRevision: ws.currentStateRevision.revisionNo, state: currentState(), q1CompanyContext: currentQ1(), changeReason: document.querySelector('#changeReason').value || null }) });
    if (!response.ok) { msg('企業基本情報を保存できませんでした。', 'error'); return; } const saved = await response.json(); await load(); await reanalyze(saved.revisionNo);
  }
  async function saveNarrative() {
    if (ws.analysisFreshness !== 'CURRENT') return; const content = {}; document.querySelectorAll('#humanNarrative [data-section]').forEach((area) => { const key = area.dataset.section; content[key] = { heading: ws.latestGeneratedNarrative.content[key].heading, entries: area.value.split('\n').map((value) => value.trim()).filter(Boolean) }; });
    const response = await fetch(`${apiBase}${encodeURIComponent(caseId)}/design-v2/narrative-edits`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ generatedNarrativeId: ws.latestGeneratedNarrative.id, content }) });
    if (!response.ok) { msg('顧客向け文面を保存できませんでした。現在の分析を確認してください。', 'error'); return; } await load(); msg('顧客向け文面を保存しました。', '', ws.reportState?.needsRefresh ? 'レポートにはまだ反映されていません。' : '');
  }
  document.querySelector('#currentForm').addEventListener('submit', saveQ1);
  document.querySelector('#toReport').addEventListener('click', openReport);
  refreshReport.addEventListener('click', refreshReportDraft);
  openAnswerReference.addEventListener('click', () => { answerReference.open = true; syncAnswerReferencePane(); });
  answerReference.addEventListener('toggle', syncAnswerReferencePane);
  openQ1Editor.addEventListener('click', () => { const opening = q1Editor.classList.contains('hidden'); q1Editor.classList.toggle('hidden', !opening); openQ1Editor.setAttribute('aria-expanded', String(opening)); if (opening) q1Editor.scrollIntoView({ block: 'nearest' }); });
  load().catch(unavailable);
})();
