const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root='/tmp/wsc-release';
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const phase=process.argv[2];
assert.ok(['before','after'].includes(phase));
assert.notEqual(process.getuid(),0);
assert.equal(Object.keys(manifest).length,4);
for(const [name,versions] of Object.entries(manifest)){
  const file='/app/dist/'+name.replace(/^src\//,'');
  const data=fs.readFileSync(file);
  const hash=crypto.createHash('sha1').update('blob '+data.length+'\0').update(data).digest('hex');
  assert.equal(hash,versions[phase],name+' blob mismatch');
}
console.log('WSC_'+phase.toUpperCase()+'_BLOB_HASHES=PASS; NONROOT=PASS');
if(phase==='after'){
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wsc-overlay-'));
  try{
    // Test the shipped runtime tree; the legacy batch tests require writable storage.
    fs.mkdirSync(path.join(tmp,'src'),{recursive:true});
    fs.cpSync('/app/dist/wsc',path.join(tmp,'src/wsc'),{recursive:true});
    fs.cpSync(path.join(root,'test'),path.join(tmp,'test'),{recursive:true});
    const run=(args)=>{
      const p=spawnSync(process.execPath,args,{cwd:tmp,stdio:'inherit',timeout:120000});
      assert.equal(p.status,0,'WSC regression failed: '+args.join(' '));
    };
    run(['--test','test/wscMailDns.test.mjs','test/wscDiagnosisAccuracy.test.mjs','test/wscPublicDestination.test.mjs']);
    for(const suite of ['wsc-vs1','wsc-phase2a','wsc-phase2b','wsc-phase2c'])run(['src/wsc/vendor/tools/'+suite+'/test.mjs']);
    console.log('WSC_RUNTIME_OVERLAY_REGRESSION=PASS');
  } finally {fs.rmSync(tmp,{recursive:true,force:true});}
}
