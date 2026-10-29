// Test-only adapter. It does not import Node networking modules and cannot
// reach a host. It verifies the production probe's SNI/Host contract shape.
export function createTestConnectionAdapter(exchange) {
  if (typeof exchange !== 'function') throw new Error('TEST_EXCHANGE_REQUIRED');
  return async ({ url, addresses, mailDomain, signal }) => exchange({ url, addresses, mailDomain, signal, connection: { servername: new URL(url).hostname, hostHeader: new URL(url).host, rejectUnauthorized: true } });
}
