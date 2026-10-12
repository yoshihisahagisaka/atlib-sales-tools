(() => {
  const ui = window.DesignV2UI;
  const params = new URLSearchParams(location.search);
  const caseId = params.get('caseId');
  const reportId = params.get('reportId');
  const apiBase = '/api/admin/free-diagnosis-v1/cases/';
  let report;
  const byId = id => document.querySelector(`#${id}`);
  const message = byId('reportMessage');
  const workspace = byId('reportWorkspace');
  const unavailable = byId('reportUnavailable');
  const safeDate = value => /^\d{4}-\d{2}-\d{2}/.test(value || '') ? value.slice(0, 10) : '';
  const sectionMap = content => new Map(content.sections.map(section => [section.key, section]));
  const candidateMap = content => content.assessmentProposal.presentationByCandidateId || {};
  const selectedIds = content => new Set(content.assessmentProposal.selectedCandidateIds || []);

  function showMessage(text, type = '') { message.textContent = text; message.className = `status${type ? ` ${type}` : ''}`; }
  function hidden(node, value) { node.classList.toggle('hidden', value); }
  function autoGrow(area) { area.style.height = 'auto'; area.style.height = `${area.scrollHeight}px`; }
  function textArea(value) { const area = document.createElement('textarea'); area.value = value || ''; area.rows = 2; area.addEventListener('input', () => { autoGrow(area); renderPreview(); }); requestAnimationFrame(() => autoGrow(area)); return area; }
  function selectedCandidateIdsFromForm() { return [...document.querySelectorAll('[data-candidate-id]:checked')].map(input => input.dataset.candidateId); }
  function presentationFromEditors() { const presentation = {}; document.querySelectorAll('[data-customer-expression]').forEach(area => { const id = area.dataset.customerExpression; presentation[id] = { customerExpression: area.value, reason: document.querySelector(`[data-reason="${id}"]`)?.value || '' }; }); return presentation; }

  function renderSelectedCandidateEditors(content, ids, pending = {}) {
    const selected = byId('assessmentSelectedEditors'); const existing = candidateMap(content);
    selected.replaceChildren(ui.el('h4', '', '今回Assessmentで確認する対象'));
    if (!ids.length) { selected.append(ui.el('p', 'editor-note', '候補を選択すると、顧客向けの表現と確認する理由を編集できます。')); return; }
    content.factCandidates.filter(candidate => ids.includes(candidate.id)).forEach((candidate, index) => {
      const item = ui.el('section', 'candidate-presentation-editor');
      item.append(ui.el('p', 'candidate-source', `元の確認候補 ${index + 1}`), ui.el('p', 'candidate-source-text', candidate.whatToVerify));
      const expressionLabel = ui.el('label', '', '確認対象の顧客向け表現');
      const expression = textArea(pending[candidate.id]?.customerExpression ?? existing[candidate.id]?.customerExpression ?? candidate.whatToVerify);
      expression.dataset.customerExpression = candidate.id; expressionLabel.append(expression);
      const reasonLabel = ui.el('label', '', '確認する理由');
      const reason = textArea(pending[candidate.id]?.reason ?? existing[candidate.id]?.reason ?? candidate.whyItMattersToFuture);
      reason.dataset.reason = candidate.id; reasonLabel.append(reason);
      item.append(expressionLabel, reasonLabel); selected.append(item);
    });
  }

  function renderForm() {
    const content = report.content;
    byId('recipientCompany').value = content.recipient.organizationDisplayName || '';
    byId('recipientRole').value = content.recipient.role || '';
    byId('recipientName').value = content.recipient.name || '';
    byId('diagnosisDate').value = safeDate(content.diagnosisDate);
    byId('durationText').value = content.assessmentProposal.durationText || '';
    byId('priceExcludingTaxText').value = content.assessmentProposal.priceExcludingTaxText || '';
    ['recipientCompany', 'recipientRole', 'recipientName', 'diagnosisDate', 'durationText', 'priceExcludingTaxText'].forEach(id => byId(id).addEventListener('input', renderPreview));
    const candidates = byId('assessmentCandidates'); candidates.replaceChildren(); const selected = selectedIds(content);
    content.factCandidates.forEach((candidate, index) => {
      const label = ui.el('label', 'candidate-selector'); const check = document.createElement('input'); check.type = 'checkbox'; check.checked = selected.has(candidate.id); check.dataset.candidateId = candidate.id;
      label.append(check, ui.el('span', '', `${index + 1}. ${candidate.whatToVerify}`));
      check.addEventListener('change', () => { const pending = presentationFromEditors(); renderSelectedCandidateEditors(content, selectedCandidateIdsFromForm(), pending); renderPreview(); }); candidates.append(label);
    });
    renderSelectedCandidateEditors(content, [...selected]);
  }

  function editedContent() {
    const base = structuredClone(report.content);
    base.recipient = { organizationDisplayName: byId('recipientCompany').value.trim(), ...(byId('recipientRole').value.trim() ? { role: byId('recipientRole').value.trim() } : {}), ...(byId('recipientName').value.trim() ? { name: byId('recipientName').value.trim() } : {}) };
    base.diagnosisDate = byId('diagnosisDate').value || base.diagnosisDate;
    const ids = selectedCandidateIdsFromForm(); const presentation = {};
    ids.forEach(id => { presentation[id] = { customerExpression: document.querySelector(`[data-customer-expression="${id}"]`).value.trim(), reason: document.querySelector(`[data-reason="${id}"]`).value.trim() }; });
    base.assessmentProposal = { ...base.assessmentProposal, selectedCandidateIds: ids, presentationByCandidateId: presentation, durationText: byId('durationText').value.trim(), priceExcludingTaxText: byId('priceExcludingTaxText').value.trim() };
    return base;
  }

  function reportPage(className = '') { return ui.el('section', `report-page ${className}`.trim()); }
  function documentHeader() { return ui.el('div', 'document-header', 'IT経営KAIZEN 無料診断　診断結果レポート'); }
  function documentFooter(pageNo) { const footer = ui.el('footer', 'document-footer'); footer.append(ui.el('span', '', 'atLIB株式会社'), ui.el('span', '', String(pageNo))); return footer; }
  function chapter(number, title, subtitle) { const node = ui.el('section', 'document-chapter'); const header = ui.el('header', 'chapter-header'); header.append(ui.el('p', 'chapter-number', number), ui.el('h2', '', title)); if (subtitle) header.append(ui.el('p', 'chapter-subtitle', subtitle)); node.append(header); return node; }
  function paragraph(text, className = '') { return ui.el('p', className, text); }
  function appendEntries(parent, entries) { const list = ui.el('ul', 'document-entry-list'); entries.forEach(entry => list.append(ui.el('li', '', entry))); parent.append(list); }
  function bodyPage(pageNo, chapters) { const page = reportPage(); page.append(documentHeader(), ...chapters.filter(Boolean), documentFooter(pageNo)); return page; }

  function renderCover(content) {
    const page = reportPage('report-cover'); const logo = document.createElement('img'); logo.className = 'report-logo'; logo.src = '/admin/assets/it-management-kaizen-logo-v1.png'; logo.alt = 'IT経営KAIZEN';
    const atlibLogo = document.createElement('img'); atlibLogo.className = 'cover-atlib-logo'; atlibLogo.src = '/admin/assets/atlib-corporate-logo.png'; atlibLogo.alt = 'atLIB';
    page.append(logo, ui.el('div', 'cover-rule'), ui.el('p', 'cover-service', 'IT経営KAIZEN 無料診断'), ui.el('h1', '', '診断結果レポート'), paragraph('会社の未来から、ITを考える。', 'cover-message'));
    const recipient = ui.el('div', 'report-recipient'); recipient.append(ui.el('strong', '', content.recipient.organizationDisplayName)); if (content.recipient.role) recipient.append(paragraph(content.recipient.role)); if (content.recipient.name) recipient.append(paragraph(`${content.recipient.name} 様`)); recipient.append(paragraph(`診断日：${content.diagnosisDate || '未記入'}`)); page.append(recipient);
    const issuer = ui.el('div', 'cover-issuer'); issuer.append(atlibLogo, paragraph('atLIB株式会社')); page.append(issuer); return page;
  }

  function summarySource(entries, maximum = 2) {
    const values = (entries || []).slice(0, maximum);
    if (!values.length) return '';
    return `${values.join('、')}${(entries || []).length > maximum ? 'など' : ''}`;
  }
  function renderExecutiveSummary(content) {
    const sections = sectionMap(content); const page = bodyPage(2, []); const summary = ui.el('section', 'executive-summary');
    const future = summarySource(sections.get('FUTURE')?.entries, 1); const current = summarySource(sections.get('CURRENT_UNDERSTANDING')?.entries, 1); const factCount = content.factCandidates.length;
    summary.append(ui.el('h2', '', '診断結果サマリー'));
    summary.append(paragraph(`今回の無料診断では、${future || '会社が目指す未来'}を基準に、ITについて考えました。ITの一般的な良し悪しではなく、その未来に向けて現在何を理解し、何を確認する価値があるかを整理しています。`, 'summary-paragraph'));
    summary.append(paragraph(`現在は、${current || '現在のITや仕事の進め方についての認識'}という理解が共有されています。今回の診断では、現時点で分かっていることと、これから確認することで経営判断に役立つことを整理しました。`, 'summary-paragraph'));
    summary.append(paragraph(`確認できていないことは、現時点の情報だけで問題と決めつけません。会社の未来に向けた経営判断を進めるため、${factCount ? `次に事実として確認したい${factCount}件のテーマ` : '次に事実として確認したいテーマ'}を整理しました。`, 'summary-paragraph'));
    page.insertBefore(summary, page.lastChild); return page;
  }

  function detail(section, subtitle, note) { const node = chapter(section.title.slice(0, 2), section.title.slice(3), subtitle); if (note) node.append(paragraph(note, 'chapter-note')); appendEntries(node, section.entries); return node; }
  function renderFacts(content) {
    const node = chapter('05', '経営判断を進めるために、次に確認したいこと', '無料診断で整理した問いを、次の確認につなげます。');
    content.factCandidates.forEach((candidate, index) => { const item = ui.el('article', 'fact-candidate'); const title = `${String(index + 1).padStart(2, '0')}　${candidate.whatToVerify}`; item.append(ui.el('h3', '', title), paragraph(`${candidate.whyItMattersToFuture} ${candidate.whatMayBecomeKnowable}`)); node.append(item); });
    return node;
  }
  function renderNextDecisionPage() {
    const node = chapter('', '診断結果を、次の経営判断へ'); node.classList.add('next-decision-page');
    node.append(paragraph('今回の無料診断で整理した内容によって、次に必要なことは企業ごとに異なります。さらに事実を確認する必要があれば設計Assessmentへ進み、すでに判断できる状態であれば、導入・運用・継続的な改善へ進むこともできます。何も実施しないことも、経営判断の一つです。', 'next-decision-lead'));
    const services = ui.el('section', 'service-options');
    [
      ['設計Assessment', '問いを、判断材料へ', '無料診断で明らかになった「次に確認したいこと」を事実として確認し、経営判断に必要なIT戦略と改善プランを具体化します。'],
      ['IT経営KAIZEN 導入支援', '判断を、実行へ', '経営判断に基づき、必要なシステムや仕組みの選定・設計・導入を支援します。'],
      ['IT経営KAIZEN 運用支援', 'IT運用を、IT戦略へ', '日々のIT運用を支えながら、IT部門が運用対応だけに追われず、企業のIT戦略を担える体制づくりを支援します。'],
      ['IT経営KAIZEN 継続KAIZEN', '改善を、一度で終わらせない', '経営や事業、ITの変化を継続的に確認し、判断・実行・振り返り・改善を繰り返すKAIZENの仕組みづくりを支援します。'],
    ].forEach(([title, subtitle, text]) => { const item = ui.el('section', 'service-option'); item.append(ui.el('h3', '', title), ui.el('h4', '', subtitle), paragraph(text)); services.append(item); }); node.append(services);
    const principle = ui.el('section', 'kaizen-principle'); principle.append(ui.el('h3', '', 'IT経営KAIZENが大切にしていること'));
    [
      'IT経営で大切なのは、新しいシステムやAIを導入することそのものではありません。会社が実現したい未来に対して、何が必要なのか、何には投資し、何には投資しないのかを、経営として判断できることだと私たちは考えています。',
      'そのためIT経営KAIZENでは、ITだけを見るのではなく、「技術」「運用」「管理」の3つの視点から会社の状況を捉えます。システムを変えれば解決するのか、仕事の進め方や運用を見直すべきなのか、経営として把握・管理する仕組みが必要なのか。一つの課題を一つの答えに決めつけず、複数の視点から確認します。',
      'さらに、会社が目指す未来に対して、現在どこまで分かっているか、何を確認する価値があるか、何がまだ判断できないか、次にどの事実を確認するか、どのような選択肢があるか、そして何を実行するかを順に整理していきます。',
      '分からないことを推測で埋めたり、最初から特定の製品や解決策を当てはめたりはしません。必要な事実を確認し、経営判断に必要な材料を整理します。',
      'また、当社への発注を前提とした診断ではありません。実行すると判断した場合も、当社へ依頼する、現在のITベンダーへ依頼する、自社のIT部門で実施するなど、貴社に適した方法を選択できます。',
      '進めることも、進めないことも含めて、最後に判断するのは経営者です。IT経営KAIZENは、その判断と実行を支えます。',
    ].forEach(text => principle.append(paragraph(text))); node.append(principle); return node;
  }

  function renderPreview() {
    if (!report) return; const content = editedContent(); const sections = sectionMap(content); const preview = byId('reportPreview'); preview.replaceChildren();
    preview.append(
      renderCover(content), renderExecutiveSummary(content),
      bodyPage(3, [detail(sections.get('FUTURE'), '今回の診断では、この未来を基準にITを考えました。', 'ITの一般的な良し悪しではなく、この未来に対して現在のITや仕事の進め方を確認しています。'), detail(sections.get('CURRENT_UNDERSTANDING'), '経営者として現在どこまで認識できているかを整理した結果')]),
      bodyPage(4, [detail(sections.get('LENSES'), '未来に向けて確認しておく価値があること'), detail(sections.get('UNKNOWNS'), '', '確認できていないことを、推測で結論づけません。')]),
      bodyPage(5, [renderFacts(content)]), bodyPage(6, [renderNextDecisionPage()]),
    );
  }

  async function load() {
    if (!caseId || !reportId) { hidden(unavailable, false); return; }
    byId('backToAnalysis').href = `/admin/free-diagnosis-v2-analysis.html?caseId=${encodeURIComponent(caseId)}`;
    const response = await fetch(`${apiBase}${encodeURIComponent(caseId)}/design-v2/report-drafts/${encodeURIComponent(reportId)}`);
    if (!response.ok) { hidden(unavailable, false); return; }
    report = await response.json(); renderForm(); renderPreview(); hidden(workspace, false);
  }
  async function save() {
    const content = editedContent();
    const response = await fetch(`${apiBase}${encodeURIComponent(caseId)}/design-v2/report-drafts/${encodeURIComponent(reportId)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(content) });
    if (!response.ok) { showMessage('提案情報を保存できませんでした。', 'error'); return; }
    report = await response.json(); renderForm(); renderPreview(); showMessage('提案情報を保存しました。');
  }
  byId('reportForm').addEventListener('submit', event => { event.preventDefault(); save(); });
  byId('saveReport').addEventListener('click', save);
  load().catch(() => hidden(unavailable, false));
})();
