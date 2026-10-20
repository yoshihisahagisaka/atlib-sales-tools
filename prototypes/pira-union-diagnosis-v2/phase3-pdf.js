/* Browser-only PDF adapter. PDF-lib supplies PDF objects/serialization; shared report blocks supply all copy. */
(function(root){'use strict';
const L=root.PDFLib,F=root.PiraPdfFont;
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const hex=s=>[...s].map(c=>{const cp=c.codePointAt(0);if(!F.widths[cp])throw Error('PDF font has no glyph: '+c);return cp.toString(16).padStart(4,'0');}).join('');
async function create(report){
 const doc=await L.PDFDocument.create();doc.setTitle(report.title);doc.setAuthor('atLIB');doc.setSubject(report.versionText);doc.setCreationDate(new Date('2026-10-20T15:00:00Z'));doc.setModificationDate(new Date('2026-10-20T15:00:00Z'));
 const ctx=doc.context,reg=x=>ctx.register(ctx.obj(x));
 const fontFile=ctx.register(ctx.flateStream(bytes(F.data),{Length1:bytes(F.data).length}));
 const descriptor=reg({Type:'FontDescriptor',FontName:'PiraNotoSansJP',Flags:4,FontBBox:F.bbox,ItalicAngle:0,Ascent:880,Descent:-120,CapHeight:733,StemV:80,FontFile2:fontFile});
 const gid=ctx.register(ctx.flateStream(bytes(F.cidMap)));
 const widths=Object.entries(F.widths).flatMap(([cp,w])=>[Number(cp),[w]]);
 const descendant=reg({Type:'Font',Subtype:'CIDFontType2',BaseFont:'PiraNotoSansJP',CIDSystemInfo:{Registry:L.PDFString.of('Adobe'),Ordering:L.PDFString.of('Identity'),Supplement:0},FontDescriptor:descriptor,DW:1000,W:widths,CIDToGIDMap:gid});
 const chars=Object.keys(F.widths).map(Number),cmap=['/CIDInit /ProcSet findresource begin','12 dict begin','begincmap','/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def','/CMapName /PiraUnicode def','/CMapType 2 def','1 begincodespacerange','<0000> <FFFF>','endcodespacerange'];
 for(let i=0;i<chars.length;i+=90){const group=chars.slice(i,i+90);cmap.push(group.length+' beginbfchar',...group.map(cp=>'<'+cp.toString(16).padStart(4,'0')+'> <'+cp.toString(16).padStart(4,'0')+'>'),'endbfchar');}cmap.push('endcmap','CMapName currentdict /CMap defineresource pop','end','end');
 const unicode=ctx.register(ctx.flateStream(cmap.join('\n')));
 const font=reg({Type:'Font',Subtype:'Type0',BaseFont:'PiraNotoSansJP',Encoding:'Identity-H',DescendantFonts:[descendant],ToUnicode:unicode});
 const pages=[];let page,y;
 function newPage(){page=doc.addPage([595.28,841.89]);page.node.setFontDictionary(L.PDFName.of('FJP'),font);pages.push(page);y=785;}
 function line(text,size,color){page.pushOperators(L.beginText(),L.setFontAndSize('FJP',size),L.setFillingRgbColor(...color),L.moveText(45,y),L.showText(L.PDFHexString.of(hex(text))),L.endText());}
 const width=(s,size)=>[...s].reduce((v,c)=>v+(F.widths[c.codePointAt(0)]||1000)*size/1000,0);
 function wrap(text,size){const lines=[];for(const source of text.split('\n')){let buf='';for(const ch of source){if(width(buf+ch,size)>492&&buf){if(/[、。，．）］】」』！？：；]/.test(ch)){lines.push(buf+ch);buf='';continue;}const last=buf.slice(-1);if(/[（［【「『]/.test(last)){lines.push(buf.slice(0,-1));buf=last;}else{lines.push(buf);buf='';}}buf+=ch;}if(buf)lines.push(buf);}return lines;}
 function paragraph(text,size=11.5,color=[.14,.21,.3],heading=false){const lines=wrap(text,size),leading=size*1.8,height=lines.length*leading+(heading?8:12);if((height<700&&y-height<55)||(heading&&y-leading*3<55))newPage();for(const txt of lines){if(y-leading<55)newPage();if(txt)line(txt,size,color);y-=leading;}y-=heading?8:12;}
 newPage();paragraph(report.title,21,[.12,.21,.34],true);paragraph(report.intro);paragraph(report.disclaimer,9,[.35,.42,.5]);
 for(let i=0;i<report.sections.length;i++){const s=report.sections[i];let firstEnd=1;if(s.blocks[0]?.kind==='heading')while(firstEnd<s.blocks.length&&s.blocks[firstEnd].kind!=='heading')firstEnd++;const firstHeight=s.blocks.slice(0,firstEnd).reduce((sum,b)=>{const size=b.kind==='heading'?13.5:b.kind==='source'?9:11.5;return sum+wrap(b.text,size).length*size*1.8+12;},0);if(y-Math.min(firstHeight+65,700)<55)newPage();y-=12;paragraph(String(i+1).padStart(2,'0')+' '+s.title,16,[.12,.35,.32],true);for(let n=0;n<s.blocks.length;n++){const b=s.blocks[n];if(b.kind==='heading'){let end=n+1;while(end<s.blocks.length&&s.blocks[end].kind!=='heading')end++;const height=s.blocks.slice(n,end).reduce((sum,x)=>{const size=x.kind==='heading'?13.5:x.kind==='source'?9:11.5;return sum+wrap(x.text,size).length*size*1.8+12;},0);if(height<700&&y-height<55)newPage();paragraph(b.text,13.5,[.12,.21,.34],true);}else paragraph(b.text,b.kind==='source'?9:11.5,b.kind==='source'?[.35,.42,.5]:[.14,.21,.3]);}}
 paragraph(report.versionText,8,[.35,.42,.5]);
 pages.forEach((p,i)=>{page=p;y=28;line('atLIB | '+(i+1)+' / '+pages.length,8,[.35,.42,.5]);});
 return doc.save({useObjectStreams:false});
}
root.PiraPdf={create};
})(globalThis);
