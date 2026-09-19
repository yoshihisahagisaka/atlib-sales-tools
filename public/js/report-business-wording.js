'use strict';
// Display translation of generated labels only. Stored/approved report text and hashes stay intact.
window.reportBusinessWording=text=>String(text).split('\n').map(line=>line
 .replace(/^確認できていること（Human Review済み）：/,'確認できていること（担当者が分析内容を確認済み）：')
 .replace(/^Evidence確認候補：/,'資料・記録等の確認候補：')
 .replace(/^Futureとの差（候補）：/,'目指している会社の姿との差（候補）：')
 .replace(/^WHY仮説：/,'理由についての仮説：')
 .replace(/^まだ分かっていないこと（(NOT_YET_CONFIRMED|UNRESOLVED|CONTRADICTORY|NOT_REQUIRED_NOW)）：/,(_,kind)=>'まだ分かっていないこと（'+({NOT_YET_CONFIRMED:'まだ確認していない',UNRESOLVED:'確認したがまだ分からない',CONTRADICTORY:'情報が一致していない',NOT_REQUIRED_NOW:'今回は確認しない'}[kind])+'）：')
 .replace(/^(確認できていることとのつながり：|次に確認が必要なこと：)未接続（Human Reviewで確認が必要）$/,'$1未接続（担当者による分析内容の確認が必要）')
 .replace(/^Futureとの差（Gapの可能性）$/,'目指している会社の姿との差（可能性）')).join('\n');
window.reportStoredWording=(text,original)=>String(text).split('\n').map((line,index)=>{
 const prior=String(original).split('\n')[index];if(prior===undefined)return line;
 if(line===window.reportBusinessWording(prior))return prior;
 const colon=prior.indexOf('：');if(colon<0)return line;
 const prefix=prior.slice(0,colon+1),translated=window.reportBusinessWording(prefix);
 return translated!==prefix&&line.startsWith(translated)?prefix+line.slice(translated.length):line;
}).join('\n');
window.reportBusinessSections=(sections,context)=>{
 const titles=['1. 目指している会社の姿','2. 今、確認できていること','3. まだ分かっていないこと','4. ITで良くできそうなこと','5. 次に確認・判断すること'];
 const result=titles.map(title=>({title,blocks:[],notes:[]}));
 for(const section of sections||[])for(const block of section.blocks){
  let target=section.section_key==='FUTURE'?0:section.section_key==='NEXT_CONFIRMATION'?4:section.section_key==='CURRENT_AND_UNKNOWN'?1:3;
  if(section.section_key==='CURRENT_AND_UNKNOWN'){
   const types=block.insight_refs.map(id=>context.insights.find(i=>i.id===id)?.semantic_type);
   if(types.length&&types.every(t=>t==='UNKNOWN'))target=2;
   else if(types.includes('UNKNOWN'))result[2].notes.push('未確認事項を含む承認文は「今、確認できていること」に併記しています。未確認という意味は変わりません。');
  }
  result[target].blocks.push(block);
 }
 result[3].notes.push('改善の選択肢と、それを考えるための差の候補・理由の仮説です。確定事実や実施決定ではありません。');
 return result;
};
