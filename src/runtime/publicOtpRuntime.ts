import express, { type Express } from 'express';
import type { Pool } from 'pg';
import type { Mailer } from '../services/mailer';
import { PostgresOtpReservationRepo } from '../publicAuth/postgresOtpReservationRepo';
import { CloudflareTurnstileVerifier, PublicOtpApiService, createMailerOtpAdapter, type JwtConfig, type PublicServiceBrand } from '../publicAuth/publicOtpApiService';
import { createPublicOtpJwksRouter, createPublicOtpRouter } from '../routes/publicOtp';
import { configurePublicRuntime } from './runtimeSecurity';
import type { Turnstile } from '../publicAuth/otpService';

export type PublicOtpRuntimeOptions = {
  pool: Pool;
  mailer: Pick<Mailer, 'sendPublicServiceOtp'>;
  turnstileSecret: string;
  hmacKey: string;
  jwt: JwtConfig;
  brands: ReadonlyMap<string, PublicServiceBrand>;
  /** Test-only injection; production entry point always uses Cloudflare. */
  turnstile?: Turnstile;
};

export function createPublicOtpRuntime(options: PublicOtpRuntimeOptions): Express {
  const app = express();
  configurePublicRuntime(app);
  app.use(express.json({ limit: '16kb', strict: true }));
  const service = new PublicOtpApiService(
    new PostgresOtpReservationRepo(options.pool),
    createMailerOtpAdapter(options.mailer),
    options.turnstile ?? new CloudflareTurnstileVerifier(options.turnstileSecret),
    options.brands,
    options.hmacKey,
    undefined,
    options.jwt,
  );
  app.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok', service: 'public-auth' }));
  app.use(createPublicOtpJwksRouter(service));
  const otpRouter = createPublicOtpRouter(service);
  app.use('/v1/otp', otpRouter);
  app.use('/security-check/v1/otp', otpRouter);
  return app;
}
