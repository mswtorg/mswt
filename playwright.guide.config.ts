import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

// Screenshots for the admin guide (docs/admin-guide). Writes to the database: run only against a
// throwaway local Postgres (`npm run guide:screens`, see docs/admin-guide/README.md), never Neon.
export default defineConfig({
  ...base,
  testDir: "scripts/admin-guide",
  testMatch: /capture\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  timeout: 600_000,
  projects: [
    {
      name: "guide",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1.5 },
    },
  ],
});
