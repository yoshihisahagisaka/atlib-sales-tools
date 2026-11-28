'use strict';
document.addEventListener('DOMContentLoaded', () => {
 const guide=document.getElementById('secumie-guide'), intake=document.getElementById('general-intake'), form=document.getElementById('general-form'), status=document.getElementById('general-status');
 const web=location.pathname.startsWith('/secumie-web/');
 const consultation=document.createElement('section');
 consultation.id='consultation-guide'; consultation.className='page'; consultation.hidden=true;
 consultation.innerHTML='<div class="form-card"><button type="button" class="back-to-guide" id="consult-back">← 診断結果に戻る</button><div class="general-brand"><h1>'+ (web?'SECU:MIE WEB':'SECU:MIE Insight') +'</h1><p>無料相談のご案内</p></div><h2 tabindex="-1" id="consult-heading">診断結果を知ることから、具体的な対策へ。</h2><p>診断結果を見て、何から対策すればよいのか、どこまで対応すべきなのか、迷われていませんか？</p><p>atLIBでは、御社の業務やIT環境に合わせて、必要なセキュリティ対策を一緒に考えます。</p><section class="guide-section"><h2>このようなご相談を承ります</h2><div class="guide-grid"><div class="guide-item"><h3>診断結果の見方が分からない</h3><p>診断結果の意味や確認すべきポイントをご説明します。</p></div><div class="guide-item"><h3>何から対策すればよいか分からない</h3><p>御社の状況に合わせて、対策の方向性や優先順位を整理します。</p></div><div class="guide-item"><h3>自社だけでの対応が難しい</h3><p>具体的な対策方法や、必要な支援についてご案内します。</p></div></div></section><section class="guide-section"><h2>ご相談いただける内容</h2><ul>'+ (web?'<li>Webサイトのセキュリティ設定</li><li>メールのなりすまし対策</li><li>診断で確認された設定の改善</li><li>Web・メール環境の見直し</li><li>技術的なセキュリティ支援</li>':'<li>情報セキュリティ対策の進め方</li><li>社内ルール・運用体制の整備</li><li>従業員へのセキュリティ教育</li><li>SCS評価制度への対応</li><li>継続的なセキュリティ管理支援</li>') +'</ul></section><section class="guide-section"><h2>無料相談の流れ</h2><ol class="guide-steps"><li><span class="step-number">01</span><strong>相談のお申し込み</strong></li><li><span class="step-number">02</span><strong>ご希望の日程を選択</strong></li><li><span class="step-number">03</span><strong>オンラインでのご相談</strong></li></ol></section><div class="guide-bottom-action"><p>診断結果や企業情報を再入力する必要はありません。</p><button class="primary-action" id="consult-apply" type="button" disabled>無料相談を申し込む →</button><p id="consult-status" role="status">相談受付の接続準備中です。</p></div></div>';
 const pageFooter=web?document.querySelector('body > footer'):null;
 document.body.insertBefore(consultation,pageFooter);
 // Presentation only: no fabricated per-check completion or server delay.
 const progress=document.createElement('section');
 progress.id='diagnosis-progress';progress.className='page';progress.hidden=true;
 progress.innerHTML='<div class="form-card diagnosis-progress-card" role="status" aria-live="polite"><h2 id="diagnosis-progress-heading" tabindex="-1">'+(web?'セキュリティ設定を確認しています':'回答内容を整理しています')+'</h2><p>'+(web?'Webサイトとメールの公開設定を確認し、レポートを準備しています。':'回答に関連する知識や実務資料を整理し、レポートを準備しています。')+'</p><div class="diagnosis-progress-track" role="progressbar" aria-labelledby="diagnosis-progress-heading"><span></span></div><p class="diagnosis-progress-note">結果が準備でき次第、自動的に表示します。</p></div>';
 document.body.insertBefore(progress,pageFooter);
 const showProgress=()=>{progress.hidden=false;progress.querySelector('h2').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});return performance.now();};
 const waitMinimum=started=>new Promise(resolve=>setTimeout(resolve,Math.max(0,3000-(performance.now()-started))));
 const finishProgress=()=>{progress.hidden=true;window.scrollTo({top:0,behavior:'instant'});};

 let returnTarget=null, receipt=null, leadReceipt=null, companyData=null, insightAnswers=null, requestKey=null, requestFingerprint=null;
 const apply=document.getElementById('consult-apply');
 const consultStatus=document.getElementById('consult-status');
 const formView=document.createElement('section');formView.className='page';formView.hidden=true;formView.id='consultation-form-view';
 formView.innerHTML=`<div class="form-card"><button class="back-to-guide" type="button" id="consult-form-back">← 無料相談のご案内に戻る</button><h1>無料相談のお申し込み</h1><div class="privacy-box"><strong>診断から引き継ぐ情報</strong><p id="consult-company"></p><p>診断結果は再入力不要です。</p></div><p class="required-note">赤色の＊は必須項目です。</p><form id="consultation-form"><div class="field"><label for="consult-name">ご担当者名 <span class="required-mark" aria-hidden="true">＊</span></label><input id="consult-name" name="personName" maxlength="150" autocomplete="name" required></div><div class="field"><label for="consult-email">メールアドレス <span class="required-mark" aria-hidden="true">＊</span></label><input id="consult-email" name="email" type="email" maxlength="254" autocomplete="email" required></div><div class="field"><label for="consult-phone">電話番号 <span class="required-mark" aria-hidden="true">＊</span></label><input id="consult-phone" name="phone" type="tel" maxlength="50" autocomplete="tel" required></div><div class="field"><label for="consult-note">ご相談内容（任意）</label><textarea id="consult-note" name="note" maxlength="2000" rows="4"></textarea></div><div class="privacy-box"><label class="privacy-label"><input type="checkbox" name="consent" required>診断結果と入力情報を相談対応のためにatLIBへ提供することに同意します。<span class="required-mark" aria-hidden="true">＊</span></label><p><a href="https://www.atlib.jp/privacy-policy/" target="_blank" rel="noopener noreferrer">プライバシーポリシー</a></p></div><button type="submit">相談を申し込み、日程調整へ進む</button><p id="consult-form-status" role="status" aria-live="polite"></p></form></div>`;
 document.body.insertBefore(formView,pageFooter);
 const cf=document.getElementById('consultation-form');
 document.getElementById('consult-form-back').onclick=()=>{formView.hidden=true;consultation.hidden=false;apply.focus();};
 apply.onclick=()=>{if(!receipt||(!web&&!insightAnswers))return;document.getElementById('consult-company').textContent=[companyData.companyName,web?companyData.targetUrl:''].filter(Boolean).join(' ／ ');document.getElementById('consult-name').value=companyData.personName||'';document.getElementById('consult-email').value=companyData.email||'';document.getElementById('consult-phone').value=companyData.phone||'';consultation.hidden=true;formView.hidden=false;cf.querySelector('input').focus();window.scrollTo(0,0);};
 cf.addEventListener('submit',async event=>{event.preventDefault();const button=cf.querySelector('button[type=submit]'),msg=document.getElementById('consult-form-status');if(button.disabled||!receipt||!cf.reportValidity())return;const d=Object.fromEntries(new FormData(cf));button.disabled=true;msg.textContent='受付中です…';try{const response=await fetch((web?'/secumie-web':'/secumie-insight')+'/api/consultation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({receipt,personName:d.personName,email:d.email,phone:d.phone,note:d.note,accepted:d.consent==='on',...(!web?{answers:insightAnswers}:{})}),signal:AbortSignal.timeout(55000)});const result=await response.json();if(!response.ok||!result.ok)throw Error(response.status===410?'診断情報の保持期限が切れました。再度診断を行ってください。':'受付を完了できませんでした。時間をおいて再度お試しください。');const url=new URL(result.scheduleUrl);if(url.protocol!=='https:'||url.hostname!=='timerex.net'||!url.pathname.startsWith('/s/')||url.username||url.password||url.port)throw Error('日程調整先を確認できませんでした。');location.assign(url.href);}catch(error){msg.textContent=error.message||'通信に失敗しました。';button.disabled=false;}});

 const openGuide=(target)=>{returnTarget=target;apply.disabled=!receipt||(!web&&!insightAnswers);consultStatus.textContent=apply.disabled?'相談受付を利用できません。':'';target.hidden=true;if(web)target.closest('main').hidden=true;consultation.hidden=false;document.getElementById('consult-heading').focus();window.scrollTo(0,0);};
 document.getElementById('consult-back').onclick=()=>{consultation.hidden=true;if(returnTarget){returnTarget.hidden=false;if(web)returnTarget.closest('main').hidden=false;returnTarget.querySelector('.consult-guide-trigger')?.focus();}};
 const addGuide=(target,container)=>{if(container.querySelector('.consult-guide-trigger'))return;const button=document.createElement('button');button.type='button';button.className='primary-action consult-guide-trigger';button.textContent='診断結果を今後の対策に活かしませんか？';button.onclick=()=>openGuide(target);container.append(button);};

 // General Insight presentation: keep the shared questions, evaluation and union report untouched.
 const enhanceInsight=(app,answers)=>{
  const report=app.querySelector('.v7-prototype');
  const content=window.PiraV6Content;
  if(!report||!content||!Array.isArray(answers)||report.classList.contains('general-insight-report'))return;
  const services='https://www.atlib.jp/services/';
  const consulting=services+'security-consulting/';
  const support={
   T01:{name:'セキュリティコンサルティング',url:consulting,detail:'情報の保管・廃棄ルールを、実際の業務に合わせて整備する支援です。'},
   T02:{name:'atLIB Secure Send',url:services+'#secure-send',detail:'PPAPに代わるファイル送受信の仕組みについてご相談いただけます。宛先確認や共有権限の管理も引き続き大切です。'},
   T03:{name:'情シスアウトソーシング',url:services+'#it-bpo',detail:'入退社・異動時のアカウント停止、権限変更など、日常のIT運用を支援します。'},
   T04:{name:'IT構築・運用支援',url:services+'#it-projects',detail:'利用中のサービスに合わせ、多要素認証の設定や導入・運用方法を検討します。'},
   T05:{name:'情シスアウトソーシング',url:services+'#it-bpo',detail:'端末の更新状況の把握や、継続的なIT運用の仕組みづくりを支援します。'},
   T06:{name:'IT構築・運用支援',url:services+'#it-projects',detail:'業務に合わせたバックアップ・復元確認の仕組みを整備します。',extra:{name:'atLIB Secure Guard',url:services+'#secure-guard',detail:'危険な接続先への通信をDNSで防ぐ補助対策です。バックアップの代替ではありません。'}},
   T07:{name:'セキュリティコンサルティング',url:consulting,detail:'振込先変更の別経路確認など、業務ルールや確認手順を整備します。',extra:{name:'atLIB Secure Guard',url:services+'#secure-guard',detail:'危険なサイトへの接続を防ぐ補助的な対策です。振込先の確認手順を置き換えるものではありません。'}},
   T08:{name:'セキュリティコンサルティング',url:consulting,detail:'事故時の連絡先、初動手順、対応記録といった運用体制を整える支援です。'}
  };
  const guidance={READY:'今の取り組みを継続するための支援',PARTIAL:'取り組みの範囲を広げるための支援',NOT_DONE:'仕組みづくりからの支援',UNKNOWN:'現状を確認するための支援',DELEGATED:'担当者・保守会社との確認を進めるための支援'};
  const node=(tag,cls,txt)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(txt!==undefined)el.textContent=txt;return el;};
  const link=(label,url)=>{const a=node('a','insight-service-link',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};
  const answerMap=new Map(answers.map(a=>[a.questionId,a.answerId]));
  const getOption=id=>content.questions.find(q=>q.id===id)?.options.find(o=>o.id===answerMap.get(id));
  report.classList.add('general-insight-report');
  const summary=report.querySelector('.result-page');
  const table=summary?.querySelector('table');
  if(summary&&table){
   const greeting=summary.querySelector('.v7-greeting');
   if(greeting)greeting.replaceChildren(node('p','','8つの回答をもとに、日常業務で見直すポイントと関連する支援をご紹介します。安全性の採点や、対策の実施状況を保証するものではありません。'));
   const themes=summary.querySelector('.v7-theme-list');
   if(themes&&themes.previousElementSibling){const title=themes.previousElementSibling;greeting?.after(title,themes);}
   const heading=table.previousElementSibling;
   if(heading)heading.textContent='8つの回答と関連する支援';
   Array.from(table.querySelectorAll('tbody tr')).forEach((row,index)=>{
    const q=content.questions[index],option=q&&getOption(q.id),entry=q&&support[q.id],cell=row.cells[2];
    if(!q||!option||!entry||!cell)return;
    row.dataset.questionId=q.id;row.dataset.answerState=option.state;
    row.cells[1].prepend(node('strong','insight-question-theme',content.themes[q.id].title));
    const info=node('div','insight-answer-support');
    if(option.state==='NOT_APPLICABLE')info.append(node('span','insight-support-context','今回の回答では対象外'));
    else{info.append(node('span','insight-support-context',guidance[option.state]||'関連する支援'),link(entry.name,entry.url));}
    cell.append(info);
   });
  }
  report.querySelectorAll('.theme-page:not(.v7-reference)').forEach(page=>{
   const title=page.querySelector('.v7-title-content h1')?.textContent;
   const id=Object.keys(support).find(k=>content.themes[k]?.title===title);
   const option=id&&getOption(id),entry=id&&support[id];
   if(!id||!option||!entry)return;
   page.dataset.questionId=id;
   const intro=page.querySelector('.v7-intro');
   if(intro){const box=node('div','insight-own-answer');box.append(node('span','insight-small-label','今回の御社の回答'),node('strong','',option.label));intro.before(box);box.append(intro);}
   const sections=Array.from(page.querySelectorAll(':scope > section'));
   sections.forEach(section=>{const h=section.querySelector('h2');if(!h)return;if(h.textContent==='基本的な知識')section.classList.add('insight-knowledge');else if(/^(実際に|身近な)/.test(h.textContent))section.classList.add('insight-case');else if(h.textContent==='日常業務での確認')section.classList.add('insight-action');});
   page.querySelectorAll('.v7-principles li').forEach((li,index)=>{
    const original=li.textContent;const parts=original.split(/[：:]/);const head=parts.shift();
    li.replaceChildren(node('span','insight-point-number',String(index+1).padStart(2,'0')),node('strong','',head||original));
    if(parts.length)li.append(node('span','insight-point-detail',parts.join('：')));
   });
   const tools=page.querySelector('.v7-tools');
   if(id==='T06'){
    const impact=page.querySelector('.v7-impact-cards');
    const source=page.querySelector('.v7-source');
    if(impact&&source)impact.before(source);
    if(tools)tools.remove();
   }else if(tools){const toolLink=tools.querySelector('.v7-tool-label');const action=page.querySelector('.insight-action');if(toolLink&&action){action.append(toolLink);tools.remove();}else{tools.replaceChildren(node('h2','','日常業務に役立つツール'));if(toolLink)tools.append(toolLink);}}
   if(option.state!=='NOT_APPLICABLE'){
    const card=node('aside','insight-related-service');card.append(node('span','insight-small-label',guidance[option.state]||'関連する支援'),link(entry.name,entry.url),node('p','',entry.detail));
    if(entry.extra)card.append(link(entry.extra.name,entry.extra.url),node('p','',entry.extra.detail));
    page.append(card);
   }
  });
  const reference=report.querySelector('.v7-reference .v7-management-grid');
  if(reference){reference.replaceChildren(...[['技術','機器・システムの対策'],['運用','日常の点検・更新・教育'],['管理','ルール・役割・改善']].map(([a,b])=>{const item=node('span','');item.append(node('strong','',a),node('small','',b));return item;}));}
  const tools=report.querySelector('.v7-tools-page');
  if(tools){const education=tools.querySelector('#tool-EDUCATION h2');if(education)education.textContent='従業員向け情報セキュリティ教育資料';}
  const final=node('section','v7-page insight-consulting-page');final.id='insight-consulting';
  const header=node('header','v7-title-card');const title=node('div','v7-title-content');title.append(node('span','','atLIB SECURITY CONSULTING'),node('h1','','知ることから、守る仕組みづくりまで。'),node('p','','企業全体のセキュリティ対策を、一緒に考えます。'));header.append(title);final.append(header);
  final.append(node('p','insight-consulting-lead','個別の対策だけでなく、技術・運用・管理を組み合わせ、御社の事業やIT環境に合った仕組みを整えることが大切です。'));
  const pillars=node('div','insight-pillars');[['技術','必要な機器・システム対策'],['運用','点検・更新・教育を日常業務に'],['管理','ルール・責任体制と継続改善']].forEach(([a,b])=>{const c=node('div','');c.append(node('strong','',a),node('span','',b));pillars.append(c);});const diagram=node('div','insight-consulting-diagram');diagram.append(pillars);const connector=node('div','insight-diagram-connector');connector.setAttribute('aria-hidden','true');diagram.append(connector,node('strong','insight-diagram-center','企業全体のセキュリティ対策'));final.append(diagram,node('h2','','atLIBのセキュリティコンサルティング'));
  final.append(node('p','','認証取得の先に、現場で機能する仕組みを。書類を整えるだけでなく、実際に運用できる情報管理・セキュリティ体制の構築を支援します。'));
  const steps=node('ol','insight-consulting-steps');[['現状把握','業務・IT環境・管理体制を確認'],['課題整理','必要な対策と優先順位を整理'],['体制・ルール整備','企業の実態に合った仕組みづくり'],['運用定着','継続的な運用・改善を支援']].forEach(([a,b],i)=>{const li=node('li','');li.append(node('span','insight-point-number',String(i+1).padStart(2,'0')),node('strong','',a),node('span','',b));steps.append(li);});final.append(steps);
  final.append(node('h2','','認証取得・評価制度への対応もご相談ください'));
  const scopes=node('div','insight-cert-links');[['ISMS取得・運用体制整備','#isms-support'],['Pマーク取得支援','#pmark-support'],['SecureNavi導入支援','#securenavi-support'],['SCS評価制度対応支援','#scs-support']].forEach(([label,fragment])=>scopes.append(link(label,consulting+fragment)));final.append(scopes);
  const next=node('div','insight-consulting-next');next.append(node('h2','','何から始めればよいか分からない企業様へ'),node('p','','診断結果をもとに、御社に必要な対策を一緒に整理します。無料相談では今回の回答を引き継げます。'),link('セキュリティコンサルティングの詳細を見る',consulting));final.append(next);
  const printContact=node('p','insight-print-contact');printContact.append(node('span','','atLIB株式会社　ご相談・お問い合わせ：'),link('www.atlib.jp/contact/','https://www.atlib.jp/contact/'));final.append(printContact);
  report.append(final);addGuide(app,next);
 };
 const persistResult=async(target,answers,alreadySaved=false)=>{
  if(alreadySaved||!leadReceipt)return;
  const previous=target.querySelector('.general-save-status');if(previous)previous.remove();
  const box=document.createElement('div');box.className='general-save-status';box.setAttribute('role','status');
  const msg=document.createElement('span'),retry=document.createElement('button');retry.type='button';retry.textContent='保存を再試行';box.append(msg,retry);target.prepend(box);
  const ownReceipt=leadReceipt;
  const attempt=async()=>{retry.disabled=true;msg.textContent='診断情報を保存しています。';try{
   const response=await fetch((web?'/secumie-web':'/secumie-insight')+'/api/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({leadReceipt:ownReceipt,...(!web?{answers}:{})}),signal:AbortSignal.timeout(10000)});
   if(response.ok){box.remove();return;}
   if(response.status===409||response.status===410){msg.textContent='診断結果は閲覧・保存できますが、受付への結果保存は完了していません。再診断が必要な場合があります。';retry.hidden=true;return;}
   throw Error();
  }catch{msg.textContent='診断情報の保存が完了していません。レポートは無料で閲覧・PDF保存できます。';retry.disabled=false;}};
  retry.onclick=attempt;await attempt();
 };
 if(!web)document.addEventListener('pira:v7-report-rendered',async event=>{
  insightAnswers=event.detail?.answers??null;
  const app=document.getElementById('app');const toolbar=app.querySelector('.v7-toolbar');if(toolbar)addGuide(app,toolbar);enhanceInsight(app,insightAnswers);
  app.hidden=true;const started=showProgress();await waitMinimum(started);
  finishProgress();app.hidden=false;toolbar?.querySelector('button')?.focus({preventScroll:true});void persistResult(app,insightAnswers);
 });

 document.querySelectorAll('[data-secumie-open-form]').forEach(b=>b.addEventListener('click',()=>{guide.hidden=true;intake.hidden=false;form.querySelector('input').focus();}));
 document.getElementById('back-guide').addEventListener('click',()=>{intake.hidden=true;guide.hidden=false;});
 form.addEventListener('submit',async event=>{
  event.preventDefault(); const button=form.querySelector('button[type=submit]'); if(button.disabled||!form.reportValidity())return;
  const token=window.turnstile?.getResponse(); if(!token){status.textContent='確認が完了していません。';return;}
  const data=Object.fromEntries(new FormData(form)); delete data['cf-turnstile-response'];data.salesContactAllowed=data.salesContactAllowed==='on';const fingerprint=JSON.stringify(data);if(fingerprint!==requestFingerprint||!requestKey){requestKey=crypto.randomUUID();requestFingerprint=fingerprint;}
  button.disabled=true; status.textContent='診断を開始しています…';
  let started=null;
  if(web){intake.hidden=true;started=showProgress();}
  try{
   const response=await fetch((web?'/secumie-web':'/secumie-insight')+'/api/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,idempotencyKey:requestKey,accepted:true,turnstileToken:token}),signal:AbortSignal.timeout(65000)});
   const result=await response.json(); if(!response.ok||!result.ok)throw Error(response.status===503?'受付情報を保存できませんでした。時間をおいて再試行してください。':response.status===429?'利用上限に達しました。時間をおいて再度お試しください。':'診断を開始できませんでした。入力内容をご確認ください。');
   receipt=result.receipt??null;leadReceipt=result.leadReceipt??null;companyData=data;
   if(web){await waitMinimum(started);finishProgress();const frame=document.getElementById('report-frame');frame.srcdoc=result.html.replace('<button class="print-button" aria-label="印刷またはPDFで保存" onclick="window.print()">▣ PDFで保存・印刷</button>','');document.getElementById('web-result').hidden=false;document.getElementById('print-result').onclick=()=>frame.contentWindow.print();intake.hidden=true;const target=document.getElementById('web-result');addGuide(target,document.getElementById('web-result-actions'));addGuide(target,document.getElementById('web-result-actions-bottom'));void persistResult(target,null,result.leadSaved===true);}
   else {document.getElementById('general-entry').hidden=true;document.getElementById('app').hidden=false;window.PiraV7PublicApp.start();document.getElementById('start').click();}
  }catch(error){if(web){finishProgress();intake.hidden=false;}status.textContent=error.message||'通信に失敗しました。';status.scrollIntoView({block:'nearest'});}finally{button.disabled=false;window.turnstile?.reset();}
 });
});
