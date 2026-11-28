import test from 'node:test';
import assert from 'node:assert/strict';
import { SecumieGeneralLimits, GENERAL_WINDOW_MS } from '../src/runtime/secumieGeneralLimits';

test('WEB admits 5 starts per IP and resets at window boundary', () => {
  let now = 0; const g = new SecumieGeneralLimits(() => now);
  for (let i=0;i<5;i++) g.admit('WEB','ip',`https://site${i}.example/`)();
  assert.throws(() => g.admit('WEB','ip','https://other.example/'), /IP_LIMIT/);
  now += GENERAL_WINDOW_MS;
  g.admit('WEB','ip','https://other.example/')();
});
test('WEB limits same hostname across IP, path, case, www and trailing dot', () => {
  const g = new SecumieGeneralLimits();
  ['https://Example.org/a','https://www.example.org/b','https://example.org./c'].forEach((url,i)=>g.admit('WEB',String(i),url)());
  assert.throws(()=>g.admit('WEB','fourth','https://example.org/'),/DOMAIN_LIMIT/);
});
test('WEB admits only 3 simultaneous starts; release is idempotent', () => {
  const g = new SecumieGeneralLimits();
  const slots = [0,1,2].map(i=>g.admit('WEB',String(i),`https://a${i}.example/`));
  assert.throws(()=>g.admit('WEB','4','https://b.example/'),/BUSY/);
  slots[0]!(); slots[0]!();
  g.admit('WEB','4','https://b.example/')();
  slots.slice(1).forEach(release=>release());
});
test('Insight has independent 20-start IP window', () => {
  const g = new SecumieGeneralLimits();
  for(let i=0;i<20;i++)g.admit('INSIGHT','ip')();
  assert.throws(()=>g.admit('INSIGHT','ip'),/IP_LIMIT/);
  g.admit('WEB','ip','https://example.org/')();
});
test('bounded memory fails closed, expired keys removed', () => {
  let now=0; const g=new SecumieGeneralLimits(()=>now,1);
  g.admit('INSIGHT','one')();
  assert.throws(()=>g.admit('INSIGHT','two'),/BUSY/);
  now+=GENERAL_WINDOW_MS; g.admit('INSIGHT','two')();
});
