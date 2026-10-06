import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const extensionPath = path.join(process.cwd(), 'dist');
const userDataDir = path.join(process.cwd(), 'output', 'playwright', 'user-data');

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'output/playwright/report' }]],
  outputDir: 'output/playwright/test-results',
  use: {
    trace: 'on',
    screenshot: 'on',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium-extension',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
  metadata: {
    extensionPath,
    userDataDir,
  },
});
