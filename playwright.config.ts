import { defineConfig, devices } from '@playwright/test';

// Locally only Chromium is installed; in CI (GitHub Actions) Firefox and
// WebKit (Safari's engine) are installed too, so all three run there.
const allBrowsers = !!process.env.CI;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  use: { baseURL: 'http://localhost:4173' },
  webServer: [
    {
      command: 'npm run build && npx vite preview --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // The online room server, run locally (tests/e2e/online.spec.ts).
      command: 'npm run server:dev -- --ip 127.0.0.1',
      url: 'http://127.0.0.1:8787/',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...(allBrowsers
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'webkit', use: { ...devices['Desktop Safari'] } },
        ]
      : []),
  ],
});
