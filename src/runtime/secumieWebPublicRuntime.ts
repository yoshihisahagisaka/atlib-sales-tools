import path from 'node:path';
import express, { type Express } from 'express';
import type { Pool } from 'pg';
import { AssemblyIntakeService } from '../secumieWeb/assemblyIntakeService';
import { HttpJwksProvider, PiraJwtVerifier } from '../piraIntake/piraJwtVerifier';
import { createAssemblyIntakeRouter } from '../routes/secumieWebAssemblyIntake';
import { configurePublicRuntime, publicPageCsp } from './runtimeSecurity';

export type SecumieWebPublicRuntimeOptions = { pool:Pool; issuer:string; jwksUrl:string; host:string; origin:string; turnstileSiteKey:string; consentVersion:string; receptionCode:string; organizerName:string; publicAuthScriptPath:string; assetDir:string };
export function createSecumieWebPublicRuntime(options: SecumieWebPublicRuntimeOptions): Express {
  const app=express(); configurePublicRuntime(app); app.use(express.json({limit:'32kb',strict:true}));
  app.use((_req,res,next)=>{res.setHeader('Content-Security-Policy',publicPageCsp);res.setHeader('Cache-Control','no-store');next();});
  const verifier=new PiraJwtVerifier(new HttpJwksProvider(options.jwksUrl),options.issuer);
  const intake=new AssemblyIntakeService(options.pool,{code:options.receptionCode,organizerName:options.organizerName,consentVersion:options.consentVersion});
  app.get('/healthz',(_req,res)=>res.json({status:'ok',service:'secumie-web'}));
  app.get('/api/public/secumie-web/v1/unions',async(_req,res)=>{try{const r=await options.pool.query('SELECT union_id AS "unionId",official_name AS "officialName" FROM secumie_web.assembly_union_master WHERE active=true ORDER BY official_name');res.json({items:r.rows});}catch{res.status(503).json({error:{code:'SERVICE_UNAVAILABLE'}});}});
  app.use('/api/public/secumie-web/v1',createAssemblyIntakeRouter(intake,verifier,'secumie-web-assembly'));
  app.get('/',(_req,res)=>res.sendFile(path.join(options.assetDir,'intake.html')));
  app.get('/public-service-auth.js',(_req,res)=>res.sendFile(options.publicAuthScriptPath));
  app.use(express.static(options.assetDir,{index:false,fallthrough:true})); app.use((_req,res)=>res.sendStatus(404)); return app;
}
