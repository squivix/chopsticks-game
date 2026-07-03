import { defineConfig, devices } from "@playwright/test";

// End-to-end tests drive the real app in a browser. They live in e2e/ and use
// the .spec.js extension, so Vitest (test/**/*.test.js) never picks them up and
// vice-versa. Playwright starts the Vite dev server itself, reusing one that is
// already running locally.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:8741",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:8741",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
