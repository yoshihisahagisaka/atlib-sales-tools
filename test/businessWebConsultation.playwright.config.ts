import { defineConfig, devices } from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:['businessWebConsultation.browser.test.ts'],workers:1,timeout:60000,reporter:'list',use:{headless:true},projects:[{name:'desktop',use:{...devices['Desktop Chrome']}}]});
