/**
 * REVIEW ARTIFACT ONLY — do not execute before the PR #46 governance review.
 * Run once from Chrome DevTools > Sources > Snippets on the exact Staging origin.
 * The JWT is used only inside this page closure and is never logged or persisted.
 */
(() => {
  'use strict';

  const EXPECTED_ORIGIN = 'https://pira-staging.atlib.jp';
  const CONTROL_KEY = '__SECU_STAGING_JTI_REPLAY_TEST__';
  const PANEL_ID = 'secumie-jti-replay-result';

  if (location.origin !== EXPECTED_ORIGIN) throw new Error('STOP_ORIGIN_MISMATCH');
  if (globalThis.__PUBLIC_AUTH_CONFIG__?.serviceId !== 'pira-union') throw new Error('STOP_SERVICE_MISMATCH');
  if (globalThis.__PIRA_E2_CONFIG__?.intakeApiBase !== '/api/public/pira/v1') throw new Error('STOP_API_BASE_MISMATCH');
  if (typeof globalThis.publicAuthIntakeAdapter !== 'function') throw new Error('STOP_ADAPTER_MISSING');
  if (globalThis[CONTROL_KEY]) throw new Error('STOP_SNIPPET_ALREADY_INSTALLED');

  const originalAdapter = globalThis.publicAuthIntakeAdapter;
  let used = false;
  let restored = false;

  const panel = document.createElement('aside');
  panel.id = PANEL_ID;
  panel.setAttribute('role', 'status');
  Object.assign(panel.style, {
    position: 'fixed', inset: '16px 16px auto auto', zIndex: '2147483647', maxWidth: '440px',
    padding: '16px', border: '2px solid #1f3556', borderRadius: '10px', background: '#f8fafc',
    color: '#1f3556', font: '14px/1.5 system-ui, sans-serif', boxShadow: '0 8px 24px rgba(0,0,0,.18)',
  });
  const message = document.createElement('div');
  const cleanup = document.createElement('button');
  cleanup.type = 'button';
  cleanup.textContent = 'Snippetを解除して表示を消す';
  Object.assign(cleanup.style, { marginTop: '12px', padding: '8px 12px', cursor: 'pointer' });
  panel.append(message, cleanup);
  document.body.append(panel);

  const show = (text, color = '#1f3556') => {
    message.textContent = text;
    panel.style.borderColor = color;
    panel.style.color = color;
  };
  const publicCode = body => {
    const code = body?.error?.code;
    return typeof code === 'string' && /^[A-Z0-9_]+$/.test(code) ? code : 'NONE';
  };
  const restore = () => {
    if (restored) return;
    if (globalThis.publicAuthIntakeAdapter === temporaryAdapter) globalThis.publicAuthIntakeAdapter = originalAdapter;
    restored = true;
    delete globalThis[CONTROL_KEY];
  };

  async function temporaryAdapter(value) {
    if (used) {
      show('STOP: このSnippetは既に使用済みです。再試行しないでください。', '#b42318');
      return;
    }
    used = true;
    show('RUNNING: 同一JWTの初回受付と再利用拒否を確認しています。');
    try {
      if (typeof value?.token !== 'string' || !value.token) throw new Error('TOKEN_MISSING');
      const apiBase = globalThis.__PIRA_E2_CONFIG__.intakeApiBase;
      const contractResponse = await fetch(`${apiBase}/intake-contract`, { credentials: 'same-origin' });
      const contract = await contractResponse.json();
      if (contractResponse.status !== 200 || contract?.initiativeCode !== 'pira-union') throw new Error('CONTRACT_MISMATCH');

      const payload = {
        initiativeCode: 'pira-union',
        companyName: `JTI再利用検証株式会社 ${new Date().toISOString()}`,
        contactName: 'Synthetic検証担当',
        websiteUrl: 'https://example.test/',
        phone: '03-0000-0000',
        unionName: '国際連携推進協会',
        address: '東京都千代田区Synthetic 1-1',
        accepted: true,
        consentVersion: contract.consent.version,
      };
      const submit = idempotencyKey => fetch(`${apiBase}/submissions`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${value.token}` },
        body: JSON.stringify({ ...payload, idempotencyKey }),
      });

      const firstResponse = await submit(crypto.randomUUID());
      const firstBody = await firstResponse.json();
      if (firstResponse.status !== 201 || typeof firstBody?.receiptId !== 'string') {
        show(`STOP: 初回受付 HTTP ${firstResponse.status} / ${publicCode(firstBody)}。再試行しないでください。`, '#b42318');
        return;
      }

      const replayResponse = await submit(crypto.randomUUID());
      const replayBody = await replayResponse.json();
      const replayCode = publicCode(replayBody);
      if (replayResponse.status === 409 && replayCode === 'JWT_REPLAYED') {
        show('PASS: 初回 HTTP 201、同一JWT再利用 HTTP 409 JWT_REPLAYED。受付は1件です。', '#13795b');
      } else {
        show(`FAIL: 初回 HTTP 201、再利用 HTTP ${replayResponse.status} / ${replayCode}。再試行しないでください。`, '#b42318');
      }
    } catch {
      show('STOP: 通信またはContract確認に失敗しました。再試行しないでください。', '#b42318');
    } finally {
      value.token = null;
      value.issueToken = null;
      restore();
    }
  }

  cleanup.addEventListener('click', () => {
    restore();
    panel.remove();
  }, { once: true });
  globalThis[CONTROL_KEY] = Object.freeze({ uninstall: () => { restore(); panel.remove(); } });
  globalThis.publicAuthIntakeAdapter = temporaryAdapter;
  show('READY: 一時Adapterを設定しました。正規UIでOTP認証し「診断を開始する」を押してください。');
})();
