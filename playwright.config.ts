import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 3,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e.json' }]],
  use: {
    baseURL: 'http://localhost:4174/martime/',
    timezoneId: 'Europe/Lisbon',
    locale: 'pt-PT',
    trace: 'retain-on-failure',
  },
  webServer: {
    // local-only build: no Supabase variables, no service worker
    command: 'VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= VITE_NO_SW=1 npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --port 4174 --strictPort',
    url: 'http://localhost:4174/martime/',
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 13'], browserName: 'webkit', viewport: { width: 390, height: 844 } } },
    { name: 'mac-chromium', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
    { name: 'mac-webkit', use: { browserName: 'webkit', viewport: { width: 1280, height: 800 } } },
  ],
});
