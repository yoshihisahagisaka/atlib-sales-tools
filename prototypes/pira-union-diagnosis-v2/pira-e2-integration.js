(() => {
  'use strict';
  const config = globalThis.__PIRA_E2_CONFIG__;
  const app = document.getElementById('pira-intake');
  let receiptId = null, issueToken = null, submissionKey = null;
  const api = async (path, body, token) => {
    const response = await fetch(`${config.intakeApiBase}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const value = await response.json(); if (!response.ok) throw Object.assign(Error('api'), value.error || {}); return value;
  };
  const id = () => crypto.randomUUID();
  const message = value => { let target = document.getElementById('pira-flow-status'); if (!target) { target=document.createElement('p'); target.id='pira-flow-status'; target.setAttribute('role','alert'); document.body.prepend(target); } target.textContent = value || ''; };
  const consent = contract => contract.initiativeKind === 'UNION' ? '本診断は、国際連携推進協会（国連協）が、組合および所属企業の情報セキュリティ向上を支援するために実施しています。\n\nご入力いただいた情報は、国連協が本診断の運営や今後の支援施策の企画・検討に利用します。\n\n診断システムの運営および情報の取り扱いは、国連協から委託を受けたatLIB株式会社が担当します。atLIBが取得情報を独自の営業活動に利用することはありません。' : '本診断は、atLIB株式会社が、企業の情報セキュリティへの理解を深め、今後の対策に役立てていただくために提供しています。\n\nご入力いただいた情報は、本診断の運営や、情報セキュリティに関する支援・サービスのご案内に利用します。';
  const form = contract => `<section><h1>${config.brandName}</h1><h2>企業情報の入力</h2><form id="pira-form"><label>企業名<input name="companyName" required maxlength="200"></label><label>担当者名<input name="contactName" required maxlength="200"></label><label>メールアドレス<input name="verifiedEmail" readonly></label><label>WebサイトURL<input name="websiteUrl" type="url" required maxlength="2000"></label><label>電話番号（任意）<input name="phone" maxlength="50"></label>${contract.initiativeKind === 'UNION' ? '<label>所属組合名<input name="unionName" required maxlength="200"></label><label>住所<textarea name="address" required maxlength="500"></textarea></label>' : ''}<h3>ご入力いただく情報の取り扱いについて</h3><p id="pira-consent-copy" style="white-space:pre-line">${consent(contract)}</p><button type="submit">同意して診断に進む</button></form></section>`;
  const startQuestions = async () => { const token = await issueToken(); await api(`/submissions/${receiptId}/state`, { state: 'ANSWERING' }, token); app.hidden = true; document.getElementById('app').hidden = false; globalThis.PiraV7PublicApp.start(); document.getElementById('start')?.click(); };
  globalThis.publicAuthIntakeAdapter = async value => {
    issueToken = value.issueToken; const response = await fetch(`${config.intakeApiBase}/intake-contract`); const contract = await response.json();
    document.getElementById('auth-root').hidden = true; app.hidden = false; app.innerHTML = form(contract); app.querySelector('[name=verifiedEmail]').value = value.email;
    document.getElementById('pira-form').addEventListener('submit', async event => { event.preventDefault(); message(''); const consentCopy=document.getElementById('pira-consent-copy'); if(!consentCopy||!consentCopy.textContent.trim()||!consentCopy.getClientRects().length){message('同意内容を表示できません。');return;} const data = Object.fromEntries(new FormData(event.currentTarget)); submissionKey ||= id(); try { const result = await api('/submissions', { initiativeCode: contract.initiativeCode, companyName: data.companyName, contactName: data.contactName, websiteUrl: data.websiteUrl, ...(data.phone ? { phone: data.phone } : {}), ...(contract.initiativeKind === 'UNION' ? { unionName: data.unionName, address: data.address } : {}), accepted: true, consentVersion: contract.consent.version, idempotencyKey: submissionKey }, await issueToken()); receiptId = result.receiptId; await startQuestions(); } catch (error) { message(error.code || '受付を完了できませんでした。'); } });
  };
  let completionRequested = false;
  document.addEventListener('pira:v7-report-rendered', async () => { if (!receiptId || !issueToken || completionRequested) return; completionRequested = true; try { await api(`/submissions/${receiptId}/state`, { state: 'COMPLETED' }, await issueToken()); } catch { completionRequested = false; message('完了状態を更新できませんでした。時間をおいて、もう一度結果を表示してください。'); } });
})();
