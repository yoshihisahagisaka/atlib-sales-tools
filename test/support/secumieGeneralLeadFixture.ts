import type {SecumieGeneralLeadRepo} from '../../src/services/secumieGeneralLeadRepo';
export function syntheticLeadRepo(){
 const calls:string[]=[];let completed:unknown=null;
 const receipt='a'.repeat(43);
 const repo:Pick<SecumieGeneralLeadRepo,'begin'|'complete'|'fail'|'getCompleted'>={
  async begin(){calls.push('begin');return {id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',receipt,created:true,status:'RECEIVED'};},
  async complete(_kind,token,result){calls.push('complete');if(token!==receipt)return false;completed=result;return true;},
  async fail(){calls.push('fail');return true;},
  async getCompleted(){return completed;}
 };
 return {repo,calls,receipt};
}
