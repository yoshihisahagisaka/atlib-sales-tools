'use strict';
document.addEventListener('DOMContentLoaded', () => {
 const guide=document.getElementById('secumie-guide'), intake=document.getElementById('general-intake'), form=document.getElementById('general-form'), status=document.getElementById('general-status');
 const web=location.pathname.startsWith('/secumie-web/');
 document.querySelectorAll('[data-secumie-open-form]').forEach(b=>b.addEventListener('click',()=>{guide.hidden=true;intake.hidden=false;form.querySelector('input').focus();}));
 document.getElementById('back-guide').addEventListener('click',()=>{intake.hidden=true;guide.hidden=false;});
 form.addEventListener('submit',async event=>{
  event.preventDefault(); const button=form.querySelector('button[type=submit]'); if(button.disabled||!form.reportValidity())return;
  const token=window.turnstile?.getResponse(); if(!token){status.textContent='確認が完了していません。';return;}
  const data=Object.fromEntries(new FormData(form)); delete data['cf-turnstile-response'];
  button.disabled=true; status.textContent='診断を開始しています…';
  try{
   const response=await fetch((web?'/secumie-web':'/secumie-insight')+'/api/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,accepted:true,turnstileToken:token}),signal:AbortSignal.timeout(65000)});
   const result=await response.json(); if(!response.ok||!result.ok)throw Error(response.status===429?'利用上限に達しました。時間をおいて再度お試しください。':'診断を開始できませんでした。入力内容をご確認ください。');
   if(web){const frame=document.getElementById('report-frame');frame.srcdoc=result.html;document.getElementById('web-result').hidden=false;document.getElementById('print-result').onclick=()=>frame.contentWindow.print();intake.hidden=true;}
   else {document.getElementById('general-entry').hidden=true;document.getElementById('app').hidden=false;window.PiraV7PublicApp.start();document.getElementById('start').click();}
  }catch(error){status.textContent=error.message||'通信に失敗しました。';}finally{button.disabled=false;window.turnstile?.reset();}
 });
});
