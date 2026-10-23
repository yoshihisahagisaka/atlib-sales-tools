'use strict';
(() => {
 const $=id=>document.getElementById(id),internal=false;
 const base='/pira/api';let csrf='',session,kind='application',current=null,scope={};
 const labels={application:'申込',order:'発注',affiliation:'所属企業',terms:'申込条件',association:'組合',membership:'権限',external_link:'外部ID',audit:'監査',outbox:'通知状況'};
 const states={SUBMITTED:'組合確認待ち',RETURNED:'差戻し',CANCELLED:'取消済み',ORDERED:'発注済み',pending:'通知待ち',sending:'配送処理中',sent:'配送済み',dead:'通知要対応'};
 const serviceName={GUARD:'Secure Guard',SEND:'Secure Send',INFRAVISION:'InfraVision'};
 const message=(v,error=false)=>{$('message').textContent=v;$('message').className=error?'error':'';};
 async function api(path,body){const r=await fetch(base+path,{credentials:'same-origin',headers:body?{'Content-Type':'application/json','X-Pira-Request':'1','X-Pira-CSRF':csrf}:{},method:body?'POST':'GET',body:body?JSON.stringify(body):undefined});let d;try{d=await r.json();}catch{d={error:'接続先を確認してください'};}if(!r.ok)throw Error(d.error||'処理できません');return d;}
 async function perform(fn){try{await fn();}catch(e){message('処理できませんでした：'+e.message,true);}}
 function el(tag,text){const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text??'');return n;}
 function button(label,fn){const b=el('button',label);b.type='button';b.onclick=()=>perform(async()=>{b.disabled=true;try{await fn();}finally{b.disabled=false;}});return b;}
 function fieldForm(parent,fields,submit,submitLabel='登録する'){
  const f=el('form');for(const [name,label,type='text',required=true] of fields){const l=el('label',label);let input;
   if(Array.isArray(type)){input=el('select');for(const [value,caption] of type){const o=el('option',caption);o.value=value;input.append(o);}}
   else{input=el(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;}
   input.name=name;input.required=required;if(type==='number'){input.min='0';input.step='1';}l.append(input);f.append(l);
  }
  const b=el('button',submitLabel);b.className='primary';f.append(b);f.onsubmit=e=>{e.preventDefault();perform(async()=>{b.disabled=true;try{const data={};for(const [k,v]of new FormData(f)){if(v==='')continue;const input=f.elements.namedItem(k);data[k]=input.type==='number'?Number(v):v;}await submit(data,f);message('登録しました。');await refresh();}finally{b.disabled=false;}});};parent.append(f);return f;
 }
 function table(rows,columns,parent){const t=el('table'),head=el('tr');columns.forEach(c=>head.append(el('th',c[0])));t.append(head);for(const row of rows){const tr=el('tr');for(const [,get]of columns){const td=el('td'),value=get(row);td.append(value instanceof Node?value:el('span',value));tr.append(td);}t.append(tr);}parent.replaceChildren(rows.length?t:el('p','該当する情報はありません。'));}
 function query(){return new URLSearchParams(scope).toString();}
 async function refresh(){const rows=await api('/records/'+kind+'?'+query());$('listTitle').textContent=labels[kind]+'一覧';table(rows,[['名称・番号',r=>r.data.name||r.data.number||r.data.label||r.data.email||r.data.contactName||r.id],['企業',r=>r.companyName||r.companyId||'—'],['状態・内容',r=>states[r.data.state]||serviceName[r.data.service]||r.data.role||r.data.action||(r.data.active===false?'停止':'—')],['詳細',r=>['application','order'].includes(kind)?button('確認する',()=>detail(kind,r.id)):button('内容を見る',()=>showRecord(r))]],$('list'));}
 function showRecord(r){$('detail').hidden=false;current=r;$('detailBody').replaceChildren();const dl=el('dl');const pairs=[['管理番号',r.data.number||r.id],['組合ID',r.associationId],['企業ID',r.companyId],['版',r.version]];for(const [k,v]of Object.entries(r.data)){if(['request','snapshot','before','after'].includes(k))continue;const map={name:'名称',email:'メール',contactName:'担当者',contactEmail:'担当者メール',state:'状態',service:'サービス',orderMode:'発注方式',conditions:'条件',initialYen:'初期費用（税別）',baseMonthlyYen:'基本月額（税別）',unitMonthlyYen:'単位月額（税別）',minQuantity:'最小数量',maxQuantity:'最大数量',note:'申込メモ',supportNote:'atLIB対応メモ',reason:'理由',active:'有効',role:'権限',canOrder:'発注権限',at:'記録日時',receivedAt:'atLIB正式受付日時',submittedAt:'申込日時',approvedBy:'承認者',approvalMode:'承認方式',destination:'通知先種別',attempts:'配送試行回数',lastError:'配送結果',nextAt:'次回試行予定',externalId:'外部ID',customerCode:'顧客コード',evidence:'確認根拠',environment:'環境',verifiedAt:'確認日時'};if(map[k])pairs.push([map[k],states[v]||serviceName[v]||(typeof v==='boolean'?(v?'はい':'いいえ'):v)]);}
  const s=r.data.snapshot;if(s)pairs.push(['サービス',serviceName[s.service]],['数量',s.quantity],['基本月額（税別）',s.baseMonthlyYen],['単位月額（税別）',s.unitMonthlyYen],['初期費用（税別）',s.initialYen],['料金条件',s.conditions],['見積ID',s.estimate?.id||'—'],['請求数量の確定',s.billingQuantityConfirmed?'条件確認済み・本画面では請求しません':'未確定・請求禁止']);
  pairs.forEach(([k,v])=>{dl.append(el('dt',k),el('dd',v??'—'));});$('detailBody').append(dl);$('actions').replaceChildren();$('history').replaceChildren();$('detail').scrollIntoView({behavior:'smooth'});
 }
 async function detail(type,id){const r=await api('/'+(type==='order'?'orders':'applications')+'/'+encodeURIComponent(id));showRecord(r);if(type==='order')return;
  const history=await api('/applications/'+encodeURIComponent(id)+'/history');table(history,[['日時',r=>r.at],['変更',r=>({application_submitted:'申込受付',application_revised:'修正受付',application_return:'差戻し',application_cancel:'取消',application_ordered:'正式発注',application_note:'対応メモ'})[r.action]||r.action],['理由',r=>r.reason||'—']],$('history'));
  const memberships=session.memberships,associationRole=memberships.find(m=>m.associationId===r.associationId&&['association_admin','association_staff'].includes(m.data.role));const companyRole=memberships.some(m=>m.companyId===r.companyId&&m.data.role==='company_admin');
  if(['SUBMITTED','RETURNED'].includes(r.data.state)){
   $('actions').append(button('申込を取り消す',async()=>{const reason=prompt('取消理由');if(!reason)return;await api('/applications/'+id+'/transition',{version:r.version,action:'cancel',reason});await detail(type,id);await refresh();}));
   if(internal||associationRole)$('actions').append(button('差し戻す',async()=>{const reason=prompt('差戻し理由');if(!reason)return;await api('/applications/'+id+'/transition',{version:r.version,action:'return',reason});await detail(type,id);await refresh();}));
  }
  if(associationRole&&(associationRole.data.role==='association_admin'||associationRole.data.canOrder)&&r.data.state==='SUBMITTED')$('actions').append(button('正式発注を確認する',async()=>{if(!confirm('表示された数量・料金条件で組合からatLIBへ正式発注します。よろしいですか？'))return;const o=await api('/applications/'+id+'/order',{version:r.version,requestId:'order-'+id+'-'+r.version,mode:'MANUAL'});await detail('order',o.id);await refresh();}));
  if((companyRole||internal)&&r.data.state==='RETURNED')fieldForm($('actions'),[['termsId','修正後の承認済み条件ID'],['quantity','数量','number']],async d=>{if(!confirm('修正後の料金条件に同意して再申込しますか？'))return;await api('/applications/'+id+'/revise',{...d,version:r.version,acceptedTerms:true});await detail(type,id);},'修正して再申込');
  if(internal)fieldForm($('actions'),[['reason','対応メモ']],async d=>{await api('/applications/'+id+'/transition',{...d,version:r.version,action:'note'});await detail(type,id);},'対応記録を追加');
 }
 function setup(){}
 async function init(){session=await api('/session');csrf=session.csrf||'';if($('logout')){$('logout').hidden=false;$('logout').onclick=()=>perform(async()=>{await api('/logout',{});location.href='/pira/';});}
  const scopes=$('scope');scopes.replaceChildren();if(internal){const o=el('option','全組合');o.value='{}';scopes.append(o);for(const a of await api('/records/association')){const o=el('option',a.data.name);o.value=JSON.stringify({associationId:a.id});scopes.append(o);}}
  else for(const m of session.memberships){const o=el('option',(m.companyId?'自社：':'組合：')+(m.companyName||m.associationName||m.companyId||m.associationId));o.value=JSON.stringify(m.companyId?{companyId:m.companyId}:{associationId:m.associationId});scopes.append(o);}
  checkScope();scopes.onchange=()=>{checkScope();perform(refresh);};function checkScope(){scope=JSON.parse(scopes.value||'{}');}
  $('refresh').onclick=()=>perform(refresh);document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{kind=b.dataset.tab;perform(refresh);});$('back').onclick=()=>{$('detail').hidden=true;};setup();
  const company=session.memberships.find(m=>m.data.role==='company_admin');if(company||internal){$('applicationForm').hidden=false;let requestId=crypto.randomUUID();
   const affiliations=await api('/records/affiliation?'+(company?new URLSearchParams({companyId:company.companyId}):''));
   const form=fieldForm($('applyFields'),[['associationId','申込先の組合',affiliations.filter(a=>a.data.active).map(a=>[a.associationId,a.associationName||a.associationId])],['companyId','利用企業ID'],['termsId','申込条件',[]],['quantity','数量','number']],async d=>{const t=await api('/records/terms?'+new URLSearchParams({associationId:d.associationId,...(company?{companyId:company.companyId}:{})}));const offer=t.find(t=>t.id===d.termsId);if(!offer)throw Error('申込条件を確認できません');
    if(!confirm(serviceName[offer.data.service]+' 数量 '+d.quantity+'\n基本月額 '+offer.data.baseMonthlyYen+'円／単位月額 '+offer.data.unitMonthlyYen+'円（税別）\n'+offer.data.conditions+'\nこの条件に同意して申し込みますか？'))return;
    await api('/applications',{...d,requestId,acceptedTerms:true});requestId=crypto.randomUUID();},'条件を確認して申し込む');
   const loadOffers=async()=>{const aid=form.elements.associationId.value;if(!aid)return;const offers=await api('/records/terms?'+new URLSearchParams({associationId:aid,...(company?{companyId:company.companyId}:{})}));const select=form.elements.termsId;select.replaceChildren();for(const t of offers){const o=el('option',serviceName[t.data.service]+'：'+t.data.label);o.value=t.id;select.append(o);}};
   form.elements.associationId.onchange=()=>perform(loadOffers);if(company){form.elements.companyId.value=company.companyId;form.elements.companyId.readOnly=true;}await loadOffers();
  }
  await refresh();const q=new URLSearchParams(location.search);if(q.get('application'))await detail('application',q.get('application'));if(q.get('order'))await detail('order',q.get('order'));message('表示範囲の情報を読み込みました。');
 }
 perform(init);
})();
