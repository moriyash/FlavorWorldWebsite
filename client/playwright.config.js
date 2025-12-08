import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  
  fullyParallel: false,
  workers: 1,
  
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    // Start E2E backend server first
    {
      command: 'cd ../server && npm run test:e2e:server',
      url: 'http://localhost:3000/api/test/db-status',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    // Start frontend dev server
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});