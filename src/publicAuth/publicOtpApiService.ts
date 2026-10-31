import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { AuthError, type Brand, type OtpMailer, type Turnstile } from './otpService';
import { PostgresOtpReservationRepo } from './postgresOtpReservationRepo';
import type { Mailer } from '../services/mailer';

export type PublicServiceBrand = Brand & { origins: readonly string[] };
export type DeliveryMailer = OtpMailer;

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
  return { sendOtp: (to, brandName, code) => mailer.sendPublicServiceOtp(to, brandName, code) };
}

export class PublicOtpApiService {
  constructor(
    private readonly repo: PostgresOtpReservationRepo,
    private readonly mailer: DeliveryMailer,
    private readonly turnstile: Turnstile,
    private readonly brands: ReadonlyMap<string, PublicServiceBrand>,
    private readonly hmacKey: string,
    private readonly now = () => new Date(),
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
    const reservation = await this.repo.reserve({ id: this.id(), challengeId, serviceId: input.serviceId, email, otpDigest: this.digest('otp', code), replaces: input.replacesChallengeId, now });
    const lease = await this.repo.claim(reservation, now);
    if (!lease) throw new AuthError('MAIL_SEND_FAILED');
    try {
      await this.mailer.sendOtp(email, brand.name, code);
    } catch (error) {
      const unknown = typeof error === 'object' && error !== null && 'deliveryUnknown' in error && (error as { deliveryUnknown?: boolean }).deliveryUnknown;
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
}
