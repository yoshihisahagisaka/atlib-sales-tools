(()=>{
  const api='/api/admin/pira/v1';
  const form=document.querySelector('#filters'),body=document.querySelector('#items'),status=document.querySelector('#status');
  const dialog=document.querySelector('#detail'),detailTitle=document.querySelector('#detail-title'),detailBody=document.querySelector('#detail-body');
  const toolbar=document.querySelector('#export-toolbar');
  const kindLabels={UNION:'国連協',GENERAL:'一般向け'};
  const stateLabels={RECEIVED:'受付済み',ANSWERING:'診断中',COMPLETED:'診断完了'};
  const text=(tag,value)=>{const element=document.createElement(tag);element.textContent=value??'';return element};
  const display=value=>value===null||value===undefined||value===''?'―':String(value);
  const date=value=>value?new Date(value).toLocaleString('ja-JP'):'―';
  const filters=()=>Object.fromEntries([...new FormData(form)].filter(([,value])=>value));
  const qs=()=>new URLSearchParams(filters()).toString();
  async function json(url,options){const response=await fetch(url,options);if(!response.ok)throw Error((await response.json()).error?.code||'ERROR');return response.json()}
  function section(title,fields){const section=document.createElement('section');section.className='detail-section';section.append(text('h3',title));const list=document.createElement('dl');for(const [label,value] of fields){list.append(text('dt',label),text('dd',display(value)))}section.append(list);return section}
  async function load(){const data=await json(`${api}/submissions?${qs()}`);body.replaceChildren(...data.items.map(item=>{const row=document.createElement('tr');const values=[date(item.received_at),item.initiative_name,kindLabels[item.initiative_kind]||item.initiative_kind,stateLabels[item.state]||item.state,item.company_name,item.contact_name,item.sales_use_allowed?'利用可':'利用不可'];for(const value of values)row.append(text('td',value));row.tabIndex=0;row.onclick=()=>show(item.submission_id);row.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();show(item.submission_id)}};return row}));status.textContent=`${data.total}件`}
  async function show(id){const item=await json(`${api}/submissions/${id}`);detailTitle.textContent=display(item.company_name);detailBody.replaceChildren(section('企業情報',[
    ['企業名',item.company_name],['担当者名',item.contact_name],['認証済みメールアドレス',item.verified_email],['WebサイトURL',item.website_url],['電話番号',item.phone],['所属組合名',item.union_name],['住所',item.address]
  ]),section('診断受付情報',[
    ['施策',item.initiative_name],['受付日時',date(item.received_at)],['診断状態',stateLabels[item.state]||item.state],['同意日時',date(item.consented_at)],['同意バージョン',item.consent_version],['営業利用可否',item.sales_use_allowed?'利用可':'利用不可']
  ]));dialog.showModal()}
  async function initiatives(){const data=await json(`${api}/initiatives`),select=form.elements.initiativeCode;for(const item of data.items){const option=document.createElement('option');option.value=item.initiative_code;option.textContent=item.display_name;select.append(option)}}
  async function permissions(){const response=await fetch(`${api}/retention-candidates`);if(response.ok){toolbar.hidden=false;return}if(response.status===403){toolbar.hidden=true;return}throw Error('PERMISSION_CHECK_FAILED')}
  async function output(format){const response=await fetch(`${api}/exports`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({format,filters:filters()})});if(!response.ok){status.textContent=`出力失敗: ${(await response.json()).error?.code}`;return}const link=document.createElement('a');link.href=URL.createObjectURL(await response.blob());link.download=`pira-submissions.${format.toLowerCase()}`;link.click();URL.revokeObjectURL(link.href)}
  form.onsubmit=event=>{event.preventDefault();load().catch(error=>status.textContent=error.message)};
  document.querySelector('#csv').onclick=()=>output('CSV');document.querySelector('#xlsx').onclick=()=>output('XLSX');document.querySelector('#close').onclick=()=>dialog.close();
  Promise.all([permissions(),initiatives()]).then(load).catch(error=>status.textContent=error.message);
})();
