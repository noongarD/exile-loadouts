import { defineConfig } from '@playwright/test';

const url = `http://127.0.0.1:${process.env.EXILE_PORT || 4173}`;

export default defineConfig({
  testDir: './tests',
  use: { baseURL: url },
  webServer: {
    command: 'npm start',
    url,
    reuseExistingServer: !process.env.CI,
  },
});
