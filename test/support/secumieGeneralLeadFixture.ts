import type {SecumieGeneralLeadRepo} from '../../src/services/secumieGeneralLeadRepo';
export function syntheticLeadRepo(){
 const calls:string[]=[];let completed:unknown=null;let input:Parameters<SecumieGeneralLeadRepo['begin']>[1]|undefined;let target:string|undefined;let notification:'PENDING'|'SENT'|'FAILED'|undefined;
 const receipt='a'.repeat(43);
 const repo:Pick<SecumieGeneralLeadRepo,'begin'|'complete'|'fail'|'getCompleted'|'claimConsultation'|'finishConsultation'>={
  async begin(_kind,data,url){input=data;target=url;calls.push('begin');return {id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',receipt,created:true,status:'RECEIVED'};},
  async complete(_kind,token,result){calls.push('complete');if(token!==receipt)return false;completed=result;return true;},
  async fail(){calls.push('fail');return true;},
  async getCompleted(){return completed;},
  async claimConsultation(_kind,token,form){calls.push('claimConsultation');if(token!==receipt||!input)throw Error('RECEIPT_EXPIRED');if(!completed)throw Error('DIAGNOSIS_NOT_SAVED');const status=notification??'CLAIMED';notification??='PENDING';return {status,id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',companyName:input.companyName,personName:input.personName,email:input.email,phone:form.phone,note:form.note??'',targetUrl:target,report:completed,receivedAt:'2026-11-28T00:00:00Z'};},
  async finishConsultation(_kind,_id,status){calls.push('finishConsultation');notification=status;return true;}
 };
 return {repo,calls,receipt};
}
