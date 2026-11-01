import ExcelJS from 'exceljs';

export const columns = ['受付ID','受付日時','施策','状態','企業名','担当者名','認証済みメール','WebサイトURL','電話番号','所属組合名','住所'] as const;
const values = (row:any) => [row.receipt_id,new Date(row.received_at).toISOString(),row.initiative_name,row.state,row.company_name,row.contact_name,row.verified_email,row.website_url,row.phone??'',row.union_name??'',row.address??''];
const csvCell=(value:unknown)=>`"${String(value).replace(/"/g,'""')}"`;
export function csv(rows:any[]):Buffer { return Buffer.from(`\uFEFF${[columns,...rows.map(values)].map(row=>row.map(csvCell).join(',')).join('\r\n')}\r\n`,'utf8'); }
export async function xlsx(rows:any[]):Promise<Buffer> {
  const book=new ExcelJS.Workbook(); const sheet=book.addWorksheet('受付一覧');
  sheet.addRow([...columns]); for(const row of rows) sheet.addRow(values(row));
  sheet.getRow(1).font={bold:true}; sheet.views=[{state:'frozen',ySplit:1}]; sheet.columns=columns.map((header,index)=>({header,key:String(index),width:Math.max(14,header.length*2+2)}));
  return Buffer.from(await book.xlsx.writeBuffer());
}
