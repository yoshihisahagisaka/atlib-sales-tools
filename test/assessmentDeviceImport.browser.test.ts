import {test,expect} from '@playwright/test';
import {previewDeviceCsv} from '../src/domain/assessmentDeviceImportPreview';
import fs from 'node:fs';
import {deflateRawSync} from 'node:zlib';
import path from 'node:path';
const root=path.resolve(__dirname,'..');
test.beforeEach(async({page})=>{
 await page.route('http://assessment.local/admin/assessment-device-import-preview.html',async route=>{
   await route.fulfill({status:200,contentType:'text/html',body:fs.readFileSync(path.join(root,'public/admin/assessment-device-import-preview.html'),'utf8')});
 });
 await page.route('http://assessment.local/css/style.css',async route=>route.fulfill({status:200,contentType:'text/css',body:''}));
 await page.route('http://assessment.local/js/assessment-device-preview-core.js',async route=>{
   await route.fulfill({status:200,contentType:'text/javascript',body:fs.readFileSync(path.join(root,'public/js/assessment-device-preview-core.js'),'utf8')});
 });
 await page.route('http://assessment.local/js/assessment-xlsx-reader.js',async route=>{
   await route.fulfill({status:200,contentType:'text/javascript',body:fs.readFileSync(path.join(root,'public/js/assessment-xlsx-reader.js'),'utf8')});
 });
 await page.route('http://assessment.local/js/assessment-device-import-preview.js',async route=>{
   await route.fulfill({status:200,contentType:'text/javascript',body:fs.readFileSync(path.join(root,'public/js/assessment-device-import-preview.js'),'utf8')});
 });
 await page.goto('http://assessment.local/admin/assessment-device-import-preview.html');
});
test('CSV upload maps known columns, keeps user and status out of Device fields',async({page})=>{
 await page.locator('#csv-file').setInputFiles({name:'devices.csv',mimeType:'text/csv',buffer:Buffer.from('資産番号,PC名,シリアル番号,利用者,状態\nPC-01,営業PC,SN-1,田中,利用中')});
 await expect(page.locator('#mapping-panel')).toBeVisible();
 await expect(page.locator('#mapping-body select').nth(0)).toHaveValue('asset_tag');
 await expect(page.locator('#mapping-body select').nth(1)).toHaveValue('display_name');
 await expect(page.locator('#mapping-body select').nth(3)).toHaveValue('');
 await expect(page.locator('#mapping-body select').nth(4)).toHaveValue('');
 await page.locator('#refresh-preview').click();
 await expect(page.locator('#preview-summary')).toContainText('正本照合待ち 1 行');
 await expect(page.locator('#preview-body')).toContainText('PC-01');
 await expect(page.locator('#preview-body')).not.toContainText('AVAILABLE');
 await expect(page.getByRole('button',{name:'FACTACTへ登録'})).toHaveCount(0);
});
test('ambiguous header requires human mapping and duplicate asset tags require review',async({page})=>{
 await page.locator('#csv-file').setInputFiles({name:'devices.csv',mimeType:'text/csv',buffer:Buffer.from('番号,PC名\nPC-01,A\nPC-01,B')});
 await page.locator('#refresh-preview').click();
 await expect(page.locator('#preview-summary')).toContainText('要確認 2 行');
 await page.locator('#mapping-body select').nth(0).selectOption('asset_tag');
 await page.locator('#refresh-preview').click();
 await expect(page.locator('#preview-body')).toContainText('ファイル内で資産番号が重複');
});
test('CSV parser handles multiline quoted cells and preserves original line',async({page})=>{
 await page.locator('#csv-file').setInputFiles({name:'devices.csv',mimeType:'text/csv',buffer:Buffer.from('資産番号,PC名\nPC-01,"営業\n予備"\nPC-02,B')});
 await page.locator('#refresh-preview').click();
 await expect(page.locator('#preview-body tr')).toHaveCount(2);
 await expect(page.locator('#preview-body tr').nth(1).locator('td').first()).toHaveText('4');
});
test('invalid CSV reports error and does not show preview',async({page})=>{
 await page.locator('#csv-file').setInputFiles({name:'invalid.csv',mimeType:'text/csv',buffer:Buffer.from('資産番号,PC名\n"PC-01,A')});
 await expect(page.locator('#file-status')).toContainText('読込エラー');
 await expect(page.locator('#preview-panel')).toBeHidden();
});

