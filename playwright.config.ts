import { defineConfig, devices } from '@playwright/test';

const PORT = 4181;
/** The same app without a dev user: real staff login (against mocks). */
const LOGIN_PORT = 4182;

/** Smoke tests run against the app with MSW mocks — no backends needed. */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /(auth|accept-invitation)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PORT}` },
    },
    {
      name: 'staff-login',
      testMatch: /(auth|accept-invitation)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${LOGIN_PORT}` },
    },
  ],
  webServer: [
    {
      command: `npx vite --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_USE_MOCKS: 'true',
        VITE_DEV_USER: '100:bo:users,bo:users:modify,bo:settings,bo:settings:modify',
      },
    },
    {
      command: `npx vite --port ${LOGIN_PORT} --strictPort`,
      url: `http://localhost:${LOGIN_PORT}`,
      reuseExistingServer: !process.env.CI,
      // Empty wins over a VITE_DEV_USER in .env.local.
      env: { VITE_USE_MOCKS: 'true', VITE_DEV_USER: '' },
    },
  ],
});
