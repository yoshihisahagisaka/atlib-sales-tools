import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '..',
  testMatch: '**/diagnosisHearing.browser.test.ts',
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
});