import express, { Express, RequestHandler } from 'express';
import path from 'node:path';
import type { Pool } from 'pg';
import { coreTransport, CoreTransport, proxyCore } from './boundary';
import { piraErrors, resolve, terms } from './routes';
import { check } from './model';
import { httpsOrigin, required } from './runtimeConfig';
import { SalesCompanyCommands } from './salesCommands';

/** Sales is an authenticated adapter, never an external portal or PIRA writer. */
export function mountPira(app:Express,pool:Pool,adminGate:RequestHandler[],origin:string,_staffSecret:string,env:NodeJS.ProcessEnv=process.env,transportOverride?:CoreTransport) {
  app.use('/pira',(_q,s)=>{s.status(404).end();}); // never enabled on Sales, even by the old external flag
  if(env.PIRA_ENABLED!=='true'){app.use(['/api/admin/pira','/admin/pira.html','/pira-assets'],(_q,s)=>{s.status(404).end();});return;}
  const transport=transportOverride??coreTransport(httpsOrigin(required(env,'PIRA_CORE_ORIGIN')));
  const commands=new SalesCompanyCommands(pool);
  const internal=express.Router();internal.use(...adminGate);
  internal.use(async(q,s,n)=>{try{
    check(q.staffEmail,'NOT_AUTHENTICATED',401);
    if(!['GET','HEAD'].includes(q.method))check(q.get('origin')===origin&&q.get('x-pira-request')==='1','CSRF_REJECTED',403);
    // Authorize in core BEFORE any Sales-owned company/estimate writes.
    if(q.method==='POST'&&['/companies/resolve','/terms'].includes(q.path)){
      const result=await transport({path:'/internal/api/session',method:'GET',headers:{'x-pira-staff-email':q.staffEmail!}});
      check(result.status===200,'ACCESS_DENIED',403);
      if(q.path==='/companies/resolve')q.body=await commands.resolve(resolve.parse(q.body),q.staffEmail!);
      else{
        const {estimateEvidence,...rest}=q.body??{};q.body=terms.parse(rest);
        if(q.body.service==='INFRAVISION')await commands.bindEstimate(q.body,q.staffEmail!,estimateEvidence);
      }
    }
    n();
  }catch(e){n(e);}});
  internal.use(proxyCore(transport,true,origin));internal.use(piraErrors);app.use('/api/admin/pira',internal);
  app.get('/admin/pira.html',...adminGate,async(q,s,n)=>{try{const r=await transport({path:'/internal/api/session',method:'GET',headers:{'x-pira-staff-email':q.staffEmail??''}});check(r.status===200,'ACCESS_DENIED',403);s.sendFile(path.join(__dirname,'../../public/admin/pira.html'));}catch(e){piraErrors(e,q,s,n);}});
  for(const file of ['pira.js','pira.css','base.css'])app.get('/pira-assets/'+file,...adminGate,(_q,s)=>s.sendFile(path.join(__dirname,'../../public/pira-assets',file)));
}
