import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.', testMatch: 'itManagementDiagnosis.browser.test.ts',
  fullyParallel: false, workers: 1, timeout: 60000,
  reporter: 'list', outputDir: '../test-results/diagnosis',
  use: { headless: true, screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
