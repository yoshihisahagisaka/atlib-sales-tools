'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const fields=[['','対応しない'],['asset_tag','資産番号'],['display_name','PC名・管理名称'],['serial_number','シリアル番号']];
  const aliases={
    asset_tag:['asset_tag','asset tag','資産番号','管理番号','資産管理番号'],
    display_name:['display_name','機器名','pc名','pc名称','名称','管理上の名称'],
    serial_number:['serial_number','serial number','シリアル番号','製造番号','sn']
  };
  const norm=s=>s.trim().normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
  let records=[];
  function parseCsv(text){
    text=text.replace(/^\uFEFF/,'');
    if(!text.trim())throw Error('空のCSVです');
    const out=[];let cells=[],cell='',quoted=false,closed=false,line=1,start=1;
    for(let i=0;i<text.length;i++){
      const ch=text[i];
      if(quoted){
        if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}
        else if(ch==='"'){quoted=false;closed=true;}
        else{cell+=ch;if(ch==='\r'||ch==='\n'){if(ch==='\r'&&text[i+1]==='\n'){cell+='\n';i++;}line++;}}
      }else if(ch==='"'){
        if(cell||closed)throw Error('引用符の形式が不正です');
        quoted=true;
      }else if(ch===','){cells.push(cell);cell='';closed=false;}
      else if(ch==='\r'||ch==='\n'){
        if(ch==='\r'&&text[i+1]==='\n')i++;
        cells.push(cell);out.push({cells,line:start});cells=[];cell='';closed=false;line++;start=line;
      }else{if(closed)throw Error('引用符の後の文字が不正です');cell+=ch;}
    }
    if(quoted)throw Error('引用符が閉じられていません');
    if(cell||cells.length||closed){cells.push(cell);out.push({cells,line:start});}
    if(!out.length||!out[0].cells.length)throw Error('ヘッダーがありません');
    return out;
  }
  const td=(tr,value)=>{const cell=document.createElement('td');cell.textContent=String(value??'');tr.append(cell);return cell;};
  function renderMapping(){
    $('mapping-body').replaceChildren();
    const header=records[0].cells;
    header.forEach((name,i)=>{
      const tr=document.createElement('tr');td(tr,name);td(tr,records[1]?.cells[i]??'');
      const cell=document.createElement('td'),sel=document.createElement('select');
      sel.dataset.index=String(i);sel.setAttribute('aria-label',name+' の登録先');
      for(const [value,label] of fields){const o=document.createElement('option');o.value=value;o.textContent=label;sel.append(o);}
      const matched=Object.entries(aliases).filter(([,a])=>a.some(x=>norm(x)===norm(name)));
      sel.value=matched.length===1?matched[0][0]:'';
      cell.append(sel);tr.append(cell);$('mapping-body').append(tr);
    });
    $('mapping-panel').hidden=false;$('preview-panel').hidden=true;
  }
  function renderPreview(){
    const header=records[0].cells;
    const mapping=[...$('mapping-body').querySelectorAll('select')].map(s=>s.value);
    const errors=[];
    for(const f of ['asset_tag','display_name'])if(!mapping.includes(f))errors.push('必須項目の対応付け不足: '+f);
    for(const f of fields.slice(1).map(x=>x[0]))if(mapping.filter(x=>x===f).length>1)errors.push('登録先が重複: '+f);
    if(new Set(header.map(norm)).size!==header.length)errors.push('元の列名が重複しています');
    const rows=records.slice(1).filter(r=>r.cells.some(x=>x.trim()));
    const counts=new Map();
    for(const r of rows){const i=mapping.indexOf('asset_tag');const key=i<0?'':norm(r.cells[i]??'');if(key)counts.set(key,(counts.get(key)||0)+1);}
    let blocked=0;$('preview-body').replaceChildren();
    for(const r of rows){
      const obj={};mapping.forEach((f,i)=>{if(f)obj[f]=(r.cells[i]??'').trim();});
      const issues=[...errors];
      if(r.cells.length!==header.length)issues.push('列数が一致しません');
      for(const f of ['asset_tag','display_name'])if(!obj[f])issues.push('必須値がありません: '+f);
      if(obj.asset_tag&&(counts.get(norm(obj.asset_tag))||0)>1)issues.push('ファイル内で資産番号が重複');
      if(issues.length)blocked++;
      const tr=document.createElement('tr');
      td(tr,r.line);td(tr,obj.asset_tag);td(tr,obj.display_name);td(tr,obj.serial_number);
      td(tr,issues.length?'要確認':'正本照合待ち');td(tr,issues.join(' / '));$('preview-body').append(tr);
    }
    $('preview-summary').textContent='対象 '+rows.length+' 行 / 要確認 '+blocked+' 行 / 正本照合待ち '+(rows.length-blocked)+' 行';
    $('preview-panel').hidden=false;
  }
  $('csv-file').addEventListener('change',async e=>{
    $('mapping-panel').hidden=true;$('preview-panel').hidden=true;
    const file=e.target.files?.[0];if(!file)return;
    if(!file.name.toLowerCase().endsWith('.csv')){$('file-status').textContent='この画面はCSV専用です。Excelは後続対応です。';return;}
    try{records=parseCsv(await file.text());$('file-status').textContent=file.name+'：'+Math.max(0,records.length-1)+' レコード';renderMapping();}
    catch(err){$('file-status').textContent='読込エラー: '+err.message;}
  });
  $('refresh-preview').addEventListener('click',renderPreview);
})();
