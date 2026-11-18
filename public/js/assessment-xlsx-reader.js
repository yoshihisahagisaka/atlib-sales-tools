'use strict';
/* Offline XLSX reader for the Assessment preview only. No network, macros, formulas or writes.
 * Uses browser-native ZIP inflate and DOMParser; rejects unsupported/encrypted archives. */
globalThis.AssessmentXlsxReader=(()=>{
 const decoder=new TextDecoder('utf-8',{fatal:true});
 const u16=(b,p)=>b[p]|(b[p+1]<<8);
 const u32=(b,p)=>(b[p]|(b[p+1]<<8)|(b[p+2]<<16)|(b[p+3]<<24))>>>0;
 async function inflate(bytes,method){
   if(method===0)return bytes;
   if(method!==8||typeof DecompressionStream==='undefined')throw Error('未対応のExcel圧縮形式です');
   const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
   return new Uint8Array(await new Response(stream).arrayBuffer());
 }
 async function unzip(buffer){
   const b=new Uint8Array(buffer);
   if(b.length>10*1024*1024)throw Error('ファイルが大きすぎます（10MBまで）');
   let eocd=-1;
   for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(u32(b,i)===0x06054b50){eocd=i;break;}
   if(eocd<0)throw Error('ExcelファイルのZIP構造を確認できません');
   const count=u16(b,eocd+10),offset=u32(b,eocd+16);
   if(count>500)throw Error('Excel内のファイル数が上限を超えています');
   let p=offset,total=0;const files=new Map();
   for(let i=0;i<count;i++){
     if(u32(b,p)!==0x02014b50)throw Error('ExcelのZIP索引が不正です');
     const flags=u16(b,p+8),method=u16(b,p+10),size=u32(b,p+20),uncompressed=u32(b,p+24);
     const nameLength=u16(b,p+28),extra=u16(b,p+30),comment=u16(b,p+32),local=u32(b,p+42);
     if(flags&1)throw Error('パスワード付きExcelには対応していません');
     const name=decoder.decode(b.slice(p+46,p+46+nameLength));
     p+=46+nameLength+extra+comment;
     if(!name.startsWith('xl/')||name.includes('..')||name.endsWith('/'))continue;
     if(size>10*1024*1024||uncompressed>20*1024*1024)throw Error('Excel内データが大きすぎます');
     total+=uncompressed;if(total>30*1024*1024)throw Error('Excel展開後のデータが大きすぎます');
     if(u32(b,local)!==0x04034b50)throw Error('ExcelのZIPデータが不正です');
     const start=local+30+u16(b,local+26)+u16(b,local+28);
     if(start+size>b.length)throw Error('ExcelのZIPデータが途中で切れています');
     const raw=await inflate(b.slice(start,start+size),method);
     if(raw.length!==uncompressed)throw Error('Excelの展開サイズが一致しません');
     files.set(name,decoder.decode(raw));
   }
   return files;
 }
 function xml(s){
   if(!s)throw Error('Excelの必須XMLがありません');
   if(/<!DOCTYPE|<!ENTITY/i.test(s))throw Error('外部実体を含むXMLは使用できません');
   const d=new DOMParser().parseFromString(s,'application/xml');
   if(d.getElementsByTagName('parsererror').length)throw Error('Excel XMLを解析できません');
   return d;
 }
 const all=(node,tag)=>[...node.getElementsByTagName(tag)];
 const text=(node,tag)=>all(node,tag).map(n=>n.textContent||'').join('');
 function colIndex(ref){
   const m=/^[A-Z]+/.exec(ref.toUpperCase());if(!m)return -1;
   let n=0;for(const c of m[0])n=n*26+c.charCodeAt(0)-64;
   return n-1;
 }
 function readSheet(doc,strings){
   const out=[];const rows=all(doc,'row');
   if(rows.length>10001)throw Error('Excelの行数が上限を超えています');
   for(const row of rows){
     const line=Number(row.getAttribute('r'));
     if(!Number.isInteger(line)||line<1||line>100000)throw Error('Excelの行番号が不正です');
     const cells=[];for(const c of all(row,'c')){
       const index=colIndex(c.getAttribute('r')||'');
       if(index<0||index>199)throw Error('Excelは200列以内にしてください');
       const type=c.getAttribute('t'),v=text(c,'v');
       if(type==='e')throw Error('エラー値を含むExcelには対応していません');
       let value=type==='inlineStr'?text(c,'t'):type==='s'?strings[Number(v)]:v;
       if(type==='s'&&value===undefined)throw Error('Excel共有文字列が不正です');
       cells[index]=String(value??'');
     }
     out.push({cells:Array.from({length:cells.length},(_,i)=>cells[i]??''),line});
   }
   return out;
 }
 async function read(buffer){
   const files=await unzip(buffer);
   const book=xml(files.get('xl/workbook.xml'));
   const sheets=all(book,'sheet');
   if(sheets.length!==1)throw Error('初期版はワークシートが1枚のExcelのみ対応しています');
   const rels=xml(files.get('xl/_rels/workbook.xml.rels'));
   const rid=sheets[0].getAttribute('r:id')||sheets[0].getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
   const rel=all(rels,'Relationship').find(x=>x.getAttribute('Id')===rid);
   if(!rel)throw Error('Excelシート参照が見つかりません');
   const target=rel.getAttribute('Target')||'';
   if(!target||target.includes('..')||rel.getAttribute('TargetMode')==='External')throw Error('外部シート参照は使用できません');
   const sheetPath=target.startsWith('/')?target.slice(1):target.startsWith('xl/')?target:'xl/'+target;
   const shared=files.get('xl/sharedStrings.xml');
   const strings=shared?all(xml(shared),'si').map(si=>text(si,'t')):[];
   const records=readSheet(xml(files.get(sheetPath)),strings);
   if(!records.length||!records[0].cells.length)throw Error('Excelに見出し行がありません');
   return records;
 }
 return {read};
})();
