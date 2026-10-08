/* Builds an inspectable five-file migration image context. It never opens a DB or runs Docker. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const fail=(message)=>{throw Error(`IT_MANAGEMENT_RELEASE_ARTIFACT_INVALID:${message}`)};
const sha256=(value)=>crypto.createHash('sha256').update(value).digest('hex');
const git=(root,args,text=false)=>execFileSync('git',['-C',root,...args],text?{encoding:'utf8'}:{})
const args=Object.fromEntries(process.argv.slice(2).flatMap((value,index,all)=>value.startsWith('--')&&all[index+1]?[ [value.slice(2),all[index+1]] ]:[]));
const isSha=(value)=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
const sqlName=/^\d+_[a-z0-9_]+\.sql$/;

function readGitBlob(root,revision,filename){return git(root,['show',`${revision}:migrations/${filename}`]);}
function gitBlobId(root,revision,filename){return git(root,['rev-parse',`${revision}:migrations/${filename}`],true).trim();}
function readManifest(root,manifestPath){
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 if(manifest.status!=='APPROVED_FOR_ARTIFACT_GENERATION'||manifest.artifact_generation?.permitted!==true) fail('MANIFEST_NOT_APPROVED');
 if(!isSha(manifest.application_rc_sha)) fail('APPLICATION_RC_SHA');
 if(manifest.release_decision?.migration_execution_authorized!==false) fail('EXECUTION_MUST_NOT_BE_AUTHORIZED');
 const migrations=manifest.migrations;
 if(!Array.isArray(migrations)||migrations.length!==5) fail('MIGRATION_COUNT');
 const ordered=[...migrations].sort((a,b)=>a.order-b.order);
 if(ordered.some((entry,index)=>entry.order!==index+1)||ordered.map(entry=>entry.filename).join('\n')!==manifest.baseline?.required_unapplied?.join('\n')) fail('MIGRATION_ORDER');
 if(new Set(ordered.map(entry=>entry.filename)).size!==5) fail('MIGRATION_DUPLICATE');
 for(const entry of ordered){
  if(!sqlName.test(entry.filename)||!isSha(entry.git_blob_id)||!Number.isInteger(entry.byte_count)||entry.byte_count<1||!/^[a-f0-9]{64}$/.test(entry.sha256)) fail(`MIGRATION_SHAPE:${entry.filename}`);
  const bytes=readGitBlob(root,manifest.application_rc_sha,entry.filename);
  if(gitBlobId(root,manifest.application_rc_sha,entry.filename)!==entry.git_blob_id) fail(`GIT_BLOB:${entry.filename}`);
  if(bytes.length!==entry.byte_count||sha256(bytes)!==entry.sha256||bytes.includes(13)) fail(`GIT_BYTES:${entry.filename}`);
 }
 return {...manifest,migrations:ordered};
}
function verifyReleaseRevision(root,manifest,reviewedSha){
 if(!isSha(reviewedSha)) fail('REVIEWED_SHA');
 if(git(root,['rev-parse','HEAD'],true).trim()!==reviewedSha) fail('HEAD_NOT_REVIEWED_SHA');
 const ancestor=git(root,['merge-base','--is-ancestor',manifest.application_rc_sha,reviewedSha],true);
 if(ancestor!=='' && ancestor!==undefined) fail('APPLICATION_RC_NOT_ANCESTOR');
 for(const entry of manifest.migrations) if(gitBlobId(root,reviewedSha,entry.filename)!==entry.git_blob_id) fail(`RELEASE_TREE_MIGRATION_CHANGED:${entry.filename}`);
}
function verifyRuntimeBuild(root){
 for(const file of ['dist/db/migrateCli.js','dist/db/migrate.js','dist/db/pool.js','dist/config.js']) if(!fs.existsSync(path.join(root,file))) fail(`RUNTIME_BUILD_MISSING:${file}`);
 try{require(path.join(root,'dist','db','migrateCli.js'));}catch(error){fail(`RUNTIME_ENTRYPOINT_LOAD:${error?.code??'UNKNOWN'}`)}
}
function copyRequired(from,to){if(!fs.existsSync(from)) fail(`BUILD_INPUT_MISSING:${path.basename(from)}`);fs.cpSync(from,to,{recursive:true});}
function build(root,manifestPath,output,reviewedSha){
 const manifest=readManifest(root,manifestPath);verifyReleaseRevision(root,manifest,reviewedSha);verifyRuntimeBuild(root);
 if(fs.existsSync(output)) fail('OUTPUT_EXISTS'); const temporary=`${output}.tmp-${process.pid}`;
 try{
  fs.mkdirSync(path.join(temporary,'migrations'),{recursive:true});
  for(const entry of manifest.migrations) fs.writeFileSync(path.join(temporary,'migrations',entry.filename),readGitBlob(root,manifest.application_rc_sha,entry.filename));
  fs.copyFileSync(manifestPath,path.join(temporary,'manifest.json'));
  for(const file of ['package.json','package-lock.json','Dockerfile.migration-release-allowlist']) copyRequired(path.join(root,file),path.join(temporary,file==='Dockerfile.migration-release-allowlist'?'Dockerfile':file));
  copyRequired(path.join(root,'dist'),path.join(temporary,'dist'));
  fs.renameSync(temporary,output);
  return {reviewedSha,applicationRcSha:manifest.application_rc_sha,filenames:manifest.migrations.map(entry=>entry.filename)};
 }catch(error){fs.rmSync(temporary,{recursive:true,force:true});throw error;}
}
function main(){const root=path.resolve(args.root??'.');const manifestPath=path.resolve(root,args.manifest??'migration-allowlists/production-it-management-current-design-v1-028-032.json');const output=path.resolve(args.output??path.join(require('node:os').tmpdir(),'it-management-current-design-028-032-artifact'));const result=build(root,manifestPath,output,args['reviewed-sha']);console.log(JSON.stringify({event:'it_management_release_artifact_built',...result,output}));}
if(require.main===module)try{main()}catch(error){console.error(error.message);process.exitCode=1;}
module.exports={readManifest,verifyReleaseRevision,verifyRuntimeBuild,build};
