import { defineConfig, devices } from "@playwright/test"
import path from "path"
import fs from "fs"
import { fileURLToPath } from "url"
import dotenv from "dotenv"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const rootDir = path.resolve(__dirname, "..")
const localE2ePath = path.join(rootDir, ".env.e2e.local")

dotenv.config({ path: path.join(rootDir, ".env"), override: true })
dotenv.config({ path: path.resolve(__dirname, ".env"), override: true })
dotenv.config({ path: path.join(rootDir, ".env.e2e"), override: true })
if (fs.existsSync(localE2ePath)) {
  dotenv.config({ path: localE2ePath, override: true })
}

const isCI = !!process.env.CI

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: 1,
  reporter: "html",
  outputDir: "test-results",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5173",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev:server:e2e",
    url: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5173",
    env: {
      VITE_API_URL: process.env.VITE_API_URL || "http://127.0.0.1:8000",
    },
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
})
