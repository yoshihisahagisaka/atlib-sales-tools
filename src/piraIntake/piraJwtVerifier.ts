import { createPublicKey } from 'node:crypto';
import jwt, { type JwtHeader } from 'jsonwebtoken';

export type PiraJwtClaims = { iss: string; aud: string | string[]; sub: string; jti: string; iat: number; exp: number; email: string };
export type JwksKey = { kty?: string; n?: string; e?: string; kid?: string; alg?: string; use?: string; [name: string]: unknown };
export type Jwks = { keys: JwksKey[] };
export interface JwksProvider { getJwks(): Promise<Jwks>; }

/** Fetches only public signing material; failures are intentionally fail-closed. */
export class HttpJwksProvider implements JwksProvider {
  constructor(private readonly url: string) {}
  async getJwks(): Promise<Jwks> {
    const response = await fetch(this.url, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error('JWKS_UNAVAILABLE');
    const value = await response.json() as unknown;
    if (!value || typeof value !== 'object' || !Array.isArray((value as { keys?: unknown }).keys)) throw new Error('JWKS_INVALID');
    return value as Jwks;
  }
}

export class PiraJwtError extends Error { constructor(public readonly code = 'JWT_INVALID') { super(code); } }

/** Receiver-side verification; it intentionally does not reuse the OTP service verifier. */
export class PiraJwtVerifier {
  constructor(private readonly jwks: JwksProvider, private readonly issuer: string) {}
  async verify(token: string, audience: string): Promise<PiraJwtClaims> {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string') throw new PiraJwtError();
    const header = decoded.header as JwtHeader;
    if (header.alg !== 'RS256' || !header.kid) throw new PiraJwtError();
    let keys: Jwks;
    try { keys = await this.jwks.getJwks(); } catch { throw new PiraJwtError('JWKS_UNAVAILABLE'); }
    const jwk = keys.keys.find(key => key.kid === header.kid && key.kty === 'RSA' && (key.alg === undefined || key.alg === 'RS256'));
    if (!jwk) throw new PiraJwtError();
    let payload: jwt.JwtPayload | string;
    try { payload = jwt.verify(token, createPublicKey({ key: jwk as never, format: 'jwk' }), { algorithms: ['RS256'], issuer: this.issuer, audience }); }
    catch { throw new PiraJwtError(); }
    if (typeof payload === 'string' || typeof payload.sub !== 'string' || typeof payload.jti !== 'string' || typeof payload.email !== 'string' || typeof payload.iat !== 'number' || typeof payload.exp !== 'number') throw new PiraJwtError();
    const email = payload.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email) || email !== payload.email) throw new PiraJwtError();
    return { iss: this.issuer, aud: payload.aud ?? audience, sub: payload.sub, jti: payload.jti, iat: payload.iat, exp: payload.exp, email };
  }
}
