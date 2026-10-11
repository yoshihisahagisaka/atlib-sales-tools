(() => {
  const labels={
    BUSINESS_GROWTH:'事業を成長・拡大したい',FOCUS_ON_CORE_WORK:'本来注力すべき仕事へ集中したい',LEAN_GROWTH:'少人数でも無理なく成長できる会社にしたい',NEW_BUSINESS_OR_WORKSTYLE:'新しい事業や働き方へ対応したい',BUSINESS_CONTINUITY:'事業を安定して継続できる状態にしたい',NO_MAJOR_CHANGE:'大きな変化は予定していない',UNDECIDED:'まだ決めていない',
    PRODUCTIVITY:'業務生産性を高めたい',LEAN_OPERATION:'少ない負担で運営したい',MANAGEMENT_DECISION_SUPPORT:'経営判断を支えたい',DATA_USE:'情報やデータを活用したい',CHANGE_READINESS:'事業や組織の変化へ対応したい',EMPLOYEE_EXPERIENCE:'働きやすさを高めたい',RESILIENCE:'事業継続性を高めたい',IT_OPERATION_EFFICIENCY:'IT運用の負担を減らしたい',
    MANAGEMENT_DECISION:'経営判断に必要な情報',INFORMATION_AND_DATA:'情報・データの管理や活用',GROWTH_AND_CHANGE:'成長や変化への対応',IT_OPERATION_AND_GOVERNANCE:'IT運用や管理体制',SECURITY_AND_CONTINUITY:'セキュリティや事業継続',
    VISIBLE_FULL:'必要な状況は把握できている',VISIBLE_MOSTLY:'おおむね把握できている',VISIBLE_PARTIAL:'分かることと分からないことがある',RELIES_ON_OTHERS:'担当者に確認すれば把握できる',LOW_VISIBILITY:'確認しても分からないことがある',UNKNOWN:'分からない',
    UNMANAGED_OR_NOT_VISIBLE:'判断に必要な情報が十分に得られていない',MANAGED_NOT_REPORTED:'確認すれば、判断に必要な情報を得られる',REPORTED_NOT_DECISION_USABLE:'情報は得られるが、そのままでは判断に使いにくい',DECISION_USABLE:'定期的に整理され、経営判断に使えている',STRATEGICALLY_CONNECTED:'経営判断や計画に継続的に活用できている',
    AI:'AI',AUTOMATION:'自動化',DATA_VISIBILITY:'情報の見える化',SECURITY:'セキュリティ',IT_LITERACY:'IT活用力',SYSTEM_LIFECYCLE:'システムの更新・見直し',CLOUD:'クラウド',IT_COST:'ITコスト',IT_ORGANIZATION:'IT運営体制',SYSTEM_INTEGRATION:'システム連携',WORKSTYLE:'働き方',EMP_1_20:'1〜20名',EMP_21_50:'21〜50名',EMP_51_100:'51〜100名',EMP_101_300:'101〜300名',EMP_301_PLUS:'301名以上',EMP_UNKNOWN:'未確認',SITE_1:'1拠点',SITE_2_3:'2〜3拠点',SITE_4_PLUS:'4拠点以上',SITE_NOT_APPLICABLE:'該当しない',SITE_UNKNOWN:'未確認','11-30':'11〜30名',ONE:'1拠点',
    TECHNOLOGY:'技術',OPERATION:'運用',MANAGEMENT:'管理'
  };
  const questions={q1CompanyContext:'Q1 会社の状況',q2Future:'Q2 実現したい会社の未来',q3ItExpectations:'Q3 ITに期待していること',q4CurrentInterest:'Q4 現在特に確認したいこと',q5Visibility:'Q5 現在の把握状況',q6ManagementConnection:'Q6 情報と経営判断のつながり',q7InterestThemes:'Q7 関心のあるITテーマ'};
  const codeGroups={
    q2Future:['BUSINESS_GROWTH','FOCUS_ON_CORE_WORK','LEAN_GROWTH','NEW_BUSINESS_OR_WORKSTYLE','BUSINESS_CONTINUITY','NO_MAJOR_CHANGE','UNDECIDED'],
    q3ItExpectations:['PRODUCTIVITY','LEAN_OPERATION','MANAGEMENT_DECISION_SUPPORT','DATA_USE','CHANGE_READINESS','EMPLOYEE_EXPERIENCE','RESILIENCE','IT_OPERATION_EFFICIENCY','UNDECIDED'],
    q4CurrentInterest:['MANAGEMENT_DECISION','PRODUCTIVITY','INFORMATION_AND_DATA','GROWTH_AND_CHANGE','IT_OPERATION_AND_GOVERNANCE','SECURITY_AND_CONTINUITY','UNDECIDED'],
    q5Visibility:['VISIBLE_FULL','VISIBLE_MOSTLY','VISIBLE_PARTIAL','RELIES_ON_OTHERS','LOW_VISIBILITY','UNKNOWN'],
    q6ManagementConnection:['UNMANAGED_OR_NOT_VISIBLE','MANAGED_NOT_REPORTED','REPORTED_NOT_DECISION_USABLE','DECISION_USABLE','STRATEGICALLY_CONNECTED','UNKNOWN'],
    q7InterestThemes:['AI','AUTOMATION','DATA_VISIBILITY','SECURITY','IT_LITERACY','SYSTEM_LIFECYCLE','CLOUD','IT_COST','IT_ORGANIZATION','SYSTEM_INTEGRATION','WORKSTYLE','UNDECIDED']
  };
  function displayCode(value){return labels[value]||'未確認'}
  function text(value){if(Array.isArray(value))return value.map(displayCode).join('、');if(value&&typeof value==='object'){if('employeeRange'in value)return `従業員規模: ${displayCode(value.employeeRange)}、拠点: ${displayCode(value.siteRange)}`;return '未確認'}return displayCode(value)}
  function el(tag,cls,value){const node=document.createElement(tag);if(cls)node.className=cls;if(value!=null)node.textContent=value;return node}
  function renderOriginal(target,answers){target.replaceChildren();for(const [key,title] of Object.entries(questions)){const box=el('section','question');box.append(el('h3','',title),el('p','',text(answers[key])));target.append(box)}}
  function renderRecords(target,records){target.replaceChildren();if(!records.length){target.append(el('p','hint','まだ記録はありません。'));return}records.forEach(record=>{const box=el('article','record');box.append(el('p','',record.statementText));if(record.recordedAt)box.append(el('time','',new Date(record.recordedAt).toLocaleString('ja-JP')));target.append(box)})}
  function narrativeToText(content){return ['future','currentUnderstanding','confirmationAndImprovement','unknowns','nextFacts'].map(k=>`${content[k].heading}\n${content[k].entries.join('\n')}`).join('\n\n')}
  window.DesignV2UI={labels,questions,codeGroups,text,el,renderOriginal,renderRecords,narrativeToText};
})();
