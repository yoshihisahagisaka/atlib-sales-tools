import dns from 'node:dns/promises';
import https from 'node:https';
import { isPublicAddress, validatePublicTarget } from '../wsc-phase2a/safe-executor.mjs';

const headers = ['strict-transport-security', 'content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy', 'location'];
const absentDns = (error = 'MAIL_DOMAIN_UNSPECIFIED') => ({ spf: { lookupStatus: 'UNVERIFIED', records: [], recordCount: 0, error }, dmarc: { lookupStatus: 'UNVERIFIED', records: [], recordCount: 0, error }, mx: { status: 'UNVERIFIED', values: [] }, ds: { status: 'UNVERIFIED', values: [] } });
const dnsError = (code) => Object.assign(new Error(code), { code });
export const withDnsDeadline = (query, { timeoutMs = 5_000, signal } = {}) => new Promise((resolve, reject) => {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) return reject(dnsError('DNS_TIMEOUT_CONFIG_INVALID'));
  if (signal?.aborted) return reject(dnsError('DNS_ACQUISITION_ABORTED'));
  let settled = false;
  const finish = (callback, value) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); callback(value); };
  const abort = () => finish(reject, dnsError('DNS_ACQUISITION_ABORTED'));
  const timer = setTimeout(() => finish(reject, dnsError('DNS_ACQUISITION_TIMEOUT')), timeoutMs);
  signal?.addEventListener('abort', abort, { once: true });
  Promise.resolve().then(query).then(value => finish(resolve, value), error => finish(reject, error));
});
const txt = async (name, resolveTxt, options) => { try { return { status: 'FOUND', values: (await withDnsDeadline(() => resolveTxt(name), options)).map(row => row.join('')) }; } catch (error) { if (error?.code === 'ENODATA' || error?.code === 'ENOTFOUND') return { status: 'NO_RECORD', values: [] }; return { status: 'UNVERIFIED', values: [], error: error.code || error.message }; } };
const normalizeMailDomain = value => typeof value === 'string' ? value.toLowerCase().replace(/\.$/, '') : '';
const validDomain = domain => domain.length <= 253 && domain.split('.').length >= 2 && domain.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
const policyValues = new Set(['none', 'quarantine', 'reject']);
const dmarcVersion = /^\s*v\s*=\s*DMARC1\s*(?:;|$)/i;
const parseDmarc = record => {
  const tags = Object.create(null);
  for (const segment of record.split(';')) {
    if (!segment.trim()) continue;
    const match = /^\s*([a-z][a-z0-9_-]*)\s*=\s*(.*?)\s*$/i.exec(segment);
    if (!match || Object.hasOwn(tags, match[1].toLowerCase())) return null;
    tags[match[1].toLowerCase()] = match[2];
  }
  if (!policyValues.has(tags.p?.toLowerCase()) || ['sp','np'].some(key => Object.hasOwn(tags,key) && !policyValues.has(tags[key].toLowerCase())) ||
      (Object.hasOwn(tags,'psd') && !['n','y','u'].includes(tags.psd.toLowerCase()))) return null;
  return tags;
};
const dmarcDomains = domain => {
  const labels = domain.split('.');
  const domains = [domain];
  for (let length = Math.min(labels.length - 1, 7); length >= 1; length--) domains.push(labels.slice(-length).join('.'));
  return domains;
};
// RFC 9989 policy discovery (not a message authentication or alignment test).
// At most eight TXT queries and one shared deadline. On uncertainty, preserve
// the existing WSC INTERNAL_ONLY contract instead of asserting absence/protection.
const discoverDmarc = async (domain, resolveTxt, options) => {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const deadline = Date.now() + timeoutMs;
  const queriedDomains = [];
  const candidates = [];
  let selected;
  const result = (lookupStatus, extra = {}) => ({ lookupStatus, records: [], recordCount: 0, tags: {}, checkedDomain: domain, queriedDomains, ...extra });
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) return result('UNVERIFIED', { error: 'DNS_TIMEOUT_CONFIG_INVALID' });
  for (const current of dmarcDomains(domain)) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return result('UNVERIFIED', { error: 'DNS_ACQUISITION_TIMEOUT' });
    queriedDomains.push(current);
    const source = await txt('_dmarc.' + current, resolveTxt, { ...options, timeoutMs: remaining });
    if (source.status === 'UNVERIFIED') return result('UNVERIFIED', { error: source.error });
    const records = source.values.filter(value => dmarcVersion.test(value));
    if (!records.length) {
      // Keep the original conservative behavior for unrelated/malformed TXT at
      // the requested owner. Unrelated ancestor TXT is not a DMARC record.
      if (source.values.some(value => /^\s*v\s*=\s*DMARC/i.test(value)) || (current === domain && source.values.length)) return result('UNVERIFIED', { error: 'RECORD_FORMAT_INVALID' });
      continue;
    }
    if (records.length !== 1) return result('UNVERIFIED', { records, recordCount: records.length, error: 'DMARC_MULTIPLE_RECORDS' });
    const tags = parseDmarc(records[0]);
    if (!tags) return result('UNVERIFIED', { records, recordCount: 1, error: 'RECORD_FORMAT_INVALID' });
    const candidate = { domain: current, records, tags, psd: tags.psd?.toLowerCase() };
    if (current === domain || candidate.psd === 'n') { selected = candidate; break; }
    if (candidate.psd === 'y') {
      const org = domain.split('.').slice(-(current.split('.').length + 1)).join('.');
      selected = candidates.find(item => item.domain === org) || candidate;
      break;
    }
    candidates.push(candidate);
  }
  selected ??= candidates.at(-1);
  if (!selected) return result('NO_RECORD');
  const inherited = selected.domain !== domain;
  const { tags } = selected;
  // The URL host was resolved and contacted; np is for nonexistent domains.
  // Explicit non-web callers must establish existence before using a distinct np.
  const parentPolicy = tags.sp ?? tags.p;
  if (inherited && options.domainExists === undefined && tags.np && tags.np.toLowerCase() !== parentPolicy.toLowerCase()) {
    return result('UNVERIFIED', { error: 'DMARC_DOMAIN_EXISTENCE_UNVERIFIED' });
  }
  const policyTag = !inherited ? 'p' : options.domainExists === false && tags.np ? 'np' : tags.sp ? 'sp' : 'p';
  return result('FOUND', { records: selected.records, recordCount: 1, tags, policyDomain: selected.domain, policyTag, effectivePolicy: tags[policyTag].toLowerCase(), policySource: selected.psd === 'y' ? 'PSD' : inherited ? 'PARENT' : 'EXACT' });
};
const spfRecords = source => source.values.filter(value => /^v=spf1(?:\s|$)/i.test(value));
export const collectMailDns = async (mailDomain, resolveTxt, options = {}) => {
  if (!mailDomain) return absentDns();
  const domain = normalizeMailDomain(mailDomain);
  if (!validDomain(domain)) return absentDns('MAIL_DOMAIN_INVALID');
  let [spfSource, dmarc] = await Promise.all([txt(domain, resolveTxt, options), discoverDmarc(domain, resolveTxt, options)]);
  let spf = spfRecords(spfSource), spfDomain = domain;
  // SPF has no inheritance. A separately queried parent record is evidence
  // about that parent only, never the URL host or the real SMTP MAIL FROM.
  if (!spf.length && spfSource.status !== 'UNVERIFIED' && !spfSource.values.some(value => /^\s*v\s*=\s*spf/i.test(value)) &&
      dmarc.lookupStatus === 'FOUND' && dmarc.policySource === 'PARENT' && validDomain(dmarc.policyDomain)) {
    const parent = await txt(dmarc.policyDomain, resolveTxt, options);
    const parentRecords = spfRecords(parent);
    if (parentRecords.length) { spfSource = parent; spf = parentRecords; spfDomain = dmarc.policyDomain; }
  }
  const lookupStatus = spfSource.status === 'UNVERIFIED' ? 'UNVERIFIED' : spf.length ? 'FOUND' : spfSource.values.length ? 'UNVERIFIED' : 'NO_RECORD';
  const error = spfSource.error || (spfSource.values.length && !spf.length ? 'RECORD_FORMAT_INVALID' : undefined);
  return { spf: { lookupStatus, records: spf, recordCount: spf.length, checkedDomain: spfDomain, ...(error ? { error } : {}) }, dmarc, mx: { status: 'UNVERIFIED', values: [] }, ds: { status: 'UNVERIFIED', values: [] } };
};

