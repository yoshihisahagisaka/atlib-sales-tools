const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const cp=require('node:child_process');
const assert=require('node:assert/strict');
const snapshot='/tmp/staff-security-before.json';
const target='/app/node_modules/nodemailer';
const version='10.6.1';
const expected='d7kfFfS/tR4Aca+SBvRaQ+MXKNv7d2JiRe5TxaRcFT/kYMh4GGPnW9aKksTIEvyEbA7d/7HYWE4YPDEHxzJj/g==';
function fingerprint(){
 const hash=crypto.createHash('sha256');
 function visit(p){
  if(p===target)return;
  const s=fs.lstatSync(p);
  hash.update(JSON.stringify([p,s.mode,s.uid,s.gid,s.isSymbolicLink()?fs.readlinkSync(p):null])+'\n');
  if(s.isDirectory()){for(const name of fs.readdirSync(p).sort())visit(path.join(p,name));}
  else if(s.isFile()){hash.update(crypto.createHash('sha256').update(fs.readFileSync(p)).digest());}
 }
 visit('/app');
 return hash.digest('hex');
}
function os(){
 const out=cp.execFileSync('dpkg-query',['-W','-f=${binary:Package}\t${Version}\t${db:Status-Status}\n'],{encoding:'utf8'});
 return Object.fromEntries(out.trim().split('\n').map(l=>l.split('\t')).filter(x=>x[2]==='installed').map(x=>[x[0],x[1]]));
}
async function install(){
 const old=JSON.parse(fs.readFileSync(target+'/package.json','utf8'));
 assert.equal(old.version,'9.1.1');
 assert.ok(Number(process.versions.node.split('.')[0])>=20);
 const url='https://registry.npmjs.org/nodemailer/-/nodemailer-'+version+'.tgz';
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(60000)});
 assert.ok(response.ok);
 const bytes=Buffer.from(await response.arrayBuffer());
 assert.equal(crypto.createHash('sha512').update(bytes).digest('base64'),expected);
 const tmp=fs.mkdtempSync('/tmp/staff-mail-');
 try{
  const file=path.join(tmp,'npm.tgz');fs.writeFileSync(file,bytes,{mode:0o600});
  const extract=path.join(tmp,'package');fs.mkdirSync(extract);
  cp.execFileSync('tar',['-xzf',file,'-C',extract,'--strip-components=1','--no-same-owner','--no-same-permissions']);
  const pkg=JSON.parse(fs.readFileSync(extract+'/package.json','utf8'));
  assert.equal(pkg.name,'nodemailer');assert.equal(pkg.version,version);
  assert.equal(Object.keys(pkg.dependencies||{}).length,0);
  assert.equal(Object.keys(pkg.optionalDependencies||{}).length,0);
  fs.rmSync(target,{recursive:true});fs.cpSync(extract,target,{recursive:true});
  cp.execFileSync('chmod',['-R','a+rX',target]);
  console.log('NODEMAILER_INTEGRITY_AND_INSTALL=PASS; 9.1.1 -> '+version);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
async function main(){
 const mode=process.argv[2];
 if(mode==='before'){fs.writeFileSync(snapshot,JSON.stringify({app:fingerprint(),os:os()}),{mode:0o600});return;}
 if(mode==='install'){await install();return;}
 if(mode==='after'){
  const before=JSON.parse(fs.readFileSync(snapshot,'utf8')),after=os();
  assert.equal(fingerprint(),before.app,'unrelated /app content or permissions changed');
  const names=new Set([...Object.keys(before.os),...Object.keys(after)]);
  const changed=[...names].filter(k=>before.os[k]!==after[k]).sort();
  assert.ok(changed.every(k=>/^(apt|libapt-pkg6\.0)(:amd64)?$/.test(k)&&before.os[k]&&after[k]));
  console.log('OS_PACKAGE_DELTA='+JSON.stringify(changed.map(k=>[k,before.os[k],after[k]])));
  console.log('UNRELATED_APPLICATION_AND_DEPENDENCIES_PRESERVED=PASS');
  return;
 }
 throw Error('mode');
}
main().catch(e=>{console.error('STAFF_SECURITY_PATCH_STOP: '+e.message);process.exitCode=1;});
