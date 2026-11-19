/* Staff-only admin UI. Intake details are kept in memory for the active page only. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const PAGE_SIZE = 50;
  const STATUSES = Object.freeze({
    RECEIVED: '受付済み',
    IN_PROGRESS: '対応中',
    SUBMITTED: '提出済み',
    CANCELLED: '取消',
  });
  let offset = 0;
  let listRequestNumber = 0;

  const message = (id, text, kind = 'info') => {
    const el = $(id);
    el.textContent = text;
    el.dataset.kind = kind;
  };

  const safeText = value => typeof value === 'string' ? value : '';

  const validateTarget = raw => {
    if (raw.length > 2000) throw new Error('診断対象URLは2000文字以内にしてください。');
    let parsed;
    try { parsed = new URL(raw); } catch { throw new Error('正しいHTTPS URLを入力してください。'); }
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
      throw new Error('認証情報を含まないHTTPS URLを入力してください。');
    }
    return raw;
  };

  const safeFilename = value => {
    const cleaned = safeText(value).replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, '_').trim().slice(0, 180);
    return cleaned && cleaned.toLowerCase().endsWith('.pdf') ? cleaned : 'SECU-MIE-Web-Report.pdf';
  };

  const reportFilename = response => {
    const header = response.headers.get('content-disposition') || '';
    const matched = /filename\*=UTF-8''([^;]+)/i.exec(header);
    if (!matched) return 'SECU-MIE-Web-Report.pdf';
    try { return safeFilename(decodeURIComponent(matched[1].replace(/^"|"$/g, ''))); }
    catch { return 'SECU-MIE-Web-Report.pdf'; }
  };

  const downloadPdf = (blob, filename) => {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  };

  $('diagnosis-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('diagnose-button');
    if (button.disabled) return;
    const company = $('company').value.trim();
    const target = $('target-url').value.trim();
    try {
      if (!company || company.length > 500) throw new Error('会社名・団体名を500文字以内で入力してください。');
      const url = validateTarget(target);
      button.disabled = true;
      message('diagnosis-state', '診断を実行しています。完了までこの画面を閉じないでください。');
      const response = await fetch('/api/admin/web-security-check/diagnose', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: company, url }),
      });
      if (response.status === 401 || response.status === 403) throw new Error('スタッフ認証を確認して、ログインし直してください。');
      if (!response.ok) throw new Error('診断が完了しませんでした。対象URLと接続状態を確認してください。');
      if (!(response.headers.get('content-type') || '').toLowerCase().includes('application/pdf')) {
        throw new Error('PDFを受信できませんでした。ログイン状態を確認してください。');
      }
      const filename = reportFilename(response);
      const pdf = await response.blob();
      if (!pdf.size) throw new Error('PDFが空です。再実行してください。');
      downloadPdf(pdf, filename);
      message('diagnosis-state', 'PDFのダウンロードを開始しました。内容を確認してから、受付メール記載の送付先へ別途送信してください。', 'success');
    } catch (error) {
      message('diagnosis-state', error instanceof Error ? error.message : '診断に失敗しました。', 'error');
    } finally {
      button.disabled = false;
    }
  });

  $('clear-button').addEventListener('click', () => {
    $('diagnosis-form').reset();
    message('diagnosis-state', '入力をクリアしました。');
    $('company').focus();
  });

  const cell = (row, value) => {
    const td = document.createElement('td');
    td.textContent = safeText(value);
    row.appendChild(td);
    return td;
  };

  const renderRequest = item => {
    const row = document.createElement('tr');
    const time = item.receivedAt ? new Date(item.receivedAt) : null;
    const received = time && !Number.isNaN(time.getTime()) ? `${time.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} JST` : '日時不明';
    cell(row, `${received}\n${safeText(item.receiptId)}`);
    cell(row, `${safeText(item.companyName)}\n${safeText(item.unionName)}`);
    cell(row, item.websiteUrl);
    cell(row, `${safeText(item.contactName)}\n${safeText(item.contactEmail)}`);

    const diagnosisCell = cell(row, '');
    const choose = document.createElement('button');
    choose.className = 'btn btn-small btn-secondary';
    choose.type = 'button';
    choose.textContent = '診断に反映';
    choose.addEventListener('click', () => {
      $('company').value = safeText(item.companyName);
      $('target-url').value = safeText(item.websiteUrl);
      message('diagnosis-state', '受付内容を診断欄へ反映しました。会社名とURLを確認してから実行してください。');
      $('diagnosis-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('company').focus({ preventScroll: true });
    });
    diagnosisCell.appendChild(choose);

    const statusCell = cell(row, '');
    const controls = document.createElement('div');
    controls.className = 'status-control';
    const select = document.createElement('select');
    select.setAttribute('aria-label', `${safeText(item.companyName)}の対応状況`);
    for (const [key, label] of Object.entries(STATUSES)) {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = label;
      select.appendChild(option);
    }
    select.value = Object.hasOwn(STATUSES, item.status) ? item.status : 'RECEIVED';
    const originalStatus = select.value;
    const save = document.createElement('button');
    save.className = 'btn btn-small btn-secondary';
    save.type = 'button';
    save.textContent = '更新';
    save.addEventListener('click', async () => {
      if (save.disabled || select.value === originalStatus) return;
      if (select.value === 'SUBMITTED' && !window.confirm('PDFを実際に顧客へ送信済みですか？ ダウンロードだけでは提出済みにしないでください。')) return;
      if (!safeText(item.intakeId)) {
        message('list-state', '受付IDが不正なため更新できません。', 'error');
        return;
      }
      save.disabled = true;
      select.disabled = true;
      try {
        const response = await fetch(`/api/admin/secumie-web/v1/requests/${encodeURIComponent(item.intakeId)}/status`, {
          method: 'PATCH',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: select.value }),
        });
        if (!response.ok) throw new Error('対応状況を更新できませんでした。再読み込みして確認してください。');
        message('list-state', '対応状況を更新しました。', 'success');
        await loadRequests();
      } catch (error) {
        message('list-state', error instanceof Error ? error.message : '対応状況の更新に失敗しました。', 'error');
        select.disabled = false;
        save.disabled = false;
      }
    });
    controls.append(select, save);
    statusCell.appendChild(controls);
    return row;
  };

  const loadRequests = async () => {
    const number = ++listRequestNumber;
    message('list-state', '受付一覧を確認しています…');
    $('request-results').hidden = true;
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if ($('filter-company').value.trim()) params.set('companyName', $('filter-company').value.trim());
    if ($('filter-union').value.trim()) params.set('unionName', $('filter-union').value.trim());
    if ($('filter-status').value) params.set('status', $('filter-status').value);
    try {
      const response = await fetch(`/api/admin/secumie-web/v1/requests?${params.toString()}`, { credentials: 'same-origin', cache: 'no-store' });
      if (number !== listRequestNumber) return;
      if (response.status === 404) {
        message('list-state', '専用受付APIはまだこの環境に接続されていません。現行の受付メールを確認し、上の診断欄を利用してください。');
        return;
      }
      if (response.status === 401 || response.status === 403) throw new Error('スタッフ認証を確認して、ログインし直してください。');
      if (!response.ok) throw new Error('受付一覧を取得できませんでした。専用DBの稼働状況を確認してください。');
      const data = await response.json();
      if (!data || !Array.isArray(data.items)) throw new Error('受付一覧の応答形式が正しくありません。');
      $('request-rows').replaceChildren(...data.items.map(renderRequest));
      $('request-results').hidden = false;
      $('previous-button').disabled = offset === 0;
      $('next-button').disabled = data.items.length < PAGE_SIZE;
      $('page-label').textContent = `${offset + 1}〜${offset + data.items.length}件目`;
      message('list-state', data.items.length ? `${data.items.length}件を表示中。` : '条件に一致する受付はありません。', 'success');
    } catch (error) {
      if (number === listRequestNumber) message('list-state', error instanceof Error ? error.message : '受付一覧を取得できませんでした。', 'error');
    }
  };

  $('filter-form').addEventListener('submit', event => {
    event.preventDefault();
    offset = 0;
    void loadRequests();
  });
  $('previous-button').addEventListener('click', () => { offset = Math.max(0, offset - PAGE_SIZE); void loadRequests(); });
  $('next-button').addEventListener('click', () => { offset += PAGE_SIZE; void loadRequests(); });

  // A DB is not required for the manual PDF workflow; do not query the API on page load.
})();
