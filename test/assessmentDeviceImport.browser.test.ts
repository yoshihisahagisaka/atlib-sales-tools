import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(__dirname,'..');
test.beforeEach(async({page})=>{
 await page.route('http://assessment.local/admin/assessment-device-import-preview.html',async route=>{
   await route.fulfill({status:200,contentType:'text/html',body:fs.readFileSync(path.join(root,'public/admin/assessment-device-import-preview.html'),'utf8')});
 });
 await page.route('http://assessment.local/css/style.css',async route=>route.fulfill({status:200,contentType:'text/css',body:''}));
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
 await page.locator('#csv-file').setInputFiles({name:'formula.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('UEsDBBQAAAAIALg9cl1229uIkAAAAOQAAAAPAAAAeGwvd29ya2Jvb2sueG1sjY8xDoMwDEWvgnyAGjp0QMDUhbknSINpIkgc2ana4zeFsnfy87f8LHcvluXOvFTvsEbtweWcWkS1joLREyeKZTKzBJNLKw/UJGQmdUQ5rHiu6wsG4yPshlb+cfA8e0tXts9AMe8SodVkz1GdTwpDt13QX62iCdTD7csNVFs2Tj0UltYXkHFqAIcOjzU8Phs+UEsDBBQAAAAIALg9cl22VKrPjgAAAPEAAAAaAAAAeGwvX3JlbHMvd29ya2Jvb2sueG1sLnJlbHONzz0OwjAMBeCrVDlA3TIwoCYTS1fEBaLUbaI2P7KNgNsTMaAiMTBZfpa+Jw8X3KyEnNiHws0jbom18iLlBMDOY7Tc5oKpXuZM0UpdaYFi3WoXhEPXHYH2hjLD3mzGSSsap14112fBf+w8z8HhObtbxCQ/KuCeaWWPKBW1tKBo9YkY3qNvq6rADPD1oXkBUEsDBBQAAAAIALg9cl1DC5vAzQAAAE8BAAAYAAAAeGwvd29ya3NoZWV0cy9zaGVldDEueG1ssynPL8ouzkhNLVGoyM3JK7ZVyigpKbDS1y9OzkjNTSzWyy9IzQPKpOUX5SaWALlF6frFBUWpiSlgTbk5+kYGBmb6uYmZeUp2NmAxl8SSRDubovxyhSJbJUOgaDKI4WiopFBiq5SZl5OZlxpcUgQUzyy2symxe7G5/fmUxc+nrnrav91Gv8TORh8krp8M1eeES1+A89MJvaga9IGWwm02gtsMYpXZGWob2uin2dmU2RnZ6Jch22CEw4an07Y9W7o2wBmbJfpIXtWHh6EdAFBLAQIUAxQAAAAIALg9cl1229uIkAAAAOQAAAAPAAAAAAAAAAAAAACAAQAAAAB4bC93b3JrYm9vay54bWxQSwECFAMUAAAACAC4PXJdtlSqz44AAADxAAAAGgAAAAAAAAAAAAAAgAG9AAAAeGwvX3JlbHMvd29ya2Jvb2sueG1sLnJlbHNQSwECFAMUAAAACAC4PXJdQwubwM0AAABPAQAAGAAAAAAAAAAAAAAAgAGDAQAAeGwvd29ya3NoZWV0cy9zaGVldDEueG1sUEsFBgAAAAADAAMAywAAAIYCAAAAAA==','base64')});
 await expect(page.locator('#file-status')).toContainText('数式を含むExcel');
 await expect(page.locator('#mapping-panel')).toBeHidden();
});
