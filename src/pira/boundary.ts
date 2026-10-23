import type { RequestHandler } from 'express';
import { GoogleAuth } from 'google-auth-library';
import { randomUUID } from 'node:crypto';
import { check } from './model';

export interface CoreRequest { path:string; method:string; headers:Record<string,string>; body?:string; }
export interface CoreResponse { status:number; body:string; headers:Record<string,string>; cookies:string[]; }
export type CoreTransport=(r:CoreRequest)=>Promise<CoreResponse>;
const externalKinds='association|affiliation|application|order|terms';
const internalKinds=externalKinds+'|audit|external_link|membership|principal|outbox';
export function allowedPath(method:string,path:string,internal=false):boolean {
  if (!['GET','POST'].includes(method) || path.includes('%') || path.includes('\\') || path.includes('//')) return false;
  if(method==='GET')return path==='/session' || new RegExp('^/records/('+ (internal?internalKinds:externalKinds) +')$').test(path) || /^\/applications\/[a-zA-Z0-9-]+(?:\/history)?$/.test(path) || /^\/orders\/[a-zA-Z0-9-]+$/.test(path) || (internal && path==='/companies');
  return (!internal&&path==='/logout') || path==='/applications' || /^\/applications\/[a-zA-Z0-9-]+\/(revise|transition|order)$/.test(path) || (internal&&['/associations','/memberships','/companies/resolve','/external-links','/terms'].includes(path));
}
export function coreTransport(origin:string):CoreTransport {
  const url=new URL(origin);check(url.origin===origin&&url.protocol==='https:','INVALID_CORE_ORIGIN');
  const auth=new GoogleAuth();
  return async r=>{
    const client=await auth.getIdTokenClient(origin);
    const tokenHeaders=await client.getRequestHeaders(origin);
    const response=await fetch(origin+r.path,{method:r.method,redirect:'manual',signal:AbortSignal.timeout(15000),headers:{...r.headers,authorization:String(tokenHeaders.Authorization)},body:r.body});
    const chunks:Uint8Array[]=[];let bytes=0;
    if(response.body)for await(const chunk of response.body){bytes+=chunk.length;check(bytes<=2*1024*1024,'CORE_RESPONSE_TOO_LARGE',502);chunks.push(chunk);}
    const headers:Record<string,string>={};for(const name of ['content-type','location']){const v=response.headers.get(name);if(v)headers[name]=v;}
    return {status:response.status,headers,cookies:response.headers.getSetCookie(),body:Buffer.concat(chunks).toString('utf8')};
  };
}
/** Explicit route proxy, never accepts a destination or identity from a browser. */
export function proxyCore(transport:CoreTransport,internal:boolean,origin:string):RequestHandler {
  return async(q,s,n)=>{
    try{
      const path=q.path;check(allowedPath(q.method,path,internal),'NOT_FOUND',404);
      const query=new URLSearchParams();
      for(const [k,v] of Object.entries(q.query)){check(['associationId','companyId','q'].includes(k)&&typeof v==='string'&&v.length<=200,'INVALID_QUERY',400);query.set(k,v);}
      const headers:Record<string,string>={'x-pira-request-id':randomUUID()};
      if(internal){check(q.staffEmail,'NOT_AUTHENTICATED',401);headers['x-pira-staff-email']=q.staffEmail!;}
      else {const cookie=q.get('cookie')??'';headers.cookie=cookie.split(';').map(v=>v.trim()).filter(v=>/^(pira_session|pira_oauth_state)=/.test(v)).join('; ');}
      for(const name of ['origin','x-pira-csrf','x-pira-request']){const value=q.get(name);if(value)headers[name]=value;}
      if(q.method==='POST'){check(q.is('application/json'),'INVALID_CONTENT_TYPE',415);headers['content-type']='application/json';}
      const result=await transport({path:(internal?'/internal/api':'/external/api')+path+(query.size?'?'+query:''),method:q.method,headers,body:q.method==='POST'?JSON.stringify(q.body):undefined});
      s.set('Cache-Control','no-store');
      if(!internal)for(const c of result.cookies){check(/^(pira_session|pira_oauth_state)=/.test(c)&&!/[\r\n]/.test(c)&&!/(?:^|;)\s*domain=/i.test(c),'INVALID_CORE_COOKIE',502);s.append('Set-Cookie',c);}
      // API routes never redirect or reflect arbitrary upstream headers.
      check(result.status<300||result.status>=400,'INVALID_CORE_REDIRECT',502);
      s.status(result.status).type('application/json').send(result.body);
    }catch(e){n(e);}
  };
}
