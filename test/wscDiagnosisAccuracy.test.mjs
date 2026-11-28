import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import {EventEmitter} from 'node:events';
import {fileURLToPath} from 'node:url';
import {evaluate,render} from '../src/wsc/vendor/tools/wsc-vs1/engine.mjs';
import {createRestrictedNetworkProbe} from '../src/wsc/vendor/tools/wsc-phase2c/restricted-network-probe.mjs';

const opts={rulesPath:fileURLToPath(new URL('../src/wsc/vendor/tools/wsc-vs1/rules.json',import.meta.url)),explanationsPath:fileURLToPath(new URL('../src/wsc/vendor/tools/wsc-vs1/explanations.json',import.meta.url))};
const url='https://example.org/', checkedAt='2026-11-29T00:00:00Z';
const evaluateInput=extra=>evaluate({targetUrl:url,checkedAt,mailDomain:'example.org',...extra},opts);
const ids=report=>report.findings.map(x=>x.id);
const web=(headers,statusCode=200)=>evaluateInput({http:{status:'OK',statusCode,headers}});
const headerDefaults={'Strict-Transport-Security':'max-age=31536000','Content-Security-Policy':"default-src 'self'; frame-ancestors 'none'",'X-Frame-Options':'DENY','X-Content-Type-Options':'nosniff'};

