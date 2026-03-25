import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  testDir: './e2e',
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'PORT=8080 SRIJAN_ADMIN_PASSWORD=testpass SRIJAN_JWT_SECRET=e2e-test-secret SRIJAN_SECRETS_KEY=dev-key-32-bytes-long-pad-here! SRIJAN_DATA_DIR=/tmp/srijan-e2e-data WORKSPACE_ROOT=/tmp/srijan-e2e-workspaces npx tsx ../src/server.ts',
    url: 'http://localhost:8080/forge/',
    reuseExistingServer: true,
    timeout: 30000,
    cwd: __dirname,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
