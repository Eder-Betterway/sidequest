import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// Claude Code cloud sessions ship a Chromium at this path; CI installs its own.
const preinstalled = "/opt/pw-browsers/chromium";
const executablePath = !process.env.CI && existsSync(preinstalled) ? preinstalled : undefined;

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
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
  webServer: {
    // A real production build, so the service worker registers like it does on a phone.
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
