import express, { type Express, type Request } from 'express';
import { z } from 'zod';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { configurePublicRuntime, publicPageCsp } from './runtimeSecurity';
import { SecumieGeneralLimits, GeneralLimitError } from './secumieGeneralLimits';
import { consultationSchema, type ConsultationHandoff } from '../services/secumieConsultationHandoff';
import type { WscHtmlService } from '../services/wscHtmlService';
import { generalLeadInputSchema, normalizeGeneralTarget, type SecumieGeneralLeadRepo } from '../services/secumieGeneralLeadRepo';

type Kind = 'WEB' | 'INSIGHT';
type Verify = (token: string, ip: string, action: string) => Promise<boolean>;
const startSchema=generalLeadInputSchema.extend({
  turnstileToken:z.string().min(1).max(2048),
  targetUrl:z.string().trim().min(1).max(2000).optional(),
}).strict();
const receiptSchema=z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const completeSchema=z.object({leadReceipt:receiptSchema,answers:consultationSchema.shape.answers}).strict();
type WebResult={normalizedUrl:string;report:unknown};
const storedWeb=z.object({normalizedUrl:z.string().url(),report:z.unknown()}).strict();

export function createGeneralTurnstileVerifier(secret: string, hostname: string, fetchImpl: typeof fetch = fetch): Verify {
  return async (token, ip, action) => {
    if (!secret) return false;
    try {
      const response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST', body: new URLSearchParams({ secret, response: token, remoteip: ip }),
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok) return false;
      const result = await response.json() as { success?: boolean; hostname?: string; action?: string };
      return result.success === true && result.hostname === hostname && result.action === action;
    } catch { return false; }
  };
}
export function createSecumieGeneralRuntime(options: {
  kind: Kind;
  hostname: string;
  enabled: boolean;
  verify: Verify;
  wsc?: Pick<WscHtmlService, 'diagnose' | 'renderStored'>;
  leads?: Pick<SecumieGeneralLeadRepo,'begin'|'complete'|'fail'|'getCompleted'>;
  evaluateInsight?: (answers:NonNullable<z.infer<typeof consultationSchema>['answers']>)=>unknown;
  limits?: SecumieGeneralLimits;
  handoff?: ConsultationHandoff;
  assets?: { pageDir: string; insightDir: string; siteKey: string };
}): Express {
  const app = express();
  configurePublicRuntime(app);
  const limits = options.limits ?? new SecumieGeneralLimits();
  const prefix = options.kind === 'WEB' ? '/secumie-web' : '/secumie-insight';
  // Bounded fallback for a failed WEB completion write; only server-generated data.
  const pendingWeb=new Map<string,{result:WebResult;expires:number}>();
  const activeWeb=new Set<string>();
  const sweep=()=>{for(const [key,value] of pendingWeb)if(value.expires<=Date.now())pendingWeb.delete(key);};
  const issue=(context:Parameters<ConsultationHandoff['issue']>[0])=>{try{return options.handoff?.issue(context);}catch{return undefined;}};
  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    // Only canonical public guides may be indexed. Non-guide routes stay out of search.
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Content-Security-Policy', publicPageCsp);
    if (!options.enabled || req.hostname !== options.hostname) { res.sendStatus(404); return; }
    next();
  });
  app.post(prefix + '/api/start', express.json({ limit: '16kb', strict: true }), async (req: Request, res) => {
    if (req.get('origin') !== 'https://' + options.hostname || !req.is('application/json')) { res.sendStatus(403); return; }
    const parsed=startSchema.safeParse(req.body);
    if(!parsed.success){res.status(422).json({code:'INVALID_REQUEST'});return;}
    if(!options.leads){res.status(503).json({code:'NOT_READY'});return;}
    const {turnstileToken,targetUrl,...data}=parsed.data;
    const ip=req.ip;
    if(!ip){res.status(403).json({code:'CLIENT_IP_UNAVAILABLE'});return;}
    let target:string|undefined;
    try{target=normalizeGeneralTarget(options.kind,targetUrl)??undefined;}catch{res.status(422).json({code:'INVALID_TARGET'});return;}
    if(options.kind==='WEB'&&!options.wsc){res.status(503).json({code:'NOT_READY'});return;}
    let release:(()=>void)|undefined;
    let leadReceipt:string|undefined;
    let ownsWeb=false;
    try{
      if(!(await options.verify(turnstileToken,ip,options.kind==='WEB'?'secumie_web':'secumie_insight'))){res.status(403).json({code:'TURNSTILE_DENIED'});return;}
      release=limits.admit(options.kind,ip,target);
      let lead;
      try{lead=await options.leads.begin(options.kind,data,target);}
      catch(error){
        const code=error instanceof Error?error.message:'';
        if(code==='LEAD_IDEMPOTENCY_CONFLICT'||code==='RECEIPT_EXPIRED'){res.status(409).json({code});return;}
        res.status(503).json({code:'LEAD_SAVE_FAILED'});return;
      }
      leadReceipt=lead.receipt;
      if(options.kind==='INSIGHT'){
        const receipt=issue({kind:'INSIGHT',companyName:data.companyName});
        res.json({ok:true,leadReceipt,...(receipt?{receipt}:{})});return;
      }
      if(activeWeb.has(leadReceipt)){res.status(409).json({code:'DIAGNOSIS_IN_PROGRESS'});return;}
      activeWeb.add(leadReceipt);ownsWeb=true;sweep();
      const pending=pendingWeb.get(leadReceipt);
      let result:WebResult;let html:string;let saved=false;
      if(lead.status==='COMPLETED'){
        const stored=storedWeb.safeParse(await options.leads.getCompleted('WEB',leadReceipt));
        if(!stored.success)throw Error('STORED_REPORT_UNAVAILABLE');
        result={normalizedUrl:stored.data.normalizedUrl,report:stored.data.report};html=await options.wsc!.renderStored({name:data.companyName,url:result.normalizedUrl,report:result.report});saved=true;
      }else if(pending){
        result=pending.result;html=await options.wsc!.renderStored({name:data.companyName,url:result.normalizedUrl,report:result.report});
      }else{
        const diagnosed=await options.wsc!.diagnose({name:data.companyName,url:target!,executor:'general-web'});
        result={normalizedUrl:diagnosed.normalizedUrl,report:diagnosed.report};html=diagnosed.html;
      }
      if(!saved){
        try{saved=await options.leads.complete('WEB',leadReceipt,result);}catch{saved=false;}
        if(saved)pendingWeb.delete(leadReceipt);
        else if(pendingWeb.size<30||pendingWeb.has(leadReceipt)){
          if(Buffer.byteLength(JSON.stringify(result))<=256*1024)pendingWeb.set(leadReceipt,{result,expires:Date.now()+120_000});
        }
      }
      const receipt=issue({kind:'WEB',companyName:data.companyName,targetUrl:result.normalizedUrl,report:result.report});
      res.json({ok:true,leadReceipt,leadSaved:saved,...(receipt?{receipt}:{}),html:html.replace('<div class="review-banner">内部デザインレビュー用｜対外配布不可</div>',''),normalizedUrl:result.normalizedUrl});
    }catch(error){
      if(error instanceof GeneralLimitError){res.status(429).json({code:error.code});return;}
      if(ownsWeb&&leadReceipt)try{await options.leads.fail('WEB',leadReceipt);}catch{/* no PII in logs */}
      res.status(422).json({code:'DIAGNOSIS_UNAVAILABLE'});
    }finally{if(ownsWeb&&leadReceipt)activeWeb.delete(leadReceipt);release?.();}
  });
  app.post(prefix+'/api/complete',express.json({limit:'16kb',strict:true}),async(req,res)=>{
    if(req.get('origin')!=='https://'+options.hostname||!req.is('application/json')){res.sendStatus(403);return;}
    if(!options.leads){res.status(503).json({code:'NOT_READY'});return;}
    const p=completeSchema.safeParse(req.body);
    if(!p.success){res.status(422).json({code:'INVALID_REQUEST'});return;}
    const {leadReceipt,answers}=p.data;
    let result:unknown;
    if(options.kind==='INSIGHT'){
      if(!answers||!options.evaluateInsight||new Set(answers.map(x=>x.questionId)).size!==8){res.status(422).json({code:'INVALID_ANSWERS'});return;}
      try{result=options.evaluateInsight(answers);}catch{res.status(422).json({code:'INVALID_ANSWERS'});return;}
    }else{
      if(answers!==undefined){res.status(422).json({code:'INVALID_REQUEST'});return;}
      sweep();result=pendingWeb.get(leadReceipt)?.result;
      if(!result){
        try{if(await options.leads.getCompleted('WEB',leadReceipt)){res.json({ok:true});return;}}catch{res.status(503).json({code:'LEAD_SAVE_FAILED'});return;}
        res.status(410).json({code:'RETRY_UNAVAILABLE'});return;
      }
    }
    try{
      if(!await options.leads.complete(options.kind,leadReceipt,result)){res.status(409).json({code:'COMPLETION_CONFLICT_OR_EXPIRED'});return;}
      if(options.kind==='WEB')pendingWeb.delete(leadReceipt);
      res.json({ok:true});
    }catch{res.status(503).json({code:'LEAD_SAVE_FAILED'});}
  });
  app.post(prefix + '/api/consultation', express.json({limit:'16kb',strict:true}), async (req,res) => {
    if (req.get('origin') !== 'https://' + options.hostname || !req.is('application/json')) { res.sendStatus(403); return; }
    if (!options.handoff) { res.status(503).json({code:'NOT_READY'}); return; }
    const parsed = consultationSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({code:'INVALID_REQUEST'}); return; }
    try { const scheduleUrl = await options.handoff.submit(parsed.data); res.json({ok:true,scheduleUrl}); }
    catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'RECEIPT_EXPIRED') { res.status(410).json({code}); return; }
      if (code === 'ALREADY_SUBMITTED') { res.status(409).json({code}); return; }
      if (code === 'INVALID_ANSWERS') { res.status(422).json({code}); return; }
      res.status(503).json({code:'NOTIFICATION_FAILED'});
    }
  });
  if (options.assets) {
    const assets = options.assets;
    app.get(prefix + '/', (_req, res) => {
      if (!/^[A-Za-z0-9_-]+$/.test(assets.siteKey)) { res.sendStatus(503); return; }
      const html = readFileSync(path.join(assets.pageDir, options.kind === 'WEB' ? 'web.html' : 'insight.html'), 'utf8');
      if (options.hostname === 'service.atlib.jp' && _req.path === prefix + '/') res.removeHeader('X-Robots-Tag');
      res.type('html').send(html.replaceAll('__GENERAL_SITE_KEY__', assets.siteKey));
    });
    for (const file of ['general.css','general.js', options.kind === 'WEB' ? 'secumie-web.png' : 'secumie-insight.png']) app.get(prefix + '/' + file, (_req,res)=>res.sendFile(path.resolve(assets.pageDir,file)));
    if (options.kind === 'INSIGHT') {
      const allowed = ['data.js','diagnosis.js','resources.js','phase3-content.js','phase3-report.js','v6-content.js','v6.js','v6-demos.js','v7-fixed-content.js','v7-prototype.js','v7-prototype-app.js','v7-prototype.css','v7-tail-pages.css','pira-e2.css'];
      for (const file of allowed) app.get(prefix + '/engine/' + file, (_req,res)=>res.sendFile(path.resolve(assets.insightDir,file)));
      for (const dir of ['assets','materials']) {
        app.use(prefix + '/' + dir, express.static(path.resolve(assets.insightDir,dir),{index:false,dotfiles:'deny'}));
        app.use(prefix + '/engine/' + dir, express.static(path.resolve(assets.insightDir,dir),{index:false,dotfiles:'deny'}));
      }
    }
  }
  app.use((_req, res) => res.sendStatus(404));
  return app;
}
