import { defineConfig, devices } from "@playwright/test"
import path from "path"
import { fileURLToPath } from "url"
import dotenv from "dotenv"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, ".env"), override: true })
dotenv.config({ path: path.resolve(__dirname, "..", ".env.e2e"), override: true })
dotenv.config({ path: path.resolve(__dirname, "..", ".env"), override: true })

const isCI = !!process.env.CI

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: "html",
  outputDir: "test-results",
  use: {
    baseURL: "http://localhost:5174",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev:server:e2e",
    url: "http://localhost:5174",
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
