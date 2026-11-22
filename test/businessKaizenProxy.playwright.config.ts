import { defineConfig, devices } from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'businessKaizenProxy.browser.test.ts',workers:1,timeout:60_000,projects:[
  {name:'desktop',use:{...devices['Desktop Chrome']}},
  {name:'mobile',use:{...devices['iPhone 13'],browserName:'chromium'}},
]});
