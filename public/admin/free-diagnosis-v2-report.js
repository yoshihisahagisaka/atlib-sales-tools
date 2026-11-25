(() => {
  const ui = window.DesignV2UI;
  const params = new URLSearchParams(location.search);
  const caseId = params.get('caseId');
  const reportId = params.get('reportId');
  const apiBase = '/api/admin/free-diagnosis-v1/cases/';
  const handoffBase = '/api/admin/it-management-kaizen/assessment-source-handoffs/';
  let feedbackState = null;
  let currentPreparationHandoff = null;
  let report;
  let postHearingWorkspace;
  const byId = id => document.querySelector(`#${id}`);
  const message = byId('reportMessage');
  const workspace = byId('reportWorkspace');
  const unavailable = byId('reportUnavailable');
  const safeDate = value => /^\d{4}-\d{2}-\d{2}/.test(value || '') ? value.slice(0, 10) : '';
  const sectionMap = content => new Map(content.sections.map(section => [section.key, section]));
  const candidateMap = content => content.assessmentProposal.presentationByCandidateId || {};
  const selectedIds = content => new Set(content.assessmentProposal.selectedCandidateIds || []);
  const staleApprovalMessage = 'レポート作成後に顧客向け文面が更新されています。最新の内容でレポートを更新してから承認してください。';

  function showMessage(text, type = '') { message.textContent = text; message.className = `status${type ? ` ${type}` : ''}`; }
  function hidden(node, value) { node.classList.toggle('hidden', value); }
  function autoGrow(area) { area.style.height = 'auto'; area.style.height = `${area.scrollHeight}px`; }
  function textArea(value) { const area = document.createElement('textarea'); area.value = value || ''; area.rows = 2; area.addEventListener('input', () => { autoGrow(area); renderPreview(); }); requestAnimationFrame(() => autoGrow(area)); return area; }
  function selectedCandidateIdsFromForm() { return [...document.querySelectorAll('[data-candidate-id]:checked')].map(input => input.dataset.candidateId); }
  function presentationFromEditors() { const presentation = {}; document.querySelectorAll('[data-customer-expression]').forEach(area => { const id = area.dataset.customerExpression; presentation[id] = { customerExpression: area.value, reason: document.querySelector(`[data-reason="${id}"]`)?.value || '' }; }); return presentation; }

  function approvalCurrent() {
    const adopted = report?.context?.adoptedNarrative;
    if (!adopted || !postHearingWorkspace?.latestGeneratedNarrative) return false;
    const human = postHearingWorkspace.latestHumanEditedNarrative;
    const generated = postHearingWorkspace.latestGeneratedNarrative;
    const humanIsCurrent = human && postHearingWorkspace.humanEditedNarrativeStatus === 'CURRENT';
    if (humanIsCurrent) return adopted.source === 'HUMAN_EDITED' && adopted.id === human.id && adopted.generatedNarrativeId === human.generatedNarrativeId && adopted.contentHash === human.contentHash;
    return adopted.source === 'SYSTEM_GENERATED' && adopted.id === generated.id && adopted.contentHash === generated.contentHash;
  }

  function setReadonly(readonly) {
    const form = byId('reportForm');
    form.classList.toggle('is-readonly', readonly);
    form.querySelectorAll('input, textarea, button').forEach(element => { element.disabled = readonly; });
    hidden(byId('saveReport'), readonly);
  }

  function renderApprovalState() {
    const status = byId('approvalStatus'); const notice = byId('approvalNotice'); const approve = byId('approveReport'); const pdf = byId('viewPdf');
    const approved = report.status === 'APPROVED';
    const delivered = report.status === 'DELIVERED';
    setReadonly(approved || delivered);
    status.textContent = delivered ? '送付済み' : approved ? '承認済み' : '';
    hidden(status, !approved && !delivered);
    if (approved) {
      pdf.href = `${apiBase}${encodeURIComponent(caseId)}/design-v2/reports/${encodeURIComponent(reportId)}/pdf`;
      notice.textContent = 'このレポートの内容は確定されています。'; hidden(notice, false); hidden(approve, true); hidden(pdf, false); return;
    }
    hidden(pdf, true);
    if (delivered) {
      notice.textContent = '送付済みのレポートです。内容は変更できません。';
      hidden(notice, false); hidden(approve, true); return;
    }
    if (report.status === 'REVIEW_REQUIRED' && approvalCurrent()) {
      notice.textContent = '承認すると、このレポートの内容が確定されます。'; hidden(notice, false); hidden(approve, false);
    } else if (report.status === 'REVIEW_REQUIRED') {
      notice.textContent = staleApprovalMessage; hidden(notice, false); hidden(approve, true);
    } else {
      hidden(notice, true); hidden(approve, true);
    }
  }

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
  function bodyPage(pageNo, chapters, className = '') { const page = reportPage(className); page.append(documentHeader(), ...chapters.filter(Boolean), documentFooter(pageNo)); return page; }

  function renderCover(content) {
    const page = reportPage('report-cover'); const logo = document.createElement('img'); logo.className = 'report-logo'; logo.src = '/admin/assets/it-management-kaizen-logo-v1.png'; logo.alt = 'IT経営KAIZEN';
    const atlibLogo = document.createElement('img'); atlibLogo.className = 'cover-atlib-logo'; atlibLogo.src = '/admin/assets/atlib-corporate-logo.png'; atlibLogo.alt = 'atLIB';
    page.append(logo, ui.el('div', 'cover-rule'), ui.el('p', 'cover-service', 'IT経営KAIZEN 無料診断'), ui.el('h1', '', '診断結果レポート'), paragraph('会社の未来から、ITを考える。', 'cover-message'));
    const recipient = ui.el('div', 'report-recipient'); recipient.append(ui.el('strong', '', content.recipient.organizationDisplayName)); if (content.recipient.role) recipient.append(paragraph(content.recipient.role)); if (content.recipient.name) recipient.append(paragraph(`${content.recipient.name} 様`)); recipient.append(paragraph(`診断日：${content.diagnosisDate || '未記入'}`)); page.append(recipient);
    const issuer = ui.el('div', 'cover-issuer'); issuer.append(atlibLogo, paragraph('atLIB株式会社')); page.append(issuer); return page;
  }

  function renderStaticIntroduction() {
    const node = chapter('', 'このレポートをお読みいただく前に'); node.classList.add('report-introduction-page');
    [
      'このたびは「IT経営KAIZEN 無料診断」をご利用いただき、ありがとうございます。',
      'IT経営KAIZEN 無料診断は、ITの「良し悪し」を採点する診断ではありません。会社が実現したい未来を起点に、ITについて今どこまで分かっているのかを整理し、経営判断のために次に何を詳しく確認する価値があるのかを明らかにする診断です。',
      'ITについて「分からないこと」があること自体を、問題とは考えていません。大切なのは、分かっていることと、まだ分かっていないことを分け、何を確認すれば経営として判断できるのかを明らかにすることです。',
      'そのため、このレポートでは特定のシステムやAIの導入を前提とせず、今回のアンケートとヒアリングをもとに、貴社が実現したい未来、現在どこまで分かっているか、確認する価値があること、現時点ではまだ判断できないこと、次に確認したい事実を整理しています。',
      '本レポートが、これからのITについて考え、経営として次の判断を行うための材料となれば幸いです。',
    ].forEach(text => node.append(paragraph(text, 'introduction-paragraph')));
    const diagram = ui.el('section', 'report-concept-diagram');
    const image = document.createElement('img'); image.src = '/admin/assets/report-guide-v1.png'; image.alt = ''; image.className = 'report-concept-art';
    const labels = ui.el('div', 'report-concept-labels');
    [
      ['diagram-future', '01 実現したい会社の未来'],
      ['diagram-context', '未来を基準に、アンケート＋ヒアリングで現在を確認'],
      ['diagram-current', '02 現在どこまで分かっているか'],
      ['diagram-unknown', '04 現時点ではまだ判断できないこと'],
      ['diagram-improvement', '03 未来に向けて確認することで、改善が期待できること'],
      ['diagram-technology', '技術'], ['diagram-operation', '運用'], ['diagram-management', '管理'],
      ['diagram-facts', '05 次に確認する価値があること'],
      ['diagram-next-decision', '次の経営判断へ'],
    ].forEach(([className, text]) => labels.append(ui.el('p', `report-concept-label ${className}`, text)));
    diagram.append(image, labels);
    node.append(diagram); return node;
  }

  function detail(section, subtitle, note) { const node = chapter(section.title.slice(0, 2), section.title.slice(3), subtitle); if (note) node.append(paragraph(note, 'chapter-note')); appendEntries(node, section.entries); return node; }
  function renderFacts(content) {
    const node = chapter('05', '次に確認する価値があること');
    content.factCandidates.forEach((candidate, index) => { const item = ui.el('article', 'fact-candidate'); const title = ui.el('h3'); title.append(ui.el('span', 'fact-candidate-number', String(index + 1).padStart(2, '0')), ui.el('span', 'fact-candidate-title', candidate.whatToVerify)); item.append(title, paragraph(`${candidate.whyItMattersToFuture} ${candidate.whatMayBecomeKnowable}`)); node.append(item); });
    return node;
  }
  function renderInterpretation(firstText, secondText) {
    const node = ui.el('section', 'report-interpretation');
    node.append(ui.el('h3', '', 'この診断結果が表していること'), paragraph(firstText), ui.el('h3', '', '確認することで、こんな判断につながる可能性があります'), paragraph(secondText));
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
      renderCover(content),
      bodyPage(2, [renderStaticIntroduction()], 'report-introduction-document'),
      bodyPage(3, [detail(sections.get('FUTURE'))], 'report-future-page'),
      bodyPage(4, [detail(sections.get('CURRENT_UNDERSTANDING'))], 'report-current-page'),
      bodyPage(5, [detail(sections.get('LENSES')), renderInterpretation('ここに示しているのは、現時点で「問題がある」と判断した項目ではありません。貴社が実現したい未来と、アンケート・ヒアリングで確認した現在の状況を照らし合わせ、技術・運用・管理の視点から、さらに確認することで改善の可能性を検討できるテーマを整理したものです。', '実際の業務やITの状況を確認することで、システムを変えるべきなのか、仕事の進め方や運用を見直すべきなのか、経営として把握・管理する仕組みを整えるべきなのかなど、どこに改善の余地があり、何を優先して取り組む価値があるのかを判断する材料につながります。')], 'report-improvement-page'),
      bodyPage(6, [detail(sections.get('UNKNOWNS')), renderInterpretation('ここに示しているのは、今回の無料診断だけでは、まだ事実として確認できていないことです。分からないことがあること自体を、問題とは判断していません。貴社が実現したい未来に向けて経営判断を行ううえで、現時点では判断材料が十分ではないテーマを整理しています。', '必要な事実を確認することで、現在のままでよいのか、改善する必要があるのか、今は対応しなくてよいのかを判断できるようになります。「分からない」を「判断できる」に変えることが、ここで確認する目的です。')], 'report-unknowns-page'),
      bodyPage(7, [renderFacts(content), renderInterpretation('ここに示しているのは、今回の診断結果から、次の経営判断に進むために事実として確認する価値があることです。すべてを確認する必要があるという意味ではありません。貴社が今後どの判断を行いたいかに応じて、必要なものを選んで確認していくためのテーマです。', '実際の業務、情報の流れ、ITの使われ方、運用や管理の状況を確認することで、改善の必要性や優先順位、取り得る選択肢を具体化し、何をするか、何をしないかを経営として判断するための材料につながります。')], 'report-facts-page'),
      bodyPage(8, [renderNextDecisionPage()], 'report-next-decision-document'),
    );
  }

  function workflowMessage(text, isError = false) {
    const node = byId('assessmentWorkflowStatus');
    node.textContent = text;
    node.className = isError ? 'status error' : 'status';
  }

  function resetPreparationPanel() {
    currentPreparationHandoff = null;
    hidden(byId('preparationSelection'), true);
    byId('preparationStatus').textContent = '';
    byId('preparationSummary').replaceChildren();
    byId('savePreparation').disabled = true;
  }

  function prepStatus(text, error = false) {
    const node = byId('preparationStatus');
    node.textContent = text;
    node.className = error ? 'status error' : 'status';
  }

  function populatePreparation(saved) {
    const future = byId('preparationFuture');
    future.replaceChildren();
    const blank = document.createElement('option'); blank.value = ''; blank.textContent = '選択してください';
    future.append(blank);
    const section = report.content.sections.filter(item => item.key === 'FUTURE');
    if (section.length !== 1 || !Array.isArray(section[0].entries)) throw new Error('Future unavailable');
    section[0].entries.forEach((entry, index) => {
      if (!entry || !entry.trim()) return;
      const option = document.createElement('option');
      option.value = String(index); option.textContent = entry;
      future.append(option);
    });
    const choice = saved?.selection;
    future.value = Number.isInteger(choice?.futureEntryIndex) ? String(choice.futureEntryIndex) : '';
    const selected = new Map((choice?.candidates || []).map(item => [item.candidateId, item]));
    const list = byId('preparationCandidates');
    list.replaceChildren();
    for (const candidate of report.content.factCandidates) {
      const row = document.createElement('section'); row.className = 'card preparation-candidate';
      row.dataset.candidateId = candidate.id;
      const label = document.createElement('label');
      const check = document.createElement('input'); check.type = 'checkbox';
      check.className = 'preparation-check';
      check.checked = selected.has(candidate.id);
      const name = document.createElement('span'); name.textContent = candidate.whatToVerify;
      label.append(check, name);
      const reason = document.createElement('p'); reason.textContent = candidate.whyItMattersToFuture;
      const controls = document.createElement('div'); controls.className = 'preparation-details';
      const areaLabel = document.createElement('label'); areaLabel.textContent = '確認領域';
      const area = document.createElement('select'); area.className = 'preparation-area';
      for (const [value, title] of [
        ['', '選択してください'], ['TECHNOLOGY', '技術'], ['OPERATION', '運用'], ['MANAGEMENT', '管理'],
      ]) {
        const option = document.createElement('option'); option.value = value; option.textContent = title;
        area.append(option);
      }
      area.value = selected.get(candidate.id)?.area || '';
      areaLabel.append(area);
      const questionLabel = document.createElement('label'); questionLabel.textContent = '確認したい質問（任意）';
      const question = document.createElement('textarea'); question.className = 'preparation-question';
      question.maxLength = 1000; question.value = selected.get(candidate.id)?.confirmationQuestion || '';
      questionLabel.append(question);
      const recipientLabel = document.createElement('label'); recipientLabel.textContent = '確認する相手（任意）';
      const recipient = document.createElement('input'); recipient.className = 'preparation-recipient';
      recipient.maxLength = 200; recipient.value = selected.get(candidate.id)?.requestedFrom || '';
      recipientLabel.append(recipient);
      controls.append(areaLabel, questionLabel, recipientLabel);
      controls.hidden = !check.checked;
      check.addEventListener('change', () => { controls.hidden = !check.checked; });
      row.append(label, reason, controls); list.append(row);
    }
  }

  function summarizePreparation(view) {
    const summary = byId('preparationSummary'); summary.replaceChildren();
    if (!view.saved) return;
    const header = document.createElement('p');
    header.textContent = `準備下書き保存済み（第${view.saved.version}版）`;
    summary.append(header);
    const counts = view.agenda?.counts;
    if (counts) {
      const p = document.createElement('p');
      p.textContent = `要確認 ${counts.toConfirm}件・確認質問未設定 ${counts.pendingWithoutQuestion}件（無料診断由来の候補は未確認）`;
      summary.append(p);
    }
    const list = document.createElement('ul');
    for (const action of view.agenda?.nextActions || []) {
      const li = document.createElement('li');
      li.textContent = `未確認：${action.topic}／${action.question}`;
      list.append(li);
    }
    summary.append(list);
  }

  async function loadPreparationFor(handoff) {
    currentPreparationHandoff = null;
    hidden(byId('preparationSelection'), true);
    const response = await fetch(`${handoffBase}${encodeURIComponent(caseId)}/preparation`);
    if (!response.ok) throw new Error('Preparation state unavailable');
    const payload = await response.json();
    const view = payload?.view;
    if (!view || (view.saved && (view.saved.handoffId !== handoff.id
      || view.saved.sourceCaseId !== caseId))) throw new Error('Preparation state mismatch');
    populatePreparation(view.saved);
    summarizePreparation(view);
    currentPreparationHandoff = handoff;
    hidden(byId('preparationSelection'), false);
    byId('savePreparation').disabled = false;
    prepStatus(view.saved ? '保存済みの準備選択を表示しています。' : 'Futureと必要な確認事項を選択してください。');
    return view;
  }

  function collectPreparationSelection() {
    const value = byId('preparationFuture').value;
    if (value === '') throw new Error('実現したい会社の姿を選んでください。');
    const futureEntryIndex = Number(value);
    const candidates = [];
    for (const row of byId('preparationCandidates').querySelectorAll('.preparation-candidate')) {
      if (!row.querySelector('.preparation-check').checked) continue;
      const area = row.querySelector('.preparation-area').value;
      if (!area) throw new Error('選んだ確認事項の領域を指定してください。');
      const confirmationQuestion = row.querySelector('.preparation-question').value.trim();
      const requestedFrom = row.querySelector('.preparation-recipient').value.trim();
      if (requestedFrom && !confirmationQuestion) throw new Error('確認する相手を指定する場合は質問も入力してください。');
      candidates.push({
        candidateId: row.dataset.candidateId,
        area,
        ...(confirmationQuestion ? { confirmationQuestion } : {}),
        ...(requestedFrom ? { requestedFrom } : {}),
      });
    }
    return { futureEntryIndex, candidates };
  }

  async function loadWorkflow() {
    feedbackState = null;
    resetPreparationPanel();
    hidden(byId('assessmentNextStep'), true);
    hidden(byId('deliveryAction'), true);
    hidden(byId('feedbackEntry'), true);
    hidden(byId('handoffAction'), true);
    hidden(byId('returnToAnalysis'), true);
    if (!['APPROVED', 'DELIVERED'].includes(report.status)) return;
    hidden(byId('assessmentNextStep'), false);
    workflowMessage('');
    const prefix = `${apiBase}${encodeURIComponent(caseId)}`;
    try {
      const stateResponse = await fetch(`${prefix}/feedback/state`);
      if (!stateResponse.ok) throw new Error('feedback state unavailable');
      const state = await stateResponse.json();
      feedbackState = state;
      if (report.status === 'APPROVED') {
        if (state.caseStatus === 'REPORT_APPROVED') {
          hidden(byId('deliveryAction'), false);
          workflowMessage('実際に顧客へ送付した後に「送付済みとして記録」を押してください。');
        } else workflowMessage('このレポートの送付状態を確認してください。', true);
        return;
      }
      if (state.feedbackReportId !== reportId) {
        workflowMessage('過去のレポートです。現在のフィードバック対象ではありません。');
        return;
      }
      if (state.caseStatus === 'FEEDBACK_PENDING') {
        hidden(byId('feedbackEntry'), false);
        workflowMessage('経営者との対話後に、判断と次の行動を記録してください。');
        return;
      }
      if (state.latestDecision?.route === 'FOCUSED_CONFIRMATION') {
        byId('returnToAnalysis').href = `/admin/free-diagnosis-v2-analysis.html?caseId=${encodeURIComponent(caseId)}`;
        hidden(byId('returnToAnalysis'), false);
        workflowMessage('追加確認を行う判断が記録されています。');
        return;
      }
      if (state.caseStatus === 'CLOSED' && state.latestDecision?.route === 'DESIGN_ASSESSMENT') {
        hidden(byId('handoffAction'), false);
        const hResponse = await fetch(`${handoffBase}${encodeURIComponent(caseId)}/latest`);
        if (!hResponse.ok) throw new Error('handoff read unavailable');
        const saved = (await hResponse.json()).handoff;
        const current = saved && saved.feedbackDecisionId === state.latestDecision.id;
        byId('createHandoff').disabled = Boolean(current);
        byId('handoffStatus').textContent = current
          ? `引継ぎ済み（第${saved.version}版）`
          : saved ? '過去の引継ぎがあります。最新の判断を引き継いでください。' : '';
        workflowMessage(current ? '設計Assessmentへの引継ぎを記録済みです。' : '設計Assessmentへ引継ぐことができます。');
        if (current && saved.reportId === reportId) {
          try { await loadPreparationFor(saved); }
          catch { resetPreparationPanel(); prepStatus('Assessment準備の状態を確認できません。画面を更新してください。', true); }
        }
        return;
      }
      workflowMessage('経営フィードバックは記録済みです。');
    } catch {
      feedbackState = null;
      hidden(byId('deliveryAction'), true);
      hidden(byId('feedbackEntry'), true);
      hidden(byId('handoffAction'), true);
      workflowMessage('現在の状態を確認できませんでした。再読み込みしてください。', true);
    }
  }

  async function postWorkflow(url, body) {
    const response = await fetch(url, {
      method: 'POST',
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  }

  async function load() {
    if (!caseId || !reportId) { hidden(unavailable, false); return; }
    byId('backToAnalysis').href = `/admin/free-diagnosis-v2-analysis.html?caseId=${encodeURIComponent(caseId)}`;
    const [response, workspaceResponse] = await Promise.all([
      fetch(`${apiBase}${encodeURIComponent(caseId)}/design-v2/report-drafts/${encodeURIComponent(reportId)}`),
      fetch(`${apiBase}${encodeURIComponent(caseId)}/design-v2/post-hearing-analysis`),
    ]);
    if (!response.ok) { hidden(unavailable, false); return; }
    report = await response.json(); postHearingWorkspace = workspaceResponse.ok ? await workspaceResponse.json() : null;
    renderForm(); renderPreview(); renderApprovalState(); hidden(workspace, false);
    await loadWorkflow();
  }
  async function save() {
    const content = editedContent();
    const response = await fetch(`${apiBase}${encodeURIComponent(caseId)}/design-v2/report-drafts/${encodeURIComponent(reportId)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(content) });
    if (!response.ok) { showMessage('提案情報を保存できませんでした。もう一度お試しください。', 'error'); return; }
    report = await response.json(); renderForm(); renderPreview(); showMessage('提案情報を保存しました。');
  }
  async function approve() {
    if (!window.confirm('この内容でレポートを承認します。承認後は、このレポートの内容を変更できません。よろしいですか？')) return;
    const button = byId('approveReport'); button.disabled = true;
    try {
      const response = await fetch(`${apiBase}${encodeURIComponent(caseId)}/design-v2/report-drafts/${encodeURIComponent(reportId)}/approve`, { method: 'POST' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        showMessage(body?.message || 'レポートを承認できませんでした。もう一度お試しください。', 'error');
        return;
      }
      await load(); showMessage('レポートを承認しました。');
    } finally { button.disabled = false; }
  }
  byId('markDelivered').addEventListener('click', async () => {
    if (report?.status !== 'APPROVED' || feedbackState?.caseStatus !== 'REPORT_APPROVED') return;
    if (!window.confirm('このPDFを実際に顧客へ送付しましたか？送付済みとして記録します。')) return;
    const button = byId('markDelivered'); button.disabled = true;
    try {
      await postWorkflow(`${apiBase}${encodeURIComponent(caseId)}/reports/${encodeURIComponent(reportId)}/deliver`);
      await load();
      showMessage('送付済みとして記録しました。');
    } catch { workflowMessage('送付を記録できませんでした。現在の状態を確認してください。', true); }
    finally { button.disabled = false; }
  });

  byId('recordFeedback').addEventListener('click', async () => {
    if (report?.status !== 'DELIVERED' || feedbackState?.caseStatus !== 'FEEDBACK_PENDING'
        || feedbackState?.feedbackReportId !== reportId) return;
    const route = byId('feedbackRoute').value;
    const materialDecision = byId('feedbackDecision').value.trim();
    const nextAction = byId('feedbackNextAction').value.trim();
    if (!materialDecision || !nextAction) { workflowMessage('今回の判断と次の行動を入力してください。', true); return; }
    const button = byId('recordFeedback'); button.disabled = true;
    try {
      if (!feedbackState.feedbackStarted) {
        await postWorkflow(`${apiBase}${encodeURIComponent(caseId)}/feedback/start`);
        feedbackState.feedbackStarted = true;
      }
      await postWorkflow(`${apiBase}${encodeURIComponent(caseId)}/feedback/decision`, {
        route, materialDecision, nextAction,
      });
      await load();
      showMessage('経営フィードバックを記録しました。');
    } catch {
      await loadWorkflow();
      workflowMessage('経営フィードバックを記録できませんでした。状態を確認してから再試行してください。', true);
    } finally { button.disabled = false; }
  });

  byId('createHandoff').addEventListener('click', async () => {
    if (report?.status !== 'DELIVERED' || feedbackState?.caseStatus !== 'CLOSED'
        || feedbackState?.feedbackReportId !== reportId
        || feedbackState?.latestDecision?.route !== 'DESIGN_ASSESSMENT') return;
    if (!window.confirm('最新の経営判断を設計Assessmentへ引き継ぎますか？')) return;
    const button = byId('createHandoff'); button.disabled = true;
    try {
      const result = await postWorkflow(`${handoffBase}${encodeURIComponent(caseId)}`);
      if (!result?.handoff || result.handoff.feedbackDecisionId !== feedbackState.latestDecision.id) {
        throw new Error('handoff response mismatch');
      }
      await loadWorkflow();
      showMessage('設計Assessmentへの引継ぎを記録しました。');
    } catch {
      workflowMessage('引継ぎに失敗しました。現在の判断と提出レポートを確認してください。', true);
    } finally { button.disabled = false; }
  });

  byId('savePreparation').addEventListener('click', async () => {
    if (report?.status !== 'DELIVERED' || feedbackState?.caseStatus !== 'CLOSED'
      || feedbackState?.feedbackReportId !== reportId
      || feedbackState?.latestDecision?.route !== 'DESIGN_ASSESSMENT'
      || !currentPreparationHandoff || currentPreparationHandoff.reportId !== reportId
      || currentPreparationHandoff.feedbackDecisionId !== feedbackState.latestDecision.id) return;
    let selection;
    try { selection = collectPreparationSelection(); }
    catch (error) { prepStatus(error.message || '選択内容を確認してください。', true); return; }
    const button = byId('savePreparation'); button.disabled = true;
    try {
      const result = await postWorkflow(`${handoffBase}${encodeURIComponent(caseId)}/preparation`, selection);
      if (!result?.view?.saved || result.view.saved.handoffId !== currentPreparationHandoff.id
        || JSON.stringify(result.view.saved.selection) !== JSON.stringify(selection)) {
        throw new Error('Preparation response mismatch');
      }
      const fresh = await loadPreparationFor(currentPreparationHandoff);
      if (!fresh.saved || JSON.stringify(fresh.saved.selection) !== JSON.stringify(selection)) {
        throw new Error('Preparation refresh mismatch');
      }
      prepStatus('Assessment準備の選択を保存しました。');
    } catch { prepStatus('保存を確認できませんでした。現在の状態を確認してください。', true); }
    finally { button.disabled = !currentPreparationHandoff; }
  });

  byId('reportForm').addEventListener('submit', event => { event.preventDefault(); save(); });
  byId('saveReport').addEventListener('click', save);
  byId('approveReport').addEventListener('click', approve);
  load().catch(() => hidden(unavailable, false));
})();
