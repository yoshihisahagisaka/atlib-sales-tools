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
