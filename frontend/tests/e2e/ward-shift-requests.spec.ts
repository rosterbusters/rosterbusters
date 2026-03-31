import { expect, test, type APIRequestContext } from "@playwright/test"

const API_BASE_URL = process.env.VITE_API_URL || "http://localhost:8000"
const ADMIN_EMAIL =
  process.env.E2E_SUPERUSER || process.env.FIRST_SUPERUSER || ""
const ADMIN_PASSWORD =
  process.env.E2E_SUPERUSER_PASSWORD ||
  process.env.FIRST_SUPERUSER_PASSWORD ||
  ""

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

async function createUser(
  request: APIRequestContext,
  token: string,
  payload: Record<string, unknown>,
) {
  const res = await request.post(`${API_BASE_URL}/api/v1/admin/users`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: payload,
  })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Failed to create user: ${res.status()} ${body}`)
  }
  return res.json() as Promise<{ userid: number; nurseid?: number | null }>
}

async function deleteUser(
  request: APIRequestContext,
  token: string,
  userid: number,
) {
  await request.delete(`${API_BASE_URL}/api/v1/admin/users/${userid}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

async function deleteShiftRequest(
  request: APIRequestContext,
  token: string,
  requestId: number,
) {
  await request.delete(`${API_BASE_URL}/api/v1/shift-requests/${requestId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

async function getActiveWard(request: APIRequestContext, token: string) {
  const res = await request.get(`${API_BASE_URL}/api/v1/wards/`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Failed to fetch wards: ${res.status()} ${body}`)
  }
  const wards = (await res.json()) as Array<{
    wardid: number
    wardname: string
    isactive?: boolean
  }>
  const ward = wards.find((w) => w.isactive !== false) ?? wards[0]
  if (!ward) {
    throw new Error("No wards found. Seed a ward before running this test.")
  }
  return ward
}

test("ward staff can create a shift request from the calendar", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000)

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      "Missing admin credentials. Set E2E_SUPERUSER and E2E_SUPERUSER_PASSWORD (or FIRST_SUPERUSER / FIRST_SUPERUSER_PASSWORD).",
    )
  }

  const adminToken = await loginToken(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  const ward = await getActiveWard(request, adminToken)

  const suffix = Date.now().toString().slice(-6)
  const nurseUsername = `e2e.nurse.${suffix}`
  const nursePassword = `TestNr${suffix}!`
  const nurseName = "E2E Nurse"

  const createdUserIds: number[] = []
  let nurseToken = ""
  let createdRequestId: number | null = null

  try {
    const nurseUser = await createUser(request, adminToken, {
      username: nurseUsername,
      name: nurseName,
      email: `e2e.nurse.${suffix}@example.com`,
      employee_id: `NU${suffix}`,
      role: "Nurse",
      ward_ids: [ward.wardid],
      designation: "RN",
      password: nursePassword,
    })
    createdUserIds.push(nurseUser.userid)

    nurseToken = await loginToken(request, nurseUsername, nursePassword)

    const periodRes = await request.get(
      `${API_BASE_URL}/api/v1/shift-requests/periods/current-upcoming`,
      { headers: { Authorization: `Bearer ${nurseToken}` } },
    )
    if (!periodRes.ok()) {
      const body = await periodRes.text()
      throw new Error(
        `Failed to fetch roster period window: ${periodRes.status()} ${body}`,
      )
    }
    const periodWindow = (await periodRes.json()) as {
      request_open_period?: { periodid: number; startdate: string }
      upcoming_period?: { periodid: number; startdate: string }
    }

    const requestOpen = periodWindow.request_open_period
    const upcoming = periodWindow.upcoming_period
    if (!requestOpen || !upcoming) {
      throw new Error(
        "No request-open period found. Adjust roster period dates for local dev.",
      )
    }
    if (requestOpen.periodid !== upcoming.periodid) {
      throw new Error(
        "Request-open period does not match upcoming period. Adjust roster period dates for local dev.",
      )
    }

    await page.goto("/login")
    await page.getByTestId("login-username").fill(nurseUsername)
    await page.getByTestId("login-password").fill(nursePassword)
    await page.getByRole("button", { name: /log in/i }).click()

    await page.goto("/ward-staff/request-application")
    await expect(
      page.getByText("Leave and Shift Request Application"),
    ).toBeVisible()

    await expect(
      page.getByRole("button", { name: /Add Shift Request/i }),
    ).toBeVisible()

    await page
      .getByTestId(`request-calendar-cell-${requestOpen.startdate}`)
      .click()

    await expect(page.getByText("Create Shift Request")).toBeVisible()

    const dialog = page.getByRole("dialog")
    await dialog.getByText("Select Shift Type").click()

    const listbox = page.locator('[role="listbox"]')
    await expect(listbox.getByText("A", { exact: true })).toBeVisible()
    await expect(listbox.getByText("P", { exact: true })).toBeVisible()
    await expect(listbox.getByText("N", { exact: true })).toBeVisible()

    await listbox.getByText("A", { exact: true }).click()

    const [createResponse] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes("/api/v1/shift-requests") &&
          res.request().method() === "POST",
      ),
      dialog.getByRole("button", { name: "Create" }).click(),
    ])

    const created = (await createResponse.json()) as { requestid?: number }
    createdRequestId = created.requestid ?? null
    if (!createdRequestId) {
      throw new Error("Shift request creation did not return a requestid.")
    }

    await expect(
      page.getByTestId(`shift-request-${createdRequestId}`),
    ).toBeVisible()
  } finally {
    if (createdRequestId && nurseToken) {
      await deleteShiftRequest(request, nurseToken, createdRequestId)
    }
    for (const userid of createdUserIds.reverse()) {
      await deleteUser(request, adminToken, userid)
    }
  }
})
