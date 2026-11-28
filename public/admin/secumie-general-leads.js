'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 const serviceLabel=kind=>kind==='WEB'?'WEB':'Insight';
 const api='/api/admin/secumie-general/v1/leads';
 const states={NEW:'未対応',CONTACTED:'連絡済み',PROPOSAL:'提案中',WON:'受注',LOST:'失注',CLOSED:'終了',RECEIVED:'受付済み',COMPLETED:'完了',FAILED:'失敗',NONE:'未申込',REQUESTED:'申込済み'};
 const notifications={NONE:'未送信',PENDING:'送信処理中・要確認',SENT:'送信済み',FAILED:'送信失敗'};
 const display=x=>states[x]??x??'—';
 const date=x=>x?new Date(x).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'—';
 const td=(row,text)=>{const cell=document.createElement('td');cell.textContent=text??'—';row.append(cell);return cell;};
 function fields(id,items){const dest=$(id);dest.replaceChildren();for(const [k,v] of items){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v??'—';dest.append(dt,dd);}}
 async function request(url,options={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});if(!r.ok)throw Error(r.status===401?'スタッフ認証が必要です':r.status===403?'操作権限がありません':'取得・更新に失敗しました（'+r.status+'）');return r.status===204?null:r.json();}

 for(const key of ['NEW','CONTACTED','PROPOSAL','WON','LOST','CLOSED'])for(const id of ['sales-filter','sales-status']){const o=document.createElement('option');o.value=key;o.textContent=states[key];$(id).append(o);}
 let offset=0,activeId=null,activeKind=null,generation=0,detailGeneration=0,candidateGeneration=0;
 async function load(){
  const seq=++generation;
  $('status').textContent='取得中…';$('rows').replaceChildren();$('prev').disabled=true;$('next').disabled=true;
  const query=new URLSearchParams({limit:'50',offset:String(offset)});
  for(const [k,v] of new FormData($('filters')))if(v)query.set(k,String(v));
  try{
   const data=await request(api+'?'+query);if(seq!==generation)return;
   for(const k of ['received','web_completed','insight_completed','consultations','new_leads'])$(k).textContent=String(data.summary[k]);
   for(const x of data.items){const row=document.createElement('tr');td(row,date(x.received_at));td(row,x.company_name+' / '+x.person_name+(x.company_group_id?'（紐づけ済）':'')+(x.is_test?'（テスト）':''));td(row,serviceLabel(x.kind));td(row,x.kind==='WEB'?x.target_url:'—');td(row,display(x.diagnosis_status));td(row,display(x.consultation_status)+(x.notification_status==='FAILED'?'（通知失敗・要対応）':x.notification_status==='PENDING'?'（通知要確認）':''));td(row,display(x.sales_status));td(row,x.sales_contact_allowed?'同意あり':'同意なし');const button=document.createElement('button');button.type='button';button.textContent='詳細';button.addEventListener('click',()=>detail(x.kind,x.id));td(row,'').append(button);$('rows').append(row);}
   $('status').textContent=data.total+'件';$('page').textContent=data.total?String(offset+1)+'–'+String(offset+data.items.length):'0件';$('prev').disabled=offset===0;$('next').disabled=offset+data.items.length>=data.total;
  }catch(e){if(seq!==generation)return;for(const k of ['received','web_completed','insight_completed','consultations','new_leads'])$(k).textContent='—';$('page').textContent='';$('status').textContent=e.message;}
 }
 function renderResult(kind,value){
  const root=$('result-summary');root.replaceChildren();
  if(!value){root.textContent='診断結果未登録';return;}
  const add=(title,body)=>{const d=document.createElement('div'),h=document.createElement('strong'),p=document.createElement('p');h.textContent=title;p.textContent=body;d.append(h,p);root.append(d);};
  if(kind==='WEB'){
   const report=value.report;
   if(report&&Array.isArray(report.findings)){
    for(const f of report.findings)add(String(f.title??f.id??'確認項目')+'｜'+String(f.status??'未確認'),String(f.nextAction??''));
    if(!report.findings.length)root.textContent='表示対象の確認項目はありません。';
   }else root.textContent='詳細データをご確認ください。';
  }else{
   if(Array.isArray(value.priorities)&&value.priorities.length)add('重点テーマ',value.priorities.join(' ／ '));
   if(Array.isArray(value.answers))for(const a of value.answers)add(String(a.question??a.questionId??'回答'),String(a.label??a.answerId??''));
  }
 }
 function resetGroup(){
  candidateGeneration++;$('group-info').textContent='';$('related-leads').replaceChildren();$('company-candidates').replaceChildren();$('company-search').value='';$('unlink-company').hidden=true;$('search-company').disabled=true;$('original-sales').textContent='';$('result-summary').replaceChildren();
 }
 function renderGroup(x){
  $('group-info').textContent=x.company_group_id?'紐づけ先：'+x.group_name+'（営業状況・メモを共通管理）':'未紐づけ（診断単位で管理）';
  $('company-search').value=x.company_name;$('search-company').disabled=false;$('unlink-company').hidden=!x.company_group_id;
  $('sales-heading').textContent=x.company_group_id?'営業対応（企業共通）':'営業対応（診断単位）';
  $('original-sales').textContent=x.company_group_id?'紐づけ前のこの診断の状態：'+display(x.original_sales_status)+' ／ '+(x.original_staff_note||'メモなし'):'';
  for(const y of x.related_leads??[]){const p=document.createElement('p'),button=document.createElement('button');button.type='button';button.textContent=serviceLabel(y.kind)+'｜'+y.company_name+' / '+y.person_name+'｜'+date(y.received_at)+'｜'+display(y.diagnosis_status);button.onclick=()=>detail(y.kind,y.id);p.append(button);$('related-leads').append(p);}
 }
 $('search-company').onclick=async()=>{
  const id=activeId,kind=activeKind,seq=detailGeneration,n=++candidateGeneration,query=$('company-search').value.trim(),root=$('company-candidates');
  if(!id||!kind||!query)return;
  root.textContent='検索中…';
  try{
   const data=await request(api+'?'+new URLSearchParams({companyName:query,limit:'50',offset:'0'}));
   if(seq!==detailGeneration||n!==candidateGeneration)return;
   root.replaceChildren();
   const candidates=data.items.filter(x=>x.id!==id);
   if(!candidates.length)root.textContent='候補がありません。';
   for(const x of candidates){
    const p=document.createElement('p'),span=document.createElement('span'),button=document.createElement('button');
    span.textContent=x.company_name+' / '+x.person_name+'｜'+serviceLabel(x.kind)+'｜'+date(x.received_at)+'｜'+display(x.sales_status)+(x.group_name?'｜紐づけ先：'+x.group_name:'')+(x.is_test?'（テスト）':'')+' ';
    button.type='button';button.textContent='同一企業として紐づけ';
    button.onclick=async()=>{if(seq!==detailGeneration||n!==candidateGeneration)return;if(!window.confirm('同一企業であることを確認しましたか？ 紐づけ後は既存の企業共通営業状況（新規グループは現在開いている診断の状態）を使用します。各診断の元の状態は保持されます。'))return;button.disabled=true;try{await request(api+'/'+kind+'/'+encodeURIComponent(id)+'/company-link',{method:'POST',headers:{'Content-Type':'application/json','X-Secumie-Staff-Command':'1'},body:JSON.stringify({targetKind:x.kind,targetId:x.id,confirmed:true})});if(seq===detailGeneration){await detail(kind,id);load();}}catch(e){if(seq===detailGeneration)$('detail-status').textContent=e.message;}finally{button.disabled=false;}};
    p.append(span,button);root.append(p);
   }
   if(data.total>50){const p=document.createElement('p');p.textContent='候補が50件を超えています。企業名を絞り込んでください。';root.append(p);}
  }catch(e){if(seq===detailGeneration&&n===candidateGeneration)root.textContent=e.message;}
 };
 $('unlink-company').onclick=async()=>{const id=activeId,kind=activeKind,seq=detailGeneration;if(!id||!kind||!window.confirm('この診断だけ紐づけを解除し、元の診断単位の営業状態に戻しますか？'))return;try{await request(api+'/'+kind+'/'+encodeURIComponent(id)+'/company-link',{method:'DELETE',headers:{'Content-Type':'application/json','X-Secumie-Staff-Command':'1'},body:JSON.stringify({confirmed:true})});if(seq===detailGeneration){await detail(kind,id);load();}}catch(e){if(seq===detailGeneration)$('detail-status').textContent=e.message;}};
 async function detail(kind,id){
  const seq=++detailGeneration;activeId=null;activeKind=null;$('detail-title').textContent='リード詳細';$('detail-status').textContent='取得中…';$('sales-form').hidden=true;$('contact').replaceChildren();$('diagnosis').replaceChildren();$('consultation').replaceChildren();$('result').textContent='';$('result-history').replaceChildren();resetGroup();if(!$('detail').open)$('detail').showModal();
  try{
   const x=await request(api+'/'+kind+'/'+encodeURIComponent(id));if(seq!==detailGeneration||!$('detail').open)return;
   activeId=x.id;activeKind=kind;$('detail-title').textContent=x.company_name+'｜'+serviceLabel(kind);
   fields('contact',[['担当者',x.person_name],['部署',x.department],['役職',x.position],['メール（未認証）',x.email],['電話番号',x.phone],['営業案内',x.sales_contact_allowed?'同意あり':'同意なし'],['同意版',x.consent_version],['同意日時',date(x.consented_at)]]);
   fields('diagnosis',[['受付日時',date(x.received_at)],['診断状況',display(x.diagnosis_status)],['完了日時',date(x.completed_at)],...(kind==='WEB'?[['対象URL',x.target_url]]:[])]);
   $('result').textContent=x.diagnosis_result?JSON.stringify(x.diagnosis_result,null,2):'診断結果未登録';
   renderResult(kind,x.diagnosis_result);renderGroup(x);
   const history=$('result-history');history.replaceChildren();
   for(const entry of x.result_history??[]){const d=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent='修正前の回答（'+date(entry.completed_at)+'）';pre.textContent=JSON.stringify(entry.diagnosis_result,null,2);d.append(summary,pre);history.append(d);}
   fields('consultation',[['申込状況',display(x.consultation_status)],['申込日時',date(x.consultation_requested_at)],['相談時電話番号',x.consultation_phone],['同意版',x.consultation_consent_version],['通知状況',notifications[x.notification_status]??'—'],['相談内容',x.consultation_note]]);
   $('sales-status').value=x.sales_status;$('staff-note').value=x.staff_note??'';$('sales-form').hidden=false;$('detail-status').textContent='';
  }catch(e){if(seq===detailGeneration)$('detail-status').textContent=e.message;}
 }
 $('filters').addEventListener('submit',e=>{e.preventDefault();offset=0;load();});$('prev').addEventListener('click',()=>{offset=Math.max(0,offset-50);load();});$('next').addEventListener('click',()=>{offset+=50;load();});$('close').addEventListener('click',()=>$('detail').close());$('detail').addEventListener('close',()=>{detailGeneration++;activeId=null;activeKind=null;$('contact').replaceChildren();$('diagnosis').replaceChildren();$('consultation').replaceChildren();$('result').textContent='';$('result-history').replaceChildren();resetGroup();$('staff-note').value='';});
 $('sales-form').addEventListener('submit',async e=>{e.preventDefault();if(!activeId||!activeKind)return;const id=activeId,kind=activeKind,seq=detailGeneration,button=e.currentTarget.querySelector('button');button.disabled=true;try{await request(api+'/'+kind+'/'+encodeURIComponent(id)+'/sales',{method:'PATCH',headers:{'Content-Type':'application/json','X-Secumie-Staff-Command':'1'},body:JSON.stringify({status:$('sales-status').value,note:$('staff-note').value})});if(seq===detailGeneration)$('detail-status').textContent='保存しました';load();}catch(err){if(seq===detailGeneration)$('detail-status').textContent=err.message;}finally{button.disabled=false;}});
 load();
})();
