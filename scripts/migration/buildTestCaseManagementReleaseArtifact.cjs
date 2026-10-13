/* Builds an inspectable, 035-only Test Case Management migration image context. Never opens a DB or runs Docker. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const fail=message=>{throw Error(`TEST_CASE_MANAGEMENT_RELEASE_ARTIFACT_INVALID:${message}`)};
const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');
const git=(root,args,text=false)=>execFileSync('git',['-C',root,...args],text?{encoding:'utf8'}:{});
const args=Object.fromEntries(process.argv.slice(2).flatMap((value,index,all)=>value.startsWith('--')&&all[index+1]?[[value.slice(2),all[index+1]]]:[]));
const isSha=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
const readGitBlob=(root,revision,filename)=>git(root,['show',`${revision}:migrations/${filename}`]);
const gitBlobId=(root,revision,filename)=>git(root,['rev-parse',`${revision}:migrations/${filename}`],true).trim();
function readManifest(root,manifestPath){
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 if(manifest.status!=='APPROVED_FOR_ARTIFACT_GENERATION'||manifest.artifact_generation?.permitted!==true)fail('MANIFEST_NOT_APPROVED');
 if(!isSha(manifest.application_rc_sha)||manifest.release_decision?.migration_execution_authorized!==false)fail('RELEASE_DECISION');
 if(!Array.isArray(manifest.migrations)||manifest.migrations.length!==1)fail('MIGRATION_COUNT');
 const entry=manifest.migrations[0];
 if(entry.order!==1||entry.filename!=='035_it_management_test_case_designation.sql'||manifest.baseline?.required_unapplied?.join()!==entry.filename)fail('MIGRATION_ALLOWLIST');
 if(!isSha(entry.git_blob_id)||!Number.isInteger(entry.byte_count)||entry.byte_count<1||!/^[a-f0-9]{64}$/.test(entry.sha256))fail('MIGRATION_SHAPE');
 const bytes=readGitBlob(root,manifest.application_rc_sha,entry.filename);
 if(gitBlobId(root,manifest.application_rc_sha,entry.filename)!==entry.git_blob_id||bytes.length!==entry.byte_count||sha256(bytes)!==entry.sha256||bytes.includes(13))fail('GIT_BYTES');
 return manifest;
}
function verifyReleaseRevision(root,manifest,reviewedSha){
 if(!isSha(reviewedSha)||git(root,['rev-parse','HEAD'],true).trim()!==reviewedSha)fail('HEAD_NOT_REVIEWED_SHA');
 try{git(root,['merge-base','--is-ancestor',manifest.application_rc_sha,reviewedSha]);}catch{fail('APPLICATION_RC_NOT_ANCESTOR');}
 const entry=manifest.migrations[0];if(gitBlobId(root,reviewedSha,entry.filename)!==entry.git_blob_id)fail('RELEASE_TREE_MIGRATION_CHANGED');
}
function verifyRuntimeBuild(root){for(const file of ['dist/db/migrateCli.js','dist/db/migrate.js','dist/db/pool.js','dist/config.js'])if(!fs.existsSync(path.join(root,file)))fail(`RUNTIME_BUILD_MISSING:${file}`);}
function build(root,manifestPath,output,reviewedSha){
 const manifest=readManifest(root,manifestPath);verifyReleaseRevision(root,manifest,reviewedSha);verifyRuntimeBuild(root);
 if(fs.existsSync(output))fail('OUTPUT_EXISTS');const temporary=`${output}.tmp-${process.pid}`;
 try{fs.mkdirSync(path.join(temporary,'migrations'),{recursive:true});const entry=manifest.migrations[0];fs.writeFileSync(path.join(temporary,'migrations',entry.filename),readGitBlob(root,manifest.application_rc_sha,entry.filename));fs.copyFileSync(manifestPath,path.join(temporary,'manifest.json'));
  for(const file of ['package.json','package-lock.json'])fs.copyFileSync(path.join(root,file),path.join(temporary,file));fs.copyFileSync(path.join(root,'Dockerfile.migration-release-allowlist'),path.join(temporary,'Dockerfile'));fs.cpSync(path.join(root,'dist'),path.join(temporary,'dist'),{recursive:true});fs.renameSync(temporary,output);
  return {reviewedSha,applicationRcSha:manifest.application_rc_sha,filenames:[entry.filename]};
 }catch(error){fs.rmSync(temporary,{recursive:true,force:true});throw error;}
}
function main(){const root=path.resolve(args.root??'.'),manifestPath=path.resolve(root,args.manifest??'migration-allowlists/production-test-case-management-v1-035.json'),output=path.resolve(args.output??path.join(require('node:os').tmpdir(),'test-case-management-v1-035-artifact'));console.log(JSON.stringify({event:'test_case_management_release_artifact_built',...build(root,manifestPath,output,args['reviewed-sha']),output}));}
if(require.main===module)try{main();}catch(error){console.error(error.message);process.exitCode=1;}
module.exports={readManifest,verifyReleaseRevision,verifyRuntimeBuild,build};
