import { expect, test } from "@playwright/test"

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
  await expect(page).toHaveURL("/admin/dashboard")
  await page.getByTestId("admin-navbar-user").click()
  await page.getByTestId("admin-navbar-signout").click()  
  await expect(page).toHaveURL(/\/login$/)
})
