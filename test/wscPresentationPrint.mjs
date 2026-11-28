import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';

const source=path.resolve(process.argv[2]||'review-reports');
const output=path.resolve(process.argv[3]||'review-pdf');
fs.mkdirSync(output,{recursive:true});
const names=fs.readdirSync(source).filter(n=>n.endsWith('.html')).sort();
assert.equal(names.length,29,'all 25 variants and 4 combined fixtures');
const norm=s=>s.normalize('NFKC').replace(/\s+/gu,'').replace(/\u00ad/g,'');
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1280,height:900}});
await context.route('**/*',r=>/^https?:/i.test(r.request().url())?r.abort():r.continue());
const page=await context.newPage();
const results=[];
try{
  for(const name of names){
    const html=fs.readFileSync(path.join(source,name),'utf8');
    // Exactly the public WscHtmlService print adapter; preserve same engine HTML.
    const publicHtml=html.replace('</head>','<style>@media print{.overview .ov-item{padding:1mm 0}.overview .technical-heading{margin-bottom:1px}.overview .ov-head{padding:2mm}.overview .ov-list{padding:0 2mm}.overview .ov-item b{font-size:9pt}.overview .attention{margin-top:2mm;padding:2mm 3mm}.overview .attention li{margin:0 0 1mm}.overview .attention h3{margin:0 0 1mm}}</style></head>').replace('<div class="review-banner">内部デザインレビュー用｜対外配布不可</div>','');
    await page.setContent(publicHtml,{waitUntil:'load'});
    await page.emulateMedia({media:'print'});
    await page.evaluate(()=>document.fonts.ready);
    const expected=await page.locator('section.detail article.finding h3,section.detail article.finding h4,section.detail article.finding p,.final-note p').allTextContents();
    const file=path.join(output,name.replace(/\.html$/,'.pdf'));
    await page.pdf({path:file,format:'A4',printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false});
    const pdf=fs.readFileSync(file);assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
    const raw=execFileSync('pdftotext',['-raw',file,'-'],{encoding:'utf8'});
    const pages=raw.split('\f').filter(p=>p.trim());
    const meta=execFileSync('pdfinfo',[file],{encoding:'utf8'});
    const pageCount=Number(meta.match(/^Pages:\s+(\d+)/m)?.[1]);
    assert.equal(pages.length,pageCount,name+': unexpected blank page');
    assert.ok(pageCount>=4&&pageCount<=12,name+': page count '+pageCount);
    assert.match(norm(pages[2]),/今回の診断で分かったこと/,name+': overview page');
    assert.match(norm(raw),/2026年11月29日01:57/,name+': localized date');
    assert.ok(!norm(raw).includes('内部デザインレビュー用'),name+': internal banner');
    const printed=norm(raw);
    for(const paragraph of expected){
      if(norm(paragraph))assert.ok(printed.includes(norm(paragraph)),name+': missing printed text '+paragraph.slice(0,80));
    }
    const cards=await page.locator('section.detail article.finding').evaluateAll(nodes=>nodes.map(node=>Array.from(node.querySelectorAll('h3,h4,p')).map(el=>el.textContent)));
    for(const card of cards){
      assert.ok(pages.some(p=>card.every(t=>norm(p).includes(norm(t)))),name+': finding card split across pages '+card[0]);
    }
    if(name.startsWith('27-')){
      assert.match(norm(pages[2]),/今回、確認をおすすめすること/,name+': review summary should fit overview');
      assert.ok(pageCount<=9,name+': review-heavy pagination regression');
    }
    const bbox=execFileSync('pdftotext',['-bbox-layout',file,'-'],{encoding:'utf8'});
    let words=0;
    for(const m of bbox.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)"/g)){
      const [x0,y0,x1,y1]=m.slice(1).map(Number);words++;
      assert.ok(x0>=-1&&y0>=-1&&x1<=596.5&&y1<=843,name+': text outside A4 bounds');
    }
    assert.ok(words>20,name+': bounding boxes unavailable');
    if(name.startsWith('26-')||name.startsWith('29-')){
      assert.equal(pageCount,7,name+': standard report should remain seven pages');
      assert.match(norm(pages[3]),/Webサイトの通信を守る仕組み/);
    }
    results.push({name,pages:pageCount,verifiedParagraphs:expected.length,words});
    console.log('PRINT_PASS',name,'pages='+pageCount,'paragraphs='+expected.length);
  }
}finally{await browser.close();}
fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2)+'\n');
console.log('WSC_PRINT_COMPLETE='+results.length);
