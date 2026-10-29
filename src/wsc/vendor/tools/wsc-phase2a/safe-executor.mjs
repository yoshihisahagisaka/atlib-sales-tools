import net from 'node:net';

const ipv4 = (ip) => ip.split('.').map(Number);
const privateV4 = (ip) => {
  const [a, b, c] = ipv4(ip);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 0 && c === 0) || (a === 192 && b === 0 && c === 2) || (a === 192 && b === 88 && c === 99) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113) || a >= 224;
};
const privateV6 = (ip) => {
  const value = ip.toLowerCase();
  return value === '::' || value === '::1' || value.startsWith('::ffff:') || value.startsWith('::') || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:') || value.startsWith('ff') || value.startsWith('64:ff9b:') || value.startsWith('64:ff9b:1:') || value.startsWith('100:') || value.startsWith('2001:db8:') || value.startsWith('2001:10:');
};
export const isPublicAddress = (ip) => net.isIP(ip) === 4 ? !privateV4(ip) : net.isIP(ip) === 6 && !privateV6(ip);

export function validatePublicTarget(value, resolve) {
  let url;
  try { url = new URL(value); } catch { throw new Error('URL_INVALID'); }
  if (url.protocol !== 'https:' || url.port && url.port !== '443' || url.username || url.password) throw new Error('URL_NOT_ALLOWED');
  if (url.hostname === 'localhost' || net.isIP(url.hostname) || url.hostname.endsWith('.local')) throw new Error('URL_HOST_NOT_PUBLIC');
  const addresses = resolve(url.hostname);
  if (!Array.isArray(addresses) || !addresses.length || addresses.some(ip => !isPublicAddress(ip))) throw new Error('DNS_NOT_PUBLIC');
  return { url: url.toString(), host: url.hostname.toLowerCase(), addresses: [...new Set(addresses)].sort() };
}

// Phase 2A deliberately has no network transport. This adapter accepts only a
// synthetic probe and verifies its declared connection address against DNS both
// before and after the probe, preventing a production caller from bypassing the
// DNS/connection binding requirement.
export function createSyntheticExecutor({ resolve, probe }) {
  if (typeof resolve !== 'function' || typeof probe !== 'function') throw new Error('SYNTHETIC_EXECUTOR_REQUIRES_RESOLVER_AND_PROBE');
  return async (targetUrl) => {
    const before = validatePublicTarget(targetUrl, resolve);
    const response = await probe(before.url, before.addresses);
    const after = validatePublicTarget(targetUrl, resolve);
    if (before.host !== after.host || before.addresses.join(',') !== after.addresses.join(',')) throw new Error('DNS_REBIND_DETECTED');
    if (!response || !before.addresses.includes(response.remoteAddress)) throw new Error('CONNECTION_IP_MISMATCH');
    if (response.redirectUrl) {
      const redirect = validatePublicTarget(response.redirectUrl, resolve);
      if (redirect.url !== before.url) throw new Error('REDIRECT_REQUIRES_SEPARATE_APPROVAL');
    }
    if (!response.diagnosis || response.diagnosis.targetUrl !== before.url) throw new Error('DIAGNOSIS_TARGET_MISMATCH');
    return response.diagnosis;
  };
}
