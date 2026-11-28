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

 let returnTarget=null, receipt=null, companyData=null, insightAnswers=null;
 const apply=document.getElementById('consult-apply');
 const consultStatus=document.getElementById('consult-status');
 const formView=document.createElement('section');formView.className='page';formView.hidden=true;formView.id='consultation-form-view';
 formView.innerHTML=`<div class="form-card"><button class="back-to-guide" type="button" id="consult-form-back">← 無料相談のご案内に戻る</button><h1>無料相談のお申し込み</h1><div class="privacy-box"><strong>診断から引き継ぐ情報</strong><p id="consult-company"></p><p>診断結果は再入力不要です。</p></div><p class="required-note">赤色の＊は必須項目です。</p><form id="consultation-form"><div class="field"><label for="consult-name">ご担当者名 <span class="required-mark" aria-hidden="true">＊</span></label><input id="consult-name" name="personName" maxlength="150" autocomplete="name" required></div><div class="field"><label for="consult-email">メールアドレス <span class="required-mark" aria-hidden="true">＊</span></label><input id="consult-email" name="email" type="email" maxlength="254" autocomplete="email" required></div><div class="field"><label for="consult-phone">電話番号 <span class="required-mark" aria-hidden="true">＊</span></label><input id="consult-phone" name="phone" type="tel" maxlength="50" autocomplete="tel" required></div><div class="field"><label for="consult-note">ご相談内容（任意）</label><textarea id="consult-note" name="note" maxlength="2000" rows="4"></textarea></div><div class="privacy-box"><label class="privacy-label"><input type="checkbox" name="consent" required>診断結果と入力情報を相談対応のためにatLIBへ提供することに同意します。<span class="required-mark" aria-hidden="true">＊</span></label><p><a href="https://www.atlib.jp/privacy-policy/" target="_blank" rel="noopener noreferrer">プライバシーポリシー</a></p></div><button type="submit">相談を申し込み、日程調整へ進む</button><p id="consult-form-status" role="status" aria-live="polite"></p></form></div>`;
 document.body.insertBefore(formView,pageFooter);
 const cf=document.getElementById('consultation-form');
 document.getElementById('consult-form-back').onclick=()=>{formView.hidden=true;consultation.hidden=false;apply.focus();};
 apply.onclick=()=>{if(!receipt||(!web&&!insightAnswers))return;document.getElementById('consult-company').textContent=[companyData.companyName,web?companyData.targetUrl:''].filter(Boolean).join(' ／ ');consultation.hidden=true;formView.hidden=false;cf.querySelector('input').focus();window.scrollTo(0,0);};
 cf.addEventListener('submit',async event=>{event.preventDefault();const button=cf.querySelector('button[type=submit]'),msg=document.getElementById('consult-form-status');if(button.disabled||!receipt||!cf.reportValidity())return;const d=Object.fromEntries(new FormData(cf));button.disabled=true;msg.textContent='受付中です…';try{const response=await fetch((web?'/secumie-web':'/secumie-insight')+'/api/consultation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({receipt,personName:d.personName,email:d.email,phone:d.phone,note:d.note,accepted:d.consent==='on',...(!web?{answers:insightAnswers}:{})}),signal:AbortSignal.timeout(55000)});const result=await response.json();if(!response.ok||!result.ok)throw Error(response.status===410?'診断情報の保持期限が切れました。再度診断を行ってください。':'受付を完了できませんでした。時間をおいて再度お試しください。');const url=new URL(result.scheduleUrl);if(url.protocol!=='https:'||url.hostname!=='timerex.net'||!url.pathname.startsWith('/s/')||url.username||url.password||url.port)throw Error('日程調整先を確認できませんでした。');location.assign(url.href);}catch(error){msg.textContent=error.message||'通信に失敗しました。';button.disabled=false;}});

 const openGuide=(target)=>{returnTarget=target;apply.disabled=!receipt||(!web&&!insightAnswers);consultStatus.textContent=apply.disabled?'相談受付を利用できません。':'';target.hidden=true;if(web)target.closest('main').hidden=true;consultation.hidden=false;document.getElementById('consult-heading').focus();window.scrollTo(0,0);};
 document.getElementById('consult-back').onclick=()=>{consultation.hidden=true;if(returnTarget){returnTarget.hidden=false;if(web)returnTarget.closest('main').hidden=false;returnTarget.querySelector('.consult-guide-trigger')?.focus();}};
 const addGuide=(target,container)=>{if(container.querySelector('.consult-guide-trigger'))return;const button=document.createElement('button');button.type='button';button.className='primary-action consult-guide-trigger';button.textContent='診断結果を今後の対策に活かしませんか？';button.onclick=()=>openGuide(target);container.append(button);};
 if(!web)document.addEventListener('pira:v7-report-rendered',async event=>{
  insightAnswers=event.detail?.answers??null;
  const app=document.getElementById('app');const toolbar=app.querySelector('.v7-toolbar');if(toolbar)addGuide(app,toolbar);
  app.hidden=true;const started=showProgress();await waitMinimum(started);
  finishProgress();app.hidden=false;toolbar?.querySelector('button')?.focus({preventScroll:true});
 });

 document.querySelectorAll('[data-secumie-open-form]').forEach(b=>b.addEventListener('click',()=>{guide.hidden=true;intake.hidden=false;form.querySelector('input').focus();}));
 document.getElementById('back-guide').addEventListener('click',()=>{intake.hidden=true;guide.hidden=false;});
 form.addEventListener('submit',async event=>{
  event.preventDefault(); const button=form.querySelector('button[type=submit]'); if(button.disabled||!form.reportValidity())return;
  const token=window.turnstile?.getResponse(); if(!token){status.textContent='確認が完了していません。';return;}
  const data=Object.fromEntries(new FormData(form)); delete data['cf-turnstile-response'];
  button.disabled=true; status.textContent='診断を開始しています…';
  let started=null;
  if(web){intake.hidden=true;started=showProgress();}
  try{
   const response=await fetch((web?'/secumie-web':'/secumie-insight')+'/api/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,accepted:true,turnstileToken:token}),signal:AbortSignal.timeout(65000)});
   const result=await response.json(); if(!response.ok||!result.ok)throw Error(response.status===429?'利用上限に達しました。時間をおいて再度お試しください。':'診断を開始できませんでした。入力内容をご確認ください。');
   receipt=result.receipt??null;companyData=data;
   if(web){await waitMinimum(started);finishProgress();const frame=document.getElementById('report-frame');frame.srcdoc=result.html.replace('<button class="print-button" aria-label="印刷またはPDFで保存" onclick="window.print()">▣ PDFで保存・印刷</button>','');document.getElementById('web-result').hidden=false;document.getElementById('print-result').onclick=()=>frame.contentWindow.print();intake.hidden=true;const target=document.getElementById('web-result');addGuide(target,document.getElementById('web-result-actions'));addGuide(target,document.getElementById('web-result-actions-bottom'));}
   else {document.getElementById('general-entry').hidden=true;document.getElementById('app').hidden=false;window.PiraV7PublicApp.start();document.getElementById('start').click();}
  }catch(error){if(web){finishProgress();intake.hidden=false;}status.textContent=error.message||'通信に失敗しました。';status.scrollIntoView({block:'nearest'});}finally{button.disabled=false;window.turnstile?.reset();}
 });
});
