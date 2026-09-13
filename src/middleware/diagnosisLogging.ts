// Access logs use an allowlist rather than serializing request bodies/headers.
// Resume tokens travel in the URL fragment (not sent to servers) and Authorization.
export function safeAccessRequest(req: { id?: unknown; method?: string; url?: string; remoteAddress?: string }) {
  return { id: req.id, method: req.method, url: req.url?.split('?')[0], remoteAddress: req.remoteAddress };
}

// pino's default response serializer includes Set-Cookie and OAuth Location headers.
export function safeAccessResponse(res: { statusCode?: number }) {
  return { statusCode: res.statusCode };
}
