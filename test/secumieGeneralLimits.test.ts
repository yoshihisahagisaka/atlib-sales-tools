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

test('pre-verification start ceiling independent of accepted diagnosis quota',()=>{
 let now=0;const g=new SecumieGeneralLimits(()=>now);
 for(let i=0;i<60;i++)g.admitOperation('WEB','start','ip');
 assert.throws(()=>g.admitOperation('WEB','start','ip'),/IP_LIMIT/);
 g.admit('WEB','ip','https://example.org/')();
 g.admitOperation('INSIGHT','start','ip');
 now+=GENERAL_WINDOW_MS;g.admitOperation('WEB','start','ip');
});
test('completion and consultation receipt limits survive changing IP, with independent windows',()=>{
 let now=0;const g=new SecumieGeneralLimits(()=>now);
 for(let i=0;i<30;i++)g.admitOperation('INSIGHT','complete','ip'+i,'receipt');
 assert.throws(()=>g.admitOperation('INSIGHT','complete','new-ip','receipt'),/RECEIPT_LIMIT/);
 for(let i=0;i<10;i++)g.admitOperation('INSIGHT','consultation','ip'+i,'receipt');
 assert.throws(()=>g.admitOperation('INSIGHT','consultation','new-ip','receipt'),/RECEIPT_LIMIT/);
 g.admitOperation('WEB','complete','ip','receipt');
 g.admitOperation('INSIGHT','complete','ip','other-receipt');
 now+=GENERAL_WINDOW_MS;g.admitOperation('INSIGHT','complete','new-ip','receipt');
});
test('operation IP ceiling bounds distinct receipts; map capacity fails closed',()=>{
 const g=new SecumieGeneralLimits();
 for(let i=0;i<120;i++)g.admitOperation('INSIGHT','complete','ip','receipt'+i);
 assert.throws(()=>g.admitOperation('INSIGHT','complete','ip','new'),/IP_LIMIT/);
 const small=new SecumieGeneralLimits(()=>0,1);
 small.admitOperation('WEB','complete','ip','receipt');
 assert.throws(()=>small.admitOperation('WEB','complete','ip','different'),/BUSY/);
});
