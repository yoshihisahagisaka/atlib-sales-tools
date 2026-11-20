'use strict';
/** Shared, side-effect-free Assessment preview rules. Browser and Node use the same code. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.AssessmentDevicePreview=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const aliases={
  asset_tag:['asset_tag','asset tag','資産番号','管理番号','資産管理番号'],
  display_name:['display_name','機器名','pc名','pc名称','名称','管理上の名称'],
  serial_number:['serial_number','serial number','シリアル番号','製造番号','sn']
 };
 const fields=Object.keys(aliases);
 const normalize=s=>s.trim().normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
 function parseCsvRecords(input){
  const text=input.replace(/^\uFEFF/,'');
  if(!text.trim())throw Error('EMPTY_CSV');
  if(text.length>5*1024*1024)throw Error('CSV_TOO_LARGE');
  const rows=[];let row=[],cell='',quoted=false,closed=false,line=1,start=1;
  for(let i=0;i<text.length;i++){
   const ch=text[i];
   if(quoted){
    if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}
    else if(ch==='"'){quoted=false;closed=true;}
    else{cell+=ch;if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n'){cell+='\n';i++;}line++;}}
   }else if(ch==='"'){
    if(cell!==''||closed)throw Error('INVALID_CSV_QUOTE');quoted=true;
   }else if(ch===','){row.push(cell);cell='';closed=false;}
   else if(ch==='\r'||ch==='\n'){
    if(ch==='\r'&&text[i+1]==='\n')i++;
    row.push(cell);rows.push({cells:row,line:start});row=[];cell='';closed=false;line++;start=line;
   }else{if(closed)throw Error('INVALID_CSV_AFTER_QUOTE');cell+=ch;}
  }
  if(quoted)throw Error('UNCLOSED_CSV_QUOTE');
  if(cell!==''||row.length||closed){row.push(cell);rows.push({cells:row,line:start});}
  return validateRecords(rows);
 }
 function validateRecords(records){
  if(!records[0]?.cells.length)throw Error('EMPTY_CSV');
  if(records.length>10001)throw Error('TOO_MANY_ROWS');
  if(records.some(r=>r.cells.length>200))throw Error('TOO_MANY_COLUMNS');
  return records;
 }
 function suggestMapping(headers){
  return headers.map((header,index)=>{
   const key=normalize(header);
   const candidates=fields.filter(field=>aliases[field].some(a=>normalize(a)===key));
   const targetField=candidates.length===1?candidates[0]:null;
   return {sourceColumnIndex:index,targetField,origin:targetField?(normalize(targetField)===key?'EXACT':'ALIAS'):'HUMAN'};
  });
 }
 function previewRecords(records,humanMapping){
  validateRecords(records);
  const [header,...data]=records,headers=header.cells;
  const mapping=humanMapping??suggestMapping(headers),issues=[];
  const valid=mapping.length===headers.length&&mapping.every((m,i)=>m.sourceColumnIndex===i&&(m.targetField===null||fields.includes(m.targetField)));
  const assigned=valid?mapping.filter(m=>m.targetField!==null):[];
  if(!valid)issues.push('INVALID_MAPPING');
  if(new Set(headers.map(normalize)).size!==headers.length)issues.push('DUPLICATE_SOURCE_HEADER');
  for(const field of fields)if(assigned.filter(m=>m.targetField===field).length>1)issues.push('DUPLICATE_TARGET_MAPPING:'+field);
  for(const field of ['asset_tag','display_name'])if(!assigned.some(m=>m.targetField===field))issues.push('MISSING_REQUIRED_MAPPING:'+field);
  const counts=new Map();
  const prepared=data.filter(r=>r.cells.some(c=>c.trim())).map(r=>{
   const mappedCandidate={};
   for(const m of assigned)if(m.targetField)mappedCandidate[m.targetField]=(r.cells[m.sourceColumnIndex]??'').trim();
   const key=normalize(mappedCandidate.asset_tag??'');
   if(key)counts.set(key,(counts.get(key)??0)+1);
   return {sourceRowNumber:r.line,originalCells:r.cells,mappedCandidate};
  });
  const rows=prepared.map(p=>{
   const errors=[...issues];
   if(p.originalCells.length!==headers.length)errors.push('COLUMN_COUNT_MISMATCH');
   for(const field of ['asset_tag','display_name'])if(!p.mappedCandidate[field])errors.push('MISSING_REQUIRED_VALUE:'+field);
   if(p.mappedCandidate.asset_tag&&(counts.get(normalize(p.mappedCandidate.asset_tag))??0)>1)errors.push('DUPLICATE_ASSET_TAG_IN_FILE');
   return {...p,issues:errors,outcome:errors.length?'NEEDS_REVIEW':'COMPARISON_PENDING'};
  });
  return {headers,mapping,rows,issues};
 }
 return {parseCsvRecords,suggestMapping,previewRecords,previewDeviceCsv:(input,mapping)=>previewRecords(parseCsvRecords(input),mapping)};
});