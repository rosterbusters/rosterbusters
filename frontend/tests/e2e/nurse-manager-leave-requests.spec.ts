import { expect, test, type APIRequestContext } from "@playwright/test"
import { loginForE2E } from "../utils/auth"
import {
  API_BASE_URL,
  completeFirstLoginSetup,
  createUser,
  deleteUser,
  getAdminToken,
  getAnyWard,
} from "./admin-helpers"

async function loginToken(
  request: APIRequestContext,
  username: string,
  password: string,
  recipientEmail?: string,
) {
  return loginForE2E({
    request,
    username,
    password,
    recipientEmail,
    apiBaseUrl: API_BASE_URL,
  })
}

const formatDateKey = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`

async function getLeaveCode(request: APIRequestContext, token: string) {
  const res = await request.get(`${API_BASE_URL}/api/v1/leave/leave-codes`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Failed to load leave codes: ${res.status()} ${body}`)
  }

  const leaveCodes = (await res.json()) as Array<{ shiftcode: string }>
  const leaveCode = leaveCodes.find((code) => code.shiftcode !== "MC")?.shiftcode
  if (!leaveCode) {
    throw new Error("No leave codes available for nurse manager leave tests.")
  }
  return leaveCode
}

async function createLeaveRequest(
  request: APIRequestContext,
  token: string,
  payload: {
    nurseid: number
    startdate: string
    enddate: string
    leavetype: string
    reason?: string
  },
) {
  const res = await request.post(`${API_BASE_URL}/api/v1/leave/`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: payload,
  })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Failed to create leave request: ${res.status()} ${body}`)
  }
  return res.json() as Promise<{ leaveid: number }>
}

async function deleteLeaveRequest(
  request: APIRequestContext,
  token: string,
  leaveId: number,
) {
  await request.delete(`${API_BASE_URL}/api/v1/leave/${leaveId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

test("nurse manager can edit a selected nurse from grouped leave requests and create a leave request from the calendar", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000)

  const adminToken = await getAdminToken(request)
  const ward = await getAnyWard(request, adminToken)

  const suffix = Date.now().toString().slice(-6)
  const managerUsername = `e2e.nm.leave.${suffix}`
  const managerPassword = `NmLeave${suffix}!`
  const managerEmail = `e2e.nm.leave.${suffix}@example.com`
  const managerEmployeeId = `NML${suffix}`
  const nurseOneName = `Alpha${suffix} Leave Nurse`
  const nurseTwoName = `Beta${suffix} Leave Nurse`

  const createdUserIds: number[] = []
  const createdLeaveIds: number[] = []
  let managerToken = ""

  try {
    const managerUser = await createUser(request, adminToken, {
      username: managerUsername,
      name: `E2E Leave Manager ${suffix}`,
      email: managerEmail,
      employee_id: managerEmployeeId,
      role: "NurseManager",
      ward_ids: [ward.wardid],
      designation: "Nurse Manager",
      password: managerPassword,
    })
    createdUserIds.push(managerUser.userid)

    const nurseOne = await createUser(request, adminToken, {
      username: `e2e.leave.a.${suffix}`,
      name: nurseOneName,
      email: `e2e.leave.a.${suffix}@example.com`,
      employee_id: `NLA${suffix}`,
      role: "Nurse",
      ward_ids: [ward.wardid],
      designation: "RN",
      password: `NurseA${suffix}!`,
    })
    createdUserIds.push(nurseOne.userid)

    const nurseTwo = await createUser(request, adminToken, {
      username: `e2e.leave.b.${suffix}`,
      name: nurseTwoName,
      email: `e2e.leave.b.${suffix}@example.com`,
      employee_id: `NLB${suffix}`,
      role: "Nurse",
      ward_ids: [ward.wardid],
      designation: "RN",
      password: `NurseB${suffix}!`,
    })
    createdUserIds.push(nurseTwo.userid)

    if (!nurseOne.nurseid || !nurseTwo.nurseid) {
      throw new Error("Created nurse users are missing nurse IDs.")
    }

    managerToken = await loginToken(
      request,
      managerUsername,
      managerPassword,
      managerEmail,
    )
    await completeFirstLoginSetup(request, managerToken, {
      new_password: managerPassword,
      email: managerEmail,
      employee_id: managerEmployeeId,
    })

    const leaveCode = await getLeaveCode(request, managerToken)
    const groupedDate = new Date()
    groupedDate.setDate(groupedDate.getDate() + 8)
    const groupedDateKey = formatDateKey(groupedDate)

    const createdOne = await createLeaveRequest(request, managerToken, {
      nurseid: nurseOne.nurseid,
      startdate: groupedDateKey,
      enddate: groupedDateKey,
      leavetype: leaveCode,
      reason: "E2E grouped leave A",
    })
    createdLeaveIds.push(createdOne.leaveid)

    const createdTwo = await createLeaveRequest(request, managerToken, {
      nurseid: nurseTwo.nurseid,
      startdate: groupedDateKey,
      enddate: groupedDateKey,
      leavetype: leaveCode,
      reason: "E2E grouped leave B",
    })
    createdLeaveIds.push(createdTwo.leaveid)

    await page.addInitScript((value) => {
      localStorage.setItem("access_token", value)
    }, managerToken)

    await page.goto("/nurse-manager/request-application")
    await expect(
      page.getByText("Leave and Shift Request Application"),
    ).toBeVisible()

    await page.getByRole("button", { name: /Leave Requests/i }).click()
    await expect(
      page.getByText("Click on a date to create/edit leave request."),
    ).toBeVisible()

    await page
      .getByTestId(`leave-request-calendar-cell-${groupedDateKey}`)
      .getByText(nurseOneName)
      .click()

    const editDialog = page.getByRole("dialog")
    await expect(editDialog.getByText("Edit Leave Request")).toBeVisible()
    await editDialog.getByRole("combobox", { name: "Nurse" }).click()
    await page.locator('[role="option"]').filter({ hasText: nurseTwoName }).click({
      force: true,
      timeout: 10_000,
    })

    const [updateResponse] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes(`/api/v1/leave/${createdTwo.leaveid}`) &&
          res.request().method() === "PATCH",
        { timeout: 10_000 },
      ),
      editDialog.getByRole("button", { name: "Save" }).click(),
    ])
    expect(updateResponse.ok()).toBeTruthy()
    await expect(editDialog).toBeHidden()

    const newRequestDate = new Date()
    newRequestDate.setDate(newRequestDate.getDate() + 9)
    const newRequestDateKey = formatDateKey(newRequestDate)

    const newRequestCell = page.getByTestId(
      `leave-request-calendar-cell-${newRequestDateKey}`,
    )
    await expect(newRequestCell).toBeVisible()
    await newRequestCell.dispatchEvent("click")
    const createDialog = page.getByRole("dialog")
    await expect(createDialog.getByText("Create Leave Request")).toBeVisible({
      timeout: 10_000,
    })

    await createDialog.getByRole("combobox", { name: "Nurse" }).click()
    await page.locator('[role="option"]').filter({ hasText: nurseOneName }).click({
      force: true,
      timeout: 10_000,
    })
    await createDialog
      .getByRole("combobox", { name: "Requested Leave Type" })
      .click()
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")
    await expect(
      createDialog.getByRole("combobox", { name: "Requested Leave Type" }),
    ).not.toContainText("Select Leave Type")

    const [createResponse] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes("/api/v1/leave/") &&
          res.request().method() === "POST",
        { timeout: 10_000 },
      ),
      createDialog.getByRole("button", { name: "Create" }).click(),
    ])

    const created = (await createResponse.json()) as { leaveid?: number }
    if (!created.leaveid) {
      throw new Error("Leave request creation did not return a leaveid.")
    }
    createdLeaveIds.push(created.leaveid)

    await expect(page.getByTestId(`leave-request-${created.leaveid}`)).toBeVisible()
  } finally {
    for (const leaveId of createdLeaveIds.reverse()) {
      if (managerToken) {
        await deleteLeaveRequest(request, managerToken, leaveId)
      }
    }
    for (const userid of createdUserIds.reverse()) {
      await deleteUser(request, adminToken, userid)
    }
  }
})
