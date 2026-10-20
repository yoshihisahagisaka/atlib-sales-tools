const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const D=require('../diagnosis.js'),E=require('../phase3-content.js'),R=require('../phase3-report.js'),cases=require('./phase3-cases.cjs'),expected=require('./fixtures/expected.json');
const out=path.join(__dirname,'../evidence/phase3-20261021');fs.mkdirSync(out,{recursive:true});const evidence=[];
const golden=require('./fixtures/phase3-expected.json');
for(const c of cases)test(c.id+' fixed explanation contract',()=>{
 const result=D.evaluate(c.input),report=R.build(result),actualThemes=result.priorityThemeIds;
 const want=c.themes||expected.find(e=>e.fixture===c.id).priorityThemeIds;assert.deepEqual(actualThemes,want);
 assert.deepEqual({case:c.id,expectedThemes:actualThemes,selectedTextIds:report.selectedTextIds,versions:report.versions,summary:report.sections[2],details:report.sections[3]},golden.find(x=>x.case===c.id));
 assert.equal(report.sections.length,5);assert.equal(report.themes.length,want.length);assert.ok(report.resources.length>=2&&report.resources.length<=3);
 assert.deepEqual(report.themes.map(x=>x.id),actualThemes);assert.equal(new Set(report.selectedTextIds).size,report.selectedTextIds.length);
 const detailIds=[];
 for(const id of want){detailIds.push(id+'-TITLE',id+'-COMMON');for(const q of result.themeEvidence[id])detailIds.push(id+'-'+q+'-'+result.normalizedAnswers.find(a=>a.questionId===q).optionIds[0]);for(const b of result.businessIds)if(E.examples[b]?.[id])detailIds.push(id+'-EXAMPLE-'+b);detailIds.push(id+'-CHECK');}
 if(want.length)assert.deepEqual(report.sections[3].blocks.map(x=>x.id),detailIds);
 for(const t of report.themes){for(const b of Object.keys(E.examples))if(!result.businessIds.includes(b))assert.ok(!t.blocks.some(x=>x.id===t.id+'-EXAMPLE-'+b));assert.ok(t.blocks.every(x=>typeof x.text==='string'&&x.text.length>20));}
 assert.ok(!/成果物|ルールID|Semantic|Direct|Relevance|Confirmation|Dependency|判定上|表示上限外|\b[CB]0[1-7]\b|R-T0/.test(report.text));
 assert.ok(!report.sections[2].blocks.some(x=>x.kind==='heading')); // No question-by-question recap.
 const reversed=JSON.parse(JSON.stringify(c.input));reversed.answers.reverse();reversed.answers.forEach(a=>a.optionIds.reverse());assert.deepEqual(R.build(D.evaluate(reversed)),report);
 if(c.id==='ALL_UNKNOWN'){assert.equal(report.themes.length,0);assert.ok(!report.text.includes('手順をまだ'));assert.ok(!report.text.includes('対策が不足'));}
 if(c.id==='AUTHORITY')assert.ok(report.sections[2].blocks.some(x=>x.id==='S03-AUTHORITY'));
 if(c.id==='T06_NOT_DONE'||c.id==='T06_PARTIAL'){assert.ok(report.text.includes('データを暗号化'));assert.ok(report.text.includes('金銭を要求'));assert.ok(report.text.includes('バックアップは情報流出を防ぐ対策ではありません'));}
 if(c.id==='T06_READY')assert.ok(report.sections[2].blocks.some(x=>x.id==='S03-RECOVERY_READY'));
 if(c.id==='T06_UNKNOWN')assert.ok(report.sections[2].blocks.some(x=>x.id==='S03-RECOVERY_UNKNOWN'));
 evidence.push({case:c.id,input:c.input,expectedThemes:want,actualThemes,selectedTextIds:report.selectedTextIds,versions:report.versions,summary:report.sections[2],details:report.sections[3],report,result});
});
test('write case trace and reviewable exact text baseline',()=>{fs.writeFileSync(path.join(out,'cases.json'),JSON.stringify(evidence,null,2));fs.writeFileSync(path.join(out,'case-text.md'),evidence.map(x=>'# '+x.case+'\n\n入力・テーマ・文章IDはcases.json参照。\n\n## 03\n'+x.summary.blocks.map(b=>b.id+'\n'+b.text).join('\n\n')+'\n\n## 04\n'+x.details.blocks.map(b=>b.id+'\n'+b.text).join('\n\n')).join('\n\n'));});
test('approved material bytes and description original',()=>{const crypto=require('node:crypto');for(const x of require('../resources').items)for(const f of x.files)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',f.href))).digest('hex'),f.sha256);});