test('TLS expiry derives from evidence time, not current wall clock or inconsistent supplied days',()=>{
  for(const [days,expected] of [[0,true],[1,true],[30,true],[31,false]]){
    const notAfter=new Date(Date.parse(checkedAt)+days*86400000).toISOString();
    const report=evaluateInput({tls:{status:'VALIDATED',policyErrors:'None',negotiatedProtocol:'TLSv1.3',notAfter,daysRemaining:99}});
    assert.equal(ids(report).includes('TLS_EXPIRING'),expected);
    if(expected)assert.equal(report.findings.find(f=>f.id==='TLS_EXPIRING').details[0].raw,days);
  }
});
test('HSTS grammar and explicit absence',()=>{
  for(const [value,id] of [['max-age=31536000','HSTS_ENABLED'],['MAX-AGE="31536000"; includeSubDomains','HSTS_ENABLED'],['max-age=0','HSTS_DISABLED'],[null,'HSTS_DISABLED'],['max-age=123abc','HSTS_INVALID'],['max-age=100; max-age=0','HSTS_INVALID'],['max-age=10; includeSubDomains=1','HSTS_INVALID'],['max-age=-1','HSTS_INVALID'],['','HSTS_INVALID'],['max-age=10; x="a;b"','HSTS_ENABLED']]){
    const report=web({...headerDefaults,'Strict-Transport-Security':value});
    assert.deepEqual(ids(report).filter(v=>v.startsWith('HSTS')),[id],String(value));
  }
});
test('unknown header fields never masquerade as explicit absence; non-page responses never yield header findings',()=>{
  for(const headers of [{},{'Strict-Transport-Security':1,'Content-Security-Policy':{},'X-Frame-Options':false}]){
    const report=web(headers);
    assert.equal(report.findings.length,0);
    assert.ok(report.internalOnly.some(x=>x.startsWith('HSTS:')));
  }
  for(const code of [204,205,301,302,304,403,404,429,500,503])assert.equal(web(headerDefaults,code).findings.length,0,String(code));
  assert.ok(ids(web(headerDefaults)).includes('NOSNIFF_ENABLED'));
});
test('CSP enforcement and frame protection are distinct; report-only does not count as enforcing',()=>{
  for(const [csp,xfo,expected] of [
    ["default-src 'self'",null,true],["default-src 'self'",'DENY',false],
    ["frame-ancestors 'none'",null,false],["frame-ancestors 'self'",null,false],
    ["frame-ancestors *",'DENY',true],[null,'ALLOW-FROM https://example.org',true],
    ["frame-ancestors https://partner.example",null,false],
    ["frame-ancestors *; frame-ancestors 'none'",null,true]
  ])assert.equal(ids(web({...headerDefaults,'Content-Security-Policy':csp,'X-Frame-Options':xfo})).includes('FRAME_HEADER_ABSENT'),expected,String(csp)+' / '+xfo);
  const monitor=web({...headerDefaults,'Content-Security-Policy':null,'Content-Security-Policy-Report-Only':"frame-ancestors 'none'",'X-Frame-Options':null});
  assert.ok(ids(monitor).includes('CSP_HEADER_ABSENT'));
  assert.ok(ids(monitor).includes('FRAME_HEADER_ABSENT'));
  assert.match(monitor.findings.find(f=>f.id==='CSP_HEADER_ABSENT').observation,/監視用/);
  for(const csp of ['','nonsense','report-uri /report'])assert.ok(ids(web({...headerDefaults,'Content-Security-Policy':csp})).includes('CSP_HEADER_INVALID'));
  assert.ok(ids(web({...headerDefaults,'Content-Security-Policy':"default-src"})).includes('CSP_HEADER_PRESENT'),'empty source list is a valid restrictive policy');
});
test('SPF permissive all and obvious malformed settings are review findings, not presence confirmation',()=>{
  for(const [record,id] of [['v=spf1 +all','SPF_ALLOW_ALL'],['v=spf1 all','SPF_ALLOW_ALL'],['v=spf1 a mx +all','SPF_ALLOW_ALL'],['v=spf1 -all +all','SPF_PRESENT'],['v=spf1 include:_spf.google.com ~all','SPF_PRESENT'],['v=spf1 badmechanism -all','SPF_INVALID'],['v=spf1 include: -all','SPF_INVALID']]){
    const report=evaluateInput({dns:{spf:{lookupStatus:'FOUND',recordCount:1,records:[record]}}});
    assert.deepEqual(ids(report),[id],record);
    if(id!=='SPF_PRESENT')assert.equal(report.findings[0].status,'追加確認推奨');
  }
});
test('live adapter records certificate expiry, real HTTP status and first HSTS field without changing target',async t=>{
  const certExpiry=new Date(Date.now()+5*86400000).toUTCString();
  const request=t.mock.method(https,'request',(options,callback)=>{
    assert.equal(options.host,'93.184.216.34');assert.equal(options.servername,'example.org');assert.equal(options.rejectUnauthorized,true);
    const req=new EventEmitter();req.destroy=e=>{if(e)req.emit('error',e)};
    req.end=()=>queueMicrotask(()=>{
      const sock=new EventEmitter();Object.assign(sock,{remoteAddress:'93.184.216.34',authorized:true,getProtocol:()=> 'TLSv1.3',getPeerCertificate:()=>({valid_to:certExpiry})});
      req.emit('socket',sock);sock.emit('connect');sock.emit('secureConnect');
      const res=new EventEmitter();Object.assign(res,{statusCode:200,headers:{'strict-transport-security':'max-age=0, max-age=123'},rawHeaders:['Strict-Transport-Security','max-age=0','Strict-Transport-Security','max-age=123']});
      callback(res);res.emit('end');
    });return req;
  });
  const probe=createRestrictedNetworkProbe({approvalStore:{consume:()=>({targetUrl:url,expiresAt:Date.now()+60000})},lookup:async()=>[{address:'93.184.216.34'}],resolveTxt:async()=>[]});
  const result=await probe({url,mailDomain:'example.org'});
  assert.equal(request.mock.callCount(),1);assert.equal(result.diagnosis.http.status,'OK');
  assert.equal(result.diagnosis.http.headers['Strict-Transport-Security'],'max-age=0');
  assert.ok(result.diagnosis.tls.daysRemaining>=4&&result.diagnosis.tls.daysRemaining<=5);
  const report=evaluate(result.diagnosis,opts);
  assert.ok(ids(report).includes('TLS_EXPIRING'));assert.ok(ids(report).includes('HSTS_DISABLED'));
});
test('certificate error is partial evidence only on pinned socket; transport/security errors still fail closed',async t=>{
  let code='CERT_HAS_EXPIRED', address='93.184.216.34';
  const request=t.mock.method(https,'request',(options)=>{
    assert.equal(options.rejectUnauthorized,true);
    const req=new EventEmitter();req.destroy=e=>{if(e)req.emit('error',e)};
    req.end=()=>queueMicrotask(()=>{
      const sock=new EventEmitter();sock.remoteAddress=address;
      req.emit('socket',sock);sock.emit('connect');
      req.emit('error',Object.assign(new Error(code),{code}));
    });return req;
  });
  const probe=createRestrictedNetworkProbe({approvalStore:{consume:()=>({targetUrl:url,expiresAt:Date.now()+60000})},lookup:async()=>[{address:'93.184.216.34'}],resolveTxt:async()=>[]});
  for(const c of ['CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID','DEPTH_ZERO_SELF_SIGNED_CERT']){
    code=c;const result=await probe({url,mailDomain:'example.org'});
    assert.equal(result.diagnosis.http.status,'UNVERIFIED');
    assert.equal(result.diagnosis.tls.policyErrors,c);
    const report=evaluate(result.diagnosis,opts);
    assert.ok(ids(report).includes('TLS_INVALID'));assert.ok(!ids(report).includes('TLS_VALID'));assert.ok(!ids(report).some(x=>x.startsWith('HSTS')||x.startsWith('CSP')));
    assert.match(render(report,{name:'Synthetic',url}),/証明書の検証に問題が報告されました/);
  }
  code='ETIMEDOUT';await assert.rejects(probe({url}),/ETIMEDOUT/);
  code='CERT_HAS_EXPIRED';address='127.0.0.1';await assert.rejects(probe({url}),/CONNECTION_IP_MISMATCH/);
  assert.equal(request.mock.callCount(),5);
});
