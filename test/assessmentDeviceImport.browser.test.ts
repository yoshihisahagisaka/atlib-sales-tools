import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(__dirname,'..');
test.beforeEach(async({page})=>{
 await page.route('http://assessment.local/admin/assessment-device-import-preview.html',async route=>{
   await route.fulfill({status:200,contentType:'text/html',body:fs.readFileSync(path.join(root,'public/admin/assessment-device-import-preview.html'),'utf8')});
 });
 await page.route('http://assessment.local/css/style.css',async route=>route.fulfill({status:200,contentType:'text/css',body:''}));
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
