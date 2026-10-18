'use strict';
const DATABASE='pira_joint_purchase_validation',PORT='55442';
function target(value,role){
 let u;try{u=new URL(value);}catch{throw Error('PIRA_VALIDATION_TARGET_REQUIRED');}
 if(!['postgres:','postgresql:'].includes(u.protocol)||!['127.0.0.1','localhost'].includes(u.hostname)||u.port!==PORT||decodeURIComponent(u.pathname)!=='/'+DATABASE||decodeURIComponent(u.username)!==role||!u.password||u.search||u.hash)throw Error('PIRA_VALIDATION_TARGET_REJECTED');
 return value;
}
function approvedTargets(env){
 if(env.PIRA_VALIDATION_DML_APPROVED!=='pira-local-dml-approved')return null;
 return {runtime:target(env.PIRA_VALIDATION_RUNTIME_DB_URL,'sales_tools_app'),fixture:target(env.PIRA_VALIDATION_FIXTURE_DB_URL,'sales_tools_migration'),readonly:target(env.PIRA_VALIDATION_READONLY_DB_URL,'pira_validation_readonly')};
}
module.exports={target,approvedTargets,DATABASE,PORT};
