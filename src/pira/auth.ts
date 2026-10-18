import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Router, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import type { Actor } from './model';
import { PiraError, check, staffId } from './model';
import type { PiraService } from './service';

export interface ExternalAuthConfig { origin:string; clientId:string; clientSecret:string; sessionSecret:string; production:boolean; }
const cookie='pira_session',stateCookie='pira_oauth_state';
const options=(secure:boolean)=>({httpOnly:true,secure,sameSite:'lax' as const,path:'/pira'});
const sign=(secret:string,payload:object,seconds:number)=>jwt.sign(payload,secret,{algorithm:'HS256',issuer:'sales-tools-pira',audience:'pira-external',expiresIn:seconds});
function verify(secret:string,token:string):any {const p=jwt.verify(token,secret,{algorithms:['HS256'],issuer:'sales-tools-pira',audience:'pira-external'});check(typeof p!=='string','INVALID_SESSION',401);return p;}
export function csrfEqual(a:unknown,b:unknown) {if(typeof a!=='string'||typeof b!=='string'||a.length<=20)return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export function externalActor(secret:string,token:unknown):Actor {check(typeof token==='string','NOT_AUTHENTICATED',401);let p:any;try{p=verify(secret,token);}catch{throw new PiraError('NOT_AUTHENTICATED',401);}check(p.purpose==='session'&&typeof p.principalId==='string','NOT_AUTHENTICATED',401);return {id:p.principalId,internal:false};}
export function issueExternalSession(secret:string,actor:Actor,csrf:string) {return sign(secret,{purpose:'session',principalId:actor.id,csrf},3600);}
export function externalGate(config:ExternalAuthConfig,service:PiraService):RequestHandler {return async(req,res,next)=>{
  try {const actor=externalActor(config.sessionSecret,req.cookies?.[cookie]);await service.session(actor);
    if(!['GET','HEAD'].includes(req.method)) {const p=verify(config.sessionSecret,req.cookies[cookie]);check(req.get('origin')===config.origin&&csrfEqual(req.get('x-pira-csrf'),p.csrf),'CSRF_REJECTED',403);}
    res.locals.piraActor={...actor,machine:res.locals.piraMachine,requestId:req.get('x-pira-request-id')};next();
  } catch(e){next(e);}
};}
/** Reuses the installed Google OAuth2Client/PKCE protocol used by Sales staff auth.
 * Separate fixed redirect, cookie, audience, secret and pre-registered principal; no staff cookie or domain JIT.
 */
export function externalAuthRouter(config:ExternalAuthConfig,service:PiraService):Router {
  check(new URL(config.origin).origin===config.origin && (!config.production||config.origin.startsWith('https://')),'INVALID_PIRA_ORIGIN');
  check(config.sessionSecret.length>=32,'INVALID_PIRA_SECRET');const r=Router();
  const client=()=>new OAuth2Client({clientId:config.clientId,clientSecret:config.clientSecret,redirectUri:config.origin+'/pira/auth/callback'});
  r.get('/login',async(_req,res,next)=>{try{const c=client(),pkce=await c.generateCodeVerifierAsync(),state=randomBytes(24).toString('hex'),nonce=randomBytes(24).toString('hex');
    res.cookie(stateCookie,sign(config.sessionSecret,{purpose:'oauth',state,nonce,verifier:pkce.codeVerifier},600),{...options(config.production),maxAge:600000});
    res.redirect(c.generateAuthUrl({scope:['openid','email'],state,nonce,code_challenge:pkce.codeChallenge,code_challenge_method:CodeChallengeMethod.S256}));
  }catch(e){next(e);}});
  r.get('/callback',async(req,res)=>{res.clearCookie(stateCookie,options(config.production));try{
    const p=verify(config.sessionSecret,req.cookies?.[stateCookie]);check(p.purpose==='oauth'&&typeof req.query.code==='string'&&csrfEqual(req.query.state,p.state),'OAUTH_REJECTED',400);
    const c=client(),{tokens}=await c.getToken({code:req.query.code as string,codeVerifier:p.verifier});check(tokens.id_token,'OAUTH_REJECTED',400);
    const payload=(await c.verifyIdToken({idToken:tokens.id_token,audience:config.clientId})).getPayload();
    check(payload?.email_verified&&payload.email&&payload.sub&&(payload as any).nonce===p.nonce,'OAUTH_REJECTED',403);
    const actor=await service.bindGoogle(payload.iss,payload.sub,payload.email);const csrf=randomBytes(24).toString('hex');
    res.cookie(cookie,issueExternalSession(config.sessionSecret,actor,csrf),{...options(config.production),maxAge:3600000});res.redirect('/pira/');
  }catch{res.status(403).type('text').send('ログインできません。組合・企業の事前登録をatLIBへご確認ください。');}});
  return r;
}
export function internalActor(email:string|undefined):Actor {check(email,'NOT_AUTHENTICATED',401);return {id:staffId(email),internal:true};}
export function externalSessionView(config:ExternalAuthConfig,req:any) {const p=verify(config.sessionSecret,req.cookies?.[cookie]);return {csrf:p.csrf};}
export function clearExternalSession(res:any,config:ExternalAuthConfig) {res.clearCookie(cookie,options(config.production));}
