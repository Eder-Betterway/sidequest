import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// Claude Code cloud sessions ship a Chromium at this path; CI installs its own.
const preinstalled = "/opt/pw-browsers/chromium";
const executablePath = !process.env.CI && existsSync(preinstalled) ? preinstalled : undefined;

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  // Tests share one set of local Firebase servers, so run them one at a time.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      // Pixel 7 runs on Chromium. The iPhone presets need WebKit, which isn't installed here.
      name: "phone",
      use: { ...devices["Pixel 7"], launchOptions: { executablePath } },
    },
  ],
  webServer: [
    {
      // Local Firebase (Auth + Firestore) so tests never touch real data.
      command: "npx firebase emulators:start --only auth,firestore --project demo-sidequest",
      url: "http://127.0.0.1:9099",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      // Let the Firebase CLI stop its Java emulator instead of orphaning it.
      gracefulShutdown: { signal: "SIGINT", timeout: 15_000 },
    },
    {
      // A real production build, so the service worker registers like it does on a phone.
      command: `npm run build && npm run start -- -p ${PORT}`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: {
        NEXT_PUBLIC_FIREBASE_EMULATORS: "1",
        FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
        ALLOWED_EMAILS: "tester@example.com,partner@example.com",
      },
    },
  ],
});
