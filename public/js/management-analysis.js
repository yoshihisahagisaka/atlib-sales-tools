'use strict';
(() => {
 const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 const labels={OBSERVATION:'観察として整理した内容',UNKNOWN:'まだ分かっていないこと',HYPOTHESIS:'私たちの仮説',GAP_CANDIDATE:'差として考えられること（候補）',ROOT_CAUSE_HYPOTHESIS:'理由についての仮説',KAIZEN_DIRECTION:'改善の選択肢（実施未決定）',EVIDENCE_CANDIDATE:'資料・記録等の確認候補'};
 const routes={DIRECT_ACT:'改善の実行へ進む',FOCUSED_CONFIRMATION:'絞り込んだ追加確認へ進む',DESIGN_ASSESSMENT:'設計Assessmentを検討する',STOP_HOLD:'今回は止める・保留する'};
 const relations={SUPPORTS:'考えた根拠',CONTRADICTS:'一致していない情報',RELATED:'関連する情報'};
 const unknownLabels={NOT_YET_CONFIRMED:'まだ確認していない',UNRESOLVED:'確認したがまだ分からない',CONTRADICTORY:'情報が一致していない',NOT_REQUIRED_NOW:'今回は確認しない'};
 window.renderManagementAnalysis=model=>{
  const root=document.getElementById('management-analysis');if(!root)return;root.replaceChildren();
  const id=new URLSearchParams(location.search).get('id');
  const link=(text,page,hash='')=>{const a=node('a',text);a.href='/admin/it-management-diagnosis-'+page+'.html?id='+encodeURIComponent(id)+hash;return a;};
  function section(key,title,hint){const s=node('section','');s.id='analysis-'+key;s.className='analysis-section';s.append(node('h2',title));if(hint)s.append(node('p',hint));root.append(s);return s;}
  function trace(sources){const d=node('details','');d.append(node('summary','もとになった情報を見る'));for(const s of sources){d.append(node('p',(relations[s.relation]?relations[s.relation]+'：':'')+s.label),node('p',s.text));if(s.recorded_at)d.append(node('p','記録日時：'+new Date(s.recorded_at).toLocaleString('ja-JP')));}d.append(node('p','取得時点の記録です。現在も同じか、内容が正しいかを自動で確定しません。'));return d;}
  function raw(e){const card=node('article','');card.className='analysis-item';card.append(node('h3',e.title),node('p',e.text));if(e.unknown_type)card.append(node('p',unknownLabels[e.unknown_type]||'まだ分かっていないこと'));card.append(trace([{label:e.origin_label,text:e.text,recorded_at:e.recorded_at}]));return card;}
  function item(i){const card=node('article','');card.className='analysis-item';card.dataset.analysisId=i.id;
   card.append(node('h3',i.title),node('p',labels[i.semantic_type]),node('p',i.content),node('p',i.approval==='PROPOSAL'?'システム／AIの未採用候補 — 経営フィードバックには含めません。':'担当者が採用した分析内容 — 確定事実や実施決定ではありません。'),trace(i.sources));
   const a=node('a',i.approval==='PROPOSAL'?'この候補を確認・判断する':'採用した内容を確認する');a.href=i.approval==='PROPOSAL'?'#proposals':'#approved';a.onclick=()=>{const target=document.querySelector(i.approval==='PROPOSAL'?`#proposals [data-proposal-id="${i.id}"]`:`#approved [data-insight-id="${i.id}"]`);if(target){target.tabIndex=-1;target.focus();target.scrollIntoView({block:'center'});return false;}};card.append(a);return card;
  }
  const future=section('future','1. 目指している会社の姿','経営者の目指す姿から、追加で確認する内容と判断につなげます。');
  future.append(node('p',model.report_context?.future.report_text||model.reuse.future||'目指している会社の姿はまだ記録されていません。'));
  const jump=node('a','次に確認・判断することへ');jump.href='#analysis-next';future.append(jump);
  const known=section('known','2. 今、確認できていること','回答・発言を取得できた内容です。内容の正しさを確定したものではありません。');
  known.append(...model.reuse.known.map(raw));
  for(const i of model.items.filter(i=>i.semantic_type==='OBSERVATION'))known.append(item(i));
  if(!known.querySelector('article'))known.append(node('p','表示できる記録はありません。'));
  const unknown=section('unknown','3. まだ分かっていないこと','分からないこと自体が大切な情報です。推測で埋めずに残します。');unknown.append(...model.reuse.unknown.map(raw));
  if(!model.reuse.unknown.length)unknown.append(node('p','表示できる未確認事項はありません。確認完了を意味するものではありません。'));
  const gap=section('gap','4. 目指している会社の姿との差','差として考えられることを示します。確定診断ではなく、経営フィードバックを作るための分析過程です。');
  gap.append(...model.items.filter(i=>i.semantic_type==='GAP_CANDIDATE').map(item));if(!gap.querySelector('article'))gap.append(node('p','差の候補はまだ整理されていません。'));
  const why=section('why','5. なぜ、その状態になっているのか','理由についての仮説です。原因とは断定しません。');
  for(const i of model.items.filter(i=>['HYPOTHESIS','ROOT_CAUSE_HYPOTHESIS'].includes(i.semantic_type))){const card=item(i),connection=i.why_connection;
   card.append(node('h4','何を根拠に考えたか'));
   const support=(connection?.supporting_insight_refs||[]).map(key=>model.items.find(x=>x.id===key)).filter(Boolean);
   card.append(node('p',support.map(x=>x.content).join(' / ')||'担当者が確認した観察とのつながりは未確認です。もとになった情報を確認してください。'));
   card.append(node('h4','次に何を確認すればよいか'));
   const needed=(connection?.evidence_confirmation_refs||[]).map(key=>model.report_context?.assessment_confirmation_items.find(x=>x.id===key)).filter(Boolean);
   card.append(node('p',needed.map(x=>x.title+'：'+x.purpose).join(' / ')||'この仮説に対する確認候補は未接続です。担当者が必要な確認を判断してください。'));
   if(needed.length)card.append(node('p','設計Assessmentで確認する候補です。無料診断で資料の中身を評価した結果ではありません。'));
   const a=node('a','残っている未確認事項を見る');a.href='#analysis-unknown';card.append(a);why.append(card);
  }
  const notes=model.reuse.hypotheses.filter(e=>['salesperson_notes','SOURCE_RECORD'].includes(e.origin.kind));
  if(notes.length){const d=node('details','');d.append(node('summary','私たちの仮説・気づき（営業・追加確認の記録）'),...notes.map(raw));why.append(d);}
  if(!why.querySelector('article'))why.append(node('p','理由についての仮説はまだ整理されていません。'));
  const kaizen=section('kaizen','6. ITで良くできそうなこと','改善の選択肢です。採用済みの分析内容でも、改善を実施する判断とは別です。');
  kaizen.append(node('p','技術・運用・管理 × なくす・自動化する・標準化する・任せる・残す・整える。登録された分類だけで整理します。該当候補なしの組み合わせは表示せず、問題や不足とは扱いません。'));
  const lens=node('div','');lens.id='analysis-lens';lens.className='analysis-lens';
  for(const cell of model.lens.cells){const s=node('section','');s.dataset.area=cell.area;s.dataset.lens=cell.lens;s.append(node('h3',cell.area+' × '+cell.lens),...cell.items.map(item));lens.append(s);}kaizen.append(lens);
  if(model.lens.unclassified.length){const s=node('section','');s.id='analysis-unclassified';s.append(node('h3','観点・改善視点を指定していない選択肢'),...model.lens.unclassified.map(item));kaizen.append(s);}
  if(!model.lens.cells.length&&!model.lens.unclassified.length)kaizen.append(node('p','該当候補なし。空欄を埋める必要はありません。'));
  const next=section('next','7. 次に確認・判断すること','確認して情報を得ることと、経営者が進め方を判断することを分けます。');
  const confirmation=node('section','');confirmation.id='analysis-confirmation';confirmation.append(node('h3','確認：足りない情報・仮説・資料の存在'));
  for(const p of model.reuse.plans){const s=node('article','');s.append(node('h4',p.text),node('p',p.purpose||''));if(p.results.length)s.append(node('p','発言を記録済みです。再質問する前に確認してください。'),...p.results.map(r=>node('p',r.text)));confirmation.append(s);}
  confirmation.append(node('p','まだ分かっていないことは上の一覧に残しています。必要な確認は担当者が選びます。'),link('取得済みの情報と追加確認を見直す','detail','#progressive-reuse'));
  for(const i of model.items.filter(i=>i.semantic_type==='EVIDENCE_CANDIDATE'))confirmation.append(item(i));next.append(confirmation);
  const decision=node('section','');decision.id='analysis-decision';decision.append(node('h3','判断：経営者が次の進め方を選ぶ'),node('p','改善を進めるか、どの案を選ぶか、追加確認や設計Assessmentを検討するか、今回は止めるかを人が判断します。システムは選びません。'));
  if(model.decision){decision.append(node('p','記録済みの判断：'+(routes[model.decision.route_code]||'進め方を確認してください')),node('p',model.decision.material_decision),node('p','次の行動：'+model.decision.next_action),node('p','記録した担当者：'+model.decision.decided_by_user_id+' / '+new Date(model.decision.decided_at).toLocaleString('ja-JP')),node('p','経営フィードバック時に記録された判断です。現在表示している分析への自動再適用ではありません。'));}
  else decision.append(node('p','進め方の判断はまだ記録されていません。候補から自動で選ぶことはありません。'));
  decision.append(node('p','設計Assessmentを検討する判断だけでは、提案・受注処理は開始されません。'));
  decision.append(link('経営フィードバック資料を確認する','report'));next.append(decision);
  const mapping=node('details','');mapping.id='analysis-report-mapping';mapping.append(node('summary','経営フィードバックの5項目とのつながり'),node('p','目指している会社の姿 → 今、確認できていること → まだ分かっていないこと → ITで良くできそうなこと → 次に確認・判断すること'),node('p','差の候補と理由の仮説は、この5項目を考えるための分析過程です。経営フィードバックには担当者が採用した情報だけを渡し、候補・仮説という意味を維持します。'));next.append(mapping);
 };
})();
