import { expect, test as setup } from "@playwright/test"
import { firstSuperuser, firstSuperuserPassword } from "./config.ts"
import { completeLogin2faInUi } from "./utils/auth"

const authFile = "playwright/.auth/user.json"

setup("authenticate", async ({ page }) => {
  await page.goto("/login")
  await page.getByTestId("login-username").fill(firstSuperuser)
  await page.getByTestId("login-password").fill(firstSuperuserPassword)
  await page.getByRole("button", { name: "Log In" }).click()
  await completeLogin2faInUi({ page, recipientEmail: firstSuperuser })
  await expect(page).not.toHaveURL(/\/login$/)
  await page.context().storageState({ path: authFile })
})
