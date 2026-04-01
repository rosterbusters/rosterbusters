import { expect, test, type APIRequestContext } from "@playwright/test"
import {
  API_BASE_URL,
  createUser,
  deleteUser,
  completeFirstLoginSetup,
  getAdminToken,
  getAnyWard,
} from "./admin-helpers"

async function loginToken(
  request: APIRequestContext,
  username: string,
  password: string,
) {
  const res = await request.post(`${API_BASE_URL}/api/v1/login/access-token`, {
    form: { username, password },
  })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Failed to login: ${res.status()} ${body}`)
  }
  const json = await res.json()
  return json.access_token as string
}

const formatDateKey = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

test("ward staff can create a leave request from the calendar", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000)

  const adminToken = await getAdminToken(request)
  const ward = await getAnyWard(request, adminToken)

  const suffix = Date.now().toString().slice(-6)
  const nurseUsername = `e2e.leave.${suffix}`
  const nursePassword = `Leave${suffix}!`
  const nurseEmail = `e2e.leave.${suffix}@example.com`
  const nurseEmployeeId = `LE${suffix}`

  const createdUserIds: number[] = []
  let nurseToken = ""
  let createdLeaveId: number | null = null

  try {
    const nurseUser = await createUser(request, adminToken, {
      username: nurseUsername,
      name: "E2E Leave Nurse",
      email: nurseEmail,
      employee_id: nurseEmployeeId,
      role: "Nurse",
      ward_ids: [ward.wardid],
      designation: "RN",
      password: nursePassword,
    })
    createdUserIds.push(nurseUser.userid)

    nurseToken = await loginToken(request, nurseUsername, nursePassword)

    // Newly created users are flagged for first-time setup and are route-guarded
    // away from ward-staff pages until setup is completed.
    await completeFirstLoginSetup(request, nurseToken, {
      new_password: nursePassword,
      email: nurseEmail,
      employee_id: nurseEmployeeId,
    })

    const leaveCodesRes = await request.get(
      `${API_BASE_URL}/api/v1/leave/leave-codes`,
      { headers: { Authorization: `Bearer ${nurseToken}` } },
    )
    if (!leaveCodesRes.ok()) {
      const body = await leaveCodesRes.text()
      throw new Error(`Failed to load leave codes: ${leaveCodesRes.status()} ${body}`)
    }
    const leaveCodes = (await leaveCodesRes.json()) as Array<{
      shiftcode: string
    }>
    const expectedCodes = leaveCodes
      .map((code) => code.shiftcode)
      .filter((code) => code.toUpperCase() !== "MC")

    if (!expectedCodes.length) {
      throw new Error("No leave codes returned for ward staff.")
    }

    await page.addInitScript((value) => {
      localStorage.setItem("access_token", value)
    }, nurseToken)

    await page.goto("/ward-staff/request-application")
    await expect(
      page.getByText("Leave and Shift Request Application"),
    ).toBeVisible()

    await page.getByRole("button", { name: /Leave Requests/i }).click()
    await expect(
      page.getByText("Click on a date to create/edit leave request."),
    ).toBeVisible()

    const targetDate = new Date()
    targetDate.setDate(targetDate.getDate() + 1)
    const dateKey = formatDateKey(targetDate)

    await page.getByTestId(`leave-request-calendar-cell-${dateKey}`).click()
    await expect(page.getByText("Create Leave Request")).toBeVisible()

    const dialog = page.getByRole("dialog")
    await page
      .getByRole("combobox", { name: "Requested Leave Type" })
      .click()

    for (const code of expectedCodes) {
      const option = page.locator("div").filter({
        hasText: new RegExp(`^${escapeRegExp(code)}$`),
      })
      await expect(option.first()).toBeVisible()
    }

    await expect(page.locator("div").filter({ hasText: /^MV$/i })).toHaveCount(0)
    await expect(page.locator("div").filter({ hasText: /^DO$/i })).toHaveCount(0)

    await page
      .locator("div")
      .filter({ hasText: new RegExp(`^${escapeRegExp(expectedCodes[0])}$`) })
      .first()
      .click()

    const [createResponse] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes("/api/v1/leave/") &&
          res.request().method() === "POST",
      ),
      dialog.getByRole("button", { name: "Create" }).click(),
    ])

    const created = (await createResponse.json()) as { leaveid?: number }
    createdLeaveId = created.leaveid ?? null
    if (!createdLeaveId) {
      throw new Error("Leave request creation did not return a leaveid.")
    }

    await expect(
      page.getByTestId(`leave-request-${createdLeaveId}`),
    ).toBeVisible()
  } finally {
    if (createdLeaveId && nurseToken) {
      await request.delete(`${API_BASE_URL}/api/v1/leave/${createdLeaveId}`, {
        headers: { Authorization: `Bearer ${nurseToken}` },
      })
    }
    for (const userid of createdUserIds.reverse()) {
      await deleteUser(request, adminToken, userid)
    }
  }
})
