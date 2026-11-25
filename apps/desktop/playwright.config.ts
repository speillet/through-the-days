// End-to-end tests of the interface in WebKit (the engine of the macOS webview)
// and Chromium, against the browser preview's synthetic in-browser journal. The
// locale and time zone are French on purpose: the interface must stay English.

import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.TTD_E2E_PORT ?? 1430);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const previewDir = `node_modules/.cache/ttd-e2e-${PORT}`;
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
    // Build the Tauri frontend into a test-only directory for this server.
    command: `npm run build -- --outDir ${previewDir} && npx vite preview --outDir ${previewDir} --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !CI && !process.env.TTD_E2E_PORT,
    timeout: 60_000,
  },
});
