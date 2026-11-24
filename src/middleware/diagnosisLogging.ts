// Access logs use an allowlist rather than serializing request bodies/headers.
// Resume tokens travel in the URL fragment (not sent to servers) and Authorization.
export function safeAccessRequest(req: { id?: unknown; method?: string; url?: string; remoteAddress?: string }) {
  const url = req.url?.split('?')[0];
  if (url === '/api/public/business-kaizen/anonymous-events') return { id: req.id, method: req.method, url };
  return { id: req.id, method: req.method, url, remoteAddress: req.remoteAddress };
}

// pino's default response serializer includes Set-Cookie and OAuth Location headers.
export function safeAccessResponse(res: { statusCode?: number }) {
  return { statusCode: res.statusCode };
}
