import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5174', locale: 'th-TH', timezoneId: 'Asia/Bangkok' },
  webServer: {
    command: 'node scripts/build.mjs --preview && node scripts/serve.mjs 5174',
    url: 'http://localhost:5174',
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile-375',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 800 }, hasTouch: true },
    },
  ],
});
