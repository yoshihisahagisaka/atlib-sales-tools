// Synthetic, offline schema probes. No server start, credentials, SMTP or DB.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const root='/app/dist',results={};
const modules=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(f.endsWith('.js')&&/require\(["']zod(?:\/[^"']*)?["']\)/.test(fs.readFileSync(f,'utf8')))modules.push(f);}}
walk(root);modules.sort();assert.equal(modules.length,44);
function parse(name,schema,values){
 assert.equal(typeof schema.safeParse,'function',name);
 results[name]=values.map(value=>{const p=schema.safeParse(value);return p.success?{success:true,data:p.data}:{success:false};});
}
const inputs=[null,false,0,'',[],{}, {unexpected:'x'}];
for(const f of modules){
 const exported=require(f);
 for(const [name,v] of Object.entries(exported))if(v&&typeof v.safeParse==='function')parse(f+':'+name,v,inputs);
}
function locals(relative,names){
 const f=path.join(root,relative);
 const m=new Module(f,module);m.filename=f;m.paths=Module._nodeModulePaths(path.dirname(f));
 m._compile(fs.readFileSync(f,'utf8')+'\nmodule.exports.__probe={'+names.join(',')+'};\n',f);
 return m.exports.__probe;
}
const domain=require(root+'/domain/kaizenAssessment.js');
const answers={};
for(const q of domain.PRE_SURVEY_QUESTIONS)if(q.required)answers[q.id]=q.type==='single'?q.options[0].value:[q.options[0].value];
parse('preSurvey',domain.buildPreSurveySchema(),[answers,{...answers,otherTexts:{Q1:'synthetic'}},{...answers,otherTexts:{Q1:'x'.repeat(501)}},{...answers,otherTexts:{Q1:1}},{}]);
assert.ok(results.preSurvey[0].success&&results.preSurvey[1].success);
assert.ok(!results.preSurvey[2].success&&!results.preSurvey[3].success);
const a=locals('routes/adminKaizenAssessment.js',['businessesPatchSchema','hypothesesPatchSchema','reportDraftPatchSchema']);
parse('businesses',a.businessesPatchSchema,[{businesses:[{name:'synthetic',nested:{n:1}}]},{businesses:[]},{businesses:[null]},{businesses:[1]},{}]);
parse('hypotheses',a.hypothesesPatchSchema,[{hypotheses:[{name:'synthetic',nested:{n:1}}]},{hypotheses:[]},{hypotheses:[false]},{}]);
assert.ok(results.businesses[0].success&&results.hypotheses[0].success);
const blocks={b01_future:'future',b02_idealJoshisu:'ideal',b03_gap:{a:1},b04_timeShift:{b:2},b05_priorityKaizen:[{c:3}],b06_next90days:[{d:4}]};
parse('reportDraft',a.reportDraftPatchSchema,[{blocks},{blocks,operatingModelHypothesis:{x:true}},{blocks:{...blocks,b03_gap:null}},{blocks:{...blocks,b05_priorityKaizen:[1]}},{}]);
assert.ok(results.reportDraft[0].success&&results.reportDraft[1].success);
const d=locals('routes/adminFreeDiagnosisDesignV2.js',['saveCurrentStateSchema']);
const supplements=d.saveCurrentStateSchema.shape.supplements;
parse('supplements',supplements,[undefined,null,{}, {q:'synthetic',nested:[1]},false,[]]);
assert.ok(results.supplements[3].success);
const s=locals('routes/adminSecumieGeneral.js',['filters','key','edit']);
parse('staffFilters',s.filters,[{}, {kind:'WEB',limit:'10',offset:'2'},{kind:'INSIGHT',consultationStatus:'REQUESTED'}, {limit:'101'},{kind:'OTHER'}]);
parse('staffKey',s.key,[{kind:'WEB',id:'123e4567-e89b-42d3-a456-426614174000'},{kind:'INSIGHT',id:'bad'},{}]);
parse('staffEdit',s.edit,[{status:'CONTACTED',note:' synthetic '},{status:'NEW',note:''},{status:'INVALID',note:''},{status:'NEW',note:'x'.repeat(2001)}]);
assert.ok(results.staffFilters[0].success&&results.staffKey[0].success&&results.staffEdit[0].success);
fs.writeFileSync(process.argv[2],JSON.stringify(results),{mode:0o644});
console.log('ZOD_MODULE_LOAD=PASS; MODULES='+modules.length+'; PROBE_SCHEMAS='+Object.keys(results).length);
