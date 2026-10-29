import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCompaniesCsv } from './csv.mjs';
import { evaluate, render } from '../wsc-vs1/engine.mjs';

const id = (prefix, value) => `${prefix}_${crypto.createHash('sha256').update(value).digest('hex').slice(0, 20)}`;
const now = () => new Date().toISOString();
export async function runSyntheticBatch({ csv, executor, store, batchId, stopAfter = Infinity, maxAttempts = 2 }) {
  const parsed = parseCompaniesCsv(csv); const batch_id = batchId || id('bat', csv); const batch = { batch_id, created_at: now(), mode: 'SYNTHETIC_ONLY', csv_contract: parsed.header, rejected_rows: parsed.errors };
  store.startBatch(batch); const state = store.readState(batch_id); let processed = 0;
  for (const company of parsed.companies) {
    const report_id = id('rpt', `${batch_id}\u0000${company.company_id}`); const current = state.reports[company.company_id];
    if (current?.status === 'REPORT_READY') {
      if (store.verifyReport(batch_id, report_id)) continue;
      state.reports[company.company_id] = { ...current, status: 'REPORT_CORRUPT', completed_at: now(), error_code: 'STORED_ARTIFACT_INTEGRITY_FAILED' };
      store.writeState(batch_id, state); processed += 1; continue;
    }
    if (current?.status === 'REPORT_CORRUPT') continue;
    if (processed >= stopAfter) { state.interrupted_at = now(); store.writeState(batch_id, state); break; }
    const diagnosis_run_id = id('run', `${batch_id}\u0000${company.company_id}\u0000${current?.attempts || 0}`); state.reports[company.company_id] = { company_id: company.company_id, report_id, diagnosis_run_id, status: 'RUNNING', attempts: (current?.attempts || 0) + 1, started_at: now() }; store.writeState(batch_id, state);
    try {
      const input = await executor(company.normalizedUrl); const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'wsc-vs1');
      const report = evaluate(input, { rulesPath: path.join(root, 'rules.json'), explanationsPath: path.join(root, 'explanations.json') }); const html = render(report, company);
      const stored = store.saveReport(batch_id, { company_id: company.company_id, diagnosis_run_id, report_id }, { 'company.json': company, 'diagnosis.json': input, 'result.json': report, 'report.html': html });
      state.reports[company.company_id] = { ...state.reports[company.company_id], status: 'REPORT_READY', completed_at: now(), storage: stored };
    } catch (error) { const attempts = state.reports[company.company_id].attempts; state.reports[company.company_id] = { ...state.reports[company.company_id], status: attempts < maxAttempts ? 'RETRY_PENDING' : 'FAILED', completed_at: now(), error_code: error.message }; }
    store.writeState(batch_id, state); processed += 1;
  }
  return { batch: store.readState(batch_id), intake: parsed };
}
