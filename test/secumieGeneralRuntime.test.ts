import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createGeneralTurnstileVerifier, createSecumieGeneralRuntime } from '../src/runtime/secumieGeneralRuntime';

test('Turnstile requires success, hostname and action; fails closed', async () => {
  for (const value of [{success:true,hostname:'service.atlib.jp',action:'secumie_web'}, {success:true,hostname:'other.example',action:'secumie_web'}, {success:true,hostname:'service.atlib.jp',action:'contact'}, {success:false}]) {
    const verify = createGeneralTurnstileVerifier('synthetic','service.atlib.jp',async()=>new Response(JSON.stringify(value)));
    assert.equal(await verify('token','192.0.2.1','secumie_web'), value.success===true && 'hostname' in value && value.hostname==='service.atlib.jp' && value.action==='secumie_web');
  }
});
test('public endpoint rejects wrong origin and invalid bot challenge, then returns HTML only', async () => {
  let verified = false, calls = 0;
  const app = createSecumieGeneralRuntime({kind:'WEB',hostname:'service.atlib.jp',enabled:true,verify:async()=>verified,wsc:{diagnose:async()=>{calls++;return {html:'<p>synthetic</p>',report:{},normalizedUrl:'https://example.org/'}}}});
  const server = app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  try {
    const address=server.address(); assert.ok(address && typeof address!=='string');
    const url='http://127.0.0.1:'+address.port+'/secumie-web/api/start';
    const send=(origin:string,host='service.atlib.jp')=>new Promise<{status:number;json:()=>unknown}>((resolve,reject)=>{
      const body=JSON.stringify({companyName:'Synthetic',registeredAddress:'Tokyo',accepted:true,turnstileToken:'test',targetUrl:'https://example.org/'});
      const req=http.request(url,{method:'POST',headers:{Host:host,Origin:origin,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>{
        const chunks:Buffer[]=[];res.on('data',(chunk:Buffer)=>chunks.push(chunk));res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode??0,json:()=>JSON.parse(Buffer.concat(chunks).toString('utf8'))}));
      });req.on('error',reject);req.end(body);
    });
    assert.equal((await send('https://service.atlib.jp','other.example')).status,404);
    assert.equal((await send('https://other.example')).status,403);
    assert.equal((await send('https://service.atlib.jp')).status,403);
    assert.equal(calls,0);
    verified=true;
    const response=await send('https://service.atlib.jp');
    assert.equal(response.status,200); assert.equal(calls,1);
    assert.deepEqual(await response.json(),{ok:true,html:'<p>synthetic</p>',normalizedUrl:'https://example.org/'});
  } finally { await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve())); }
});

for (const kind of ['WEB','INSIGHT'] as const) test(kind+' only exposes indexable canonical static guide, not diagnosis API or staging',async()=>{
  const path=require('node:path') as typeof import('node:path');
  const prefix='/secumie-'+kind.toLowerCase();
  for (const scenario of [{hostname:'service.atlib.jp',enabled:true},{hostname:'service-staging.atlib.jp',enabled:true},{hostname:'service.atlib.jp',enabled:false}]){
    let calls=0;
    const app=createSecumieGeneralRuntime({kind,...scenario,verify:async()=>{calls++;return false;},assets:{pageDir:path.resolve('prototypes/secumie-general'),insightDir:path.resolve('prototypes/pira-union-diagnosis-v2'),siteKey:'synthetic'}});
    const server=app.listen(0,'127.0.0.1'); await new Promise<void>(resolve=>server.once('listening',resolve));
    try{
      const address=server.address();assert.ok(address&&typeof address!=='string');
      const get=(p:string,method='GET')=>new Promise<{status:number;headers:http.IncomingHttpHeaders;body:string}>((resolve,reject)=>{
        const req=http.request({hostname:'127.0.0.1',port:address.port,path:p,method,headers:{Host:scenario.hostname}},res=>{const chunks:Buffer[]=[];res.on('data',c=>chunks.push(c));res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode??0,headers:res.headers,body:Buffer.concat(chunks).toString('utf8')}));});req.on('error',reject);req.end();
      });
      const page=await get(prefix+'/');
      assert.equal(page.status,scenario.enabled?200:404);
      const indexable=scenario.enabled&&scenario.hostname==='service.atlib.jp';
      assert.equal(page.headers['x-robots-tag'],indexable?undefined:'noindex, nofollow');
      assert.equal(page.headers['cache-control'],'no-store');
      if(scenario.enabled){
        assert.match(page.body,/セキュミー/);
        assert.doesNotMatch(page.body,/セクミエ/);
        assert.ok(page.body.includes('rel="canonical" href="https://service.atlib.jp'+prefix+'/"'));
        assert.equal((page.body.match(/<details>/g)||[]).length,6);
        const raw=page.body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
        assert.ok(raw);
        const data=JSON.parse(raw);
        const service=data['@graph'].find((v:{'@type':string})=>v['@type']==='Service');
        assert.equal(service.url,'https://service.atlib.jp'+prefix+'/');
        assert.equal(service.offers.price,0);
        assert.equal(service.alternateName,kind==='WEB'?'セキュミー ウェブ':'セキュミー インサイト');
      }
      const api=await get(prefix+'/api/start');
      assert.equal(api.status,404);assert.equal(api.headers['x-robots-tag'],'noindex, nofollow');
      const rejected=await get(prefix+'/api/consultation','POST');
      assert.equal(rejected.status,scenario.enabled?403:404);assert.equal(rejected.headers['x-robots-tag'],'noindex, nofollow');
      assert.equal(calls,0);
    }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
  }
});
