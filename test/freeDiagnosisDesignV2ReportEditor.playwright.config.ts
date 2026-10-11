import { defineConfig, devices } from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:['freeDiagnosisDesignV2ReportEditor.browser.test.ts'],workers:1,timeout:60000,reporter:'list',use:{headless:true},projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['Pixel 5']}}]});
