import dns from 'node:dns/promises';
import https from 'node:https';
import tls from 'node:tls';
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
export const collectMailDns = async (mailDomain, resolveTxt, options = {}) => {
  if (!mailDomain) return absentDns(); const spfSource = await txt(mailDomain, resolveTxt, options); const dmarcSource = await txt(`_dmarc.${mailDomain}`, resolveTxt, options);
  const spf = spfSource.values.filter(value => /^v=spf1(?:\s|$)/i.test(value)); const dmarc = dmarcSource.values.filter(value => /^v=DMARC1(?:;|$)/i.test(value)); const tags = {};
  if (dmarc.length === 1) for (const segment of dmarc[0].split(';')) { const match = /^\s*([a-z]+)\s*=\s*(.*?)\s*$/i.exec(segment); if (match) tags[match[1].toLowerCase()] = match[2]; }
  const status = (source, records) => source.status === 'UNVERIFIED' ? 'UNVERIFIED' : records.length ? 'FOUND' : source.values.length ? 'UNVERIFIED' : 'NO_RECORD';
  const formatError = (source, records) => source.error || (source.values.length && !records.length ? 'RECORD_FORMAT_INVALID' : undefined);
  return { spf: { lookupStatus: status(spfSource, spf), records: spf, recordCount: spf.length, ...(formatError(spfSource, spf) ? { error: formatError(spfSource, spf) } : {}) }, dmarc: { lookupStatus: status(dmarcSource, dmarc), records: dmarc, recordCount: dmarc.length, tags, ...(formatError(dmarcSource, dmarc) ? { error: formatError(dmarcSource, dmarc) } : {}) }, mx: { status: 'UNVERIFIED', values: [] }, ds: { status: 'UNVERIFIED', values: [] } };
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
      const req = https.request({ protocol: 'https:', host: uri.hostname, port: 443, path: `${uri.pathname}${uri.search}`, method: 'GET', headers: { Host: connection.hostHeader, 'User-Agent': 'atLIB-public-security-check/2.0' }, agent: false, servername: connection.servername, rejectUnauthorized: true, createConnection: () => tls.connect(connection) }, async (res) => {
        const chunks = []; let total = 0; res.on('data', chunk => { total += chunk.length; if (total > maxResponseBytes) { req.destroy(new Error('HTTP_RESPONSE_BODY_SIZE_LIMIT')); } else chunks.push(chunk); });
        res.on('error', fail); res.on('end', async () => { if (settled) return; try { if (!socketEvidence || !sameIp(ip, socketEvidence.remoteAddress)) throw new Error('CONNECTION_IP_MISMATCH'); if (!socketEvidence.authorized || socketEvidence.authorizationError) throw new Error('TLS_VALIDATION_FAILED'); const cert = socketEvidence.cert; const mapped = Object.fromEntries(headers.map(name => [name.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('-'), res.headers[name] ? String(res.headers[name]) : null])); const diagnosis = { schemaVersion: '2.0', targetUrl: url, mailDomain: mailDomain ?? null, checkedAt: new Date().toISOString(), http: { status: 'OK', statusCode: res.statusCode, headers: mapped, redirectNotFollowed: true }, tls: { status: 'VALIDATED', negotiatedProtocol: socketEvidence.protocol, subject: cert.subject?.CN ? `CN=${cert.subject.CN}` : null, issuer: cert.issuer?.CN ? `CN=${cert.issuer.CN}` : null, notAfter: cert.valid_to ? new Date(cert.valid_to).toISOString() : null, policyErrors: 'None', chainStatus: [] }, dns: await collectMailDns(mailDomain, resolveTxt, { timeoutMs: dnsTimeoutMs, signal }) }; finish(resolve, { remoteAddress: socketEvidence.remoteAddress, responseBytes: Number(res.headers['content-length'] || total), bodyChunks: chunks, redirectUrl: mapped.Location, diagnosis }); } catch (error) { fail(error); } });
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
