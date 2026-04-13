import { expect, test } from "@playwright/test"
import { getAdminToken } from "./admin-helpers"

test("admin ward form shows only 12-hour shift options with DO last", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000)

  const token = await getAdminToken(request)

  await page.addInitScript((value) => {
    localStorage.setItem("access_token", value)
  }, token)

  await page.goto("/admin/wards")

  await page.getByRole("button", { name: "Create Ward" }).click()
  await expect(page.getByRole("heading", { name: "Create Ward" })).toBeVisible()

  await page.locator('select[name="wardhourtype"]').selectOption("12_HOURS")

  const shiftOptionsSection = page.locator("div.border.rounded-lg.bg-blue-50.border-blue-200")
  await shiftOptionsSection
    .getByRole("button", { name: /Shift Request Options \(Nurse\)/i })
    .click()

  const optionTexts = (await shiftOptionsSection.locator("label span").allTextContents())
    .map((text) => text.trim())
  const optionCodes = optionTexts.map((text) => text.split(" - ")[0].trim())

  expect(optionCodes).toEqual(["A-12", "N-12", "DO"])
})
