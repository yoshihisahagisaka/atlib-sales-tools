import crypto from 'node:crypto';
import { normalizeDiagnosisUrl } from '../wsc-vs1/engine.mjs';

const required = ['企業名', '本店所在地', 'URL'];
const parseLine = (line) => {
  const result = []; let current = ''; let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') { if (quoted && line[i + 1] === '"') { current += '"'; i += 1; } else quoted = !quoted; }
    else if (ch === ',' && !quoted) { result.push(current); current = ''; } else current += ch;
  }
  if (quoted) throw new Error('CSV_QUOTE_UNCLOSED'); result.push(current); return result;
};
const id = (value) => crypto.createHash('sha256').update(value).digest('hex').slice(0, 20);
export function parseCompaniesCsv(source) {
  const lines = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((line, i, all) => line !== '' || i !== all.length - 1);
  if (!lines.length) throw new Error('CSV_EMPTY');
  const header = parseLine(lines[0]);
  if (!(header.length === 3 || header.length === 4) || required.some((name, i) => header[i] !== name) || header[3] && header[3] !== 'メールアドレス') throw new Error('CSV_HEADER_INVALID');
  const companies = [], errors = [], seen = new Set();
  lines.slice(1).forEach((line, index) => {
    const row = index + 2;
    try {
      const values = parseLine(line); if (values.length !== header.length) throw new Error('CSV_COLUMN_COUNT_INVALID');
      const [name, headOffice, url, email] = values.map(v => v.trim());
      if (!name || !url) throw new Error('CSV_REQUIRED_VALUE_MISSING');
      const normalizedUrl = normalizeDiagnosisUrl(url);
      if (!/^https:\/\//.test(normalizedUrl)) throw new Error('CSV_URL_HTTPS_REQUIRED');
      const fingerprint = `${name}\u0000${headOffice}\u0000${normalizedUrl}`;
      if (seen.has(fingerprint)) throw new Error('CSV_DUPLICATE_ROW');
      seen.add(fingerprint);
      companies.push({ row, company_id: `cmp_${id(fingerprint)}`, name, headOffice, url, normalizedUrl, ...(header.length === 4 && email ? { email } : {}) });
    } catch (error) { errors.push({ row, source: line, code: error.message }); }
  });
  return { header, companies, errors };
}
