import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {evaluate,render} from '../src/wsc/vendor/tools/wsc-vs1/engine.mjs';

const root=fileURLToPath(new URL('../src/wsc/vendor/tools/wsc-vs1/',import.meta.url));
const opts={rulesPath:path.join(root,'rules.json'),explanationsPath:path.join(root,'explanations.json')};
const rules=JSON.parse(fs.readFileSync(opts.rulesPath));
const content=JSON.parse(fs.readFileSync(opts.explanationsPath));
const url='https://www.example.org/',checkedAt='2026-11-28T16:57:00.842Z';
const company={name:'検証株式会社',url};
const base={targetUrl:url,checkedAt,mailDomain:'www.example.org'};
const headers={'Strict-Transport-Security':'max-age=31536000','Content-Security-Policy':"default-src 'self'; frame-ancestors 'none'",'X-Frame-Options':'DENY','X-Content-Type-Options':'nosniff'};
const web=(h={})=>({http:{status:'OK',statusCode:200,headers:{...headers,...h}}});
const tls=(days)=>({tls:{status:'VALIDATED',policyErrors:'None',negotiatedProtocol:'TLSv1.3',notAfter:new Date(Date.parse(checkedAt)+days*86400000).toISOString()}});
const spf=(records,owner='example.org')=>({dns:{spf:{lookupStatus:'FOUND',records,recordCount:records.length,checkedDomain:owner}}});
const dmarc=(p,t,tag='p')=>({dns:{dmarc:{lookupStatus:'FOUND',recordCount:1,records:['v=DMARC1; p='+p+(t===undefined?'':'; t='+t)],tags:{p,...(t===undefined?{}:{t})},checkedDomain:'www.example.org',policyDomain:'example.org',policyTag:tag,effectivePolicy:p}}});
const absent={dns:{dmarc:{lookupStatus:'NO_RECORD',checkedDomain:'www.example.org',queriedDomains:['www.example.org','example.org','org']}}};
const scenarios=[
 ['TLS_VALID',tls(60)],['TLS_EXPIRING',tls(5)],['TLS_INVALID',{tls:{status:'VALIDATION_FAILED',policyErrors:'CERT_HAS_EXPIRED'}}],
 ['HSTS_ENABLED',web()],['HSTS_DISABLED',web({'Strict-Transport-Security':null})],['HSTS_DISABLED',web({'Strict-Transport-Security':'max-age=0'})],['HSTS_INVALID',web({'Strict-Transport-Security':'max-age=abc'})],
 ['CSP_HEADER_PRESENT',web()],['CSP_HEADER_ABSENT',web({'Content-Security-Policy':null})],['CSP_HEADER_ABSENT',web({'Content-Security-Policy':null,'Content-Security-Policy-Report-Only':"default-src 'self'"})],['CSP_HEADER_INVALID',web({'Content-Security-Policy':'bad'})],
 ['FRAME_HEADER_ABSENT',web({'Content-Security-Policy':"default-src 'self'",'X-Frame-Options':null})],['NOSNIFF_ENABLED',web()],
 ['SPF_PRESENT',spf(['v=spf1 -all'])],['SPF_PRESENT',spf(['v=spf1 -all'],'www.example.org')],['SPF_MULTIPLE',spf(['v=spf1 -all','v=spf1 ~all'])],['SPF_ALLOW_ALL',spf(['v=spf1 +all'])],['SPF_INVALID',spf(['v=spf1 badmechanism -all'])],
 ['DMARC_NONE',dmarc('none')],['DMARC_NONE',dmarc('none','y')],['DMARC_ENFORCING',dmarc('reject')],['DMARC_ENFORCING',dmarc('quarantine','n','sp')],['DMARC_TEST',dmarc('reject','y')],['DMARC_TEST',dmarc('quarantine','y','sp')],['DMARC_ABSENT',absent]
];
const report=input=>evaluate({...base,...input},opts);
const generate=r=>render(r,company,{technicalHeadings:true});
const escape=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

