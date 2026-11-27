import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { isPublicAddress, validatePublicTarget } from '../src/wsc/vendor/tools/wsc-phase2a/safe-executor.mjs';
import { createRestrictedNetworkProbe } from '../src/wsc/vendor/tools/wsc-phase2c/restricted-network-probe.mjs';

test('public target guard rejects private, transition and special IPv6 ranges in alternate spellings', () => {
  for (const ip of ['127.0.0.1','169.254.169.254','10.1.2.3','::1','0:0:0:0:0:ffff:7f00:1','fe90::1','fec0::1','fc00::1','64:ff9b::a00:1','2002:7f00:1::1','2001::1','2001:0db8::1','3fff::1','ff02::1','2606:4700::1%eth0']) assert.equal(isPublicAddress(ip),false,ip);
  for (const ip of ['93.184.216.34','2606:4700:4700::1111']) assert.equal(isPublicAddress(ip),true,ip);
  assert.throws(()=>validatePublicTarget('https://[2606:4700:4700::1111]/',()=>['2606:4700:4700::1111']),/URL_HOST_NOT_PUBLIC/);
});

test('real request construction uses numeric socket host, original SNI and Host; no third resolver or redirect', async t => {
  const url='https://example.org/';
  let calls=0;
  const request=t.mock.method(https,'request',(options,callback)=>{
    assert.equal(options.host,'93.184.216.34');
    assert.equal(options.servername,'example.org');
    assert.equal(options.headers.Host,'example.org');
    assert.equal(options.agent,false);
    assert.equal(options.rejectUnauthorized,true);
    const req=new EventEmitter();
    req.destroy=e=>req.emit('error',e);
    req.end=()=>queueMicrotask(()=>{
      const socket=new EventEmitter();
      Object.assign(socket,{remoteAddress:'93.184.216.34',authorized:true,authorizationError:null,getProtocol:()=> 'TLSv1.3',getPeerCertificate:()=>({})});
      req.emit('socket',socket);
      socket.emit('secureConnect');
      const res=new EventEmitter();
      Object.assign(res,{statusCode:302,headers:{location:'https://other.example/'}});
      callback(res);
      res.emit('end');
    });
    return req;
  });
  const probe=createRestrictedNetworkProbe({approvalStore:{consume:()=>({targetUrl:url,expiresAt:Date.now()+60000})},lookup:async()=>{calls++;return [{address:'93.184.216.34'}]},resolveTxt:async()=>[]});
  const result=await probe({url});
  assert.equal(calls,2);
  assert.equal(request.mock.callCount(),1);
  assert.equal(result.diagnosis.http.redirectNotFollowed,true);
  assert.equal(result.remoteAddress,'93.184.216.34');
});

test('rejects DNS changes and mixed public/private answers before opening HTTPS', async t=>{
  const url='https://example.org/';
  const request=t.mock.method(https,'request',()=>{throw Error('UNEXPECTED_NETWORK')});
  for(const answers of [[['93.184.216.34'],['93.184.216.35']],[['93.184.216.34','127.0.0.1'],['93.184.216.34','127.0.0.1']]]){
    let calls=0;
    const probe=createRestrictedNetworkProbe({approvalStore:{consume:()=>({targetUrl:url,expiresAt:Date.now()+60000})},lookup:async()=>answers[calls++].map(address=>({address}))});
    await assert.rejects(probe({url}),/DNS_REBIND_DETECTED|DNS_NOT_PUBLIC/);
  }
  assert.equal(request.mock.callCount(),0);
});
