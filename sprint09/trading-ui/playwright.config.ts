import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// Loads the E2E_* variables from .env.local (gitignored) next to this file,
// so the tests work from any terminal and from the VS Code Testing panel.
// Variables already set in the environment are not overwritten. With no
// .env.local (e.g. CI) the real environment is used as it is.
try {
  process.loadEnvFile(path.join(__dirname, '.env.local'));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
    throw error;
  }
}

// The journeys run against the real, already-running stack (UI, auth service,
// Trade REST API, executor, Postgres, Kafka). Nothing is started here and
// nothing is mocked.
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