test('all current rule IDs have customer definitions and actual evaluator-to-render coverage',()=>{
  assert.deepEqual([...new Set(scenarios.map(x=>x[0]))].sort(),rules.findings.map(x=>x.id).sort());
  assert.deepEqual(Object.keys(content.entries).sort(),rules.findings.map(x=>x.id).sort());
  const output=process.env.WSC_PRESENTATION_OUTPUT;
  if(output)fs.mkdirSync(output,{recursive:true});
  for(const [i,[id,input]] of scenarios.entries()){
    const r=report(input),f=r.findings.find(f=>f.id===id);
    assert.ok(f,id);assert.equal(f.status,rules.findings.find(x=>x.id===id).status);
    const p=f.presentation,h=generate(r);
    assert.ok(p.summary&&p.result&&p.protection.length&&p.impact.length,id);
    for(const s of [p.summary,p.result,...p.protection,...p.impact,...(p.action?[p.action]:[])])assert.ok(h.includes(escape(s)),id+': '+s);
    assert.equal(Boolean(p.action),f.status==='追加確認推奨');
    for(const fact of p.facts)assert.ok(h.includes(escape(fact.label+'：'+fact.value)));
    assert.match(h,/2026年11月29日 01:57/);
    assert.doesNotMatch(h,/（日本時間）|2026-11-28T16:57:00\.842Z|原値：|data-finding-id|ルール版：/);
    assert.equal(generate(structuredClone(r)),h,'deterministic snapshot');
    if(output)fs.writeFileSync(path.join(output,String(i+1).padStart(2,'0')+'-'+id+'.html'),h);
  }
});
test('generate combined reports for print review, including actual atLIB-like finding mix',()=>{
  const output=process.env.WSC_PRESENTATION_OUTPUT;
  if(!output)return;
  const email=(s,d)=>({dns:{...s.dns,...d.dns}});
  const inputs=[
    ['26-combined-atlib-like', {...tls(60),...web(),...email(spf(['v=spf1 include:_spf.google.com ~all']),dmarc('none'))}],
    ['27-combined-review-heavy', {...tls(5),...web({'Strict-Transport-Security':'max-age=bad','Content-Security-Policy':'bad','X-Frame-Options':null}),...email(spf(['v=spf1 +all']),dmarc('reject','y'))}],
    ['28-no-confirmed-results',{http:{status:'UNVERIFIED'},dns:{spf:{lookupStatus:'UNVERIFIED'},dmarc:{lookupStatus:'UNVERIFIED'}}}],
    ['29-combined-protected',{...tls(60),...web(),...email(spf(['v=spf1 -all']),dmarc('reject'))}]
  ];
  for(const [name,input] of inputs)fs.writeFileSync(path.join(output,name+'.html'),generate(report(input)));
});
test('variant evidence and test mode are factual, with no normal enforcement confirmation for t=y',()=>{
  for(const p of ['reject','quarantine']){
    const f=report(dmarc(p,'y')).findings[0];
    assert.equal(f.id,'DMARC_TEST');
    assert.ok(f.presentation.facts.some(x=>x.value===(p==='reject'?'quarantine':'none')));
    assert.match(f.presentation.result,/テストモード/);
  }
  assert.equal(report(dmarc('none','y')).findings[0].id,'DMARC_NONE');
  assert.equal(report(dmarc('reject','bad')).findings.length,0);
  assert.match(report(web({'Strict-Transport-Security':'max-age=0'})).findings.find(f=>f.id==='HSTS_DISABLED').presentation.result,/有効期間が0/);
  for(const owner of ['www.example.org','example.org'])assert.ok(report(spf(['v=spf1 -all'],owner)).findings[0].presentation.facts.some(x=>x.value===owner));
  const r=report({dns:{spf:{lookupStatus:'UNVERIFIED'},dmarc:{lookupStatus:'UNVERIFIED'}},http:{status:'UNVERIFIED'}});
  assert.equal(r.findings.length,0);assert.doesNotMatch(generate(r),/設定確認済み<\/span>/);
  const injection=report(spf(['v=spf1 -all'],'<script>unsafe</script>'));
  assert.doesNotMatch(generate(injection),/<script>unsafe/);
});
test('old stored report remains byte-identical to old renderer; new snapshots do not re-read copy',async()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wsc-legacy-'));
  try{
    const old='340076c356121ac58d9c6ca13ed4581b28734961';
    for(const file of ['engine.mjs','rules.json','explanations.json'])fs.writeFileSync(path.join(tmp,file),execFileSync('git',['show',old+':src/wsc/vendor/tools/wsc-vs1/'+file]));
    fs.symlinkSync(path.join(root,'assets'),path.join(tmp,'assets'),'dir');
    const legacy=await import(pathToFileURL(path.join(tmp,'engine.mjs')).href);
    const original=legacy.evaluate({...base,...web(),...spf(['v=spf1 -all'])},{rulesPath:path.join(tmp,'rules.json'),explanationsPath:path.join(tmp,'explanations.json')});
    for(const technicalHeadings of [true,false])assert.equal(render(original,company,{technicalHeadings}),legacy.render(original,company,{technicalHeadings}));
    const r=report(spf(['v=spf1 -all']));
    r.findings[0].presentation.summary='保存済み概要';r.findings[0].presentation.result='保存済み結果';
    assert.match(generate(r),/保存済み概要/);assert.match(generate(r),/保存済み結果/);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
