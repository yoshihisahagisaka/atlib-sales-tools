import { defineConfig, devices } from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:['businessKaizenDiagnosisUi.browser.test.ts'],workers:1,timeout:90_000,reporter:'list',use:{headless:true},projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['Pixel 5']}}]});
