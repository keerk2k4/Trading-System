import { defineConfig, devices } from '@playwright/test';

// The journeys run against the real, already-running stack (UI, auth service,
// Trade REST API, executor, Postgres, Kafka). Nothing is started here and
// nothing is mocked. Export the E2E_* variables first - see e2e/README.md.
export default defineConfig({
  testDir: './e2e',
  // One test at a time: the Trade REST API allocates order IDs with
  // MAX(order_id) + 1, so two orders placed at the same moment can collide
  // on the primary key and come back as ERR-500.
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: process.env['E2E_BASE_URL'] || 'http://localhost:4200',
    trace: 'on-first-retry'
  },
  webServer: undefined,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
