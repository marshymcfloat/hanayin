import { defineConfig, devices } from '@playwright/test';
import { requireTestDatabase } from './scripts/test-database-target.mjs';
import { ISOLATED_AUTH_SECRET } from './test/support/e2e-environment';

const PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:3100';
const testDatabase = process.env.TEST_DATABASE_DISPOSABLE === '1'
  ? requireTestDatabase()
  : undefined;

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './test/e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI
    ? [['line'], ['github'], ['html', { open: 'never' }]]
    : 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL for relative page.goto('/path') calls in smoke tests. */
    baseURL: PLAYWRIGHT_BASE_URL,
    serviceWorkers: 'block',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: process.env.E2E_USE_PRODUCTION === '1'
      ? 'npm run start -- --hostname 127.0.0.1 --port 3100'
      : 'npm run dev -- --hostname 127.0.0.1 --port 3100',
    url: PLAYWRIGHT_BASE_URL,
    reuseExistingServer: !process.env.CI && process.env.TEST_DATABASE_DISPOSABLE !== "1",
    timeout: 120_000,
    env: testDatabase ? {
      DATABASE_URL: testDatabase,
      DIRECT_DATABASE_URL: testDatabase,
      E2E_DATABASE_URL: testDatabase,
      NEXTAUTH_URL: PLAYWRIGHT_BASE_URL,
      NEXT_PUBLIC_APP_URL: PLAYWRIGHT_BASE_URL,
      NEXTAUTH_SECRET: ISOLATED_AUTH_SECRET,
      CRON_SECRET: 'isolated-cron-secret-not-for-production',
      BOOKING_SUCCESS_TOKEN_SECRET: '',
      PRISMA_SERVICE_TOKEN: '',
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
      SEMAPHORE_API: '',
      RESEND_API_KEY: '',
      OPENAI_KEY: '',
      OPENAI_API_KEY: '',
      GEMINI_KEY: '',
      GEMINI_API_KEY: '',
      BLOB_READ_WRITE_TOKEN: '',
      PEXELS_API_KEY: '',
      META_APP_ID: '',
      META_APP_SECRET: '',
      SOCIAL_TOKEN_ENCRYPTION_KEY: '',
      SOCIAL_PUBLISHING_ENABLED: 'true',
      SOCIAL_PUBLISHING_PILOT_SLUGS: '',
    } : undefined,
  },
});
