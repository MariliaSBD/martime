import { defineConfig } from '@playwright/test';

// Real Supabase: the build uses .env.local (URL + public key). A test user is created and deleted around the run.
export default defineConfig({
  testDir: 'tests/integration',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  globalSetup: './tests/integration/setup.ts',
  globalTeardown: './tests/integration/teardown.ts',
  use: { baseURL: 'http://localhost:4175/martime/', timezoneId: 'Europe/Lisbon', locale: 'pt-PT', browserName: 'chromium', viewport: { width: 1280, height: 800 } },
  webServer: {
    command: 'npx vite build --outDir dist-int --emptyOutDir && npx vite preview --outDir dist-int --port 4175 --strictPort',
    url: 'http://localhost:4175/martime/',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
