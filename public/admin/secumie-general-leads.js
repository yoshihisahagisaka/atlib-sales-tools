'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 const kind=document.body.dataset.service;
 if(kind!=='WEB'&&kind!=='INSIGHT')throw Error('SERVICE_PAGE_REQUIRED');
 const label=kind==='WEB'?'WEB':'Insight';
 const api='/api/admin/secumie-general/v1/leads';
 const states={NEW:'未対応',CONTACTED:'連絡済み',PROPOSAL:'提案中',WON:'受注',LOST:'失注',CLOSED:'終了',RECEIVED:'受付済み',COMPLETED:'完了',FAILED:'失敗',NONE:'未申込',REQUESTED:'申込済み'};
 const notifications={NONE:'未送信',PENDING:'送信待ち',SENT:'送信済み',FAILED:'送信失敗'};
 const display=x=>states[x]??x??'—';
 const date=x=>x?new Date(x).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'—';
 const td=(row,text)=>{const cell=document.createElement('td');cell.textContent=text??'—';row.append(cell);return cell;};
 function fields(id,items){const dest=$(id);dest.replaceChildren();for(const [k,v] of items){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v??'—';dest.append(dt,dd);}}
 async function request(url,options={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});if(!r.ok)throw Error(r.status===401?'スタッフ認証が必要です':r.status===403?'操作権限がありません':'取得・更新に失敗しました（'+r.status+'）');return r.status===204?null:r.json();}
 $('title').textContent='SECU:MIE '+label+'｜リード管理';
 $('diagnosis-col').textContent=kind==='WEB'?'対象URL':'診断';
 for(const key of ['NEW','CONTACTED','PROPOSAL','WON','LOST','CLOSED'])for(const id of ['sales-filter','sales-status']){const o=document.createElement('option');o.value=key;o.textContent=states[key];$(id).append(o);}
 let offset=0,activeId=null,generation=0,detailGeneration=0;
 async function load(){
  const seq=++generation;
  $('status').textContent='取得中…';$('rows').replaceChildren();$('prev').disabled=true;$('next').disabled=true;
  const query=new URLSearchParams({kind,limit:'50',offset:String(offset)});
  for(const [k,v] of new FormData($('filters')))if(v)query.set(k,String(v));
  try{
   const data=await request(api+'?'+query);if(seq!==generation)return;
   for(const k of ['received','completed','consultations','new_leads'])$(k).textContent=String(data.summary[k]);
   for(const x of data.items){const row=document.createElement('tr');td(row,date(x.received_at));td(row,x.company_name+' / '+x.person_name+(x.is_test?'（テスト）':''));td(row,kind==='WEB'?x.target_url:'8問診断');td(row,display(x.diagnosis_status));td(row,display(x.consultation_status)+(x.notification_status==='FAILED'?'（通知失敗）':''));td(row,display(x.sales_status));td(row,x.sales_contact_allowed?'同意あり':'同意なし');const button=document.createElement('button');button.type='button';button.textContent='詳細';button.addEventListener('click',()=>detail(x.id));td(row,'').append(button);$('rows').append(row);}
   $('status').textContent=data.total+'件';$('page').textContent=data.total?String(offset+1)+'–'+String(offset+data.items.length):'0件';$('prev').disabled=offset===0;$('next').disabled=offset+data.items.length>=data.total;
  }catch(e){if(seq!==generation)return;for(const k of ['received','completed','consultations','new_leads'])$(k).textContent='—';$('page').textContent='';$('status').textContent=e.message;}
 }
 async function detail(id){
  const seq=++detailGeneration;activeId=null;$('detail-title').textContent='リード詳細';$('detail-status').textContent='取得中…';$('sales-form').hidden=true;$('contact').replaceChildren();$('diagnosis').replaceChildren();$('consultation').replaceChildren();$('result').textContent='';if(!$('detail').open)$('detail').showModal();
  try{
   const x=await request(api+'/'+kind+'/'+encodeURIComponent(id));if(seq!==detailGeneration||!$('detail').open)return;
   activeId=x.id;$('detail-title').textContent=x.company_name+'｜'+label;
   fields('contact',[['担当者',x.person_name],['部署',x.department],['役職',x.position],['メール（未認証）',x.email],['電話番号',x.phone],['営業案内',x.sales_contact_allowed?'同意あり':'同意なし'],['同意版',x.consent_version],['同意日時',date(x.consented_at)]]);
   fields('diagnosis',[['受付日時',date(x.received_at)],['診断状況',display(x.diagnosis_status)],['完了日時',date(x.completed_at)],...(kind==='WEB'?[['対象URL',x.target_url]]:[])]);
   $('result').textContent=x.diagnosis_result?JSON.stringify(x.diagnosis_result,null,2):'診断結果未登録';
   fields('consultation',[['申込状況',display(x.consultation_status)],['申込日時',date(x.consultation_requested_at)],['同意版',x.consultation_consent_version],['通知状況',notifications[x.notification_status]??'—'],['相談内容',x.consultation_note]]);
   $('sales-status').value=x.sales_status;$('staff-note').value=x.staff_note??'';$('sales-form').hidden=false;$('detail-status').textContent='';
  }catch(e){if(seq===detailGeneration)$('detail-status').textContent=e.message;}
 }
 $('filters').addEventListener('submit',e=>{e.preventDefault();offset=0;load();});$('prev').addEventListener('click',()=>{offset=Math.max(0,offset-50);load();});$('next').addEventListener('click',()=>{offset+=50;load();});$('close').addEventListener('click',()=>$('detail').close());$('detail').addEventListener('close',()=>{detailGeneration++;activeId=null;$('contact').replaceChildren();$('diagnosis').replaceChildren();$('consultation').replaceChildren();$('result').textContent='';$('staff-note').value='';});
 $('sales-form').addEventListener('submit',async e=>{e.preventDefault();if(!activeId)return;const id=activeId,seq=detailGeneration,button=e.currentTarget.querySelector('button');button.disabled=true;try{await request(api+'/'+kind+'/'+encodeURIComponent(id)+'/sales',{method:'PATCH',headers:{'Content-Type':'application/json','X-Secumie-Staff-Command':'1'},body:JSON.stringify({status:$('sales-status').value,note:$('staff-note').value})});if(seq===detailGeneration)$('detail-status').textContent='保存しました';load();}catch(err){if(seq===detailGeneration)$('detail-status').textContent=err.message;}finally{button.disabled=false;}});
 load();
})();
