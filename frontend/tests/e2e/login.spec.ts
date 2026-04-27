import { expect, test } from "@playwright/test"
import { completeLogin2faInUi } from "../utils/auth"

const ADMIN_EMAIL =
  process.env.E2E_SUPERUSER || process.env.FIRST_SUPERUSER || ""
const ADMIN_PASSWORD =
  process.env.E2E_SUPERUSER_PASSWORD ||
  process.env.FIRST_SUPERUSER_PASSWORD ||
  ""

test("redirects to login and renders the sign-in form", async ({ page }) => {
  await page.goto("/")

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible()
  await expect(page.getByPlaceholder("Password")).toBeVisible()
  await expect(page.getByRole("button", { name: /log in/i })).toBeVisible()
})

test("login successfully into admin account", async ({ page }) => {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      "Missing admin credentials. Set E2E_SUPERUSER and E2E_SUPERUSER_PASSWORD (or FIRST_SUPERUSER / FIRST_SUPERUSER_PASSWORD).",
    )
  }
  await page.goto("/login")
  await page.getByTestId("login-username").fill(ADMIN_EMAIL)
  await page.getByTestId("login-password").fill(ADMIN_PASSWORD)

  await page.getByRole('button', { name: 'Log In' }).click()
  await completeLogin2faInUi({ page, recipientEmail: ADMIN_EMAIL })
  await expect(page).toHaveURL("/admin/dashboard")
  await page.getByTestId("admin-navbar-user").click()
  await page.getByTestId("admin-navbar-signout").click()  
  await expect(page).toHaveURL(/\/login$/)
})

test("OTP 2FA: nurse manager can log in on first OTP attempt", async ({ page }) => {
  const email = "lim.weiling@sach.org.sg"
  const password = "manager123"

  await page.goto("/login")
  await page.getByTestId("login-username").fill(email)
  await page.getByTestId("login-password").fill(password)
  await page.getByRole("button", { name: /log in/i }).click()

  // The 2FA verification screen MUST appear for non-admin users
  await expect(page.getByRole("heading", { name: /verify login/i })).toBeVisible({ timeout: 8_000 })

  // Complete the OTP flow via mailcatcher — this must succeed on the FIRST attempt
  await completeLogin2faInUi({ page, recipientEmail: email })

  // Should land on nurse manager home, not stuck on /login
  await expect(page).toHaveURL(/\/nurse-manager/, { timeout: 10_000 })
})

test("OTP 2FA: nurse can log in on first OTP attempt", async ({ page }) => {
  const email = "teo.boonkiat@sach.org.sg"
  const password = "nurse123"

  await page.goto("/login")
  await page.getByTestId("login-username").fill(email)
  await page.getByTestId("login-password").fill(password)
  await page.getByRole("button", { name: /log in/i }).click()

  // The 2FA verification screen MUST appear for non-admin users
  await expect(page.getByRole("heading", { name: /verify login/i })).toBeVisible({ timeout: 8_000 })

  // Complete the OTP flow via mailcatcher — this must succeed on the FIRST attempt
  await completeLogin2faInUi({ page, recipientEmail: email })

  // Should land on ward-staff home, not stuck on /login
  await expect(page).toHaveURL(/\/ward-staff/, { timeout: 10_000 })
})

