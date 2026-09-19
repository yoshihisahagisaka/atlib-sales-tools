import { OAuth2Client } from 'google-auth-library';
import type { Request, Response, NextFunction } from 'express';

const client = new OAuth2Client();

/**
 * Verifies a Google-signed OIDC ID token (as issued by Cloud Scheduler for its
 * configured service account) and rejects unless the token's verified subject
 * matches the single allowed service account email for this endpoint. This is
 * the application-level authorization layer; it does not rely on any shared
 * secret, only on Google's own token signature verification (google-auth-library,
 * the same library already used for staff OAuth in staffAuth.ts).
 */
export function requireSchedulerIdentity(allowedServiceAccountEmail: string, audience: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.header('authorization');
    const idToken = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!idToken) { res.status(401).json({ error: 'UNAUTHENTICATED' }); return; }
    try {
      const ticket = await client.verifyIdToken({ idToken, audience });
      const payload = ticket.getPayload();
      if (payload?.email && payload.email_verified && payload.email === allowedServiceAccountEmail) {
        next();
        return;
      }
      res.status(403).json({ error: 'FORBIDDEN' });
    } catch {
      res.status(401).json({ error: 'UNAUTHENTICATED' });
    }
  };
}
