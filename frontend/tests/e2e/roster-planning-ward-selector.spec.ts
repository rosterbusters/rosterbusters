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
  return res.json() as Promise<{
    userid: number
    username: string
    nurseid?: number | null
    managerid?: number | null
  }>
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

async function completeFirstLogin(
  request: APIRequestContext,
  token: string,
  newPassword: string,
  email?: string,
) {
  const res = await request.post(`${API_BASE_URL}/api/v1/users/me/first-login-setup`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: {
      new_password: newPassword,
      ...(email ? { email } : {}),
    },
  })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Failed to complete first login: ${res.status()} ${body}`)
  }
}

async function updateWardManager(
  request: APIRequestContext,
  token: string,
  wardId: number,
  managerId: number | null,
) {
  const res = await request.patch(`${API_BASE_URL}/api/v1/wards/${wardId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: { managerid: managerId },
  })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Failed to update ward: ${res.status()} ${body}`)
  }
}

test("roster planning defaults to manager ward and loads ward data", async ({ page, request }) => {
  test.setTimeout(120_000)

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      "Missing admin credentials. Set E2E_SUPERUSER and E2E_SUPERUSER_PASSWORD (or FIRST_SUPERUSER / FIRST_SUPERUSER_PASSWORD).",
    )
  }

  const adminToken = await loginToken(request, ADMIN_EMAIL, ADMIN_PASSWORD)

  const wardsRes = await request.get(`${API_BASE_URL}/api/v1/wards/`)
  if (!wardsRes.ok()) {
    const body = await wardsRes.text()
    throw new Error(`Failed to fetch wards: ${wardsRes.status()} ${body}`)
  }
  const wards = (await wardsRes.json()) as Array<{
    wardid: number
    wardname: string
    managerid?: number | null
    isactive?: boolean
  }>
  const ward = wards.find((w) => w.isactive !== false) ?? wards[0]
  if (!ward) {
    throw new Error("No wards found. Seed a ward before running this test.")
  }

  const originalManagerId = ward.managerid ?? null
  const suffix = Date.now().toString().slice(-6)
  const nmUsername = `e2e.nm.${suffix}`
  const nmPassword = `TestNm${suffix}!`
  const nmEmail = `e2e.nm.${suffix}@example.com`
  const nurseName = `E2E Nurse ${suffix}`
  const nurseUsername = `e2e.nurse.${suffix}`

  let nmUser: { userid: number } | null = null
  let nurseUser: { userid: number } | null = null

  try {
    nmUser = await createUser(request, adminToken, {
      username: nmUsername,
      email: nmEmail,
      password: nmPassword,
      role: "NurseManager",
      ward_ids: [ward.wardid],
    })

    const nmToken = await loginToken(request, nmUsername, nmPassword)
    await completeFirstLogin(request, nmToken, nmPassword, nmEmail)

    nurseUser = await createUser(request, adminToken, {
      username: nurseUsername,
      name: nurseName,
      email: `e2e.nurse.${suffix}@example.com`,
      password: `TestNurse${suffix}!`,
      role: "Nurse",
      designation: "Staff Nurse",
      ward_ids: [ward.wardid],
    })

    await expect
      .poll(
        async () => {
          const statsRes = await request.get(
            `${API_BASE_URL}/api/v1/roster/manager/statistics?ward_id=${ward.wardid}`,
            { headers: { Authorization: `Bearer ${nmToken}` } },
          )
          if (!statsRes.ok()) return false
          const stats = (await statsRes.json()) as {
            nurses?: Array<{ name?: string | null }>
          }
          return stats.nurses?.some((n) => n.name === nurseName) ?? false
        },
        { timeout: 30_000 },
      )
      .toBeTruthy()

    await page.goto("/login")
    await page.getByTestId("login-username").fill(nmUsername)
    await page.getByTestId("login-password").fill(nmPassword)
    await page.getByRole("button", { name: /log in/i }).click()

    if (page.url().includes("/first-login-setup")) {
      await page.getByPlaceholder("your.email@example.com").fill(nmEmail)
      await page.getByPlaceholder("At least 8 characters").fill(nmPassword)
      await page.getByPlaceholder("Repeat your password").fill(nmPassword)
      await page.getByRole("button", { name: /complete setup/i }).click()
    }

    await expect(page).toHaveURL(/\/nurse-manager\/home/)

    await page.goto("/nurse-manager/roster-planning")
    await page.waitForResponse(
      (res) =>
        res.url().includes(`/api/v1/roster/manager/statistics?ward_id=${ward.wardid}`) &&
        res.status() === 200,
    )

    const wardTrigger = page.getByTestId("roster-ward-trigger")
    await expect(wardTrigger).toBeVisible()
    await expect(wardTrigger).toContainText(ward.wardname)

    await expect
      .poll(
        async () => page.getByText(nurseName, { exact: false }).count(),
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0)
    const nurseRow = page.getByRole("row").filter({ hasText: nurseName }).first()
    await expect(nurseRow).toBeVisible({ timeout: 10_000 })

    await wardTrigger.click()
    const wardOptions = page.locator('[data-testid^="roster-ward-option-"]')
    await expect(wardOptions).toHaveCount(wards.length)
  } finally {
    if (nmUser?.userid) {
      await deleteUser(request, adminToken, nmUser.userid)
    }
    if (nurseUser?.userid) {
      await deleteUser(request, adminToken, nurseUser.userid)
    }
    await updateWardManager(request, adminToken, ward.wardid, originalManagerId)
  }
})
