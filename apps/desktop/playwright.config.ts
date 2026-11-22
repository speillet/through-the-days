// End-to-end tests of the interface in WebKit (the engine of the macOS webview)
// and Chromium, against the browser preview's synthetic in-browser journal. The
// locale and time zone are French on purpose: the interface must stay English.

import { defineConfig, devices } from '@playwright/test';

const PORT = 1430;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CI = Boolean(process.env.CI);

const context = {
  baseURL: BASE_URL,
  locale: 'fr-FR',
  timezoneId: 'Europe/Paris',
  viewport: { width: 1280, height: 860 },
};

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    ...context,
    // Traces and screenshots only ever contain the synthetic fixtures below.
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'webkit', use: { ...devices['Desktop Safari'], ...context } },
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...context } },
  ],
  webServer: {
    command: 'npx vite --port 1430 --strictPort',
    url: BASE_URL,
    reuseExistingServer: !CI,
    timeout: 60_000,
  },
});
