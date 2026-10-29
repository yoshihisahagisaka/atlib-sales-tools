import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
export function createLocalPrivateStore(root, { onWrite } = {}) {
  const base = path.resolve(root); fs.mkdirSync(base, { recursive: true });
  const inside = (...segments) => { if (segments.some(segment => typeof segment !== 'string' || segment === '' || segment === '.' || segment === '..' || segment.includes('/') || segment.includes('\\'))) throw new Error('STORE_PATH_ESCAPE'); const target = path.resolve(base, ...segments); if (!target.startsWith(`${base}${path.sep}`)) throw new Error('STORE_PATH_ESCAPE'); return target; };
  const atomic = (file, content) => { if (fs.existsSync(file)) throw new Error('STORE_IMMUTABLE_EXISTS'); const temp = `${file}.${process.pid}.tmp`; fs.writeFileSync(temp, content, { mode: 0o600 }); fs.renameSync(temp, file); };
  const verifyDirectory = (dir, checksums) => Object.entries(checksums).every(([name, sum]) => digest(fs.readFileSync(path.join(dir, name), 'utf8')) === sum);
  return {
    startBatch(batch) { const dir = inside('batches', batch.batch_id); fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); const manifest = path.join(dir, 'manifest.json'); if (!fs.existsSync(manifest)) atomic(manifest, json(batch)); return dir; },
    readState(batchId) { const file = inside('batches', batchId, 'state.json'); return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { batch_id: batchId, reports: {} }; },
    writeState(batchId, state) { const file = inside('batches', batchId, 'state.json'); const temp = `${file}.${process.pid}.tmp`; fs.writeFileSync(temp, json(state), { mode: 0o600 }); fs.renameSync(temp, file); },
    saveReport(batchId, ids, artifacts) { const reports = inside('batches', batchId, 'reports'); const finalDir = path.join(reports, ids.report_id); if (fs.existsSync(finalDir)) throw new Error('STORE_IMMUTABLE_EXISTS'); const staging = path.join(reports, `.staging-${ids.report_id}-${crypto.randomUUID()}`); fs.mkdirSync(staging, { recursive: true, mode: 0o700 }); try { const checksums = {}; for (const [name, artifact] of Object.entries(artifacts)) { if (!/^[a-z][a-z0-9-]*\.(json|html)$/.test(name)) throw new Error('STORE_ARTIFACT_NAME_INVALID'); const value = typeof artifact === 'string' ? artifact : json(artifact); onWrite?.(name); atomic(path.join(staging, name), value); checksums[name] = digest(value); } atomic(path.join(staging, 'integrity.json'), json({ ...ids, checksums })); if (!verifyDirectory(staging, checksums)) throw new Error('STORE_STAGING_INTEGRITY_FAILED'); fs.renameSync(staging, finalDir); return { relative_path: path.relative(base, finalDir).replace(/\\/g, '/'), checksums }; } catch (error) { fs.rmSync(staging, { recursive: true, force: true }); throw error; } },
    verifyReport(batchId, reportId) { try { const dir = inside('batches', batchId, 'reports', reportId); const integrity = JSON.parse(fs.readFileSync(path.join(dir, 'integrity.json'), 'utf8')); return verifyDirectory(dir, integrity.checksums); } catch { return false; } }
  };
}
