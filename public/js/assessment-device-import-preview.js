'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const fields=[['','対応しない'],['asset_tag','資産番号'],['display_name','PC名・管理名称'],['serial_number','シリアル番号']];
  const core=globalThis.AssessmentDevicePreview;
  let records=[];
  const td=(tr,value)=>{const cell=document.createElement('td');cell.textContent=String(value??'');tr.append(cell);return cell;};
  function renderMapping(){
    $('mapping-body').replaceChildren();
    const header=records[0].cells;
    header.forEach((name,i)=>{
      const tr=document.createElement('tr');td(tr,name);td(tr,records[1]?.cells[i]??'');
      const cell=document.createElement('td'),sel=document.createElement('select');
      sel.dataset.index=String(i);sel.setAttribute('aria-label',name+' の登録先');
      for(const [value,label] of fields){const o=document.createElement('option');o.value=value;o.textContent=label;sel.append(o);}
      sel.value=core.suggestMapping(header)[i].targetField??'';
      cell.append(sel);tr.append(cell);$('mapping-body').append(tr);
    });
    $('mapping-panel').hidden=false;$('preview-panel').hidden=true;
  }
  function renderPreview(){
    const header=records[0].cells;
    const mapping=[...$('mapping-body').querySelectorAll('select')].map(s=>s.value);
    const decisions=mapping.map((targetField,i)=>({sourceColumnIndex:i,targetField:targetField||null,origin:'HUMAN'}));
    const preview=core.previewRecords(records,decisions);
    $('preview-body').replaceChildren();
    for(const r of preview.rows){
      const tr=document.createElement('tr');
      td(tr,r.sourceRowNumber);td(tr,r.mappedCandidate.asset_tag);td(tr,r.mappedCandidate.display_name);td(tr,r.mappedCandidate.serial_number);
      td(tr,r.outcome==='NEEDS_REVIEW'?'要確認':'正本照合待ち');
      td(tr,r.issues.map(issue=>{
        if(issue==='DUPLICATE_ASSET_TAG_IN_FILE')return 'ファイル内で資産番号が重複';
        if(issue==='COLUMN_COUNT_MISMATCH')return '列数が一致しません';
        if(issue.startsWith('MISSING_REQUIRED_VALUE:'))return '必須値がありません: '+issue.split(':')[1];
        if(issue.startsWith('MISSING_REQUIRED_MAPPING:'))return '必須項目の対応付け不足: '+issue.split(':')[1];
        if(issue.startsWith('DUPLICATE_TARGET_MAPPING:'))return '登録先が重複: '+issue.split(':')[1];
        if(issue==='DUPLICATE_SOURCE_HEADER')return '元の列名が重複しています';
        return issue;
      }).join(' / '));
      $('preview-body').append(tr);
    }
    const blocked=preview.rows.filter(r=>r.outcome==='NEEDS_REVIEW').length;
    $('preview-summary').textContent='対象 '+preview.rows.length+' 行 / 要確認 '+blocked+' 行 / 正本照合待ち '+(preview.rows.length-blocked)+' 行';
    $('preview-panel').hidden=false;
  }
  $('csv-file').addEventListener('change',async e=>{
    $('mapping-panel').hidden=true;$('preview-panel').hidden=true;
    const file=e.target.files?.[0];if(!file)return;
    const name=file.name.toLowerCase();
    if(!name.endsWith('.csv')&&!name.endsWith('.xlsx')){$('file-status').textContent='CSVまたは.xlsxを選択してください。';return;}
    try{
      if(file.size>10*1024*1024)throw Error('ファイルが大きすぎます（10MBまで）');
      records=name.endsWith('.xlsx')?await globalThis.AssessmentXlsxReader.read(await file.arrayBuffer()):core.parseCsvRecords(await file.text());
      $('file-status').textContent=file.name+'：'+Math.max(0,records.length-1)+' レコード';renderMapping();
    }
    catch(err){const messages={EMPTY_CSV:'ヘッダーがありません',CSV_TOO_LARGE:'CSVファイルが大きすぎます（5MBまで）',TOO_MANY_ROWS:'CSVは見出しを含め10,001行までです',TOO_MANY_COLUMNS:'CSVは200列以内にしてください'};
      $('file-status').textContent='読込エラー: '+(messages[err.message]??err.message);
    }
  });
  $('refresh-preview').addEventListener('click',renderPreview);
})();
