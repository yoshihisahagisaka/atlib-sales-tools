import express from 'express';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { CoreTransport, proxyCore } from './boundary';
import { check } from './model';
import { piraErrors } from './errors';
import { createIpRateLimiter } from '../middleware/rateLimit';

export function createPortal(transport:CoreTransport,origin:string) {
  const app=express();app.disable('x-powered-by');
  app.use(createIpRateLimiter({windowMs:60000,maxRequests:120}));
  app.use(express.json({limit:'32kb'}));
  const root=path.join(__dirname,'../../public');
  app.get('/healthz/',(_q,s)=>{s.json({ok:true,role:'pira-portal'});});
  app.get('/pira/',(_q,s)=>s.sendFile(path.join(root,'pira/index.html')));
  for(const file of ['pira.css','pira.js','base.css'])app.get('/pira-assets/'+file,(_q,s)=>s.sendFile(path.join(root,'pira-assets',file==='pira.js'?'external.js':file)));
  app.get(['/pira/auth/login','/pira/auth/callback'],async(q,s,n)=>{
    try{
      const query=new URLSearchParams();
      for(const [k,v]of Object.entries(q.query)){check(['code','state','error','scope','authuser','prompt','hd'].includes(k)&&typeof v==='string'&&v.length<=4096,'INVALID_QUERY',400);query.set(k,v);}
      const cookie=(q.get('cookie')??'').split(';').map(v=>v.trim()).filter(v=>/^pira_oauth_state=/.test(v)).join('; ');
      const r=await transport({path:'/external/auth/'+(q.path.endsWith('/login')?'login':'callback')+(query.size?'?'+query:''),method:'GET',headers:{cookie,'x-pira-request-id':randomUUID()}});
      for(const c of r.cookies){check(/^(pira_session|pira_oauth_state)=/.test(c)&&!/[\r\n]/.test(c)&&!/(?:^|;)\s*domain=/i.test(c),'INVALID_CORE_COOKIE',502);s.append('Set-Cookie',c);}
      if(r.status===302){const dest=r.headers.location;check(dest,'INVALID_CORE_REDIRECT',502);const u=new URL(dest,origin);check(u.href===origin+'/pira/'||(u.origin==='https://accounts.google.com'&&u.pathname==='/o/oauth2/v2/auth'),'INVALID_CORE_REDIRECT',502);s.set('Location',dest);}
      else check(r.status>=400,'INVALID_AUTH_RESPONSE',502);
      s.set('Cache-Control','no-store').status(r.status).type('text/plain').send(r.status===302?'':'ログインできませんでした。');
    }catch(e){n(e);}
  });
  app.use('/pira/api',proxyCore(transport,false,origin));
  app.use((_q,s)=>{s.status(404).end();});app.use(piraErrors);return app;
}
