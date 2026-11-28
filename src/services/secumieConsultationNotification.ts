import type {ConsultationNotice} from './secumieConsultationHandoff';

// Existing Sales Tools canonical origin. Staff authentication protects this page.
export const SECUMIE_GENERAL_ADMIN_URL='https://sales.atlib.jp/admin/secumie-general-leads.html';

function line(value:unknown):string{
 return typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]+/g,' ').trim():'';
}
function receivedAt(value:string):string{
 const date=new Date(value);
 if(!Number.isFinite(date.getTime()))return '日時不明';
 return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date);
}
function serviceName(notice:ConsultationNotice):string{
 return notice.kind==='WEB'?'SECU:MIE WEB':'SECU:MIE Insight';
}
function companyName(notice:ConsultationNotice):string{
 return line(notice.companyName)||'企業名未記入';
}
export function formatSecumieConsultationNotification(notice:ConsultationNotice):{subject:string;text:string}{
 const service=serviceName(notice);
 const company=companyName(notice);
 return {
  subject:`【${service}】無料相談申込：${company}`,
  text:[
   `${service}の無料相談のお申し込みがありました。`,'',
   '■ お申し込み情報',
   '受付日時：'+receivedAt(notice.receivedAt),
   '企業名：'+company,
   '担当者名：'+line(notice.personName),
   'メールアドレス：'+line(notice.email),
   '電話番号：'+line(notice.phone),
   ...(notice.targetUrl?['診断対象URL：'+line(notice.targetUrl)]:[]),
   '相談内容：'+(notice.note?.trim()||'記載なし'),
   '',
   '■ 管理画面',
   SECUMIE_GENERAL_ADMIN_URL,
   '',
   '受付番号：'+line(notice.reference),
  ].join('\n'),
 };
}
// Escape Slack control syntax: user-entered company names cannot create mentions or links.
function slackText(value:string):string{
 return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
export function formatSecumieConsultationSlack(notice:ConsultationNotice):string{
 return [
  `【${serviceName(notice)}】無料相談申込`,
  '企業名：'+slackText(companyName(notice)),
  '受付日時：'+receivedAt(notice.receivedAt),
  '<'+SECUMIE_GENERAL_ADMIN_URL+'|管理画面で確認>',
 ].join('\n');
}

// Independent best-effort Slack. Preserve existing notification_status as the email outcome.
// Wait for both channels, including when mail fails; no automatic duplicate send or retry.
export async function dispatchSecumieConsultationNotification(
 notice:ConsultationNotice,
 sendMail:(notice:ConsultationNotice)=>Promise<void>,
 sendSlack:(text:string)=>Promise<void>,
):Promise<void>{
 const [mail,slack]=await Promise.allSettled([
  Promise.resolve().then(()=>sendMail(notice)),
  Promise.resolve().then(()=>sendSlack(formatSecumieConsultationSlack(notice))),
 ]);
 if(slack.status==='rejected')console.error(JSON.stringify({event:'secumie_slack_notification_failed'}));
 if(mail.status==='rejected')throw Error('SECUMIE_MAIL_NOTIFICATION_FAILED');
}
