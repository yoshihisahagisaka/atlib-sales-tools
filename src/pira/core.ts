import express from 'express';
import cookieParser from 'cookie-parser';
import { externalAuthRouter, externalGate, ExternalAuthConfig, internalActor } from './auth';
import { piraApi, piraErrors } from './routes';
import { PiraService } from './service';
import { Callers, MachineVerifier, machineGate } from './machineAuth';
import { allowedPath } from './boundary';
import { check } from './model';
import { createIpRateLimiter } from '../middleware/rateLimit';

export function createCore(service:PiraService,auth:ExternalAuthConfig,salesOrigin:string,callers:Callers,verify:MachineVerifier){
  check(callers.portal.subject!==callers.sales.subject&&callers.portal.email!==callers.sales.email,'CALLERS_MUST_DIFFER');
  const app=express();app.disable('x-powered-by');app.use(cookieParser());
  // Machine gate precedes parsing and all business/health routes; no anonymous core surface.
  app.use('/external',machineGate('portal',callers,verify));app.use('/internal',machineGate('sales',callers,verify));
  app.use(express.json({limit:'32kb'}));
  app.use(createIpRateLimiter({windowMs:60000,maxRequests:240}));
  const external=express.Router();
  external.use('/auth',externalAuthRouter(auth,service));
  external.use('/api',(q,_s,n)=>{try{check(allowedPath(q.method,q.path),'NOT_FOUND',404);n();}catch(e){n(e);}},externalGate(auth,service),piraApi(service,false,auth));
  app.use('/external',external);
  app.use('/internal/api',(q,s,n)=>{try{
    check(allowedPath(q.method,q.path,true),'NOT_FOUND',404);
    s.locals.piraActor={...internalActor(q.get('x-pira-staff-email')),machine:s.locals.piraMachine,requestId:q.get('x-pira-request-id')};
    n();
  }catch(e){n(e);}},piraApi(service,true,undefined,salesOrigin,true));
  app.use((_q,s)=>{s.status(404).end();});app.use(piraErrors);return app;
}
