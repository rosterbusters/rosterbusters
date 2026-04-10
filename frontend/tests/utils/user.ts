import { expect, type Page } from "@playwright/test"
import { completeLogin2faInUi } from "./auth"

export async function logInUser(
  page: Page,
  email: string,
  password: string,
  recipientEmail?: string,
) {
  await page.goto("/login")

  await page.getByTestId("login-username").fill(email)
  await page.getByTestId("login-password").fill(password)
  await page.getByRole("button", { name: "Log In" }).click()
  await completeLogin2faInUi({ page, recipientEmail: recipientEmail || email })
  await expect(page).not.toHaveURL(/\/login$/)
  await expect(
    page.getByText("Welcome back, nice to see you again!"),
  ).toBeVisible()
}

export async function logOutUser(page: Page) {
  await page.getByTestId("user-menu").click()
  await page.getByRole("menuitem", { name: "Log out" }).click()
  await page.goto("/login")
}
