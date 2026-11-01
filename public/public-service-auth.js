(() => {
  const config = window.__PUBLIC_AUTH_CONFIG__;
  const byId = id => document.getElementById(id);
  const screens = { email: byId('email-screen'), code: byId('code-screen'), success: byId('success-screen') };
  const error = byId('error'), busy = byId('busy'), email = byId('email'), code = byId('code'), send = byId('send'), verify = byId('verify'), resend = byId('resend'), changeEmail = byId('change-email'), start = byId('start'), wait = byId('resend-wait');
  const copy = { OTP_INVALID:'認証コードが正しくありません。もう一度ご確認ください。', OTP_EXPIRED:'認証コードの有効期限が切れました。再度認証コードを送信してください。', CHALLENGE_LOCKED:'認証回数の上限に達しました。認証コードを再送してください。', RESEND_COOLDOWN:'認証コードは60秒経過後に再送できます。', SEND_LIMIT_REACHED:'送信回数の上限に達しました。しばらく時間をおいてお試しください。', TURNSTILE_DENIED:'確認が完了しませんでした。もう一度お試しください。', NETWORK_ERROR:'通信に失敗しました。通信環境をご確認のうえ、もう一度お試しください。', MAIL_SEND_FAILED:'認証コードを送信できませんでした。しばらく時間をおいてお試しください。', SESSION_INVALID:'認証の有効期限が切れました。もう一度メールアドレスの確認を行ってください。' };
  let state = { challengeId: null, sessionId: null, sessionToken: null, timer: null };
  const show = name => Object.entries(screens).forEach(([key, element]) => { element.hidden = key !== name; });
  const message = value => { error.textContent = copy[value] || ''; };
  const setBusy = (value, buttons = []) => { busy.textContent = value ? '処理中です。' : ''; buttons.forEach(button => { button.disabled = value; }); };
  const api = async (path, options = {}) => {
    try { const response = await fetch(`${config.apiBase}${path}`, { ...options, headers: { 'content-type':'application/json', ...(options.headers || {}) } }); const data = response.status === 204 ? null : await response.json(); if (!response.ok) { const fault = new Error('api'); fault.code = data?.error?.code; throw fault; } return data; }
    catch (fault) { if (!fault.code) fault.code = 'NETWORK_ERROR'; throw fault; }
  };
  const turnstileToken = () => window.turnstile?.getResponse?.() || window.publicAuthTurnstileToken?.() || '';
  if (config?.turnstileSiteKey && window.turnstile?.render) window.turnstile.render('#turnstile', { sitekey: config.turnstileSiteKey });
  const reset = () => { if (state.timer) clearInterval(state.timer); state = { challengeId:null, sessionId:null, sessionToken:null, timer:null }; code.value=''; message(''); show('email'); email.focus(); };
  const countdown = until => { if (state.timer) clearInterval(state.timer); const tick = () => { const seconds = Math.max(0, Math.ceil((until - Date.now()) / 1000)); resend.disabled = seconds > 0; wait.textContent = seconds > 0 ? `再送できるまで${seconds}秒` : ''; if (seconds === 0) clearInterval(state.timer); }; tick(); state.timer = setInterval(tick, 250); };
  const sendCode = async (isResend = false) => {
    const address = email.value.trim(); if (!/^\S+@\S+\.\S+$/.test(address)) { email.focus(); return; }
    const token = turnstileToken(); if (!token) { message('TURNSTILE_DENIED'); return; }
    setBusy(true, [send, resend, changeEmail]); message('');
    try { const result = await api(isResend ? `/v1/otp/challenges/${state.challengeId}/resend` : '/v1/otp/challenges', { method:'POST', body:JSON.stringify({ serviceId:config.serviceId, email:address, turnstileToken:token }) }); state.challengeId = result.challengeId; show('code'); code.focus(); countdown(Date.parse(result.resendAt)); }
    catch (fault) { message(fault.code); } finally { setBusy(false, [send, resend, changeEmail]); }
  };
  byId('email-form').addEventListener('submit', event => { event.preventDefault(); sendCode(false); });
  byId('code-form').addEventListener('submit', async event => { event.preventDefault(); if (!state.challengeId || !/^\d{6}$/.test(code.value)) { message('OTP_INVALID'); return; } setBusy(true, [verify, resend, changeEmail]); message(''); try { const result = await api(`/v1/otp/challenges/${state.challengeId}/verify`, { method:'POST', body:JSON.stringify({ serviceId:config.serviceId, code:code.value }) }); state.sessionId=result.sessionId; state.sessionToken=result.sessionToken; show('success'); } catch (fault) { message(fault.code); if (fault.code === 'SESSION_INVALID') reset(); } finally { setBusy(false, [verify, resend, changeEmail]); } });
  resend.addEventListener('click', () => sendCode(true));
  changeEmail.addEventListener('click', async () => { if (!state.challengeId) return reset(); setBusy(true, [resend, changeEmail]); try { await api(`/v1/otp/challenges/${state.challengeId}`, { method:'DELETE', body:JSON.stringify({ serviceId:config.serviceId }) }); reset(); } catch (fault) { message(fault.code); } finally { setBusy(false, [resend, changeEmail]); } });
  start.addEventListener('click', async () => { if (!state.sessionId || !state.sessionToken) return reset(); setBusy(true, [start]); try { const issueToken = async () => (await api(`/v1/otp/sessions/${state.sessionId}/tokens`, { method:'POST', body:JSON.stringify({ serviceId:config.serviceId, sessionToken:state.sessionToken }) })).token; const token = await issueToken(); const adapter = window.publicAuthIntakeAdapter || (async value => { window.location.assign(value.destination); }); await adapter({ token, issueToken, email:email.value.trim().toLowerCase(), serviceId:config.serviceId, destination:config.intakeStartUrl }); } catch (fault) { message(fault.code); if (fault.code === 'SESSION_INVALID') reset(); } finally { setBusy(false, [start]); } });
  if (!config?.serviceId || config.apiBase === undefined) { message('NETWORK_ERROR'); send.disabled = true; }
  window.addEventListener('beforeunload', () => { state = { challengeId:null, sessionId:null, sessionToken:null, timer:null }; });
})();
