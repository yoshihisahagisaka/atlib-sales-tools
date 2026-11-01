(() => {
  'use strict';
  const config = globalThis.__PIRA_E2_CONFIG__;
  const app = document.getElementById('pira-intake');
  let receiptId = null, issueToken = null;
  const api = async (path, body, token) => {
    const response = await fetch(`${config.intakeApiBase}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const value = await response.json(); if (!response.ok) throw Object.assign(Error('api'), value.error || {}); return value;
  };
  const id = () => crypto.randomUUID();
  const message = value => { const target = document.getElementById('pira-intake-error'); if (target) target.textContent = value || ''; };
  const form = contract => `<section><h1>${config.brandName}</h1><h2>企業情報の入力</h2><form id="pira-form"><label>企業名<input name="companyName" required maxlength="200"></label><label>担当者名<input name="contactName" required maxlength="200"></label><label>WebサイトURL<input name="websiteUrl" type="url" required maxlength="2000"></label><label>電話番号（任意）<input name="phone" maxlength="50"></label>${contract.initiativeKind === 'UNION' ? '<label>所属組合名<input name="unionName" required maxlength="200"></label><label>住所<textarea name="address" required maxlength="500"></textarea></label>' : ''}<label><input name="accepted" type="checkbox" required> 同意内容を確認し、同意します。</label><button type="submit">診断を開始する</button></form></section>`;
  const startQuestions = async () => { const token = await issueToken(); await api(`/submissions/${receiptId}/state`, { state: 'ANSWERING' }, token); app.hidden = true; document.getElementById('app').hidden = false; globalThis.PiraV7PublicApp.start(); };
  globalThis.publicAuthIntakeAdapter = async value => {
    issueToken = value.issueToken; const response = await fetch(`${config.intakeApiBase}/intake-contract`); const contract = await response.json();
    document.getElementById('auth-root').hidden = true; app.hidden = false; app.innerHTML = form(contract);
    document.getElementById('pira-form').addEventListener('submit', async event => { event.preventDefault(); message(''); const data = Object.fromEntries(new FormData(event.currentTarget)); try { const token = value.token; const result = await api('/submissions', { initiativeCode: contract.initiativeCode, companyName: data.companyName, contactName: data.contactName, websiteUrl: data.websiteUrl, ...(data.phone ? { phone: data.phone } : {}), ...(contract.initiativeKind === 'UNION' ? { unionName: data.unionName, address: data.address } : {}), accepted: data.accepted === 'on', consentVersion: contract.consent.version, idempotencyKey: id() }, token); receiptId = result.receiptId; await startQuestions(); } catch (error) { message(error.code || '受付を完了できませんでした。'); } });
  };
  document.addEventListener('pira:v7-report-rendered', async () => { if (!receiptId || !issueToken) return; try { await api(`/submissions/${receiptId}/state`, { state: 'COMPLETED' }, await issueToken()); } catch { message('完了状態を更新できませんでした。'); } });
})();
