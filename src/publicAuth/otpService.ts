import { createHmac, randomBytes, randomInt } from 'node:crypto';
import jwt from 'jsonwebtoken';

export type AuthCode = 'BRAND_NOT_FOUND'|'INVALID_REQUEST'|'TURNSTILE_DENIED'|'IP_RATE_LIMITED'|'RESEND_COOLDOWN'|'SEND_LIMIT_REACHED'|'MAIL_SEND_FAILED'|'CHALLENGE_INVALID'|'OTP_EXPIRED'|'OTP_INVALID'|'CHALLENGE_LOCKED'|'SESSION_INVALID'|'JWT_INVALID'|'JWT_REPLAYED';
export class AuthError extends Error { constructor(public readonly code: AuthCode) { super(code); } }
export type Challenge = { id:string; brand:string; email:string; digest:string; expiresAt:number; resendAt:number; failures:number; consumed:boolean; invalid:boolean };
export type Session = { id:string; brand:string; email:string; digest:string; expiresAt:number; revoked:boolean };

/** Adapter boundary: production implements every mutation in PostgreSQL transactions/row locks. */
export interface OtpStore {
  challenge(id:string): Promise<Challenge|undefined>; saveChallenge(v:Challenge): Promise<void>;
  sendCount(brand:string,email:string,since:number): Promise<number>; recordSend(brand:string,email:string,at:number): Promise<void>;
  saveSession(v:Session): Promise<void>; session(id:string): Promise<Session|undefined>;
}
export interface OtpMailer { sendOtp(to:string, brandName:string, code:string): Promise<void>; }
export interface Turnstile { verify(token:string, ip:string): Promise<boolean>; }
export type Brand = { id:string; name:string };

export class OtpService {
  constructor(private readonly store:OtpStore, private readonly mailer:OtpMailer, private readonly turnstile:Turnstile, private readonly brands:Map<string,Brand>, private readonly otpKey:string, private readonly jwtKey:string, private readonly kid:string, private readonly issuer:string, private readonly now=()=>Date.now()) {}
  private digest(purpose:'otp'|'session',value:string){return createHmac('sha256',this.otpKey).update(`${purpose}:${value}`).digest('hex');}
  private id(){return randomBytes(24).toString('base64url');}
  private code(){return String(randomInt(0,1_000_000)).padStart(6,'0');}
  private brand(id:string){const b=this.brands.get(id);if(!b)throw new AuthError('BRAND_NOT_FOUND');return b;}
  async send(brand:string,email:string,token:string,ip:string,previousId?:string){const b=this.brand(brand);if(!/^\S+@\S+\.\S+$/.test(email))throw new AuthError('INVALID_REQUEST');if(!(await this.turnstile.verify(token,ip)))throw new AuthError('TURNSTILE_DENIED');const t=this.now(), normalized=email.trim().toLowerCase();if(await this.store.sendCount(brand,normalized,t-3_600_000)>=5)throw new AuthError('SEND_LIMIT_REACHED');const code=this.code(), id=this.id();try{await this.mailer.sendOtp(normalized,b.name,code);}catch{throw new AuthError('MAIL_SEND_FAILED');}if(previousId){const p=await this.store.challenge(previousId);if(!p||p.brand!==brand)throw new AuthError('CHALLENGE_INVALID');if(p.resendAt>t)throw new AuthError('RESEND_COOLDOWN');p.invalid=true;await this.store.saveChallenge(p);}await this.store.recordSend(brand,normalized,t);await this.store.saveChallenge({id,brand,email:normalized,digest:this.digest('otp',code),expiresAt:t+600_000,resendAt:t+60_000,failures:0,consumed:false,invalid:false});return {challengeId:id,resendAt:t+60_000};}
  async change(brand:string,id:string){const c=await this.store.challenge(id);if(!c||c.brand!==brand)throw new AuthError('CHALLENGE_INVALID');c.invalid=true;await this.store.saveChallenge(c);}
  async verify(brand:string,id:string,code:string){const c=await this.store.challenge(id),t=this.now();if(!c||c.brand!==brand||c.invalid||c.consumed)throw new AuthError('CHALLENGE_INVALID');if(c.expiresAt<=t)throw new AuthError('OTP_EXPIRED');if(c.failures>=5)throw new AuthError('CHALLENGE_LOCKED');if(this.digest('otp',code)!==c.digest){c.failures++;if(c.failures>=5)c.invalid=true;await this.store.saveChallenge(c);throw new AuthError(c.failures>=5?'CHALLENGE_LOCKED':'OTP_INVALID');}c.consumed=true;await this.store.saveChallenge(c);const raw=randomBytes(32).toString('base64url'), session={id:this.id(),brand,email:c.email,digest:this.digest('session',raw),expiresAt:t+7_200_000,revoked:false};await this.store.saveSession(session);return {sessionId:session.id,sessionToken:raw};}
  async issueJwt(brand:string,sessionId:string,token:string){this.brand(brand);const s=await this.store.session(sessionId),t=this.now();if(!s||s.brand!==brand||s.revoked||s.expiresAt<=t||this.digest('session',token)!==s.digest)throw new AuthError('SESSION_INVALID');const jti=this.id();return jwt.sign({email:s.email},this.jwtKey,{algorithm:'RS256',keyid:this.kid,issuer:this.issuer,audience:brand,subject:s.id,jwtid:jti,expiresIn:'5m'});}
  async revoke(brand:string,id:string,token:string){const s=await this.store.session(id);if(!s||s.brand!==brand||this.digest('session',token)!==s.digest)throw new AuthError('SESSION_INVALID');s.revoked=true;await this.store.saveSession(s);}
  jwks(){return {keys:[]};} // populated by deployment key adapter; private material is never exposed
}
