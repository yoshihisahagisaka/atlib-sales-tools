'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
function verify(){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/pira-phase1-validation-manifest-20261018.json'),'utf8'));
 for(const f of manifest.files){const full=path.resolve(root,f.path);if(!full.startsWith(root+path.sep))throw Error('PACKAGE_PATH_REJECTED');const bytes=fs.readFileSync(full),hash=crypto.createHash('sha256').update(bytes).digest('hex');if(hash!==f.sha256||bytes.length!==f.bytes)throw Error('PACKAGE_HASH_MISMATCH: '+f.path);}
 const files=fs.readdirSync(path.join(root,'migrations')).filter(n=>/^\d+_[a-z0-9_]+\.sql$/.test(n)).sort();
 if(JSON.stringify(files)!==JSON.stringify(manifest.baselineMigrationFilenames))throw Error('BASELINE_MIGRATION_SET_CHANGED_REVIEW_REQUIRED');
 for(const n of files)if(/\bpira_[a-z_]+\b/i.test(fs.readFileSync(path.join(root,'migrations',n),'utf8')))throw Error('PIRA_OBJECT_CONFLICT_IN_BASELINE');
 console.log(JSON.stringify({status:'PASS',ddlSha256:manifest.ddlSha256,files:manifest.files.length,numberedMigrationAdded:false,realDatabaseAccess:false}));return manifest;
}
if(require.main===module)try{verify();}catch(e){console.error(JSON.stringify({status:'FAILED',reason:e.message}));process.exitCode=1;}
module.exports={verify};
