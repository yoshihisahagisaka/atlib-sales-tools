import { OAuth2Client } from 'google-auth-library';
import type { Request, Response, NextFunction } from 'express';

const client = new OAuth2Client();

/** Minimal shape of the request-scoped logger (pino-http injects a real pino.Logger as req.log
 * in server.ts; this local type avoids depending on pino-http's global Express augmentation so
 * this middleware type-checks standalone, including under an isolated ts-node test program). */
type RequestLogger = { info: (fields: Record<string, unknown>) => void; warn: (fields: Record<string, unknown>) => void };
function requestLogger(req: Request): RequestLogger | undefined {
  return (req as unknown as { log?: RequestLogger }).log;
}

/**
 * Verifies a Google-signed OIDC ID token (as issued by Cloud Scheduler for its
 * configured service account) and rejects unless the token's verified subject
 * matches the single allowed service account email for this endpoint. This is
 * the application-level authorization layer; it does not rely on any shared
 * secret, only on Google's own token signature verification (google-auth-library,
 * the same library already used for staff OAuth in staffAuth.ts).
 */
// Minimal structured audit logging (Human Decision 2026-09-20): every authorized/rejected
// decision is logged via the existing request-scoped pino logger (req.log, injected by
// pino-http in server.ts). Never logs the token, the Authorization header, or any credential.
export function requireSchedulerIdentity(allowedServiceAccountEmail: string, audience: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const endpoint = req.path;
    const header = req.header('authorization');
    const idToken = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!idToken) {
      requestLogger(req)?.warn({ event: 'scheduler_auth', endpoint, authorizationResult: 'REJECTED', rejectedIdentity: null, rejectionReason: 'MISSING_TOKEN' });
      res.status(401).json({ error: 'UNAUTHENTICATED' });
      return;
    }
    try {
      const ticket = await client.verifyIdToken({ idToken, audience });
      const payload = ticket.getPayload();
      if (payload?.email && payload.email_verified && payload.email === allowedServiceAccountEmail) {
        requestLogger(req)?.info({ event: 'scheduler_auth', endpoint, authorizationResult: 'AUTHORIZED', verifiedIdentity: payload.email });
        next();
        return;
      }
      requestLogger(req)?.warn({
        event: 'scheduler_auth',
        endpoint,
        authorizationResult: 'REJECTED',
        rejectedIdentity: payload?.email ?? null,
        rejectionReason: !payload?.email ? 'NO_EMAIL_IN_TOKEN' : !payload.email_verified ? 'EMAIL_NOT_VERIFIED' : 'IDENTITY_NOT_ALLOWED',
      });
      res.status(403).json({ error: 'FORBIDDEN' });
    } catch {
      requestLogger(req)?.warn({ event: 'scheduler_auth', endpoint, authorizationResult: 'REJECTED', rejectedIdentity: null, rejectionReason: 'TOKEN_VERIFICATION_FAILED' });
      res.status(401).json({ error: 'UNAUTHENTICATED' });
    }
  };
}