// Network code is present for review, but disabled unless an exact target and
// one-use approval are both injected by a later, separately approved runner.
export function createRestrictedNetworkProbe({ approvalStore, clock = () => Date.now(), lookup = dns.lookup, resolveTxt = dns.resolveTxt, dnsTimeoutMs = 5_000, maxResponseBytes = 1_000_000, networkExchange } = {}) {
  return async ({ url, addresses, mailDomain, signal, approvalId, executor }) => {
    // approvalStore is an injected, non-logging capability store. It must consume
    // the one-use grant before any DNS lookup; this module never issues grants.
    const now = clock();
    const grant = approvalStore?.consume?.({ approvalId, url, now, executor });
    if (!grant || grant.targetUrl !== url || !Number.isFinite(grant.expiresAt) || grant.expiresAt <= now) throw new Error('EXTERNAL_NETWORK_DISABLED_PENDING_APPROVAL');
    const initial = addresses || (await withDnsDeadline(() => lookup(new URL(url).hostname, { all: true, verbatim: true }), { timeoutMs: dnsTimeoutMs, signal })).map(row => row.address);
    const current = await withDnsDeadline(() => lookup(new URL(url).hostname, { all: true, verbatim: true }), { timeoutMs: dnsTimeoutMs, signal }); const resolved = current.map(row => row.address);
    const target = validatePublicTarget(url, () => resolved);
    if (target.addresses.join(',') !== [...new Set(initial)].sort().join(',')) throw new Error('DNS_REBIND_DETECTED');
    const ip = target.addresses[0]; if (!isPublicAddress(ip)) throw new Error('DNS_NOT_PUBLIC');
    const connection = { host: ip, port: 443, servername: target.host, hostHeader: new URL(url).host, rejectUnauthorized: true };
    if (networkExchange) return networkExchange({ url, ip, addresses: target.addresses, mailDomain, signal, connection, maxResponseBytes });
    return new Promise((resolve, reject) => {
      const uri = new URL(url); let settled = false; let timer; let socketEvidence; const sameIp = (expected, actual) => actual === expected || (actual?.startsWith('::ffff:') && actual.slice(7) === expected);
      const finish = (callback, value) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); callback(value); };
      const fail = (error) => finish(reject, error);
      // Use the numeric validated address as the actual socket destination; SNI and Host retain the original hostname. No third DNS lookup.
      const req = https.request({ protocol: 'https:', host: ip, port: 443, path: `${uri.pathname}${uri.search}`, method: 'GET', headers: { Host: connection.hostHeader, 'User-Agent': 'atLIB-public-security-check/2.0' }, agent: false, servername: connection.servername, rejectUnauthorized: true }, async (res) => {
        const chunks = []; let total = 0; res.on('data', chunk => { total += chunk.length; if (total > maxResponseBytes) { req.destroy(new Error('HTTP_RESPONSE_BODY_SIZE_LIMIT')); } else chunks.push(chunk); });
        res.on('error', fail); res.on('end', async () => { if (settled) return; try { if (!socketEvidence || !sameIp(ip, socketEvidence.remoteAddress)) throw new Error('CONNECTION_IP_MISMATCH'); if (!socketEvidence.authorized || socketEvidence.authorizationError) throw new Error('TLS_VALIDATION_FAILED'); const cert = socketEvidence.cert; const mapped = Object.fromEntries(headers.map(name => [name.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('-'), res.headers[name] ? String(res.headers[name]) : null])); const diagnosis = { schemaVersion: '2.0', targetUrl: url, mailDomain: mailDomain ?? null, checkedAt: new Date().toISOString(), http: { status: 'OK', statusCode: res.statusCode, headers: mapped, redirectNotFollowed: true }, tls: { status: 'VALIDATED', negotiatedProtocol: socketEvidence.protocol, subject: cert.subject?.CN ? `CN=${cert.subject.CN}` : null, issuer: cert.issuer?.CN ? `CN=${cert.issuer.CN}` : null, notAfter: cert.valid_to ? new Date(cert.valid_to).toISOString() : null, policyErrors: 'None', chainStatus: [] }, dns: await collectMailDns(mailDomain, resolveTxt, { timeoutMs: dnsTimeoutMs, signal, domainExists: normalizeMailDomain(mailDomain) === normalizeMailDomain(uri.hostname) ? true : undefined }) }; finish(resolve, { remoteAddress: socketEvidence.remoteAddress, responseBytes: Number(res.headers['content-length'] || total), bodyChunks: chunks, redirectUrl: mapped.Location, diagnosis }); } catch (error) { fail(error); } });
      });
      const abort = () => req.destroy(new Error('ACQUISITION_ABORTED'));
      req.on('socket', socket => socket.on('secureConnect', () => {
        socketEvidence = { remoteAddress: socket.remoteAddress, authorized: socket.authorized, authorizationError: socket.authorizationError, protocol: socket.getProtocol(), cert: socket.getPeerCertificate() };
        if (!sameIp(ip, socketEvidence.remoteAddress)) req.destroy(new Error('CONNECTION_IP_MISMATCH'));
        if (!socketEvidence.authorized || socketEvidence.authorizationError) req.destroy(new Error('TLS_VALIDATION_FAILED'));
      }));
      signal?.addEventListener('abort', abort, { once: true }); req.on('error', fail); timer = setTimeout(() => req.destroy(new Error('ACQUISITION_TIMEOUT')), 15000); req.end();
    });
  };
}
