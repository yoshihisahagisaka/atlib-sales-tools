import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { collectMailDns } from '../src/wsc/vendor/tools/wsc-phase2c/restricted-network-probe.mjs';
import { evaluate, render } from '../src/wsc/vendor/tools/wsc-vs1/engine.mjs';

const options = { rulesPath: fileURLToPath(new URL('../src/wsc/vendor/tools/wsc-vs1/rules.json',import.meta.url)), explanationsPath: fileURLToPath(new URL('../src/wsc/vendor/tools/wsc-vs1/explanations.json',import.meta.url)) };
const reportFor = (host, dns) => evaluate({ targetUrl: 'https://' + host + '/', mailDomain: host, checkedAt: '2026-11-28T15:30:32.609Z', dns }, options);
const resolver = (entries, calls = []) => async name => {
  calls.push(name);
  if (!Object.hasOwn(entries,name)) throw Object.assign(new Error('NXDOMAIN'),{code:'ENOTFOUND'});
  if (entries[name] instanceof Error) throw entries[name];
  return entries[name];
};
const dmarc = (policy) => [['v=DMARC1; ' + policy]];
const atlib = {
  'atlib.jp': [['MS=ms95630035'],['v=spf1 include:_spf.google.com include:spf.bmv.jp ~all']],
  '_dmarc.atlib.jp': dmarc('p=none'),
};
test('reproduces www.atlib.jp NXDOMAIN and apex TXT: same policy as apex, scoped SPF, no false absence', async () => {
  for (const host of ['www.atlib.jp','atlib.jp','service.atlib.jp']) {
    const dns = await collectMailDns(host,resolver(atlib),{domainExists:true});
    assert.equal(dns.dmarc.lookupStatus,'FOUND');
    assert.equal(dns.dmarc.policyDomain,'atlib.jp');
    assert.equal(dns.dmarc.effectivePolicy,'none');
    assert.equal(dns.spf.lookupStatus,'FOUND');
    assert.equal(dns.spf.checkedDomain,'atlib.jp');
    const report = reportFor(host,dns);
    assert.deepEqual(report.findings.map(f=>f.id),['SPF_PRESENT','DMARC_NONE']);
    assert.equal(report.ruleVersion,'WSC-R-1.0.1-draft');
    assert.equal(report.contentVersion,'WSC-C-1.0.1-draft');
    const finding = report.findings.find(f=>f.id==='DMARC_NONE');
    assert.ok(finding.details.some(d=>d.label==='レコード取得ドメイン' && d.raw==='atlib.jp'));
    if(host !== 'atlib.jp') {
      const html=render(report,{name:'atLIB synthetic',url:'https://'+host+'/'});
      assert.match(html,/確認したドメインは atlib\.jp です/);
      assert.match(html,/上位ドメイン（atlib\.jp）に公開された対応方針/);
      assert.match(html,/偽メールの隔離・拒否を求める設定にはなっていません/);
      assert.doesNotMatch(html,/DMARC_ABSENT|原値：/);
    }
  }
});
test('direct subdomain record wins; inherited sp overrides p; SPF never inherits', async () => {
  const host='mail.example.co.jp';
  const entries={'_dmarc.example.co.jp':dmarc('p=reject; sp=none'),'example.co.jp':[['v=spf1 -all']]};
  const inherited=await collectMailDns(host,resolver(entries),{domainExists:true});
  assert.equal(inherited.dmarc.tags.p,'reject');
  assert.equal(inherited.dmarc.policyTag,'sp');
  assert.equal(inherited.dmarc.effectivePolicy,'none');
  assert.equal(reportFor(host,inherited).findings.find(f=>f.id.startsWith('DMARC')).id,'DMARC_NONE');
  assert.equal(inherited.spf.checkedDomain,'example.co.jp');
  const override=await collectMailDns(host,resolver({...entries,['_dmarc.'+host]:dmarc('p=reject; sp=none'),[host]:[['v=spf1 +all']]}),{domainExists:true});
  assert.equal(override.dmarc.policyDomain,host);
  assert.equal(override.dmarc.policyTag,'p');
  assert.equal(override.dmarc.effectivePolicy,'reject');
  assert.equal(override.spf.checkedDomain,host);
  assert.deepEqual(override.dmarc.queriedDomains,[host]);
  const noDmarc=await collectMailDns(host,resolver({'example.co.jp':[['v=spf1 -all']]}),{domainExists:true});
  assert.equal(noDmarc.spf.lookupStatus,'NO_RECORD','do not guess SPF owner without evidence');
});
test('bounded tree walk chooses shortest discovered organization record, honors psd boundaries', async () => {
  const host='a.mail.example.co.jp';
  const entries={'_dmarc.mail.example.co.jp':dmarc('p=reject'),'_dmarc.example.co.jp':dmarc('p=none')};
  const result=await collectMailDns(host,resolver(entries),{domainExists:true});
  assert.equal(result.dmarc.policyDomain,'example.co.jp');
  assert.equal(result.dmarc.effectivePolicy,'none');
  const local=await collectMailDns(host,resolver({...entries,'_dmarc.mail.example.co.jp':dmarc('p=reject; psd=n')}),{domainExists:true});
  assert.equal(local.dmarc.policyDomain,'mail.example.co.jp');
  const psd=await collectMailDns(host,resolver({...entries,'_dmarc.co.jp':dmarc('p=reject; psd=y')}),{domainExists:true});
  assert.equal(psd.dmarc.policyDomain,'example.co.jp');
  const psdOnly=await collectMailDns(host,resolver({'_dmarc.co.jp':dmarc('p=reject; psd=y'),'co.jp':[['v=spf1 -all']]}),{domainExists:true});
  assert.equal(psdOnly.dmarc.policySource,'PSD');
  assert.equal(psdOnly.spf.lookupStatus,'NO_RECORD','PSD SPF is not company SPF');
  const long='a.b.c.d.e.f.g.h.i.example.com';
  const bounded=await collectMailDns(long,resolver({}),{domainExists:true});
  assert.equal(bounded.dmarc.queriedDomains.length,8);
  assert.equal(bounded.dmarc.lookupStatus,'NO_RECORD');
});
test('np is used only with known nonexistence; malformed, multiple, timeout never become absence or success', async () => {
  const host='www.example.org';
  const records={'_dmarc.example.org':dmarc('p=reject; sp=none; np=quarantine')};
  assert.equal((await collectMailDns(host,resolver(records),{domainExists:true})).dmarc.effectivePolicy,'none');
  assert.equal((await collectMailDns(host,resolver(records),{domainExists:false})).dmarc.effectivePolicy,'quarantine');
  assert.equal((await collectMailDns(host,resolver(records))).dmarc.lookupStatus,'UNVERIFIED');
  for(const entries of [
    {'_dmarc.example.org':dmarc('p=reject; p=none')},
    {'_dmarc.example.org':dmarc('p=invalid')},
    {'_dmarc.example.org':[['v=DMARC1; p=reject'],['v=DMARC1; p=none']]},
    {'_dmarc.example.org':Object.assign(new Error('timeout'),{code:'ETIMEOUT'})},
    {'_dmarc.example.org':dmarc('p=reject'),'_dmarc.org':Object.assign(new Error('SERVFAIL'),{code:'ESERVFAIL'})}
  ]) {
    const dns=await collectMailDns(host,resolver(entries),{domainExists:true});
    assert.equal(dns.dmarc.lookupStatus,'UNVERIFIED');
    const report=reportFor(host,dns);
    assert.equal(report.findings.some(f=>f.id.startsWith('DMARC')),false);
    assert.ok(report.internalOnly.some(x=>x.startsWith('DMARC:')));
  }
  const missing=await collectMailDns(host,resolver({}),{domainExists:true});
  assert.equal(reportFor(host,missing).findings[0].id,'DMARC_ABSENT');
  const timed=await collectMailDns(host,async()=>new Promise(()=>{}),{domainExists:true,timeoutMs:10});
  assert.equal(timed.dmarc.lookupStatus,'UNVERIFIED');
  assert.equal(timed.dmarc.error,'DNS_ACQUISITION_TIMEOUT');
});
