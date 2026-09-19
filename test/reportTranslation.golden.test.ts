import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const window:any={};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../public/js/report-business-wording.js'),'utf8'),{window});
test('SL-A6: generated report labels translate and round-trip without changing approved storage or user content',()=>{
 const texts=['確認できていること（Human Review済み）：顧客発言があった','まだ分かっていないこと（UNRESOLVED）：担当者は未確認','WHY仮説：役割に差がある可能性がある\n確認できていることとのつながり：未接続（Human Reviewで確認が必要）','Evidence確認候補：資料の存在を確認する'];
 for(const raw of texts){const display=window.reportBusinessWording(raw);assert.doesNotMatch(display,/Human Review|UNRESOLVED|Evidence/);assert.equal(window.reportStoredWording(display,raw),raw);}
 assert.equal(window.reportBusinessWording('顧客の原文：UNKNOWNという言葉を使った'),'顧客の原文：UNKNOWNという言葉を使った','never rewrite quoted customer content');
 const original='まだ分かっていないこと（UNRESOLVED）：分からない';assert.equal(window.reportStoredWording('原因は担当者の不在です',original),'原因は担当者の不在です','meaning-changing edit still reaches existing rejection validator');
});
test('SL-A6: five Business sections preserve block identity and mixed approved wording without reclassification',()=>{
 const context={insights:[{id:'known',semantic_type:'OBSERVATION'},{id:'unknown',semantic_type:'UNKNOWN'}]};
 const mixed={block_id:'mixed',insight_refs:['known','unknown'],text:'観察と未確認事項の承認文'},unknown={block_id:'u',insight_refs:['unknown'],text:'未確認'},gap={block_id:'g',insight_refs:[],text:'差の候補'};
 const stored=[{section_key:'CURRENT_AND_UNKNOWN',blocks:[mixed,unknown]},{section_key:'GAP',blocks:[gap]}],before=JSON.stringify(stored),view=window.reportBusinessSections(stored,context);
 assert.equal(view.length,5);assert.equal(view[1].blocks[0],mixed);assert.equal(view[2].blocks[0],unknown);assert.equal(view[3].blocks[0],gap);assert.ok(view[2].notes[0].includes('未確認'));assert.equal(JSON.stringify(stored),before);
});
