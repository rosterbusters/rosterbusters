import { type APIRequestContext, expect, test } from "@playwright/test"
import { API_BASE_URL, getAdminToken } from "./admin-helpers"

async function createWard(
  request: APIRequestContext,
  token: string,
  wardname: string,
) {
  const res = await request.post(`${API_BASE_URL}/api/v1/wards/`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: {
      wardname,
      wardtype: "E2E",
      wardhourtype: "8_HOURS",
      location: "Playwright",
      isactive: true,
    },
  })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Failed to create ward: ${res.status()} ${body}`)
  }
  return res.json() as Promise<{ wardid: number; wardname: string }>
}

async function deleteWard(
  request: APIRequestContext,
  token: string,
  wardid: number,
) {
  await request.delete(`${API_BASE_URL}/api/v1/wards/${wardid}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

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

  const shiftOptionsSection = page.locator(
    "div.border.rounded-lg.bg-blue-50.border-blue-200",
  )
  await shiftOptionsSection
    .getByRole("button", { name: /Shift Request Options \(Nurse\)/i })
    .click()

  const optionTexts = (
    await shiftOptionsSection.locator("label span").allTextContents()
  ).map((text) => text.trim())
  const optionCodes = optionTexts.map((text) => text.split(" - ")[0].trim())

  expect(optionCodes).toEqual(["A-12", "N-12", "DO"])
})

test("admin deleting a ward removes it from the page and API", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000)

  const token = await getAdminToken(request)
  const suffix = Date.now().toString().slice(-6)
  const wardName = `E2E Delete Ward ${suffix}`
  const createdWard = await createWard(request, token, wardName)

  try {
    await page.addInitScript((value) => {
      localStorage.setItem("access_token", value)
    }, token)

    await page.goto("/admin/wards")

    await page
      .getByPlaceholder("Search by name, type, or location...")
      .fill(wardName)
    const wardCard = page
      .locator(".bg-white.rounded-xl.border.border-gray-200")
      .filter({ hasText: wardName })

    await expect(wardCard).toBeVisible()
    await wardCard.getByTitle("Delete ward").click()
    await expect(
      page.getByRole("heading", { name: "Delete Ward", exact: true }),
    ).toBeVisible()
    await page.getByRole("button", { name: "Delete", exact: true }).click()

    await expect(wardCard).toHaveCount(0)

    await expect
      .poll(async () => {
        const res = await request.get(
          `${API_BASE_URL}/api/v1/wards/${createdWard.wardid}`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        return res.status()
      })
      .toBe(404)
  } finally {
    await deleteWard(request, token, createdWard.wardid)
  }
})
