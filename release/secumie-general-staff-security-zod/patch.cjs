const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const target='/app/node_modules/zod';
const changes=[
 ['/app/dist/domain/kaizenAssessment.js','zod_1.z.record(zod_1.z.string().max(500))','zod_1.z.record(zod_1.z.string(), zod_1.z.string().max(500))',1],
 ['/app/dist/routes/adminFreeDiagnosisDesignV2.js','zod_1.z.record(zod_1.z.unknown())','zod_1.z.record(zod_1.z.string(), zod_1.z.unknown())',1],
 ['/app/dist/routes/adminKaizenAssessment.js','zod_1.z.record(zod_1.z.unknown())','zod_1.z.record(zod_1.z.string(), zod_1.z.unknown())',7],
];
const excluded=new Set([target,...changes.map(x=>x[0])]);
const file='/tmp/zod-fingerprint.json';
function digest(b){return crypto.createHash('sha256').update(b).digest('hex')}
function fingerprint(){
 const hash=crypto.createHash('sha256');
 function visit(p){if(excluded.has(p))return;const s=fs.lstatSync(p);hash.update(JSON.stringify([p,s.mode,s.uid,s.gid,s.isSymbolicLink()?fs.readlinkSync(p):null])+'\n');if(s.isDirectory())for(const n of fs.readdirSync(p).sort())visit(path.join(p,n));else if(s.isFile())hash.update(digest(fs.readFileSync(p)));}
 visit('/app');return hash.digest('hex');
}
async function main(){
 const mode=process.argv[2];
 if(mode==='before'){
  assert.equal(require(target+'/package.json').version,'3.25.76');
  const expected=changes.map(([f,a,b,count])=>{const t=fs.readFileSync(f,'utf8');assert.equal(t.split(a).length-1,count,f);return [f,digest(t.split(a).join(b)),fs.statSync(f).mode];});
  fs.writeFileSync(file,JSON.stringify({app:fingerprint(),expected}),{mode:0o600});return;
 }
 if(mode==='install'){
  const resp=await fetch('https://registry.npmjs.org/zod/-/zod-4.6.7.tgz',{redirect:'error',signal:AbortSignal.timeout(60000)});assert.ok(resp.ok);
  const bytes=Buffer.from(await resp.arrayBuffer());
  assert.equal(crypto.createHash('sha512').update(bytes).digest('base64'),'g8W2D2kU6a8untc053fX1uVBKzM7yqAxW/3zwk83+6RyF2+SKOuV+c0wBDhUwzV1PaGapmZH+rmcUzPf+3CGwg==');
  const tmp=fs.mkdtempSync('/tmp/zod-');
  try{
   const tar=path.join(tmp,'package.tgz'),out=path.join(tmp,'package');fs.writeFileSync(tar,bytes,{mode:0o600});fs.mkdirSync(out);
   cp.execFileSync('tar',['-xzf',tar,'-C',out,'--strip-components=1','--no-same-owner','--no-same-permissions']);
   const pkg=JSON.parse(fs.readFileSync(out+'/package.json','utf8'));assert.equal(pkg.name,'zod');assert.equal(pkg.version,'4.6.7');assert.equal(Object.keys(pkg.dependencies||{}).length,0);assert.equal(Object.keys(pkg.optionalDependencies||{}).length,0);
   fs.rmSync(target,{recursive:true});fs.cpSync(out,target,{recursive:true});cp.execFileSync('chmod',['-R','a+rX',target]);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
  for(const [f,a,b,count] of changes){const t=fs.readFileSync(f,'utf8');assert.equal(t.split(a).length-1,count);fs.writeFileSync(f,t.split(a).join(b));cp.execFileSync('node',['--check',f]);}
  console.log('ZOD_INTEGRITY_AND_EXACT_9_RECORD_PATCHES=PASS');return;
 }
 if(mode==='after'){
  const before=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(fingerprint(),before.app);
  for(const [f,hash,mode] of before.expected){assert.equal(digest(fs.readFileSync(f)),hash);assert.equal(fs.statSync(f).mode,mode);}
  assert.equal(require(target+'/package.json').version,'4.6.7');
  console.log('UNRELATED_APPLICATION_AND_DEPENDENCIES_PRESERVED=PASS');return;
 }
 throw Error('unknown mode');
}
main().catch(e=>{console.error('ZOD_PATCH_STOP: '+e.message);process.exitCode=1});
