import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/web',
  timeout: 45000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:8081/family-ledger',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 390, height: 844 },
  },
  projects: [
    {
      name: 'Mobile Chromium',
      use: {
        ...devices['Pixel 5'],
      },
    },
  ],
  webServer: {
    command: 'node scripts/serve-web.mjs',
    url: 'http://localhost:8081/family-ledger/',
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
});
