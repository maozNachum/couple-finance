import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/auth-e2e',
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'off', screenshot: 'off', video: 'off' },
  projects: [
    { name: 'desktop-auth', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-auth', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview --outDir .artifacts/auth-app --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173', reuseExistingServer: false,
  },
});
