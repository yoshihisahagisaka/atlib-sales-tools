const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const cp=require('node:child_process');
const assert=require('node:assert/strict');
const groups=[['pam','1.5.2-6+deb12u3'],['libzstd','1.5.4+dfsg2-5+deb12u1'],['systemd','252.39-1~deb12u2'],['libgcrypt20','1.10.1-3+deb12u1'],['sed','4.9-1+deb12u1']];
const env={...process.env,LC_ALL:'C',DEBIAN_FRONTEND:'noninteractive'};
function run(cmd,args){return cp.execFileSync(cmd,args,{encoding:'utf8',env,maxBuffer:16*1024*1024});}
function ge(a,b){return cp.spawnSync('dpkg',['--compare-versions',a,'ge',b],{env}).status===0;}
function inventory(){
 return new Map(run('dpkg-query',['-W','-f=${binary:Package}\t${source:Package}\t${Version}\t${db:Status-Status}\n']).trim().split('\n').map(l=>l.split('\t')).filter(x=>x[3]==='installed').map(([name,source,version])=>[name,{source,version}]));
}
function fingerprint(){
 const hash=crypto.createHash('sha256');
 function visit(p){const s=fs.lstatSync(p);hash.update(JSON.stringify([p,s.mode,s.uid,s.gid,s.isSymbolicLink()?fs.readlinkSync(p):null])+'\n');if(s.isDirectory())for(const n of fs.readdirSync(p).sort())visit(path.join(p,n));else if(s.isFile())hash.update(crypto.createHash('sha256').update(fs.readFileSync(p)).digest());}
 visit('/app');return hash.digest('hex');
}
const before=inventory(), app=fingerprint();
for(const [source,floor] of groups){
 const current=inventory();
 const family=[...current].filter(([,v])=>v.source===source);
 if(!family.length){console.log('OS_GROUP_SKIP='+source+'; NOT_INSTALLED');continue;}
 const selected=[];
 let reason='';
 for(const [name,v] of family){
  if(ge(v.version,floor))continue;
  const candidate=run('apt-cache',['policy',name]).match(/^\s*Candidate:\s*(\S+)/m)?.[1];
  if(!candidate||candidate==='(none)'||!ge(candidate,floor)||!ge(candidate,v.version)){reason='FIX_NOT_AVAILABLE';break;}
  selected.push(name+'='+candidate);
 }
 if(reason||!selected.length){console.log('OS_GROUP_SKIP='+source+'; '+(reason||'ALREADY_FIXED'));continue;}
 const args=['install','--no-install-recommends','--only-upgrade',...selected];
 let plan;
 try{plan=run('apt-get',['-s',...args]);}catch{console.log('OS_GROUP_SKIP='+source+'; SIMULATION_FAILED');continue;}
 const changes=plan.split('\n').filter(l=>/^(Inst|Remv|Purg) /.test(l));
 const allowed=new Set(family.flatMap(([n])=>[n,n.replace(/:amd64$/,'')]));
 if(!changes.length||changes.some(l=>!l.startsWith('Inst ')||!allowed.has(l.split(/\s+/)[1])||!/\[[^\]]+\]/.test(l))){console.log('OS_GROUP_SKIP='+source+'; UNRELATED_OR_NEW_PACKAGE_PLAN');continue;}
 console.log('OS_GROUP_PLAN='+source+'\n'+changes.join('\n'));
 console.log(run('apt-get',['-y',...args]));
 const after=inventory();
 assert.equal(after.size,current.size);
 for(const [name,v] of current){
  const n=after.get(name);assert.ok(n&&n.source===v.source);
  if(n.version!==v.version){assert.equal(v.source,source);assert.ok(ge(n.version,v.version)&&ge(n.version,floor));}
 }
 for(const [name] of family)assert.ok(ge(after.get(name).version,floor));
 console.log('OS_GROUP_APPLIED='+source);
}
const after=inventory();assert.equal(after.size,before.size);
const delta=[];
for(const [name,v] of before){const n=after.get(name);assert.ok(n&&n.source===v.source);if(n.version!==v.version){assert.ok(groups.some(([source,floor])=>source===v.source&&ge(n.version,floor)));delta.push([name,v.version,n.version]);}}
assert.equal(fingerprint(),app,'application tree changed');
console.log('OS_PACKAGE_DELTA='+JSON.stringify(delta));
console.log('ALL_APPLICATION_AND_NPM_FILES_PRESERVED=PASS');