test('XLSX compressed workbook is read locally and mapped through same preview',async({page})=>{
 await page.locator('#csv-file').setInputFiles({name:'devices.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('UEsDBBQAAAAIAGUdcl3e4HGbegAAAJcAAAAPAAAAeGwvd29ya2Jvb2sueG1sNY4xDsMgEAS/YvGAnJMiBQIqN3kGwUdANhy6w0meH4q4Wq1mR1rzId6eRNv0LXsVzVal3psGkJCweLlQwzpYJC6+j8ovoBhzwIXCUbB2uM3zHRh33zNVSbmJckYSYpd/TtUXtGrB9/BETazzahU/1qsCZ+DcwnnG/QBQSwMEFAAAAAgAZR1yXdTErVk/AAAAVwAAABoAAAB4bC9fcmVscy93b3JrYm9vay54bWwucmVsc7MJSs1JLMnMzyvOyCwotrNB5ip4ptgqFXmmGCophCQWpaeW2CqV5xdlF2ekppYU64MpQ72K3BwlfTsbfVRzAFBLAwQUAAAACABlHXJdrNP8Sj4AAABpAAAAFAAAAHhsL3NoYXJlZFN0cmluZ3MueG1ssykuLrGzKc60symxe7G5/fmUxc+nrnrav91GHyisDxKHyAU4P53Qiymoa2CILvh02rZnS9cGOCPE9UF2AABQSwMEFAAAAAgAZR1yXb6eN9hZAAAAwAAAABgAAAB4bC93b3Jrc2hlZXRzL3NoZWV0MS54bWyzKc8vyi7OSE0tsbMBUy6JJYl2NkX55QpFtkqGSnY2ySCGo6GSQomtUjGQX2ZnYKNfZmejnwyVc0KWM4TL6QPNgBtkBDfICEmxEZpByHLGaAbpI7lOH+FoAFBLAQIUAxQAAAAIAGUdcl3e4HGbegAAAJcAAAAPAAAAAAAAAAAAAACAAQAAAAB4bC93b3JrYm9vay54bWxQSwECFAMUAAAACABlHXJd1MStWT8AAABXAAAAGgAAAAAAAAAAAAAAgAGnAAAAeGwvX3JlbHMvd29ya2Jvb2sueG1sLnJlbHNQSwECFAMUAAAACABlHXJdrNP8Sj4AAABpAAAAFAAAAAAAAAAAAAAAgAEeAQAAeGwvc2hhcmVkU3RyaW5ncy54bWxQSwECFAMUAAAACABlHXJdvp432FkAAADAAAAAGAAAAAAAAAAAAAAAgAGOAQAAeGwvd29ya3NoZWV0cy9zaGVldDEueG1sUEsFBgAAAAAEAAQADQEAAB0CAAAAAA==','base64')});
 await expect(page.locator('#mapping-panel')).toBeVisible();
 await page.locator('#refresh-preview').click();
 await expect(page.locator('#preview-body')).toContainText('PC-01');
 await expect(page.locator('#preview-body')).toContainText('営業PC');
 await expect(page.locator('#preview-summary')).toContainText('正本照合待ち 1 行');
});

test('formula XLSX is rejected instead of trusting cached formula result',async({page})=>{
 await page.locator('#csv-file').setInputFiles({name:'formula.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('UEsDBBQAAAAIAGdAcl15CEmGfwAAAKIAAAAPAAAAeGwvd29ya2Jvb2sueG1sNY7BDsIgEER/peED3NaDBwKcvPTsFyBdhLSwzS5GP1809jRvZjLJmBfxeidah3fZqmi2KrW2awAJCYuXE+1YexeJi2/d8gMoxhzwSuFZsDY4j+MFGDffMlVJeRfljCTEJn8dqi9o1e3Lkxp+2bxY1Zl17sDzMilwBo4ZHL/cB1BLAwQUAAAACABnQHJd1MStWT8AAABXAAAAGgAAAHhsL19yZWxzL3dvcmtib29rLnhtbC5yZWxzswlKzUksyczPK87ILCi2s0HmKnim2CoVeaYYKimEJBalp5bYKpXnF2UXZ6SmlhTrgylDvYrcHCV9Oxt9VHMAUEsDBBQAAAAIAGdAcl30hQ7YiQAAAAoBAAAYAAAAeGwvd29ya3NoZWV0cy9zaGVldDEueG1ssynPL8ouzkhNLbGzAVMuiSWJdjZF+eUKRbZKhkp2NskghqOhkkKJrVJmXk5mXmpwSRFQPLPYzqbE7sXm9udTFj+fuupp/3YbfaAh+iBx/WSoPidc+gKcn07oRdWgD7QUbrMR3GYjnCboGhhisxKkNc3OUBsomWZnU2ZnZKNfhmyDPpI/9RHeBwBQSwECFAMUAAAACABnQHJdeQhJhn8AAACiAAAADwAAAAAAAAAAAAAAgAEAAAAAeGwvd29ya2Jvb2sueG1sUEsBAhQDFAAAAAgAZ0ByXdTErVk/AAAAVwAAABoAAAAAAAAAAAAAAIABrAAAAHhsL19yZWxzL3dvcmtib29rLnhtbC5yZWxzUEsBAhQDFAAAAAgAZ0ByXfSFDtiJAAAACgEAABgAAAAAAAAAAAAAAIABIwEAAHhsL3dvcmtzaGVldHMvc2hlZXQxLnhtbFBLBQYAAAAAAwADAMsAAADiAQAAAAA=','base64')});
 await expect(page.locator('#file-status')).toContainText('数式を含むExcel');
 await expect(page.locator('#mapping-panel')).toBeHidden();
});

test('browser CSV preview agrees with domain preview for duplicate and pending rows',async({page})=>{
 const csv='資産番号,PC名,シリアル番号\nPC-001,A,S1\nPC-001,B,S2\nPC-002,C,S3';
 const expected=previewDeviceCsv(csv);
 await page.locator('#csv-file').setInputFiles({name:'parity.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
 await page.locator('#refresh-preview').click();
 const browser=await page.locator('#preview-body tr').evaluateAll(rows=>rows.map(row=>{
   const cells=[...row.querySelectorAll('td')].map(cell=>cell.textContent||'');
   return {sourceRowNumber:Number(cells[0]),assetTag:cells[1],displayName:cells[2],serial:cells[3],outcome:cells[4]};
 }));
 expect(browser).toEqual(expected.rows.map(r=>({
   sourceRowNumber:r.sourceRowNumber,
   assetTag:r.mappedCandidate.asset_tag,
   displayName:r.mappedCandidate.display_name,
   serial:r.mappedCandidate.serial_number,
   outcome:r.outcome==='NEEDS_REVIEW'?'要確認':'正本照合待ち'
 })));
});


// Synthetic workbook ZIPs are constructed in test code; no customer files or remote fixtures.
function zipEntries(entries:Record<string,string>):Buffer {
 const locals:Buffer[]=[],centrals:Buffer[]=[];let offset=0;
 const u16=(n:number)=>{const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;};
 const u32=(n:number)=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
 const crc=(data:Buffer)=>{let v=0xffffffff;for(const byte of data){v^=byte;for(let i=0;i<8;i++)v=(v>>>1)^((v&1)?0xedb88320:0);}return (v^0xffffffff)>>>0;};
 for(const [name,content] of Object.entries(entries)){
  const data=Buffer.from(content),packed=deflateRawSync(data),filename=Buffer.from(name),hash=crc(data);
  const local=Buffer.concat([u32(0x04034b50),u16(20),u16(0),u16(8),u16(0),u16(0),u32(hash),u32(packed.length),u32(data.length),u16(filename.length),u16(0),filename,packed]);
  locals.push(local);
  centrals.push(Buffer.concat([u32(0x02014b50),u16(20),u16(20),u16(0),u16(8),u16(0),u16(0),u32(hash),u32(packed.length),u32(data.length),u16(filename.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),filename]));
  offset+=local.length;
 }
 const central=Buffer.concat(centrals);
 const eocd=Buffer.concat([u32(0x06054b50),u16(0),u16(0),u16(centrals.length),u16(centrals.length),u32(central.length),u32(offset),u16(0)]);
 return Buffer.concat([...locals,central,eocd]);
}
function workbook(sheetXml:string,options?:{twoSheets?:boolean}):Buffer {
 const workbookXml='<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Assets" sheetId="1" r:id="rId1"/>'+
 (options?.twoSheets?'<sheet name="Other" sheetId="2" r:id="rId2"/>':'')+'</sheets></workbook>';
 const rels='<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/>'+
 (options?.twoSheets?'<Relationship Id="rId2" Target="worksheets/sheet2.xml"/>':'')+'</Relationships>';
 return zipEntries({'xl/workbook.xml':workbookXml,'xl/_rels/workbook.xml.rels':rels,'xl/worksheets/sheet1.xml':sheetXml,...(options?.twoSheets?{'xl/worksheets/sheet2.xml':'<worksheet><sheetData/></worksheet>'}:{})});
}
const header='<row r="1"><c r="A1" t="inlineStr"><is><t>資産番号</t></is></c><c r="B1" t="inlineStr"><is><t>PC名</t></is></c></row>';
const sheet=(rows:string)=>'<worksheet><sheetData>'+header+rows+'</sheetData></worksheet>';
async function uploadWorkbook(page:any,buffer:Buffer){
 await page.locator('#csv-file').setInputFiles({name:'synthetic.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer});
}
test('XLSX sparse physical rows and leading-zero asset IDs survive preview',async({page})=>{
 const xml=sheet('<row r="2"><c r="A2" t="inlineStr"><is><t>000123</t></is></c><c r="B2" t="inlineStr"><is><t>営業PC</t></is></c></row>'+
 '<row r="4"><c r="A4" t="inlineStr"><is><t>000124</t></is></c><c r="B4" t="inlineStr"><is><t>予備PC</t></is></c></row>');
 await uploadWorkbook(page,workbook(xml));
 await page.locator('#refresh-preview').click();
 await expect(page.locator('#preview-body tr')).toHaveCount(2);
 await expect(page.locator('#preview-body tr').nth(0).locator('td').nth(1)).toHaveText('000123');
 await expect(page.locator('#preview-body tr').nth(1).locator('td').first()).toHaveText('4');
});
test('XLSX multiple worksheets fail closed without guessing which sheet',async({page})=>{
 await uploadWorkbook(page,workbook(sheet(''),{twoSheets:true}));
 await expect(page.locator('#file-status')).toContainText('ワークシートが1枚');
 await expect(page.locator('#mapping-panel')).toBeHidden();
});
test('XLSX styled numeric asset identifier fails closed',async({page})=>{
 await uploadWorkbook(page,workbook(sheet('<row r="2"><c r="A2" s="1"><v>123</v></c><c r="B2" t="inlineStr"><is><t>営業PC</t></is></c></row>')));
 await expect(page.locator('#file-status')).toContainText('文字列として保存');
 await expect(page.locator('#mapping-panel')).toBeHidden();
});
test('XLSX malformed ZIP fails closed',async({page})=>{
 await uploadWorkbook(page,Buffer.from('not-a-zip'));
 await expect(page.locator('#file-status')).toContainText('ZIP構造');
 await expect(page.locator('#mapping-panel')).toBeHidden();
});

test('XLSX ZIP64 sentinel fails closed',async({page})=>{
 const b=workbook(sheet(''));
 const eocd=b.length-22;
 b.writeUInt16LE(0xffff,eocd+10);
 await uploadWorkbook(page,b);
 await expect(page.locator('#file-status')).toContainText('ZIP64');
 await expect(page.locator('#mapping-panel')).toBeHidden();
});
test('XLSX duplicate ZIP entry fails closed',async({page})=>{
 const xml=sheet('');
 const b=zipEntries({'xl/workbook.xml':'<workbook/>','xl/_rels/workbook.xml.rels':'<Relationships/>','xl/worksheets/sheet1.xml':xml});
 // Duplicate central-directory filename with different local entries is rejected by the reader.
 // Here the second ZIP index points to the same local entry, without modifying payload.
 const end=b.length-22,centralOffset=b.readUInt32LE(end+16);
 const firstNameLength=b.readUInt16LE(centralOffset+28);
 const firstEntryLength=46+firstNameLength;
 const first=b.subarray(centralOffset,centralOffset+firstEntryLength);
 const centralSize=b.readUInt32LE(end+12);
 const rebuilt=Buffer.concat([b.subarray(0,end),first,b.subarray(end)]);
 const newEnd=rebuilt.length-22;
 rebuilt.writeUInt16LE(4,newEnd+8);
 rebuilt.writeUInt16LE(4,newEnd+10);
 rebuilt.writeUInt32LE(centralSize+first.length,newEnd+12);
 await uploadWorkbook(page,rebuilt);
 await expect(page.locator('#file-status')).toContainText('重複ファイル');
 await expect(page.locator('#mapping-panel')).toBeHidden();
});

test('oversized CSV is rejected before rendering mapping',async({page})=>{
 const oversized='資産番号,PC名\n'+('A'.repeat(5*1024*1024))+',B';
 await page.locator('#csv-file').setInputFiles({name:'large.csv',mimeType:'text/csv',buffer:Buffer.from(oversized)});
 await expect(page.locator('#file-status')).toContainText('大きすぎます');
 await expect(page.locator('#mapping-panel')).toBeHidden();
});
test('CSV with too many columns is rejected before rendering mapping',async({page})=>{
 const header=Array.from({length:201},(_,i)=>'col'+i).join(',');
 await page.locator('#csv-file').setInputFiles({name:'wide.csv',mimeType:'text/csv',buffer:Buffer.from(header+'\n')});
 await expect(page.locator('#file-status')).toContainText('200列以内');
 await expect(page.locator('#mapping-panel')).toBeHidden();
});
