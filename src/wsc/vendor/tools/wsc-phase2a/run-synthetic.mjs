import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSyntheticBatch } from './batch.mjs';
import { createLocalPrivateStore } from './local-store.mjs';
import { createSyntheticExecutor } from './safe-executor.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const [csvPath, storageRoot] = process.argv.slice(2);
if (!csvPath || !storageRoot) throw new Error('使い方: node run-synthetic.mjs input.csv local-private-store');
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, '..', 'wsc-vs1', 'fixtures', name), 'utf8'));
const csv = fs.readFileSync(csvPath, 'utf8');
const targets = new Map();
for (const [index, row] of csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/).slice(1).entries()) { const url = row.split(',').at(-1); const source = read(index % 2 ? 'synthetic-gaps.json' : 'synthetic-protected.json'); targets.set(url, { ...source, targetUrl: url, checkedAt: '2026-10-25T00:00:00.000Z' }); }
const executor = createSyntheticExecutor({ resolve: () => ['93.184.216.34'], probe: async (url) => ({ remoteAddress: '93.184.216.34', diagnosis: targets.get(url) }) });
const result = await runSyntheticBatch({ csv, executor, store: createLocalPrivateStore(storageRoot) });
console.log(JSON.stringify({ batch_id: result.batch.batch_id, reports: result.batch.reports, rejected_rows: result.intake.errors }, null, 2));
