import type {ConsultationNotice} from './secumieConsultationHandoff';

function record(value:unknown):Record<string,unknown>{
 return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
}
function line(value:unknown):string{
 return typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]+/g,' ').trim():'';
}
function items(value:unknown):unknown[]{return Array.isArray(value)?value:[];}
function receivedAt(value:string):string{
 const date=new Date(value);
 if(!Number.isFinite(date.getTime()))return '日時不明';
 return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date)+'（日本時間）';
}

function webResult(report:Record<string,unknown>):string[]{
 const findings=items(report.findings).map(record).filter(f=>line(f.title)&&line(f.status));
 if(!findings.length)return ['表示対象の診断項目はありません。'];
 const lines:string[]=[];
 for(const status of ['追加確認推奨','設定確認済み']){
  const group=findings.filter(f=>line(f.status)===status);
  lines.push(`【${status}：${group.length}件】`);
  if(!group.length)lines.push('該当なし');
  for(const f of group){
   lines.push('・'+line(f.title)+(line(f.observation)?'：'+line(f.observation):''));
  }
  lines.push('');
 }
 for(const f of findings.filter(f=>!['追加確認推奨','設定確認済み'].includes(line(f.status)))){
  lines.push('・'+line(f.title)+'：'+line(f.status));
 }
 return lines;
}

function insightResult(report:Record<string,unknown>):string[]{
 const priorities=items(report.priorities).map(line).filter(Boolean);
 const answers=items(report.answers).map(record).filter(a=>line(a.question)&&line(a.label));
 const lines=['【重点テーマ】',...(priorities.length?priorities.map(p=>'・'+p):['表示対象なし']),'','【回答内容】'];
 if(!answers.length)lines.push('表示対象の回答はありません。');
 answers.forEach((a,i)=>lines.push(`${i+1}. ${line(a.question)}`, '    回答：'+line(a.label),''));
 return lines;
}

export function formatSecumieConsultationNotification(notice:ConsultationNotice):{subject:string;text:string}{
 const service=notice.kind==='WEB'?'SECU:MIE WEB':'SECU:MIE Insight';
 const company=line(notice.companyName)||'企業名未記入';
 const report=record(notice.report);
 const result=notice.kind==='WEB'?webResult(report):insightResult(report);
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
   '',
   '■ ご相談内容',
   notice.note?.trim()||'記載なし',
   '',
   '■ 診断結果',
   ...result,
   '',
   '※ 無料相談の受付通知です。面談日時の確定はTimeRexでご確認ください。',
   '受付番号：'+line(notice.reference),
   '',
   'atLIB株式会社｜SECU:MIE',
  ].join('\n'),
 };
}
