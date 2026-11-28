const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root='/tmp/wsc-staff',manifest=JSON.parse(fs.readFileSync(root+'/manifest.json','utf8')),phase=process.argv[2];
if(phase!=='guard')assert.notEqual(process.getuid(),0);assert.equal(Object.keys(manifest).length,4);
const names=Object.keys(manifest),runtime=p=>'/app/dist/'+p.replace(/^src\//,'');
const guard='/app/dist/wsc/vendor/tools/wsc-phase2a/safe-executor.mjs',oldGuard='437c644bed0b8b4e884f4533ba103921e7cea6a3',newGuard='e24e52714f0a34ec1a5a9f66ef604d7019806e3e';
const excluded=new Set([...names.map(runtime),guard]);
function blob(b){return crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex')}
function fingerprint(){
 const hash=crypto.createHash('sha256');
 function visit(p){if(excluded.has(p))return;const s=fs.lstatSync(p);hash.update(JSON.stringify([p,s.mode,s.uid,s.gid,s.isSymbolicLink()?fs.readlinkSync(p):null])+'\n');if(s.isDirectory())for(const n of fs.readdirSync(p).sort())visit(path.join(p,n));else if(s.isFile())hash.update(crypto.createHash('sha256').update(fs.readFileSync(p)).digest());}
 visit('/app');return hash.digest('hex');
}
function run(args,cwd,extra={}){
 const p=spawnSync(process.execPath,args,{cwd,stdio:'inherit',timeout:600000,env:{...process.env,...extra}});
 assert.equal(p.status,0,'regression failed: '+args.join(' '));
}
const hashes=Object.fromEntries(names.map(n=>[n,blob(fs.readFileSync(runtime(n)))]));
if(phase==='before'){
 // Exact old complete tuple from current production source lineage or existing staff PR source.
 const tuple=[0,1].find(i=>names.every(n=>manifest[n][i]===hashes[n]));
 console.log('STAFF_WSC_ACTUAL_OLD_BLOBS='+JSON.stringify(hashes));assert.notEqual(tuple,undefined,'unknown old runtime WSC blobs; no blind replacement');
 const actualGuard=blob(fs.readFileSync(guard));assert.ok([oldGuard,newGuard].includes(actualGuard),'unknown target guard blob');
 console.log('STAFF_WSC_ACTUAL_TARGET_GUARD='+actualGuard);
 fs.writeFileSync('/tmp/wsc-staff-before.json',JSON.stringify({fingerprint:fingerprint(),hashes,guard:actualGuard}));
 run([root+'/schema-probe.cjs','/tmp/wsc-schema-before.json'],'/app');
 console.log('STAFF_WSC_BASELINE=PASS');
}else if(phase==='guard'){
 const baseline=JSON.parse(fs.readFileSync('/tmp/wsc-staff-before.json','utf8'));
 const current=blob(fs.readFileSync(guard)),approved=fs.readFileSync(root+'/approved-safe-executor.mjs');
 assert.equal(current,baseline.guard);assert.equal(blob(approved),newGuard);
 if(current===oldGuard){fs.writeFileSync(guard,approved);console.log('WSC_TARGET_GUARD_UPDATED=PASS; EXACT_APPROVED_SOURCE');}
 else {assert.equal(current,newGuard);console.log('WSC_TARGET_GUARD_ALREADY_CURRENT=PASS');}
}else if(phase==='after'){
 assert.equal(blob(fs.readFileSync(guard)),newGuard);
 for(const n of names)assert.equal(hashes[n],manifest[n][2],n);
 const baseline=JSON.parse(fs.readFileSync('/tmp/wsc-staff-before.json','utf8'));
 assert.equal(fingerprint(),baseline.fingerprint,'unrelated app/dependencies/permissions changed');
 run([root+'/schema-probe.cjs','/tmp/wsc-schema-after.json'],'/app');
 assert.deepEqual(JSON.parse(fs.readFileSync('/tmp/wsc-schema-after.json')),JSON.parse(fs.readFileSync('/tmp/wsc-schema-before.json')));
 console.log('UNRELATED_APPLICATION_AND_57_SCHEMA_REGRESSION=PASS');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'staff-wsc-'));
 try{
  fs.mkdirSync(path.join(tmp,'src'),{recursive:true});
  fs.cpSync('/app/dist/wsc',path.join(tmp,'src/wsc'),{recursive:true});
  fs.cpSync(root+'/test',path.join(tmp,'test'),{recursive:true});
  for(const suite of ['wsc-vs1','wsc-phase2c'])fs.copyFileSync(path.join(tmp,'test','vendor',suite,'test.mjs'),path.join(tmp,'src/wsc/vendor/tools',suite,'test.mjs'));
  const legacy=path.join(tmp,'test','legacy');
  const env={WSC_LEGACY_FIXTURE_DIR:legacy};
  run(['--test','test/wscMailDns.test.mjs','test/wscDiagnosisAccuracy.test.mjs','test/wscPublicDestination.test.mjs','test/wscPresentation.test.mjs'],tmp,env);
  for(const suite of ['wsc-vs1','wsc-phase2a','wsc-phase2b','wsc-phase2c'])run(['src/wsc/vendor/tools/'+suite+'/test.mjs'],tmp,env);
  // The approved fixture suite uses public technical headings. Reuse its fixtures,
  // changing only the test generator to the existing staff default (no technical headings).
  const fixture=path.join(tmp,'test','wscPresentation.test.mjs'),t=fs.readFileSync(fixture,'utf8');
  const from='const generate=r=>render(r,company,{technicalHeadings:true});',to='const generate=r=>render(r,company);';
  assert.equal(t.split(from).length-1,1);fs.writeFileSync(fixture,t.replace(from,to));
  const reports=path.join(tmp,'staff-reports');
  run(['--test','test/wscPresentation.test.mjs'],tmp,{...env,WSC_PRESENTATION_OUTPUT:reports});
  run([root+'/staff-regression.cjs',reports],'/app');
  console.log('STAFF_WSC_RUNTIME_REGRESSION=PASS');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}else throw Error('mode');
