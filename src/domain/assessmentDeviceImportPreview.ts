/** Assessment-only offline CSV preview. Never writes authoritative FACTACT state. */
export type DeviceField = 'asset_tag' | 'display_name' | 'serial_number';
export type RowOutcome = 'NEEDS_REVIEW' | 'COMPARISON_PENDING' | 'EXCLUDED';
export interface Mapping { sourceColumnIndex: number; targetField: DeviceField | null; origin: 'EXACT'|'ALIAS'|'HUMAN'; }
export interface ImportRow {
  sourceRowNumber: number;
  originalCells: string[];
  mappedCandidate: Partial<Record<DeviceField,string>>;
  issues: string[];
  outcome: RowOutcome;
}
export interface ImportPreview { headers: string[]; mapping: Mapping[]; rows: ImportRow[]; issues: string[]; }
interface CsvRecord { cells: string[]; line: number; }

const aliases: Record<DeviceField,readonly string[]> = {
  asset_tag:['asset_tag','asset tag','資産番号','管理番号','資産管理番号'],
  display_name:['display_name','機器名','pc名','pc名称','名称','管理上の名称'],
  serial_number:['serial_number','serial number','シリアル番号','製造番号','sn']
};
const normalize=(s:string)=>s.trim().normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
const fields=Object.keys(aliases) as DeviceField[];

/** RFC4180-style quoted fields, escaped quotes, CRLF/LF, and embedded newlines. */
function parseCsvRecords(input:string):CsvRecord[] {
  const text=input.replace(/^\uFEFF/,'');
  if(!text.trim())throw new Error('EMPTY_CSV');
  const rows:CsvRecord[]=[];let row:string[]=[];let cell='';let quoted=false;let closed=false;
  let physicalLine=1;let recordStartLine=1;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}
      else if(ch==='"'){quoted=false;closed=true;}
      else {cell+=ch;if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n'){cell+='\n';i++;}physicalLine++;}}
    }else if(ch==='"'){
      if(cell!==''||closed)throw new Error('INVALID_CSV_QUOTE');
      quoted=true;
    }else if(ch===','){row.push(cell);cell='';closed=false;}
    else if(ch==='\r'||ch==='\n'){
      if(ch==='\r'&&text[i+1]==='\n')i++;
      row.push(cell);rows.push({cells:row,line:recordStartLine});row=[];cell='';closed=false;
      physicalLine++;recordStartLine=physicalLine;
    }else{
      if(closed)throw new Error('INVALID_CSV_AFTER_QUOTE');
      cell+=ch;
    }
  }
  if(quoted)throw new Error('UNCLOSED_CSV_QUOTE');
  if(cell!==''||row.length||closed){row.push(cell);rows.push({cells:row,line:recordStartLine});}
  if(!rows[0]?.cells.length)throw new Error('EMPTY_CSV');
  return rows;
}
export function parseCsv(input:string):string[][] {return parseCsvRecords(input).map(r=>r.cells);}
export function suggestMapping(headers:readonly string[]):Mapping[]{
  return headers.map((header,index)=>{
    const normalized=normalize(header);
    const candidates=fields.filter(field=>aliases[field].some(a=>normalize(a)===normalized));
    const targetField:DeviceField|null=candidates.length===1?(candidates[0]??null):null;
    return {sourceColumnIndex:index,targetField,origin:targetField?(normalize(targetField)===normalized?'EXACT':'ALIAS'):'HUMAN'};
  });
}
export function previewDeviceCsv(input:string, humanMapping?:Mapping[]):ImportPreview{
  const [headerRecord,...data]=parseCsvRecords(input);
  if(!headerRecord)throw new Error('EMPTY_CSV');
  const headers=headerRecord.cells;
  const mapping=humanMapping??suggestMapping(headers);
  const issues:string[]=[];
  const validMapping=mapping.length===headers.length && mapping.every((m,i)=>m.sourceColumnIndex===i && (m.targetField===null || fields.includes(m.targetField)));
  const assigned=validMapping?mapping.filter(m=>m.targetField!==null):[];
  if(!validMapping)issues.push('INVALID_MAPPING');
  const seenHeaders=new Set<string>();
  for(const header of headers){const key=normalize(header);if(seenHeaders.has(key))issues.push('DUPLICATE_SOURCE_HEADER');seenHeaders.add(key);}
  for(const field of fields){
    if(assigned.filter(m=>m.targetField===field).length>1)issues.push('DUPLICATE_TARGET_MAPPING:'+field);
  }
  for(const field of ['asset_tag','display_name'] as const){
    if(!assigned.some(m=>m.targetField===field))issues.push('MISSING_REQUIRED_MAPPING:'+field);
  }
  const assetCounts=new Map<string,number>();
  const prepared=data.filter(({cells})=>cells.some(c=>c.trim()!=='')).map(({cells,line})=>{
    const mappedCandidate:Partial<Record<DeviceField,string>>={};
    for(const m of assigned){
      if(m.targetField&&m.sourceColumnIndex>=0&&m.sourceColumnIndex<headers.length)
        mappedCandidate[m.targetField]=(cells[m.sourceColumnIndex]??'').trim();
    }
    const key=normalize(mappedCandidate.asset_tag??'');
    if(key)assetCounts.set(key,(assetCounts.get(key)??0)+1);
    return {sourceRowNumber:line,originalCells:cells,mappedCandidate};
  });
  const rows:ImportRow[]=prepared.map(p=>{
    const errors=[...issues];
    if(p.originalCells.length!==headers.length)errors.push('COLUMN_COUNT_MISMATCH');
    for(const field of ['asset_tag','display_name'] as const)
      if(!p.mappedCandidate[field])errors.push('MISSING_REQUIRED_VALUE:'+field);
    if(p.mappedCandidate.asset_tag && (assetCounts.get(normalize(p.mappedCandidate.asset_tag)) ?? 0)>1)
      errors.push('DUPLICATE_ASSET_TAG_IN_FILE');
    return {...p,issues:errors,outcome:errors.length?'NEEDS_REVIEW':'COMPARISON_PENDING'};
  });
  return {headers,mapping,rows,issues};
}
