'use strict';

const countElement = document.getElementById('itAcceptedCount');
const periodElement = document.getElementById('itAcceptedPeriod');
const statusElement = document.getElementById('itAcceptedStatus');

function showUnavailable() {
  countElement.textContent = '—';
  periodElement.textContent = '会計年度：—';
  statusElement.textContent = '取得できませんでした';
  statusElement.dataset.state = 'error';
}

async function loadPortalKpis() {
  try {
    const response = await fetch('/api/admin/portal-kpis', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('KPI request failed');
    const data = await response.json();
    const count = data?.services?.IT_KAIZEN?.acceptedCount?.value;
    const fiscalYear = data?.period?.fiscalYear;
    if (!Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(fiscalYear)) throw new Error('Invalid KPI response');
    countElement.textContent = `${count}件`;
    periodElement.textContent = `会計年度：${fiscalYear}年2月1日〜${fiscalYear + 1}年1月31日`;
    statusElement.textContent = '受付済みの無料診断';
    statusElement.dataset.state = 'available';
  } catch {
    showUnavailable();
  }
}

void loadPortalKpis();
