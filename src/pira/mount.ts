import express, { Express, RequestHandler } from 'express';
import path from 'node:path';
import type { Pool } from 'pg';
import { PgPiraStore } from './pgStore';
import { PiraService } from './service';
import { externalAuthRouter, externalGate, internalActor, ExternalAuthConfig } from './auth';
import { piraApi, piraErrors } from './routes';
import { check } from './model';
import { createIpRateLimiter } from '../middleware/rateLimit';

export function mountPira(app:Express,pool:Pool,adminGate:RequestHandler[],origin:string,staffSecret:string,env:NodeJS.ProcessEnv=process.env) {
  if(env.PIRA_ENABLED!=='true'){
    app.use(['/api/admin/pira','/pira','/admin/pira.html'],(_q,s)=>{s.status(404).end();});return;
  }
  const service=new PiraService(new PgPiraStore(pool));
  app.get('/pira-assets/base.css',(_q,s)=>s.sendFile(path.join(__dirname,'../../public/admin/partner-leads.css')));
  const internal=express.Router();internal.use(...adminGate);internal.use(piraApi(service,true,undefined,origin));internal.use(piraErrors);app.use('/api/admin/pira',internal);
  app.get('/admin/pira.html',...adminGate,async(q,s,n)=>{try{await service.session(internalActor(q.staffEmail));n();}catch(e){piraErrors(e,q,s,n);}});
  if(env.PIRA_EXTERNAL_ENABLED==='true'){
    const c:ExternalAuthConfig={origin:env.PIRA_EXTERNAL_ORIGIN??origin,clientId:env.PIRA_GOOGLE_CLIENT_ID??'',clientSecret:env.PIRA_GOOGLE_CLIENT_SECRET??'',sessionSecret:env.PIRA_SESSION_SECRET??'',production:env.NODE_ENV==='production'};
    check(c.clientId&&c.clientSecret&&c.sessionSecret!==staffSecret,'PIRA_AUTH_CONFIGURATION_REQUIRED');
    const external=express.Router();external.use(createIpRateLimiter({windowMs:60000,maxRequests:120}));
    external.use('/auth',externalAuthRouter(c,service));external.use('/api',externalGate(c,service),piraApi(service,false,c));
    external.use(piraErrors);app.use('/pira',external);
    app.get('/pira/',(_q,s)=>s.sendFile(path.join(__dirname,'../../public/pira/index.html')));
  } else app.use('/pira',(_q,s)=>{s.status(404).end();});
}
