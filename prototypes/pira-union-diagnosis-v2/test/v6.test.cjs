const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const V=require('../v6'),C=require('../v6-content'),D=require('../diagnosis'),demos=require('../v6-demos'),cases=require('./fixtures/v6-cases.json');
const out=path.join(__dirname,'../evidence/v6-20261025');fs.mkdirSync(out,{recursive:true});const records=[];
for(const fixture of cases)for(const audience of V.audiences)test(fixture.id+' '+audience+' approved contract',()=>{
 const input=demos[fixture.id],result=V.evaluate(input),report=V.report(result,audience);
 assert.deepEqual(result.priorityThemeIds,fixture.themes);assert.equal(result.summaryId,fixture.summary);assert.equal(report.sections.length,4);
 assert.deepEqual(report.sections.map(s=>s.key),['S1','S2','S3','S4']);assert.equal(report.sections[1].blocks[0].text,C.summary[fixture.summary]);
 assert.equal(report.resources.length,5);assert.equal(new Set(report.resources.map(m=>m.id)).size,5);
 for(const t of report.themes){const q=C.questions.find(q=>q.id===t.id),a=q.options.find(o=>o.id===t.answerId);assert.notEqual(a.state,'NOT_APPLICABLE');assert.deepEqual(t.blocks.map(b=>b.text),[a.intro,C.themes[t.id].common,a.check]);}
 if(audience==='PIRA_UNION'){assert.equal(report.supplements.length,0);assert.ok(!/Secure Guard|DNSセキュリティ|相談する|相談したい方/.test(report.text));}else{assert.equal(report.supplements.length,2);assert.deepEqual(report.supplements[0].blocks.map(b=>b.text),C.dns.paragraphs);assert.deepEqual(report.supplements[1].blocks.map(b=>b.text),[...C.contact.paragraphs,C.contact.label]);}
 assert.ok(!report.text.includes('DNSFilter'));assert.ok(!report.text.includes('組合の業務と重要情報'));
 const reversed={...input,answers:[...input.answers].reverse()};assert.deepEqual(V.evaluate(reversed),result);assert.deepEqual(V.report(V.evaluate(reversed),audience),report);
 records.push({case:fixture.id,audience,input,expectedThemes:fixture.themes,result,report});
});
test('all 38 answer IDs, exact question/option text and source original paragraphs',()=>{
 assert.equal(C.questions.length,8);const all=C.questions.flatMap(q=>q.options);assert.equal(all.length,38);assert.equal(new Set(all.map(o=>o.id)).size,38);assert.equal(all.filter(o=>o.state==='NOT_APPLICABLE').length,6);
 const spec=fs.readFileSync(path.join(__dirname,'../spec/PIRA_knowledge_first_spec_v6_approved.md'),'utf8');
 assert.equal(crypto.createHash('sha256').update(spec).digest('hex'),C.amendedSha256);
 for(const q of C.questions){assert.ok(spec.includes('| '+q.id+' | '+q.text+' |'));for(const a of q.options){assert.ok(spec.includes('| '+a.id+' | '+a.label+' | '+a.state+' | '+a.intro+' | '+a.check+' |'));}}
 for(const t of Object.values(C.themes))assert.ok(spec.includes(t.common));for(const m of C.materials)assert.ok(spec.includes(m.description));
 assert.equal(C.questions[3].text,'メールや業務システムへのログインに、パスワード以外の本人確認（多要素認証）も利用していますか？');
 assert.equal(C.questions[4].text,'業務用パソコンのWindowsなどの基本ソフトを、定期的に更新（Windows Update）していますか？');
 assert.equal(C.questions[5].text,'業務で使う重要なデータが突然使えなくなった場合、元に戻す方法（バックアップと復元方法）を把握していますか？');
});
test('each answer variant is selected intact when its topic is prioritized',()=>{
 for(const q of C.questions)for(const a of q.options){
  // Put every other topic in READY, so this priority answer is always exposed.
  const input=JSON.parse(JSON.stringify(demos.ALL_READY));for(const x of input.answers){const other=C.questions.find(q=>q.id===x.questionId);const na=other.options.find(o=>o.state==='NOT_APPLICABLE');if(na)x.answerId=na.id;}input.answers.find(x=>x.questionId===q.id).answerId=a.id;
  const r=V.evaluate(input);assert.equal(r.states[q.id],a.state);if(a.state==='NOT_APPLICABLE')assert.ok(!r.priorityThemeIds.includes(q.id));
  else {if(a.state!=='READY')assert.equal(r.priorityThemeIds[0],q.id);assert.ok(r.priorityThemeIds.includes(q.id));const t=V.report(r,'PIRA_UNION').themes.find(t=>t.id===q.id);assert.deepEqual(t.blocks.map(b=>b.text),[a.intro,C.themes[q.id].common,a.check]);}
 }
});
test('STOP01 T05 prioritizes calendar, never education by T05 mapping',()=>{
 const input=JSON.parse(JSON.stringify(demos.ALL_READY));input.answers.find(a=>a.questionId==='T05').answerId='T05_A2';
 const r=V.evaluate(input),materials=V.materials(r);assert.equal(r.priorityThemeIds[0],'T05');assert.equal(materials[0].id,'CALENDAR');assert.equal(materials.findIndex(m=>m.id==='EDUCATION'),4);
});
test('READY recovery never claims tested; delegation not converted to done/not-done',()=>{
 const ready=V.evaluate(demos.ALL_READY),delegated=V.evaluate(demos.DELEGATED);assert.equal(ready.states.T06,'READY');assert.equal(delegated.states.T06,'DELEGATED');
 const text=V.report(ready,'PIRA_UNION').themes[0].blocks.map(b=>b.text).join('\n');assert.ok(text.includes('復旧方法を把握'));assert.ok(!/復元テスト済み|復元確認済み|復元確認を行っている/.test(text));
});
test('validation rejects missing, duplicate, unknown, injected state, old answer IDs',()=>{
 const clone=x=>JSON.parse(JSON.stringify(x));let invalid=[];let x=clone(demos.ALL_READY);x.answers.pop();invalid.push(x);x=clone(demos.ALL_READY);x.answers[0]=x.answers[1];invalid.push(x);x=clone(demos.ALL_READY);x.answers[0].answerId='T02_A1';invalid.push(x);x=clone(demos.ALL_READY);x.answers[0].state='READY';invalid.push(x);x=clone(demos.ALL_READY);x.answers[0].answerId='READY';invalid.push(x);
 for(const input of invalid)assert.throws(()=>V.evaluate(input));assert.equal(V.audience('invalid'),'PIRA_UNION');
});
test('all original material bytes are unchanged',()=>{for(const m of V.materials(V.evaluate(demos.ALL_READY)))for(const f of m.files)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',f.href))).digest('hex'),f.sha256);});
test('reproducible report hashes include audience and v6 versions',async()=>{
 const r=V.evaluate(demos.ALL_UNKNOWN),rep=V.report(r,'PIRA_UNION'),one=await V.snapshot(demos.ALL_UNKNOWN,r,rep),two=await V.snapshot(demos.ALL_UNKNOWN,r,rep);assert.deepEqual(one,two);const reordered={...demos.ALL_UNKNOWN,answers:[...demos.ALL_UNKNOWN.answers].reverse()};assert.deepEqual(await V.snapshot(reordered,V.evaluate(reordered),rep),one);const company=await V.snapshot(demos.ALL_UNKNOWN,r,V.report(r,'MEMBER_COMPANY'));assert.notEqual(one.executionKey,company.executionKey);
});
test('write actual case trace',()=>{fs.writeFileSync(path.join(out,'cases.json'),JSON.stringify(records,null,2));fs.writeFileSync(path.join(out,'case-text.md'),records.map(c=>'# '+c.case+' / '+c.audience+'\n\n'+c.report.text).join('\n\n'));});
