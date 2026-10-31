import { createHmac, createPublicKey, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { AuthError, type Brand, type OtpMailer, type Turnstile } from './otpService';
import { PostgresOtpReservationRepo } from './postgresOtpReservationRepo';
import type { Mailer } from '../services/mailer';

export type PublicServiceBrand = Brand & { origins: readonly string[] };
export type DeliveryMailer = OtpMailer;
export class OtpDeliveryError extends Error { constructor(public readonly outcome: 'FAILED' | 'UNKNOWN') { super(outcome); } }
export type JwtKey = { kid: string; privateKey: string; publicKey: string };
export type JwtConfig = { issuer: string; activeKid: string; keys: readonly JwtKey[] };

/** Production adapter: it never logs the token and fails closed on network errors. */
export class CloudflareTurnstileVerifier implements Turnstile {
  constructor(private readonly secret: string, private readonly endpoint = 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {}
  async verify(token: string, ip: string): Promise<boolean> {
    try {
      const body = new URLSearchParams({ secret: this.secret, response: token, remoteip: ip });
      const response = await fetch(this.endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
      const value = await response.json() as { success?: unknown };
      return response.ok && value.success === true;
    } catch { return false; }
  }
}

/** Binds the existing SMTP implementation to the OTP-only mailer boundary. */
export function createMailerOtpAdapter(mailer: Mailer): DeliveryMailer {
  return { sendOtp: async (to, brandName, code) => {
    try { await mailer.sendPublicServiceOtp(to, brandName, code); }
    catch (error) {
      const value = error as { code?: string; responseCode?: number };
      const unknown = ['ETIMEDOUT', 'ECONNRESET', 'ECONNABORTED', 'ESOCKET'].includes(value?.code ?? '') || value?.responseCode === undefined;
      throw new OtpDeliveryError(unknown ? 'UNKNOWN' : 'FAILED');
    }
  } };
}

export class PublicOtpApiService {
  constructor(
    private readonly repo: PostgresOtpReservationRepo,
    private readonly mailer: DeliveryMailer,
    private readonly turnstile: Turnstile,
    private readonly brands: ReadonlyMap<string, PublicServiceBrand>,
    private readonly hmacKey: string,
    private readonly now = () => new Date(), private readonly jwtConfig?: JwtConfig,
  ) {}

  private brand(id: string) { const value = this.brands.get(id); if (!value) throw new AuthError('BRAND_NOT_FOUND'); return value; }
  private digest(purpose: 'otp' | 'session', value: string) { return createHmac('sha256', this.hmacKey).update(`${purpose}:${value}`).digest('hex'); }
  private id() { return randomBytes(24).toString('base64url'); }
  private code() { return String(randomInt(0, 1_000_000)).padStart(6, '0'); }
  private validEmail(email: string) { return /^\S+@\S+\.\S+$/.test(email); }

  assertOrigin(serviceId: string, origin: string | undefined): PublicServiceBrand {
    const brand = this.brand(serviceId);
    if (!origin || !brand.origins.includes(origin)) throw new AuthError('BRAND_NOT_FOUND');
    return brand;
  }

  async send(input: { serviceId: string; email: string; turnstileToken: string; ip: string; origin: string; replacesChallengeId?: string }) {
    const brand = this.assertOrigin(input.serviceId, input.origin);
    const email = input.email.trim().toLowerCase();
    if (!this.validEmail(email) || !input.turnstileToken) throw new AuthError('INVALID_REQUEST');
    if (!(await this.turnstile.verify(input.turnstileToken, input.ip))) throw new AuthError('TURNSTILE_DENIED');
    const now = this.now();
    if (input.replacesChallengeId) {
      const previous = await this.repo.challengeForResend(input.replacesChallengeId);
      const inCooldown = previous !== undefined && previous.resendNotBefore > now;
      if (!previous || previous.serviceId !== input.serviceId || previous.email !== email || inCooldown) throw new AuthError(inCooldown ? 'RESEND_COOLDOWN' : 'CHALLENGE_INVALID');
    }
    const code = this.code();
    const challengeId = this.id();
    let reservation;
    try { reservation = await this.repo.reserve({ id: this.id(), challengeId, serviceId: input.serviceId, email, otpDigest: this.digest('otp', code), replaces: input.replacesChallengeId, now }); }
    catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'RESEND_COOLDOWN' || code === 'SEND_LIMIT_REACHED') throw new AuthError(code);
      throw error;
    }
    const lease = await this.repo.claim(reservation, now);
    if (!lease) throw new AuthError('MAIL_SEND_FAILED');
    try {
      await this.mailer.sendOtp(email, brand.name, code);
    } catch (error) {
      const unknown = error instanceof OtpDeliveryError ? error.outcome === 'UNKNOWN' : typeof error === 'object' && error !== null && 'deliveryUnknown' in error && (error as { deliveryUnknown?: boolean }).deliveryUnknown;
      await this.repo.finish(lease, unknown ? 'UNKNOWN' : 'FAILED', unknown ? 'SMTP_UNKNOWN' : 'SMTP_FAILED', this.now());
      throw new AuthError('MAIL_SEND_FAILED');
    }
    if (!(await this.repo.activateChallenge(lease, this.now()))) throw new AuthError('MAIL_SEND_FAILED');
    return { challengeId, resendAt: new Date(now.getTime() + 60_000).toISOString() };
  }

  async verify(input: { serviceId: string; challengeId: string; code: string; origin: string }) {
    this.assertOrigin(input.serviceId, input.origin);
    if (!/^\d{6}$/.test(input.code)) throw new AuthError('OTP_INVALID');
    const sessionToken = randomBytes(32).toString('base64url');
    const result = await this.repo.verifyAndCreateSession({ challengeId: input.challengeId, serviceId: input.serviceId, otpDigest: this.digest('otp', input.code), sessionId: this.id(), sessionDigest: this.digest('session', sessionToken), now: this.now() });
    if (result.result !== 'OK' || !result.session) throw new AuthError(result.result as Exclude<typeof result.result, 'OK'>);
    return { sessionId: result.session.id, sessionToken, expiresAt: result.session.expiresAt.toISOString() };
  }
  async changeEmail(input: { serviceId: string; challengeId: string; origin: string }) { this.assertOrigin(input.serviceId, input.origin); if (!(await this.repo.invalidateChallenge(input.challengeId, input.serviceId, this.now()))) throw new AuthError('CHALLENGE_INVALID'); }
  async issueJwt(input: { serviceId: string; sessionId: string; sessionToken: string; origin: string }) {
    this.assertOrigin(input.serviceId, input.origin); const config = this.jwtConfig; if (!config) throw Error('JWT_NOT_CONFIGURED'); const session = await this.repo.activeSession(input.sessionId, input.serviceId, this.now());
    const supplied = Buffer.from(this.digest('session', input.sessionToken), 'hex'); const expected = session ? Buffer.from(session.tokenDigest, 'hex') : Buffer.alloc(0);
    if (!session || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new AuthError('SESSION_INVALID');
    const key = config.keys.find(value => value.kid === config.activeKid); if (!key) throw Error('JWT_NOT_CONFIGURED');
    return jwt.sign({ email: session.email }, key.privateKey, { algorithm: 'RS256', keyid: key.kid, issuer: config.issuer, audience: input.serviceId, subject: session.id, jwtid: this.id(), expiresIn: 300 });
  }
  async revokeSession(input: { serviceId: string; sessionId: string; sessionToken: string; origin: string }) { this.assertOrigin(input.serviceId, input.origin); if (!(await this.repo.revokeSession(input.sessionId, input.serviceId, this.digest('session', input.sessionToken), this.now()))) throw new AuthError('SESSION_INVALID'); }
  jwks() { const config = this.jwtConfig; if (!config) throw Error('JWT_NOT_CONFIGURED'); return { keys: config.keys.map(key => ({ ...createPublicKey(key.publicKey).export({ format: 'jwk' }), kid: key.kid, alg: 'RS256', use: 'sig' })) }; }
  verifyJwtForService(token: string, serviceId: string) { const config = this.jwtConfig; if (!config) throw new AuthError('JWT_INVALID'); const decoded = jwt.decode(token, { complete: true }); const kid = decoded && typeof decoded !== 'string' ? decoded.header.kid : undefined; const key = typeof kid === 'string' ? config.keys.find(value => value.kid === kid) : undefined; if (!key) throw new AuthError('JWT_INVALID'); try { return jwt.verify(token, key.publicKey, { algorithms: ['RS256'], issuer: config.issuer, audience: serviceId }); } catch { throw new AuthError('JWT_INVALID'); } }
}
