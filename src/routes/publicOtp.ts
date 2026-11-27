import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { createIpRateLimiter } from '../middleware/rateLimit';
import { AuthError } from '../publicAuth/otpService';
import { PublicOtpApiService } from '../publicAuth/publicOtpApiService';

const sendSchema = z.object({ serviceId: z.string().min(1).max(80), email: z.string().max(320), turnstileToken: z.string().min(1).max(4096) }).strict();
const verifySchema = z.object({ serviceId: z.string().min(1).max(80), code: z.string().length(6) }).strict();
const resendSchema = z.object({ serviceId: z.string().min(1).max(80), email: z.string().max(320), turnstileToken: z.string().min(1).max(4096) }).strict();
const sessionSchema = z.object({ serviceId: z.string().min(1).max(80), sessionToken: z.string().min(32).max(512) }).strict();

const messages: Record<string, string> = {
  OTP_INVALID: '認証コードが正しくありません。もう一度ご確認ください。', OTP_EXPIRED: '認証コードの有効期限が切れました。再度認証コードを送信してください。', CHALLENGE_LOCKED: '認証回数の上限に達しました。認証コードを再送してください。', RESEND_COOLDOWN: '認証コードは60秒経過後に再送できます。', SEND_LIMIT_REACHED: '送信回数の上限に達しました。しばらく時間をおいてお試しください。', TURNSTILE_DENIED: '確認が完了しませんでした。もう一度お試しください。', MAIL_SEND_FAILED: '認証コードを送信できませんでした。しばらく時間をおいてお試しください。', SESSION_INVALID: '認証の有効期限が切れました。もう一度メールアドレスの確認を行ってください。',
};
function sendError(res: Response, error: unknown) {
  const code = error instanceof AuthError ? error.code : 'INTERNAL_ERROR';
  const status = code === 'BRAND_NOT_FOUND' ? 404 : code === 'RESEND_COOLDOWN' || code === 'SEND_LIMIT_REACHED' || code === 'IP_RATE_LIMITED' ? 429 : code === 'TURNSTILE_DENIED' ? 403 : 400;
  res.status(code === 'INTERNAL_ERROR' ? 500 : status).json({ error: { code, ...(messages[code] ? { message: messages[code] } : {}) } });
}
function origin(req: Request) { return req.get('origin'); }
function allowOrigin(req: Request, res: Response, serviceId: string, service: PublicOtpApiService): string | undefined {
  const value = origin(req); service.assertOrigin(serviceId, value); res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Origin', value!); return value;
}

/** Dedicated OTP API router. Mount only in the separate public-auth service. */
export function createPublicOtpRouter(service: PublicOtpApiService): Router {
  const router = Router();
  const ipLimit = createIpRateLimiter({ windowMs: 10 * 60_000, maxRequests: 20, onLimit: (_req, res) => res.status(429).json({ error: { code: 'IP_RATE_LIMITED' } }) });
  router.post('/challenges', ipLimit, async (req, res) => {
    const parsed = sendSchema.safeParse(req.body); if (!parsed.success) return sendError(res, new AuthError('INVALID_REQUEST'));
    try { const requestOrigin = allowOrigin(req, res, parsed.data.serviceId, service); res.status(201).json(await service.send({ ...parsed.data, origin: requestOrigin!, ip: req.ip ?? 'unknown' })); } catch (error) { sendError(res, error); }
  });
  router.post('/challenges/:challengeId/verify', ipLimit, async (req, res) => {
    const parsed = verifySchema.safeParse(req.body); if (!parsed.success) return sendError(res, new AuthError('INVALID_REQUEST'));
    const challengeId = req.params.challengeId; if (!challengeId) return sendError(res, new AuthError('INVALID_REQUEST'));
    try { const requestOrigin = allowOrigin(req, res, parsed.data.serviceId, service); res.status(200).json(await service.verify({ ...parsed.data, challengeId, origin: requestOrigin! })); } catch (error) { sendError(res, error); }
  });
  router.post('/challenges/:challengeId/resend', ipLimit, async (req, res) => {
    const parsed = resendSchema.safeParse(req.body); if (!parsed.success) return sendError(res, new AuthError('INVALID_REQUEST'));
    const challengeId = req.params.challengeId; if (!challengeId) return sendError(res, new AuthError('INVALID_REQUEST'));
    try { const requestOrigin = allowOrigin(req, res, parsed.data.serviceId, service); res.status(201).json(await service.send({ ...parsed.data, replacesChallengeId: challengeId, origin: requestOrigin!, ip: req.ip ?? 'unknown' })); } catch (error) { sendError(res, error); }
  });
  router.delete('/challenges/:challengeId', ipLimit, async (req, res) => { const parsed = z.object({ serviceId: z.string().min(1).max(80) }).strict().safeParse(req.body); if (!parsed.success) return sendError(res, new AuthError('INVALID_REQUEST')); const challengeId = req.params.challengeId; if (!challengeId) return sendError(res, new AuthError('INVALID_REQUEST')); try { const requestOrigin = allowOrigin(req, res, parsed.data.serviceId, service); await service.changeEmail({ serviceId: parsed.data.serviceId, challengeId, origin: requestOrigin! }); res.status(204).end(); } catch (error) { sendError(res, error); } });
  router.post('/sessions/:sessionId/tokens', ipLimit, async (req, res) => { const parsed = sessionSchema.safeParse(req.body); if (!parsed.success) return sendError(res, new AuthError('INVALID_REQUEST')); const sessionId = req.params.sessionId; if (!sessionId) return sendError(res, new AuthError('INVALID_REQUEST')); try { const requestOrigin = allowOrigin(req, res, parsed.data.serviceId, service); res.status(200).json({ token: await service.issueJwt({ ...parsed.data, sessionId, origin: requestOrigin! }) }); } catch (error) { sendError(res, error); } });
  router.delete('/sessions/:sessionId', ipLimit, async (req, res) => { const parsed = sessionSchema.safeParse(req.body); if (!parsed.success) return sendError(res, new AuthError('INVALID_REQUEST')); const sessionId = req.params.sessionId; if (!sessionId) return sendError(res, new AuthError('INVALID_REQUEST')); try { const requestOrigin = allowOrigin(req, res, parsed.data.serviceId, service); await service.revokeSession({ ...parsed.data, sessionId, origin: requestOrigin! }); res.status(204).end(); } catch (error) { sendError(res, error); } });
  return router;
}
export function createPublicOtpJwksRouter(service: PublicOtpApiService): Router { const router = Router(); router.get('/.well-known/jwks.json', (_req, res) => { try { res.status(200).json(service.jwks()); } catch { res.status(503).json({ error: { code: 'INTERNAL_ERROR' } }); } }); return router; }
