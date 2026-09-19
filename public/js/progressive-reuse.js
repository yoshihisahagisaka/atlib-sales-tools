'use strict';
(()=>{
 const root=document.getElementById('progressive-reuse');if(!root)return;
 const id=new URLSearchParams(location.search).get('id'),base='/api/admin/it-management-diagnosis/cases/'+encodeURIComponent(id);
 const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 let data,busy=false,serial=0,editing=false;
 const error=node('p','');error.setAttribute('role','alert');root.append(error);
 const content=node('div','');root.append(content);
 async function api(path,body){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Diagnosis-Command':'1'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});const d=r.status===204?null:await r.json();if(!r.ok)throw Error(d.error||'読み込み・保存に失敗しました。');return d;}
 const link=(text,page,hash='')=>{const a=node('a',text);a.href='/admin/it-management-diagnosis-'+page+'.html?id='+encodeURIComponent(id)+hash;return a;};
 function button(text,fn,blocked=false){const b=node('button',text);b.type='button';b.className='btn btn-secondary';b.dataset.blocked=String(blocked||busy);b.disabled=blocked||busy;b.onclick=fn;return b;}
 function trace(e){const d=node('details','');d.append(node('summary','もとになった情報を見る'),node('p',e.origin_label),node('p',e.recorded_at?'記録日時：'+new Date(e.recorded_at).toLocaleString('ja-JP'):'記録日時：未記録'));
  if(e.occurred_at)d.append(node('p','会話・取得日時：'+new Date(e.occurred_at).toLocaleString('ja-JP')));
  if(e.actor)d.append(node('p','記録した担当者：'+e.actor));
  d.append(node('p','取得時点の記録です。現在も同じかは、必要に応じて担当者が確認してください。'));
  if(['customer_statements','unknowns','salesperson_notes'].includes(e.origin.kind)){const a=node('a','元の営業会話を見る');a.href='/admin/sales-conversation.html?id='+encodeURIComponent(e.origin.id);d.append(a);}
  return d;
 }
 function entry(e){const card=node('section','');card.className='reuse-entry';card.dataset.reuseKey=e.key;card.append(node('h4',e.title),node('p',e.text),trace(e));return card;}
 async function command(path,body){if(busy)return;busy=true;error.textContent='';root.querySelectorAll('button').forEach(b=>{b.disabled=true;b.dataset.blocked='true';});try{await api(path,body);editing=false;await load(true);window.dispatchEvent(new Event('reuse-changed'));}catch(e){error.textContent=e.message;}finally{busy=false;root.querySelectorAll('button').forEach(b=>{b.disabled=false;b.dataset.blocked='false';});}}
 function choose(candidate){
  if(busy)return;editing=true;const form=node('form','');form.className='reuse-editor';form.id='reuse-editor';
  form.append(node('h3','今回確認する内容を決める'),node('p','元の未確認事項：'+candidate.text));
  const label=node('label','次の会話で確認する内容'),text=node('textarea','');text.id='reuse-question';text.maxLength=2000;text.required=true;label.htmlFor=text.id;
  const purposeLabel=node('label','確認する目的'),purpose=node('textarea','');purpose.id='reuse-purpose';purpose.maxLength=2000;purposeLabel.htmlFor=purpose.id;
  const themeLabel=node('label','目指している会社の姿との関係'),theme=document.createElement('select');theme.id='reuse-theme';themeLabel.htmlFor=theme.id;
  theme.append(new Option('案件全体（目的を記入してください）',''),...data.themes.map(t=>new Option(t.title+' — '+t.future_relation,t.id)));
  form.append(label,text,purposeLabel,purpose,themeLabel,theme);
  const save=node('button','今回確認する内容に追加');save.type='submit';save.className='btn';
  form.append(save,button('今回は追加しない',()=>{editing=false;form.remove();}));
  form.onsubmit=e=>{e.preventDefault();void command('/progressive-reuse/select',{candidateKey:candidate.key,expectedVersion:data.version,plan:{text:text.value,purpose:purpose.value,item_type:'CONFIRMATION',diagnosis_theme_id:theme.value||null}});};
  content.querySelector('#reuse-editor')?.remove();content.prepend(form);text.focus();form.scrollIntoView({block:'center'});
 }
 function render(){
  content.replaceChildren();content.append(node('h2','次に確認すること'),node('p','取得済みの内容を踏まえて、今回の会話で確認する内容を担当者が選びます。候補をすべて質問する必要はありません。'));
  const future=node('section','');future.append(node('h3','目指している会社の姿'),node('p',data.future||'回答や会話の記録を確認してください。まだ確定していない内容は推測しません。'));content.append(future);
  const next=node('div','');next.id='reuse-next';
  const status=data.diagnosis_status;
  if(['APPLICATION_STARTED','SURVEY_IN_PROGRESS'].includes(status))next.append(node('p','保存済みの回答は引き継いでいます。まず、足りない回答だけ確認してください。「分からない」も有効な回答です。'),link('足りない回答を確認する','new','&missingOnly=1'));
  else if(status==='SURVEY_COMPLETED')next.append(node('p','無料診断の準備を始め、次に確認する内容を選びます。'),link('追加で確認する内容を選ぶ','preparation'));
  else if(status==='PREPARATION_IN_PROGRESS')next.append(node('p','候補から今回確認する内容を選び、テーマとの関係を確認してから確定してください。'),link('テーマと確認内容を確定する','preparation','#human-editor'));
  else if(['READY_FOR_DIAGNOSIS','DIAGNOSIS_IN_PROGRESS'].includes(status))next.append(node('p','担当者が選んだ内容を追加確認で使います。発言を記録しても、未確認事項が自動で解消されることはありません。'),link('追加確認で使う','workspace'));
  else next.append(node('p','追加確認の結果と未確認の内容は、担当者が既存の分析内容の確認で判断します。'),link('追加確認の結果を確認する','review'));
  content.append(next);
  const selected=node('section','');selected.id='reuse-selected';selected.append(node('h3','担当者が今回確認する内容'));
  for(const p of data.plans){const card=node('section','');card.className='reuse-entry';card.dataset.planId=p.id;card.append(node('h4',p.text),node('p',p.purpose||''));if(p.future_relation)card.append(node('p','目指している会社の姿との関係：'+p.future_relation));
   if(p.results.length){const d=node('details','');d.append(node('summary','追加確認で記録した発言を見る'));for(const s of p.results)d.append(node('p',s.text));card.append(node('p','この内容に関する発言が記録されています。再質問する前に内容を確認してください。'),d);}
   if(status==='DIAGNOSIS_IN_PROGRESS')card.append(button('この内容を確認して記録する',()=>{if(document.getElementById('statement-content')){window.dispatchEvent(new CustomEvent('reuse-record',{detail:p}));}else location.assign('/admin/it-management-diagnosis-workspace.html?id='+encodeURIComponent(id)+'&plan='+encodeURIComponent(p.id));}));
   if(data.can_remove)card.append(button('今回は確認しない',()=>{if(window.confirm('今回の確認内容から外します。元の未確認事項はそのまま残ります。'))void command('/preparation/plan-items/'+encodeURIComponent(p.id)+'/remove',{});}));
   selected.append(card);
  }
  if(!data.plans.length)selected.append(node('p','今回確認する内容はまだ選ばれていません。下の候補を確認してください。'));
  content.append(selected);
  const candidates=node('details','');candidates.id='reuse-candidates';candidates.open=!data.plans.length;candidates.append(node('summary','追加確認の候補を選ぶ'));
  for(const e of data.candidates){const card=entry(e);if(e.selected_plan_id)card.append(node('p','今回確認する内容に選択済み'));else if(data.can_select)card.append(button('今回確認する',()=>choose(e)));else card.append(node('p','元の情報を確認し、診断準備または追加確認の開始後に担当者が選びます。'));candidates.append(card);}
  if(!data.candidates.length)candidates.append(node('p','記録から抽出できる未確認の候補はありません。必要な追加確認は担当者が既存の入力欄から追加できます。'));
  content.append(candidates);
  const groups=node('div','');groups.className='reuse-groups';
  for(const [key,title,hint] of [['known','今、確認できていること','回答・発言を取得できた内容です。内容の正しさや現在の有効性を確定したものではありません。'],['unknown','まだ分かっていないこと','未回答と、確認しても分からない内容を区別して残します。'],['hypotheses','私たちの仮説・気づき','担当者やシステム／AI側の解釈・観察です。顧客の発言とは別に扱います。']]){
   const group=node('section','');group.id='reuse-'+key;group.append(node('h3',title),node('p',hint),...data[key].map(entry));if(!data[key].length)group.append(node('p','表示できる記録はありません。'));groups.append(group);
  }
  if(data.intake_redacted)content.append(node('p','開始前の営業会話の内容は削除済みです。未記録とは区別して扱います。'));
  content.append(groups);
 }
 async function load(force=false){if(editing&&!force)return;const request=++serial;try{const result=await api('/progressive-reuse');if(request!==serial)return;data=result;error.textContent='';render();}catch(e){error.textContent=e.message;}}
 window.addEventListener('diagnosis-data-loaded',()=>{void load();});
 window.addEventListener('beforeunload',e=>{if(editing&&content.querySelector('textarea')?.value.trim()){e.preventDefault();e.returnValue='';}});
 void load();
})();
