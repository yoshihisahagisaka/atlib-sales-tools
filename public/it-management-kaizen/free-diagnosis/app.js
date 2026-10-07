(() => {
  const app = document.querySelector('#app');
  const bookingUrl = 'https://timerex.net/s/yoshihisa.hagisaka_e611/446dce29';
  const state = { step: 0, screen: 'questions', answers: {}, idempotencyKey: crypto.randomUUID() };
  const questions = [
    { id: 'Q1', title: '会社の規模と拠点について教えてください', fields: [['employeeSize', '従業員規模', ['EMP_1_20','EMP_21_50','EMP_51_100','EMP_101_300','EMP_301_PLUS','EMP_UNKNOWN'], ['1〜20名','21〜50名','51〜100名','101〜300名','301名以上','分からない']], ['locations', '拠点数', ['SITE_1','SITE_2_3','SITE_4_PLUS','SITE_NOT_APPLICABLE','SITE_UNKNOWN'], ['1拠点','2〜3拠点','4拠点以上','該当しない','分からない']]] },
    { id: 'Q2', title: '今後の会社の変化として近いものを選んでください（複数可）', multi: true, opts: [['HEADCOUNT_GROWTH','人員を増やす'],['SITE_CHANGE','拠点を変える・増やす'],['NEW_BUSINESS','新しい事業を始める'],['ORG_CHANGE','組織を変える'],['IPO_PREPARATION','上場準備を進める'],['WORKSTYLE_CHANGE','働き方を変える'],['BUSINESS_EXPANSION','事業を広げる'],['LEAN_SCALING','少人数で成長・運営する'],['STABILITY_EFFICIENCY','安定・効率を高める'],['NO_MAJOR_CHANGE','大きな変化は予定していない'],['OTHER','その他']] },
    { id: 'Q3', title: 'ITで実現したいことを選んでください（複数可）', multi: true, opts: [['SUPPORT_CHANGE','変化を支えたい'],['IMPROVE_PRODUCTIVITY','生産性を高めたい'],['PROTECT_BUSINESS','事業を守りたい'],['ENABLE_MANAGEMENT_DECISION','経営判断を支えたい'],['STRATEGIC_IT_USE','ITを戦略的に活かしたい'],['STABILIZE_IT_OPERATION','IT運営を安定させたい'],['OPTIMIZE_IT_INVESTMENT','IT投資を見直したい'],['UNDECIDED','まだ決めていない'],['OTHER','その他']] },
    { id: 'Q4', title: '現在、特に気になっていることに近いものを選んでください', opts: [['MANAGEMENT_DECISION_CONCERN','経営判断に必要な情報'],['IT_OPERATION_CONCERN','IT運営の安定性'],['BUSINESS_PROTECTION_CONCERN','事業を守る備え'],['PRODUCTIVITY_OPPORTUNITY','業務の生産性'],['CHANGE_READINESS_CONCERN','変化への備え'],['STRATEGIC_USE_OPPORTUNITY','ITの戦略的活用'],['NO_MAJOR_CONCERN','大きな懸念はない'],['OTHER','その他']] },
    { id: 'Q5', title: 'ITや業務の状況は、どの程度見えていますか', opts: [['VISIBLE_ENOUGH','必要な範囲は把握できている'],['MOSTLY_VISIBLE','おおむね把握できている'],['PARTIALLY_VISIBLE','一部だけ把握できている'],['VISIBLE_ON_REQUEST','依頼すれば確認できる'],['LARGELY_UNKNOWN','あまり把握できていない']] },
    { id: 'Q6', title: '経営判断に必要な情報は、どのように届いていますか', opts: [['REGULAR_AND_USABLE','定期的に届き、判断に使える'],['DELIVERED_NOT_USABLE','届くが、判断には使いにくい'],['ON_REQUEST_USABLE','必要な時に確認できる'],['NOT_SUFFICIENTLY_DELIVERED','十分には届いていない'],['INFORMATION_NEED_UNCLEAR','何が必要かまだ整理できていない']] },
    { id: 'Q7', title: '60分の無料診断で特に相談したいことがあれば教えてください（任意）', optional: true },
  ];
  const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const labels = id => (Array.isArray(state.answers[id]) ? state.answers[id] : [state.answers[id]]).filter(Boolean).map(value => questions.find(q => q.id === id).opts.find(([code]) => code === value)?.[1]).filter(Boolean).join('、');
  const error = () => '<p class="error" id="error"></p>';
  const nav = () => `<div class="actions">${state.step ? '<button id="back" type="button">戻る</button>' : ''}<button id="next" type="button">次へ</button></div>${error()}`;
  function renderQuestions() {
    const q = questions[state.step]; let body = `<p class="progress">事前アンケート ${state.step + 1} / ${questions.length}</p><h2>${q.title}</h2>`;
    if (q.fields) body += q.fields.map(([id, label, codes, display]) => `<label>${label}<select data-field="${id}"><option value="">選択してください</option>${codes.map((code, i) => `<option value="${code}" ${state.answers.Q1?.[id] === code ? 'selected' : ''}>${display[i]}</option>`).join('')}</select></label>`).join('');
    else if (q.optional) body += `<label>ご相談内容<textarea id="q7" maxlength="4000">${esc(state.answers.Q7 || '')}</textarea></label>`;
    else body += `<fieldset>${q.opts.map(([value, label]) => `<label><input type="${q.multi ? 'checkbox' : 'radio'}" name="answer" value="${value}" ${(q.multi ? state.answers[q.id]?.includes(value) : state.answers[q.id] === value) ? 'checked' : ''}>${label}</label>`).join('')}</fieldset>`;
    app.innerHTML = body + nav();
  }
  function renderConversion() {
    app.innerHTML = `<h2>ご回答ありがとうございました</h2><p>御社について、60分で確認する準備ができました。</p><p>この診断では、ITの良し悪しを採点したり、システムの導入を勧めたりするのではありません。</p><p>ご回答をもとに、御社が実現したいことに対して、「今どこまで分かっているか」「次に何を確認すれば、経営として判断できるか」を一緒に整理します。</p><p>診断後には、今回確認できたこと・まだ分からないこと・次に確認する価値があることを整理してお渡しします。</p><p>60分・無料。ITの専門知識は必要ありません。</p><h3>これから実現したいこと</h3><p>${esc(labels('Q2'))}</p><h3>ITについて望んでいる状態</h3><p>${esc(labels('Q3'))}</p><div class="actions"><button id="back" type="button">回答を見直す</button><button id="to-application" type="button">申込者情報を入力する</button></div>${error()}`;
  }
  function renderApplication() {
    app.innerHTML = `<h2>申込者情報</h2><p>60分の無料IT経営診断のお申込みに必要な情報をご入力ください。</p><label>会社名<input id="company" maxlength="200"></label><label>お名前<input id="name" maxlength="200"></label><label>メールアドレス<input id="email" type="email" maxlength="320"></label><label>電話番号（任意）<input id="phone" maxlength="50"></label><label>ご紹介者（任意）<input id="referralPersonName" maxlength="200"><small>ご紹介でお申込みの場合は、ご紹介いただいた方のお名前をご入力ください。</small></label><label>お立場<select id="role"><option value="MANAGEMENT">経営者・役員</option><option value="IT_DECISION_OWNER">ITの意思決定を担当</option><option value="IT_OR_BUSINESS_STAFF">ITまたは業務の担当</option></select></label><fieldset><label><input id="privacy" type="checkbox"><a href="https://www.atlib.jp/policy/" target="_blank" rel="noopener noreferrer">プライバシーポリシー</a>に同意します</label><label><input id="use" type="checkbox">無料診断の準備・実施のため、回答内容を利用することに同意します</label></fieldset><div class="actions"><button id="back" type="button">戻る</button><button id="submit" type="button">60分の無料IT経営診断を申し込む</button></div>${error()}`;
  }
  function renderComplete() { app.innerHTML = `<h2>無料IT経営診断のお申込みを受け付けました</h2><p>あと1ステップです。</p><p>続けて、60分の無料IT経営診断の日時をお選びください。</p><p>事前アンケートと御社の情報を確認して診断準備を行います。</p><p><a id="timerex-link" href="${bookingUrl}" target="_blank" rel="noopener noreferrer">60分診断の日程を予約する</a></p>`; }
  function render() { if (state.screen === 'questions') renderQuestions(); else if (state.screen === 'conversion') renderConversion(); else if (state.screen === 'application') renderApplication(); else renderComplete(); bind(); }
  function fail(message) { const target = document.querySelector('#error'); if (target) target.textContent = message; }
  function saveAnswer() { const q = questions[state.step]; if (q.fields) { const answer = {}; q.fields.forEach(([id]) => { answer[id] = document.querySelector(`[data-field="${id}"]`).value; }); if (Object.values(answer).some(value => !value)) return false; state.answers.Q1 = answer; } else if (q.optional) state.answers.Q7 = document.querySelector('#q7').value.trim(); else { const values = [...document.querySelectorAll('input[name="answer"]:checked')].map(input => input.value); if (!values.length) return false; state.answers[q.id] = q.multi ? values : values[0]; } return true; }
  function bind() {
    const back = document.querySelector('#back'); if (back) back.onclick = () => { if (state.screen === 'questions') state.step--; else if (state.screen === 'conversion') { state.screen = 'questions'; state.step = questions.length - 1; } else state.screen = 'conversion'; render(); };
    const next = document.querySelector('#next'); if (next) next.onclick = () => { if (!saveAnswer()) return fail('すべて選択してください。'); if (state.step === questions.length - 1) state.screen = 'conversion'; else state.step++; render(); };
    const application = document.querySelector('#to-application'); if (application) application.onclick = () => { state.screen = 'application'; render(); };
    const submit = document.querySelector('#submit'); if (submit) submit.onclick = submitForm;
  }
  async function submitForm() {
    const value = selector => document.querySelector(selector).value.trim(); if (!value('#company') || !value('#name') || !value('#email') || !document.querySelector('#privacy').checked || !document.querySelector('#use').checked) return fail('必須項目と同意を確認してください。');
    const respondentRole = document.querySelector('#role').value, envelope = (questionCode, answerValue) => ({ schemaVersion: 1, questionCode, answerValue, responseState: 'ANSWERED', respondent: { role: respondentRole }, provenance: { channel: 'SELF', source: 'CUSTOMER_SELF' } }), answers = questions.slice(0, 6).map(question => envelope(question.id, state.answers[question.id])); if (state.answers.Q7) answers.push(envelope('Q7', state.answers.Q7));
    const url = new URL(location.href), body = { idempotencyKey: state.idempotencyKey, company: { name: value('#company') }, contact: { name: value('#name'), email: value('#email'), phone: value('#phone') || undefined, respondentRole }, referralPersonName: value('#referralPersonName') || undefined, answers, consent: { privacy: true, diagnosisUse: true, wordingVersion: 'it_management_public_self_consent_v1' }, attribution: { acquisitionSourceType: url.searchParams.get('acquisition_source_type') || undefined, acquisitionSourceName: url.searchParams.get('acquisition_source_name') || undefined, utmSource: url.searchParams.get('utm_source') || undefined, utmMedium: url.searchParams.get('utm_medium') || undefined, utmCampaign: url.searchParams.get('utm_campaign') || undefined, utmContent: url.searchParams.get('utm_content') || undefined, utmTerm: url.searchParams.get('utm_term') || undefined, landingUrl: location.href, referrer: document.referrer || undefined } };
    try { const response = await fetch('/api/public/it-management-kaizen/free-diagnosis-v1/submissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!response.ok) throw Error(); state.screen = 'complete'; render(); } catch { fail('送信に失敗しました。時間をおいて再度お試しください。'); }
  }
  render();
})();
