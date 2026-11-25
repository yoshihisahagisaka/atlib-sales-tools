import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
  testDir:'.',
  testMatch:['assessmentDeviceImport.browser.test.ts'],
  workers:1,
  timeout:30000,
  reporter:'list',
  use:{headless:true},
  projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}]
});
